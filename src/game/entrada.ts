import * as Phaser from 'phaser';
import { direcaoDaTela, doChao, type Iso } from '../render/iso';
import { controles } from '../sim/content';
import { definirControle, usandoControle } from './dispositivo';
import { TECLAS, type Controles, type Tecla } from '../sim/content/esquemas';
import type { V2 } from '../sim/geometria';

type Direcao = 'cima' | 'baixo' | 'esquerda' | 'direita';

/** Pedido de quem joga, já traduzido do teclado, do mouse ou do controle. */
export type Pedido =
  | {
      tipo: 'habilidade';
      tecla: Tecla;
      /** Direção do analógico (controle); sem ela, o cursor. */ dirAnalogico?: V2;
    }
  | { tipo: 'ponto'; tecla: Tecla }
  | { tipo: 'golpear'; dirAnalogico?: V2 }
  | { tipo: 'rolar' }
  | { tipo: 'lanterna' }
  | { tipo: 'consumivel'; indice: number }
  | { tipo: 'interagir' }
  | { tipo: 'travessura' };

/** Botões do controle (layout padrão do navegador). */
const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  L3: 10,
  CIMA: 12,
  ESQ: 14,
  DIR: 15,
} as const;

/** O botão direito do mouse no lugar de uma tecla (`controles.json` → `habilidades`). */
export const BOTAO_DIREITO = 'BOTAO_DIREITO';

/** O botão do controle de cada habilidade da ficha (o mesmo de `lerControle`). */
const BOTAO_DA_HABILIDADE: Record<Tecla, string> = { Q: 'X', W: 'Y', E: 'B', R: 'LT' };

/**
 * Nome curto da tecla física de uma habilidade, para a tela: no teclado "B DIR", "Q"...; no
 * controle, o botão dele (X, Y, B, LT).
 */
export function rotuloDaTecla(slot: string): string {
  if (usandoControle()) return BOTAO_DA_HABILIDADE[slot as Tecla] ?? slot;
  const fisica = controles.habilidades[slot as Tecla] ?? slot;
  return fisica === BOTAO_DIREITO ? 'B DIR' : fisica;
}

export type Acao =
  | 'interagir'
  | 'travessura'
  | 'rolar'
  | 'lanterna'
  | 'golpe'
  | 'subirPosto'
  | 'consumivel1'
  | 'consumivel2'
  | 'mapa'
  | 'pausa';

/** O botão (controle) ou a tecla (teclado) de cada ação, para as dicas da tela. */
export function rotuloDaAcao(acao: Acao): string {
  if (usandoControle())
    return {
      interagir: 'RB',
      travessura: '↑',
      rolar: 'A',
      lanterna: 'L3',
      golpe: 'RT',
      subirPosto: 'LB +',
      consumivel1: '←',
      consumivel2: '→',
      mapa: 'Back',
      pausa: 'Start',
    }[acao];
  const nome = (t: string) => (t === 'SPACE' ? 'Espaço' : t === 'SHIFT' ? 'Shift' : t);
  return {
    interagir: controles.interagir,
    travessura: controles.travessura,
    rolar: nome(controles.rolar),
    lanterna: nome(controles.lanterna),
    golpe: 'Botão esquerdo',
    subirPosto: 'Ctrl +',
    consumivel1: '1',
    consumivel2: '2',
    mapa: 'Tab',
    pausa: 'Esc',
  }[acao];
}

/**
 * Lê teclado, mouse e controle e responde em coordenadas do mundo. Controles no estilo Minecraft
 * Dungeons (PLANO_JOGABILIDADE.md): WASD ou setas andam; o botão esquerdo é o ataque básico
 * (segurar repete); as habilidades da ficha (Q, W, E, R)
 * ficam nas teclas de `controles.json` (o botão direito é a principal), miradas no cursor, com
 * lançamento rápido (segurar mostra a mira, soltar lança; Esc cancela); Ctrl + tecla gasta um
 * ponto de nível; Espaço rola; Shift é a lanterna; 1 e 2 são os consumíveis; F interage.
 */
export class EntradaDoJogador {
  private readonly setas: Record<Direcao, Phaser.Input.Keyboard.Key[]>;
  private readonly ctrl: Phaser.Input.Keyboard.Key;
  /** Habilidade presa no botão direito do mouse (se houver). */
  private readonly slotDoMouse: Tecla | null;
  /** Botão esquerdo apertado: o ataque básico continua saindo enquanto segura. */
  private esquerdo = false;
  /** Tecla de habilidade segurada, com a mira aparecendo no chão. */
  private mirando: Tecla | null = null;
  private pedidos: Pedido[] = [];
  /** Botões do controle apertados no quadro anterior (para pegar a borda). */
  private padAntes = new Set<number>();
  private padMirando: Tecla | null = null;
  /**
   * Quem joga está no controle (mexeu nele depois do mouse): a mira sai para onde a personagem
   * olha, não para o cursor parado. Mexer no mouse volta para o cursor.
   */
  get usandoControle(): boolean {
    return usandoControle();
  }

  constructor(
    private readonly cena: Phaser.Scene,
    private readonly iso: Iso,
    readonly modo: Controles['lancamento'] = controles.lancamento,
  ) {
    const teclado = cena.input.keyboard!;
    const C = Phaser.Input.Keyboard.KeyCodes;
    const codigo = (nome: string): number => {
      const c = (C as Record<string, number>)[nome];
      if (c === undefined) throw new Error(`tecla desconhecida em controles.json: ${nome}`);
      return c;
    };
    this.setas = {
      cima: [teclado.addKey(C.UP), teclado.addKey(C.W)],
      baixo: [teclado.addKey(C.DOWN), teclado.addKey(C.S)],
      esquerda: [teclado.addKey(C.LEFT), teclado.addKey(C.A)],
      direita: [teclado.addKey(C.RIGHT), teclado.addKey(C.D)],
    };
    this.ctrl = teclado.addKey(C.CTRL);
    let slotDoMouse: Tecla | null = null;
    for (const t of TECLAS) {
      const fisica = controles.habilidades[t] ?? t;
      if (fisica === BOTAO_DIREITO) {
        slotDoMouse = t;
        continue;
      }
      const tecla = teclado.addKey(codigo(fisica));
      tecla.on('down', (_k: unknown, ev?: KeyboardEvent) => this.apertou(t, ev?.ctrlKey));
      tecla.on('up', () => this.soltou(t));
    }
    this.slotDoMouse = slotDoMouse;
    teclado.addKey(C.ESC).on('down', () => (this.mirando = null));
    teclado.addKey(codigo(controles.rolar)).on('down', () => this.pedidos.push({ tipo: 'rolar' }));
    teclado
      .addKey(codigo(controles.lanterna))
      .on('down', () => this.pedidos.push({ tipo: 'lanterna' }));
    teclado.addKey(C.ONE).on('down', () => this.pedidos.push({ tipo: 'consumivel', indice: 0 }));
    teclado.addKey(C.TWO).on('down', () => this.pedidos.push({ tipo: 'consumivel', indice: 1 }));
    teclado
      .addKey(codigo(controles.interagir))
      .on('down', () => this.pedidos.push({ tipo: 'interagir' }));
    teclado
      .addKey(codigo(controles.travessura))
      .on('down', () => this.pedidos.push({ tipo: 'travessura' }));

    cena.input.mouse?.disableContextMenu();
    // O botão direito é uma habilidade como as teclas: segurar mira, soltar lança.
    // Vale o botão que gerou o evento: num clique rápido, o botão já foi solto quando o Phaser
    // processa o "apertou" (perguntar se está apertado agora perderia o clique).
    const direito = (p: Phaser.Input.Pointer) => (p.event as MouseEvent | undefined)?.button === 2;
    const esquerdo = (p: Phaser.Input.Pointer) => (p.event as MouseEvent | undefined)?.button === 0;
    cena.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (direito(p) && this.slotDoMouse)
        this.apertou(this.slotDoMouse, (p.event as MouseEvent | undefined)?.ctrlKey);
      // Botão esquerdo: ataque básico na direção do cursor (um clique rápido também conta).
      if (esquerdo(p)) {
        this.esquerdo = true;
        this.pedidos.push({ tipo: 'golpear' });
      }
    });
    cena.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (direito(p) && this.slotDoMouse) this.soltou(this.slotDoMouse);
      if (esquerdo(p)) this.esquerdo = false;
    });
  }

  /** `ctrl` vem do próprio evento (mais confiável que o estado da tecla Ctrl). */
  private apertou(t: Tecla, ctrl = this.ctrl.isDown): void {
    if (ctrl) {
      this.pedidos.push({ tipo: 'ponto', tecla: t });
      return;
    }
    if (this.modo === 'apertar') this.pedidos.push({ tipo: 'habilidade', tecla: t });
    else this.mirando = t;
  }

  private soltou(t: Tecla): void {
    if (this.mirando !== t) return;
    this.mirando = null;
    this.pedidos.push({ tipo: 'habilidade', tecla: t });
  }

  /** O botão esquerdo (ou o gatilho direito do controle) está apertado: golpes seguidos. */
  get segurandoAtaque(): boolean {
    return this.esquerdo || (this.pad?.buttons[PAD.RT]?.pressed ?? false);
  }

  /** Tecla cuja mira está no chão agora (teclado ou controle). */
  get teclaMirando(): Tecla | null {
    return this.mirando ?? this.padMirando;
  }

  /** Pedidos desde a última leitura, em ordem. */
  tirarPedidos(): Pedido[] {
    this.lerControle();
    const p = this.pedidos;
    this.pedidos = [];
    return p;
  }

  private get pad(): Phaser.Input.Gamepad.Gamepad | undefined {
    return this.cena.input.gamepad?.pad1;
  }

  /** Analógico direito do controle, já no mundo (ou null se parado). */
  analogicoDireito(): V2 | null {
    const pad = this.pad;
    if (!pad) return null;
    const { x, y } = pad.rightStick;
    if (Math.hypot(x, y) <= controles.zonaMortaAnalogico) return null;
    return direcaoDaTela({ x, y }, this.iso);
  }

  /**
   * Controle: X, Y, B e gatilho esquerdo lançam ao soltar (LB + botão gasta o ponto); RT golpeia;
   * A rola; L3 é a lanterna; RB interage (doce) e o direcional para cima pede travessura; o
   * direcional para os lados usa os consumíveis. Start e Back ficam com src/game/controleNosMenus.ts.
   */
  private lerControle(): void {
    const pad = this.pad;
    if (!pad) return;
    const agora = new Set<number>();
    pad.buttons.forEach((b, i) => {
      if (b.pressed) agora.add(i);
    });
    const zona = controles.zonaMortaAnalogico;
    const mexeu =
      Math.hypot(pad.leftStick.x, pad.leftStick.y) > zona ||
      Math.hypot(pad.rightStick.x, pad.rightStick.y) > zona;
    if (agora.size > 0 || mexeu) definirControle(true);
    const borda = (i: number) => agora.has(i) && !this.padAntes.has(i);
    const solto = (i: number) => !agora.has(i) && this.padAntes.has(i);
    const mapa: [number, Tecla][] = [
      [PAD.X, 'Q'],
      [PAD.Y, 'W'],
      [PAD.B, 'E'],
      [PAD.LT, 'R'],
    ];
    for (const [botao, tecla] of mapa) {
      if (borda(botao)) {
        if (agora.has(PAD.LB)) this.pedidos.push({ tipo: 'ponto', tecla });
        else this.padMirando = tecla;
      }
      if (solto(botao) && this.padMirando === tecla) {
        this.padMirando = null;
        this.pedidos.push({
          tipo: 'habilidade',
          tecla,
          dirAnalogico: this.analogicoDireito() ?? undefined,
        });
      }
    }
    if (borda(PAD.RT))
      this.pedidos.push({ tipo: 'golpear', dirAnalogico: this.analogicoDireito() ?? undefined });
    if (borda(PAD.A)) this.pedidos.push({ tipo: 'rolar' });
    if (borda(PAD.L3)) this.pedidos.push({ tipo: 'lanterna' });
    if (borda(PAD.ESQ)) this.pedidos.push({ tipo: 'consumivel', indice: 0 });
    if (borda(PAD.DIR)) this.pedidos.push({ tipo: 'consumivel', indice: 1 });
    if (borda(PAD.RB)) this.pedidos.push({ tipo: 'interagir' });
    // Direcional para cima: na campainha, pede travessura (o RB pede doce).
    if (borda(PAD.CIMA)) this.pedidos.push({ tipo: 'travessura' });
    this.padAntes = agora;
  }

  /** Direção no mundo, com comprimento até 1. O analógico vale mais que as setas se estiver em uso. */
  direcao(): V2 {
    const pad = this.pad;
    if (pad) {
      const { x, y } = pad.leftStick;
      if (Math.hypot(x, y) > controles.zonaMortaAnalogico) return direcaoDaTela({ x, y }, this.iso);
    }
    const apertada = (d: Direcao) => this.setas[d].some((k) => k.isDown);
    const tela = {
      x: (apertada('direita') ? 1 : 0) - (apertada('esquerda') ? 1 : 0),
      y: (apertada('baixo') ? 1 : 0) - (apertada('cima') ? 1 : 0),
    };
    const n = Math.hypot(tela.x, tela.y);
    return n === 0 ? tela : direcaoDaTela({ x: tela.x / n, y: tela.y / n }, this.iso);
  }

  /** Ponto do chão sob o cursor, onde as habilidades miram. */
  cursor(): V2 {
    return this.noChao(this.cena.input.activePointer);
  }

  private noChao(p: Phaser.Input.Pointer): V2 {
    const mundo = this.cena.cameras.main.getWorldPoint(p.x, p.y);
    return doChao({ x: mundo.x, y: mundo.y }, this.iso);
  }
}
