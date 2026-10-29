import * as Phaser from 'phaser';
import { controles, exploracao, simulacao, visual } from '../../sim/content';
import type { OrigemDoDesafio } from '../../sim/exploracao';
import type { EntradaMinijogo, Minijogo, Seta } from '../../sim/minijogos';
import { PassoFixo } from '../../sim/passoFixo';
import { mixer } from '../audio/mixer';
import { usandoControle } from '../dispositivo';
import { rotuloDaAcao } from '../entrada';
import { telaDe } from '../tela';
import { brilharPainel, entrarCena, pular } from './animacao';
import { COR, corTexto, estiloTexto, painel, placa } from './estilo';
import { carregarArtes, imagemDaArte } from './artes';
import { iconeDoce, retrato } from './icones';

/** O título da janela, pela porta: o doce é fácil e a travessura, difícil. */
const TITULO_DA_PORTA: Record<OrigemDoDesafio, string> = {
  desconfiada: 'CASA DESCONFIADA',
  campainha: 'CAMPAINHA · DOCE (FÁCIL)',
  travessura: 'CAMPAINHA · TRAVESSURA (DIFÍCIL)',
};

export interface DadosDesafio {
  minijogo: Minijogo;
  /** De quem é a porta (muda o título): a Casa Desconfiada, ou a campainha (doce ou travessura). */
  origem: OrigemDoDesafio;
  /** Fecha a janela: a rua volta a rodar e a exploração aplica o resultado no tick seguinte. */
  aoFechar: () => void;
  /** Testes de tela: joga sozinho com a resposta certa. */
  automatico?: () => boolean;
}

const LARGURA = 640;
const ALTURA = 440;
/** Altura do centro da cena do minijogo, abaixo do título e da instrução. */
const CENTRO_Y = 236;
/** Quanto o resultado fica na tela antes de a janela fechar. */
const RESULTADO_MS = 1000;
/** Lado do retrato do Design Codex dentro da vidraça do Quem Bate? (a carta tem 130 × 150). */
const LADO_RETRATO = 118;

const NOMES: Record<Minijogo['tipo'], string> = {
  toque: 'Toque Combinado',
  olho: 'Olho Mágico',
  fresta: 'Doce na Fresta',
  quem: 'Quem Bate?',
};

const SIMBOLO: Record<Seta, string> = { cima: '↑', baixo: '↓', esquerda: '←', direita: '→' };

/** Para onde a pupila do Olho Mágico olha em cada seta (na tela). */
const DIRECAO_DA_SETA: Record<Seta, { x: number; y: number }> = {
  cima: { x: 0, y: -1 },
  baixo: { x: 0, y: 1 },
  esquerda: { x: -1, y: 0 },
  direita: { x: 1, y: 0 },
};

/** Cada minijogo tem a sua cor: a moldura, o título, a barra do tempo e os destaques. */
const ACENTO: Record<Minijogo['tipo'], number> = {
  toque: COR.doce,
  olho: COR.magia,
  fresta: COR.jogador,
  quem: COR.fantasma,
};

/** Quanto tempo a pupila fica em cada seta da senha. */
const OLHO_POR_SETA_S = 0.45;
/** Quanto o vidro do Quem Bate? leva para desembaçar: a fase "abrindo" do minijogo. */
const QUEM_ABRIR_S = exploracao.desconfiada.minijogos.quem.introS;

/** Teclas físicas de cada seta (as setas e o WASD). */
const TECLAS_DA_SETA: Record<Seta, string[]> = {
  cima: ['UP', 'W'],
  baixo: ['DOWN', 'S'],
  esquerda: ['LEFT', 'A'],
  direita: ['RIGHT', 'D'],
};

/** Botões do controle (layout padrão do navegador). */
const PAD = { A: 0, RB: 5, CIMA: 12, BAIXO: 13, ESQ: 14, DIR: 15 } as const;

/**
 * A porta da Casa Desconfiada (docs/PLANO_CASA_DESCONFIADA.md): o minijogo por cima da rua parada.
 * Quem decide é `src/sim/minijogos.ts`; aqui o passo fixo avança o minijogo, a entrada vira
 * `EntradaMinijogo` e a tela desenha a vista dele.
 */
export class CenaDesafio extends Phaser.Scene {
  private d!: DadosDesafio;
  private g!: Phaser.GameObjects.Graphics;
  /** O que fica por cima dos retratos (o vidro embaçado, o foco e a chuva do Quem Bate?). */
  private gFrente!: Phaser.GameObjects.Graphics;
  /** Quem Bate?: o retrato do Design Codex de cada silhueta (null: desenhado por código). */
  private retratos: (Phaser.GameObjects.Image | null)[] = [];
  private passoFixo!: PassoFixo;
  private textos: Phaser.GameObjects.Text[] = [];
  private resultado: Phaser.GameObjects.Text | null = null;
  private fechaEm: number | null = null;
  private batidasTocadas = 0;
  private toquesVistos = 0;
  private padAntes: boolean[] = [];
  private x0 = 0;
  private y0 = 0;
  /** Quando o minijogo terminou (time.now), para as animações do resultado. */
  private terminouEm: number | null = null;
  /** Olho Mágico: quando a pálpebra começou a fechar (s do minijogo). */
  private olhoFechouEm: number | null = null;
  /** Doce na Fresta: onde o doce estava no quadro anterior (o rastro). */
  private doceAntes: number | null = null;

  constructor() {
    super('CenaDesafio');
  }

  init(d: DadosDesafio): void {
    this.d = d;
    this.passoFixo = new PassoFixo(simulacao.ticksPorSegundo, simulacao.maxTicksPorQuadro);
    this.textos = [];
    // Os textos da porta anterior morreram com a cena: a segunda casa da rua recria os seus.
    this.simbolos = new Map();
    this.textoDaLegenda = null;
    this.resultado = null;
    this.fechaEm = null;
    this.batidasTocadas = 0;
    this.toquesVistos = 0;
    this.padAntes = [];
    this.terminouEm = null;
    this.olhoFechouEm = null;
    this.doceAntes = null;
    this.retratos = [];
  }

  preload(): void {
    carregarArtes(this);
  }

  create(): void {
    const { largura, altura } = telaDe(this);
    this.add.rectangle(0, 0, largura, altura, 0x000000, 0.55).setOrigin(0).setInteractive();
    this.x0 = Math.round((largura - LARGURA) / 2);
    this.y0 = Math.round((altura - ALTURA) / 2);
    const fundo = this.add.graphics();
    const m = this.d.minijogo;
    painel(fundo, this.x0, this.y0, LARGURA, ALTURA, ACENTO[m.tipo]);
    brilharPainel(this, this.x0 + 12, this.y0, LARGURA - 24, ACENTO[m.tipo]);
    entrarCena(this);
    this.texto(
      this.x0 + 28,
      this.y0 + 22,
      TITULO_DA_PORTA[this.d.origem],
      12,
      COR.textoApagado,
      true,
    );
    this.texto(this.x0 + 28, this.y0 + 40, NOMES[m.tipo], 28, corTexto(ACENTO[m.tipo]), true);
    this.texto(this.x0 + 28, this.y0 + 82, this.instrucao(), 15, COR.texto);
    this.g = this.add.graphics().setDepth(5);
    this.gFrente = this.add.graphics().setDepth(5.2);
    this.ligarEntrada();
    mixer.tocar('aldrava');
  }

  private texto(
    x: number,
    y: number,
    t: string,
    tamanho: number,
    cor: string,
    negrito = false,
  ): Phaser.GameObjects.Text {
    const o = this.add.text(x, y, t, estiloTexto(tamanho, cor, negrito)).setResolution(2);
    this.textos.push(o);
    return o;
  }

  private instrucao(): string {
    const F = usandoControle() ? 'A' : rotuloDaAcao('interagir');
    switch (this.d.minijogo.tipo) {
      case 'toque':
        return `Ouça a aldrava e repita o ritmo com ${F}.`;
      case 'olho':
        return 'Decore a senha no olho mágico e digite com o direcional.';
      case 'fresta':
        return `Aperte ${F} quando o doce passar no vão da porta.`;
      default:
        return 'Quem está batendo? Aponte a sua fantasia: ← ↑ →, ou clique.';
    }
  }

  // ------------------------------------------------------------------ entrada

  private entrar(e: EntradaMinijogo): void {
    if (!this.d.minijogo.terminou) this.d.minijogo.entrar(e);
  }

  private ligarEntrada(): void {
    const teclado = this.input.keyboard;
    if (teclado) {
      for (const k of [controles.interagir, 'SPACE', 'ENTER'])
        teclado.addKey(k.toUpperCase()).on('down', () => this.entrar({ tipo: 'toque' }));
      for (const seta of Object.keys(TECLAS_DA_SETA) as Seta[])
        for (const k of TECLAS_DA_SETA[seta])
          teclado.addKey(k).on('down', () => this.entrar({ tipo: 'seta', seta }));
    }
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const m = this.d.minijogo;
      if (m.vista.tipo === 'quem') {
        const i = this.cartaSob(p.x, p.y);
        if (i !== null) this.entrar({ tipo: 'escolha', indice: i });
        return;
      }
      this.entrar({ tipo: 'toque' });
    });
  }

  /** O controle: A ou RB batem, o direcional dá as setas. */
  private lerControle(): void {
    const pad = this.input.gamepad?.pad1;
    if (!pad) return;
    const borda = (i: number) => {
      const agora = !!pad.buttons[i]?.pressed;
      const antes = this.padAntes[i] ?? false;
      this.padAntes[i] = agora;
      return agora && !antes;
    };
    if (borda(PAD.A) || borda(PAD.RB)) this.entrar({ tipo: 'toque' });
    if (borda(PAD.CIMA)) this.entrar({ tipo: 'seta', seta: 'cima' });
    if (borda(PAD.BAIXO)) this.entrar({ tipo: 'seta', seta: 'baixo' });
    if (borda(PAD.ESQ)) this.entrar({ tipo: 'seta', seta: 'esquerda' });
    if (borda(PAD.DIR)) this.entrar({ tipo: 'seta', seta: 'direita' });
  }

  // ------------------------------------------------------------------ quadro a quadro

  override update(_tempo: number, delta: number): void {
    const m = this.d.minijogo;
    this.lerControle();
    if (!m.terminou) {
      const ticks = this.passoFixo.avancar(delta);
      for (let k = 0; k < ticks && !m.terminou; k++) {
        if (this.d.automatico?.()) {
          const certa = m.respostaCerta();
          if (certa) m.entrar(certa);
        }
        m.passo();
        this.sons();
      }
      if (m.terminou) this.mostrarResultado();
    }
    this.desenhar();
    if (this.fechaEm !== null && this.time.now >= this.fechaEm) {
      this.fechaEm = null;
      this.scene.stop();
      this.d.aoFechar();
    }
  }

  /** As batidas da aldrava (Toque Combinado) e cada toque do jogador. */
  private sons(): void {
    const v = this.d.minijogo.vista;
    if (v.tipo !== 'toque') return;
    const t = this.d.minijogo.segundos;
    while (this.batidasTocadas < v.batidas.length && v.batidas[this.batidasTocadas]! <= t) {
      this.batidasTocadas++;
      mixer.tocar('aldrava');
    }
    while (this.toquesVistos < v.toques.length) {
      this.toquesVistos++;
      mixer.tocar('aldrava', 3);
    }
  }

  private mostrarResultado(): void {
    const r = this.d.minijogo.resultado!;
    this.terminouEm = this.time.now;
    const textos = { perfeito: 'PERFEITO!', acerto: 'ACERTOU!', erro: 'ERROU!' };
    const cor = r === 'erro' ? COR.perigo : r === 'perfeito' ? COR.doce : COR.magia;
    mixer.tocar(r === 'erro' ? 'minijogoErro' : 'minijogoAcerto');
    this.resultado = this.add
      .text(this.x0 + LARGURA / 2, this.y0 + ALTURA - 66, textos[r], {
        ...estiloTexto(34, corTexto(cor), true),
      })
      .setOrigin(0.5)
      .setResolution(2)
      .setDepth(6);
    pular(this, this.resultado, 1.25);
    this.fechaEm = this.time.now + RESULTADO_MS;
  }

  // ------------------------------------------------------------------ desenho

  private desenhar(): void {
    const g = this.g.clear();
    this.gFrente.clear();
    const m = this.d.minijogo;
    const v = m.vista;
    const cx = this.x0 + LARGURA / 2;
    const cy = this.y0 + CENTRO_Y;
    this.esconderSimbolos();
    if (v.tipo === 'toque') this.desenharToque(g, cx, cy);
    else if (v.tipo === 'olho') this.desenharOlho(g, cx, cy);
    else if (v.tipo === 'fresta') this.desenharFresta(g, cx, cy);
    else this.desenharQuem(g, cx, cy);
    // O tempo que falta, embaixo.
    const w = LARGURA - 56;
    const y = this.y0 + ALTURA - 26;
    g.fillStyle(COR.borda, 1).fillRect(this.x0 + 28, y, w, 6);
    if (!m.terminou) {
      const total = m.restanteS + m.segundos;
      const f = total > 0 ? m.restanteS / total : 0;
      g.fillStyle(ACENTO[m.tipo], 0.85).fillRect(this.x0 + 28, y, w * f, 6);
    }
  }

  /** Segundos desde que o minijogo terminou (0 enquanto ele roda): as animações do resultado. */
  private depoisDoFim(): number {
    return this.terminouEm === null ? 0 : (this.time.now - this.terminouEm) / 1000;
  }

  /** Uma porta de tábuas (folha clara, frisos e painéis), com a maçaneta. */
  private porta(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    g.fillStyle(COR.placaClara, 1).fillRect(x, y, w, h);
    g.lineStyle(2, COR.borda, 0.7);
    for (let k = 1; k < 4; k++) g.lineBetween(x + (w * k) / 4, y + 4, x + (w * k) / 4, y + h - 4);
    g.lineStyle(2, COR.borda, 1).strokeRect(x + 12, y + 12, w - 24, h * 0.32);
    g.strokeRect(x + 12, y + h * 0.32 + 22, w - 24, h * 0.68 - 34);
  }

  /**
   * Toque Combinado: a porta inteira, a argola balançando e a porta tremendo a cada batida, as ondas
   * do som saindo dela e o ritmo numa pauta (as notas da casa; na sua vez, as suas e o cursor).
   */
  private desenharToque(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    const m = this.d.minijogo;
    const v = m.vista;
    if (v.tipo !== 'toque') return;
    const t = m.segundos;
    const acento = ACENTO.toque;
    const soaram = [...(v.fase === 'ouvir' ? v.batidas.filter((b) => b <= t) : []), ...v.toques];
    const desde = t - Math.max(-10, ...soaram);
    const impacto = Math.max(0, 1 - desde / 0.3);
    const tremor = Math.sin(desde * 70) * 4 * impacto;
    const pw = 132;
    const ph = 168;
    const px = cx - pw / 2 + tremor;
    const py = cy - 92;
    // Batente, folha e maçaneta.
    g.fillStyle(COR.sombra, 1).fillRect(px - 10, py - 10, pw + 20, ph + 10);
    this.porta(g, px, py, pw, ph);
    g.fillStyle(COR.doce, 0.9).fillCircle(px + pw - 16, py + ph * 0.6, 5);
    // A aldrava: a placa e a argola, que balança depois de cada batida.
    const ax = px + pw / 2;
    const ay = py + 40;
    g.fillStyle(COR.luz, 0.9).fillRect(ax - 9, ay - 12, 18, 9);
    const ang = Math.sin(desde * 16) * 0.55 * impacto;
    const rx = ax + Math.sin(ang) * 20;
    const ry = ay + Math.cos(ang) * 20;
    g.lineStyle(5, COR.luz, 0.65 + 0.35 * impacto).strokeCircle(rx, ry, 15);
    // As ondas do som: dois arcos que abrem e somem, um de cada lado.
    for (const b of soaram) {
      const d = t - b;
      if (d < 0 || d > 0.7) continue;
      const f = d / 0.7;
      g.lineStyle(3, acento, (1 - f) * 0.9);
      for (const lado of [0, Math.PI]) {
        g.beginPath();
        g.arc(rx, ry, 24 + f * 110, lado - 0.55, lado + 0.55);
        g.strokePath();
      }
    }
    // A pauta: as notas no tempo do ritmo; na sua vez, um cursor corre e os seus toques acendem.
    const xa = cx - 200;
    const xb = cx + 200;
    const yp = cy + 100;
    g.lineStyle(2, COR.borda, 1).lineBetween(xa - 12, yp, xb + 12, yp);
    const b0 = v.batidas[0]!;
    const dur = Math.max(0.01, v.batidas.at(-1)! - b0);
    const xDe = (s: number) => xa + ((s - b0) / dur) * (xb - xa);
    v.batidas.forEach((b, k) => {
      const ouvida = v.fase === 'ouvir' ? b <= t : true;
      const feita = v.fase === 'repetir' && k < v.toques.length;
      const pulo = v.fase === 'ouvir' && b <= t && t - b < 0.2 ? 1 - (t - b) / 0.2 : 0;
      g.fillStyle(feita ? acento : COR.luz, feita ? 1 : ouvida ? 0.6 : 0.15);
      g.fillCircle(xDe(b), yp - pulo * 8, 8 + pulo * 3);
    });
    if (v.fase === 'repetir' && v.toques.length > 0 && !m.terminou) {
      const cursor = b0 + (t - v.toques[0]!);
      if (cursor <= v.batidas.at(-1)! + v.janelaS)
        g.lineStyle(2, acento, 0.8).lineBetween(xDe(cursor), yp - 14, xDe(cursor), yp + 14);
    }
    this.legenda(v.fase === 'ouvir' ? 'Escute a aldrava...' : 'Sua vez: repita o ritmo!', cy + 128);
  }

  /**
   * Olho Mágico: o olho de alguém do outro lado da porta. Na hora de decorar, a pupila olha para
   * cada seta da senha, uma de cada vez; depois a pálpebra fecha e os espaços enchem conforme você
   * digita.
   */
  private desenharOlho(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    const m = this.d.minijogo;
    const v = m.vista;
    if (v.tipo !== 'olho') return;
    const acento = ACENTO.olho;
    const t = m.segundos;
    const oy = cy - 16;
    if (v.fase === 'digitar' && this.olhoFechouEm === null) this.olhoFechouEm = t;
    // A porta escura e o anel de latão do olho mágico.
    g.fillStyle(COR.sombra, 1).fillRoundedRect(cx - 170, cy - 96, 340, 172, 10);
    g.fillStyle(COR.doce, 0.3).fillCircle(cx, oy, 70);
    g.lineStyle(4, COR.doce, 0.9).strokeCircle(cx, oy, 70);
    g.fillStyle(COR.placa, 1).fillCircle(cx, oy, 62);
    const n = v.senha.length;
    const atual = Math.floor(t / OLHO_POR_SETA_S) % Math.max(1, n);
    // A pálpebra: aberta para decorar; na hora de digitar, fecha em 0,2 s.
    const fechado = this.olhoFechouEm === null ? 0 : Math.min(1, (t - this.olhoFechouEm) / 0.2);
    const abertura = 30 * (1 - fechado);
    if (abertura > 1) {
      g.fillStyle(COR.luz, 0.92).fillEllipse(cx, oy, 104, abertura * 2);
      const dir = DIRECAO_DA_SETA[v.senha[atual]!];
      const ix = cx + dir.x * 22;
      const iy = oy + dir.y * Math.min(14, abertura * 0.5);
      g.fillStyle(acento, 1).fillCircle(ix, iy, Math.min(20, abertura * 0.8));
      g.fillStyle(COR.sombra, 1).fillCircle(ix, iy, Math.min(9, abertura * 0.4));
      g.fillStyle(COR.luz, 0.9).fillCircle(ix - 5, iy - 5, 3);
    } else {
      // Fechado: a linha da pálpebra e os cílios.
      g.lineStyle(3, COR.luz, 0.8).lineBetween(cx - 50, oy, cx + 50, oy);
      for (let k = -2; k <= 2; k++) g.lineBetween(cx + k * 18, oy, cx + k * 20, oy + 8);
    }
    // Os espaços da senha: com as setas para decorar; vazios (e enchendo) para digitar.
    const passo = 52;
    const x0 = cx - ((n - 1) * passo) / 2;
    v.senha.forEach((s, k) => {
      const x = x0 + k * passo;
      const olhando = v.fase === 'olhar';
      const foco = olhando && k === atual;
      g.fillStyle(foco ? COR.cartaoFoco : COR.placaClara, 1).fillRoundedRect(
        x - 20,
        cy + 82,
        40,
        40,
        6,
      );
      if (foco) g.lineStyle(2, acento, 1).strokeRoundedRect(x - 20, cy + 82, 40, 40, 6);
      const digitada = !olhando && k < v.digitadas;
      if (!olhando && !digitada) return;
      const cor = olhando ? (foco ? corTexto(acento) : COR.texto) : corTexto(COR.doce);
      this.simbolo(`senha${k}`, x, cy + 102, SIMBOLO[s], foco ? 28 : 24, cor);
    });
    this.legenda(
      v.fase === 'olhar' ? 'Siga o olho e decore a senha!' : 'Digite a senha!',
      cy + 140,
    );
  }

  /**
   * Doce na Fresta: a porta entreaberta, a luz saindo pelo vão e a mão esperando dentro. O doce corre
   * pelo trilho com um rastro; no acerto a mão pega o doce, no erro a porta bate.
   */
  private desenharFresta(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    const m = this.d.minijogo;
    const v = m.vista;
    if (v.tipo !== 'fresta') return;
    const acento = ACENTO.fresta;
    const w = 460;
    const h = 150;
    const x0 = cx - w / 2;
    const yTopo = cy - 90;
    const fim = this.depoisDoFim();
    const erro = m.resultado === 'erro';
    // No erro, as folhas fecham sobre o vão.
    const bate = erro ? Math.min(1, fim / 0.18) : 0;
    const vao0 = x0 + w * (v.centro - v.vao / 2);
    const vaoW = w * v.vao * (1 - bate);
    const vaoX = vao0 + (w * v.vao * bate) / 2;
    // A luz de dentro, que pulsa devagar.
    const pulso = 0.2 + 0.08 * Math.sin(m.segundos * 6);
    g.fillStyle(COR.sombra, 1).fillRect(x0, yTopo, w, h);
    g.fillStyle(COR.doce, pulso + 0.1).fillRect(vaoX, yTopo, vaoW, h);
    g.fillStyle(COR.doce, pulso * 0.5).fillRect(vaoX - 14, yTopo, vaoW + 28, h);
    // As duas folhas da porta, dos lados do vão.
    this.porta(g, x0, yTopo, vaoX - x0, h);
    this.porta(g, vaoX + vaoW, yTopo, x0 + w - vaoX - vaoW, h);
    if (vaoW > 2) g.lineStyle(2, acento, 0.9).strokeRect(vaoX, yTopo, vaoW, h);
    // A mão de dentro: espera no alto do vão e desce para pegar o doce no acerto.
    const pega = !erro && m.terminou ? Math.min(1, fim / 0.25) : 0;
    const mx = vaoX + vaoW / 2;
    const my = yTopo + 14 + pega * (h / 2 - 22);
    if (vaoW > 12) {
      g.fillStyle(COR.placa, 1).fillRoundedRect(mx - 12, my - 10, 24, 20, 6);
      for (let k = -1; k <= 1; k++) g.fillRect(mx + k * 7 - 2, my + 8, 4, 8);
    }
    // O trilho e o doce, com o rastro de onde ele passou.
    const yt = yTopo + h / 2;
    g.lineStyle(3, COR.borda, 1).lineBetween(x0 + 8, yt + 14, x0 + w - 8, yt + 14);
    const pos = v.parouEm ?? v.doce;
    if (v.parouEm === null) {
      const anterior = this.doceAntes ?? pos;
      for (let k = 1; k <= 3; k++) {
        const p = pos + (anterior - pos) * k * 2;
        g.fillStyle(COR.doce, 0.25 / k).fillCircle(x0 + w * p, yt, 10);
      }
      this.doceAntes = pos;
    }
    if (pega < 1 || erro) iconeDoce(g, x0 + w * pos, yt - (erro ? 0 : pega * 6), 16);
    this.legenda('Pare o doce no vão!', cy + 84);
  }

  /**
   * Quem Bate?: a janela embaçada na chuva com três silhuetas atrás do vidro. Elas ficam nítidas
   * aos poucos; a escolhida acende na cor do minijogo.
   */
  private desenharQuem(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    const m = this.d.minijogo;
    const v = m.vista;
    if (v.tipo !== 'quem') return;
    const acento = ACENTO.quem;
    const t = m.segundos;
    const abre = v.fase === 'abrindo' ? Math.min(1, t / QUEM_ABRIR_S) : 1;
    const primeira = this.carta(0, v.opcoes.length, cx, cy);
    const ultima = this.carta(v.opcoes.length - 1, v.opcoes.length, cx, cy);
    // A moldura da janela.
    g.fillStyle(COR.sombra, 1).fillRect(
      primeira.x - 16,
      primeira.y - 14,
      ultima.x + ultima.w - primeira.x + 32,
      primeira.h + 28,
    );
    v.opcoes.forEach((f, i) => {
      const { x, y, w, h } = this.carta(i, v.opcoes.length, cx, cy);
      const foco = v.escolhida === i;
      // Cada vidraça balança de leve, fora de compasso com as outras.
      const balanco = Math.sin(t * 3 + i * 1.7) * 1.5 * abre;
      placa(g, x, y + balanco, w, h, {
        cor: foco ? COR.cartaoFoco : COR.placaClara,
        alfa: 1,
        chanfro: 4,
      });
      // O retrato da fantasia é a arte do Design Codex; sem ela, o desenho por código.
      const ry = y + h / 2 - 6 + balanco;
      if (this.retratos[i] === undefined) {
        this.retratos[i] = imagemDaArte(this, 'retrato', f, x + w / 2, ry, LADO_RETRATO);
        this.retratos[i]?.setDepth(5.1);
      }
      const imagem = this.retratos[i];
      if (imagem) imagem.setPosition(x + w / 2, ry);
      else retrato(g, f, x + w / 2, ry, 92);
      // O vidro embaçado por cima: desembaça enquanto a porta abre.
      const frente = this.gFrente;
      frente.fillStyle(COR.placaClara, 0.9 * (1 - abre)).fillRect(x, y + balanco, w, h);
      if (foco) frente.lineStyle(3, acento, 1).strokeRect(x - 2, y - 2 + balanco, w + 4, h + 4);
      const setas = ['←', '↑', '→'];
      this.simbolo(`seta${i}`, x + w / 2, y + h + 18, setas[Math.min(i, 2)]!, 18, COR.textoApagado);
    });
    // A chuva escorrendo no vidro.
    const largura = ultima.x + ultima.w - primeira.x;
    this.gFrente.lineStyle(1, COR.luz, 0.35);
    for (let k = 0; k < 18; k++) {
      const x = primeira.x + ((k * 53) % largura);
      const y = primeira.y + ((t * 160 + k * 37) % primeira.h);
      this.gFrente.lineBetween(x, y, x - 2, y + 9);
    }
  }

  private carta(i: number, n: number, cx: number, cy: number) {
    const w = 130;
    const h = 150;
    const gap = 26;
    const total = n * w + (n - 1) * gap;
    return { x: cx - total / 2 + i * (w + gap), y: cy - 84, w, h };
  }

  private cartaSob(px: number, py: number): number | null {
    const v = this.d.minijogo.vista;
    if (v.tipo !== 'quem') return null;
    const cx = this.x0 + LARGURA / 2;
    const cy = this.y0 + CENTRO_Y;
    for (let i = 0; i < v.opcoes.length; i++) {
      const c = this.carta(i, v.opcoes.length, cx, cy);
      if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) return i;
    }
    return null;
  }

  // Setas e legendas: um texto por chave, criado uma vez; a cada quadro só muda o que mudou.
  private simbolos = new Map<string, Phaser.GameObjects.Text>();
  private textoDaLegenda: Phaser.GameObjects.Text | null = null;

  private esconderSimbolos(): void {
    for (const t of this.simbolos.values()) t.setVisible(false);
  }

  private simbolo(
    chave: string,
    x: number,
    y: number,
    t: string,
    tamanho: number,
    cor: string,
  ): void {
    let o = this.simbolos.get(chave);
    if (!o) {
      o = this.add
        .text(x, y, t, estiloTexto(tamanho, cor, true))
        .setOrigin(0.5)
        .setResolution(2);
      o.setDepth(6);
      this.simbolos.set(chave, o);
    }
    if (o.text !== t) o.setText(t);
    if (o.style.color !== cor) o.setColor(cor);
    if (Number.parseFloat(String(o.style.fontSize)) !== tamanho) o.setFontSize(tamanho);
    o.setPosition(x, y).setVisible(true);
  }

  private legenda(t: string, y: number): void {
    if (!this.textoDaLegenda)
      this.textoDaLegenda = this.add
        .text(this.x0 + LARGURA / 2, y, t, estiloTexto(15, visual.paleta.luz))
        .setOrigin(0.5)
        .setResolution(2)
        .setDepth(6);
    this.textoDaLegenda.setText(t).setY(y);
    this.textoDaLegenda.setVisible(!this.d.minijogo.terminou);
  }
}
