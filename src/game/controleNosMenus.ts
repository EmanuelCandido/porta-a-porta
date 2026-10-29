import * as Phaser from 'phaser';
import { controles } from '../sim/content';
import { definirControle, mexeuNoAnalogico } from './dispositivo';
import { COR } from './interface/estilo';
import { centroDa, proximoNaDirecao, type Caixa } from './navegacaoPorFoco';

// O controle nas telas de menu (título, Álbum, Diário, porta, evolução, fim da run e pausa): o
// direcional ou o analógico esquerdo levam o foco ao botão mais perto naquela direção, A aperta,
// B e Start voltam (Esc), LB e RB trocam de carta ou de aba (setas). Toda ação dos menus tem um
// botão clicável (os objetos com a mãozinha do cursor), então o foco anda só entre eles. Na rua,
// Start pausa (Esc) e Back segura o mapa (Tab); o resto do controle fica com a EntradaDoJogador.

/** Botões do controle (layout padrão do navegador). */
const BOTAO = {
  A: 0,
  B: 1,
  LB: 4,
  RB: 5,
  BACK: 8,
  START: 9,
  CIMA: 12,
  BAIXO: 13,
  ESQ: 14,
  DIR: 15,
} as const;

/** Telas de menu: com uma delas aberta por cima, o controle navega nela. */
const MENUS = new Set([
  'CenaTitulo',
  'CenaAlbum',
  'CenaDiario',
  'CenaPorta',
  'CenaEvolucao',
  'CenaFimDaRun',
  'CenaPausa',
]);

/** Um botão fica de fora se cobrir mais que isso da tela (o fundo que só segura o clique). */
const FRACAO_MAXIMA_DA_TELA = 0.5;
const DEPTH_DO_FOCO = 100_000;

type Direcao = 'cima' | 'baixo' | 'esquerda' | 'direita';
const VETOR: Record<Direcao, { x: number; y: number }> = {
  cima: { x: 0, y: -1 },
  baixo: { x: 0, y: 1 },
  esquerda: { x: -1, y: 0 },
  direita: { x: 1, y: 0 },
};

interface Alvo extends Caixa {
  obj: Phaser.GameObjects.GameObject;
}

type Interativo = Phaser.GameObjects.GameObject & {
  getBounds?: () => Phaser.Geom.Rectangle;
  scrollFactorX?: number;
  scrollFactorY?: number;
  visible?: boolean;
  alpha?: number;
};

const TECLAS = {
  esc: ['Escape', 27],
  tab: ['Tab', 9],
  esquerda: ['ArrowLeft', 37],
  direita: ['ArrowRight', 39],
} as const;
type NomeDaTecla = keyof typeof TECLAS;

/** Uma tecla de mentira para o teclado do Phaser (ele lê o `keyCode` do evento da janela). */
function tecla(tipo: 'keydown' | 'keyup', nome: NomeDaTecla): void {
  const [key, keyCode] = TECLAS[nome];
  const ev = new KeyboardEvent(tipo, { key, code: key, bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'keyCode', { get: () => keyCode });
  Object.defineProperty(ev, 'which', { get: () => keyCode });
  window.dispatchEvent(ev);
}

/** Os botões clicáveis da cena, já na tela (px), visíveis, sem o fundo que cobre tudo. */
function alvosDa(cena: Phaser.Scene): Alvo[] {
  const lista: Alvo[] = [];
  const { width, height } = cena.scale;
  const cam = cena.cameras.main;
  const visitar = (o: Phaser.GameObjects.GameObject, pai: boolean) => {
    const i = o as Interativo;
    const visivel = pai && i.visible !== false && (i.alpha ?? 1) > 0.05;
    if (o instanceof Phaser.GameObjects.Container) for (const f of o.list) visitar(f, visivel);
    if (!visivel || !o.input?.enabled || !o.input.cursor || !i.getBounds) return;
    const b = i.getBounds();
    if (b.width * b.height > FRACAO_MAXIMA_DA_TELA * width * height) return;
    const x = (b.x - cam.scrollX * (i.scrollFactorX ?? 1)) * cam.zoom + cam.x;
    const y = (b.y - cam.scrollY * (i.scrollFactorY ?? 1)) * cam.zoom + cam.y;
    const w = b.width * cam.zoom;
    const h = b.height * cam.zoom;
    if (x + w < 0 || y + h < 0 || x > width || y > height) return;
    lista.push({ obj: o, x, y, w, h });
  };
  for (const o of cena.children.list) visitar(o, true);
  return lista;
}

const centro = centroDa;

/** Um ponteiro de mentira para quem lê o evento do clique (botão esquerdo, sem Ctrl). */
function ponteiroEm(x: number, y: number): unknown {
  return {
    x,
    y,
    worldX: x,
    worldY: y,
    button: 0,
    buttons: 1,
    event: { button: 0, ctrlKey: false, shiftKey: false },
    leftButtonDown: () => true,
    rightButtonDown: () => false,
    leftButtonReleased: () => true,
    rightButtonReleased: () => false,
  };
}

export class ControleNosMenus {
  private antes = new Set<number>();
  private cena: Phaser.Scene | null = null;
  private focado: Alvo | null = null;
  /** Onde estava o foco (para achar o botão de novo quando a tela se redesenha). */
  private ondeEstava: { x: number; y: number } | null = null;
  private desenho: Phaser.GameObjects.Graphics | null = null;
  private segurando: Direcao | null = null;
  private proximaRepeticao = 0;

  constructor(private readonly jogo: Phaser.Game) {}

  passo(agora: number): void {
    const pad = [...(navigator.getGamepads?.() ?? [])].find((p) => p?.connected) ?? null;
    const menu = this.menuDeCima();
    if (menu !== this.cena) this.trocarDeCena(menu);
    if (!pad) {
      this.antes.clear();
      return;
    }
    const apertados = new Set<number>();
    pad.buttons.forEach((b, i) => {
      if (b.pressed) apertados.add(i);
    });
    const borda = (i: number) => apertados.has(i) && !this.antes.has(i);
    const solto = (i: number) => !apertados.has(i) && this.antes.has(i);
    // Mexeu no controle: a tela passa a mostrar os botões dele.
    const zona = controles.zonaMortaAnalogico;
    if ([...apertados].some((i) => !this.antes.has(i)) || mexeuNoAnalogico(pad.axes, zona))
      definirControle(true);
    if (menu) this.noMenu(menu, pad, apertados, borda, agora);
    else {
      // Na rua: Start pausa; Back segura o mapa (como o Tab).
      if (borda(BOTAO.START)) this.apertarTecla('esc');
      if (borda(BOTAO.BACK)) tecla('keydown', 'tab');
    }
    if (solto(BOTAO.BACK)) tecla('keyup', 'tab');
    this.antes = apertados;
  }

  /** A tela de menu em que o controle está agora (para os testes). */
  get tela(): string | null {
    return this.cena?.scene.key ?? null;
  }

  /** Quem está com o foco agora (para os testes). */
  get foco(): Caixa | null {
    const f = this.focado;
    return f ? { x: f.x, y: f.y, w: f.w, h: f.h } : null;
  }

  private apertarTecla(nome: NomeDaTecla): void {
    tecla('keydown', nome);
    tecla('keyup', nome);
  }

  /** A tela de menu mais de cima entre as cenas ativas (ou null na rua sem menu aberto). */
  private menuDeCima(): Phaser.Scene | null {
    const ativas = this.jogo.scene.getScenes(true, true) as Phaser.Scene[];
    return ativas.find((c) => MENUS.has(c.scene.key)) ?? null;
  }

  private trocarDeCena(menu: Phaser.Scene | null): void {
    this.soltarFoco();
    this.desenho = null;
    this.cena = menu;
    this.ondeEstava = null;
    this.segurando = null;
  }

  private noMenu(
    cena: Phaser.Scene,
    pad: Gamepad,
    apertados: Set<number>,
    borda: (i: number) => boolean,
    agora: number,
  ): void {
    const alvos = alvosDa(cena);
    this.manterFoco(cena, alvos);
    const dir = this.direcaoDoPad(pad, apertados);
    if (dir && (dir !== this.segurando || agora >= this.proximaRepeticao)) {
      const cfg = controles.controle.menus;
      const espera = dir !== this.segurando ? cfg.repeticaoInicialS : cfg.repeticaoS;
      this.proximaRepeticao = agora + espera * 1000;
      this.segurando = dir;
      this.mover(cena, alvos, dir);
    } else if (!dir) this.segurando = null;
    if (borda(BOTAO.A) && this.focado) this.apertar(cena, this.focado);
    if (borda(BOTAO.B) || borda(BOTAO.START)) this.apertarTecla('esc');
    if (borda(BOTAO.LB)) this.apertarTecla('esquerda');
    if (borda(BOTAO.RB)) this.apertarTecla('direita');
    // A tela pode ter fechado com o botão apertado agora: só desenha se continua aberta.
    if (cena.scene.isActive()) this.desenhar(cena);
  }

  private direcaoDoPad(pad: Gamepad, apertados: Set<number>): Direcao | null {
    if (apertados.has(BOTAO.CIMA)) return 'cima';
    if (apertados.has(BOTAO.BAIXO)) return 'baixo';
    if (apertados.has(BOTAO.ESQ)) return 'esquerda';
    if (apertados.has(BOTAO.DIR)) return 'direita';
    const x = pad.axes[0] ?? 0;
    const y = pad.axes[1] ?? 0;
    if (Math.max(Math.abs(x), Math.abs(y)) < controles.controle.menus.limiarAnalogico) return null;
    if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'direita' : 'esquerda';
    return y > 0 ? 'baixo' : 'cima';
  }

  /** A tela se redesenhou (botões novos): o foco volta ao botão mais perto de onde estava. */
  private manterFoco(cena: Phaser.Scene, alvos: Alvo[]): void {
    const antes = this.focado;
    const atual = antes ? alvos.find((a) => a.obj === antes.obj) : undefined;
    if (atual) {
      this.focado = atual;
      this.ondeEstava = centro(atual);
      return;
    }
    this.focado = null;
    if (alvos.length === 0) return;
    // Tela nova: começa pelo botão que o menu já destaca (o foco do teclado, ou o principal).
    if (!this.ondeEstava) {
      const botao = (a: Alvo) =>
        a.obj.getData?.('botaoDeMenu') as { foco: boolean; principal: boolean } | undefined;
      const inicial = alvos.find((a) => botao(a)?.foco) ?? alvos.find((a) => botao(a)?.principal);
      if (inicial) return this.focar(inicial);
    }
    const ref = this.ondeEstava ?? { x: cena.scale.width / 2, y: cena.scale.height / 2 };
    let melhor = alvos[0]!;
    let d0 = Infinity;
    for (const a of alvos) {
      const c = centro(a);
      const d = Math.hypot(c.x - ref.x, c.y - ref.y);
      if (d < d0) {
        d0 = d;
        melhor = a;
      }
    }
    this.focar(melhor);
  }

  private mover(cena: Phaser.Scene, alvos: Alvo[], dir: Direcao): void {
    const atual = this.focado;
    if (!atual) return this.manterFoco(cena, alvos);
    const prox = proximoNaDirecao(
      centro(atual),
      VETOR[dir],
      alvos.filter((a) => a.obj !== atual.obj),
    );
    if (prox) this.focar(prox);
  }

  private focar(a: Alvo): void {
    if (this.focado?.obj !== a.obj) {
      this.soltarFoco();
      // O mesmo realce do mouse (os botões de menu desenham o foco no "pointerover").
      const c = centro(a);
      a.obj.emit('pointerover', ponteiroEm(c.x, c.y));
    }
    this.focado = a;
    this.ondeEstava = centro(a);
  }

  private soltarFoco(): void {
    const f = this.focado;
    this.focado = null;
    if (f && f.obj.active) f.obj.emit('pointerout', ponteiroEm(f.x, f.y));
  }

  private apertar(cena: Phaser.Scene, a: Alvo): void {
    const c = centro(a);
    const p = ponteiroEm(c.x, c.y);
    cena.input.emit('gameobjectdown', p, a.obj, {});
    a.obj.emit('pointerdown', p, a.w / 2, a.h / 2, {});
    if (a.obj.active) a.obj.emit('pointerup', p, a.w / 2, a.h / 2, {});
  }

  /** Um contorno na cor do jogador em volta do botão com foco (por cima de tudo na tela). */
  private desenhar(cena: Phaser.Scene): void {
    if (!this.desenho || !this.desenho.active || this.desenho.scene !== cena)
      this.desenho = cena.add.graphics().setScrollFactor(0).setDepth(DEPTH_DO_FOCO);
    const g = this.desenho.clear();
    const f = this.focado;
    // Botões que desenham o próprio foco (os de menu e as linhas do título) dispensam o contorno.
    if (!f || f.obj.getData?.('focoProprio')) return;
    const cam = cena.cameras.main;
    // O desenho fica parado na tela: desfaz o zoom e a posição da câmera da própria cena.
    const x = (f.x - cam.x) / cam.zoom;
    const y = (f.y - cam.y) / cam.zoom;
    g.lineStyle(3, COR.jogador, 1).strokeRect(x - 3, y - 3, f.w / cam.zoom + 6, f.h / cam.zoom + 6);
  }
}

/** Liga o controle nos menus do jogo inteiro (uma vez, depois de criar o jogo). */
export function ligarControleNosMenus(jogo: Phaser.Game): ControleNosMenus {
  const c = new ControleNosMenus(jogo);
  jogo.events.on(Phaser.Core.Events.STEP, (tempo: number) => c.passo(tempo));
  return c;
}
