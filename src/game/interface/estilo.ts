import type * as Phaser from 'phaser';
import { visual } from '../../sim/content';

// Linguagem visual da interface (docs/DESIGN.md, seção 7): placas azul-noite semitransparentes com
// cantos chanfrados (o low-poly do cenário na interface), borda e filete claros, sem gradiente. Os
// menus usam a moldura (cantoneiras e faixa na cor do jogador). As cores de acento só marcam o que
// é do jogador, magia, cura, perigo e doces.

const hex = (c: string) => Number.parseInt(c.slice(1), 16);
const tema = visual.interface.tema;

export const COR = {
  placa: hex(tema.painel),
  placaClara: hex(tema.painelClaro),
  borda: hex(tema.borda),
  sombra: hex(tema.sombra),
  cartao: hex(tema.cartao),
  cartaoFoco: hex(tema.cartaoFoco),
  filete: hex(tema.filete),
  texto: visual.paleta.luz,
  textoApagado: '#8E909C',
  apagado: 0x5d5f6a,
  jogador: Number.parseInt(visual.acentos.jogador.slice(1), 16),
  magia: Number.parseInt(visual.acentos.magia.slice(1), 16),
  fantasma: Number.parseInt(visual.acentos.fantasma.slice(1), 16),
  perigo: Number.parseInt(visual.acentos.perigo.slice(1), 16),
  doce: Number.parseInt(visual.acentos.doce.slice(1), 16),
  luz: Number.parseInt(visual.paleta.luz.slice(1), 16),
};

export const ALFA_PLACA = visual.interface.alfaPlaca;
/** Chanfro dos cantos das placas, em px. */
export const CHANFRO = 6;

/** Fonte dos rótulos e frases (os números vão em fonte pixel). */
export const FONTE_TEXTO = '"Segoe UI", "Trebuchet MS", system-ui, sans-serif';

function cantos(x: number, y: number, w: number, h: number, c: number): number[] {
  return [
    x + c,
    y,
    x + w - c,
    y,
    x + w,
    y + c,
    x + w,
    y + h - c,
    x + w - c,
    y + h,
    x + c,
    y + h,
    x,
    y + h - c,
    x,
    y + c,
  ];
}

function caminho(g: Phaser.GameObjects.Graphics, pts: number[]): void {
  g.beginPath();
  g.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
  g.closePath();
}

/** Placa chanfrada com borda azul e filete claro. */
export function placa(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  opcoes: { cor?: number; alfa?: number; filete?: number; chanfro?: number } = {},
): void {
  const c = opcoes.chanfro ?? CHANFRO;
  const pts = cantos(x, y, w, h, c);
  g.fillStyle(opcoes.cor ?? COR.placa, opcoes.alfa ?? ALFA_PLACA);
  caminho(g, pts);
  g.fillPath();
  g.lineStyle(1, COR.borda, 0.9);
  g.strokePath();
  // Filete claro por dentro da borda, só em cima: a luz da noite batendo na placa.
  g.lineStyle(1, opcoes.filete ?? COR.filete, 0.12).lineBetween(x + c, y + 1.5, x + w - c, y + 1.5);
}

/**
 * Painel de menu: sombra, placa, faixa de cima na cor do jogador e cantoneiras. É a moldura de
 * todas as telas por cima do jogo (porta, loja, pausa, evolução, fim da run).
 */
export function painel(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  destaque: number = COR.jogador,
): void {
  const c = CHANFRO * 2;
  g.fillStyle(COR.sombra, 0.55);
  caminho(g, cantos(x + 6, y + 8, w, h, c));
  g.fillPath();
  placa(g, x, y, w, h, { chanfro: c, alfa: 0.97 });
  g.fillStyle(destaque, 1).fillRect(x + c, y, w - 2 * c, 3);
  // Cantoneiras: um L em cada canto, por dentro da borda.
  const l = 18;
  const m = 7;
  g.lineStyle(2, destaque, 0.9);
  for (const [cx, cy, sx, sy] of [
    [x + m, y + m, 1, 1],
    [x + w - m, y + m, -1, 1],
    [x + m, y + h - m, 1, -1],
    [x + w - m, y + h - m, -1, -1],
  ] as const) {
    g.lineBetween(cx, cy, cx + sx * l, cy);
    g.lineBetween(cx, cy, cx, cy + sy * l);
  }
}

/** Cartão dentro de um painel (item da loja, preço, arte): normal, com foco ou apagado. */
export function cartao(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  estado: 'normal' | 'foco' | 'apagado' = 'normal',
  borda: number = COR.borda,
): void {
  g.fillStyle(estado === 'foco' ? COR.cartaoFoco : COR.cartao, estado === 'apagado' ? 0.55 : 0.95);
  caminho(g, cantos(x, y, w, h, 4));
  g.fillPath();
  g.lineStyle(estado === 'foco' ? 2 : 1, estado === 'foco' ? COR.jogador : borda, 0.9);
  g.strokePath();
}

/** Etiqueta arredondada (preço, marca, atalho). */
export function etiqueta(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  cor: number,
  alfa = 0.2,
): void {
  g.fillStyle(cor, alfa).fillRoundedRect(x, y, w, h, Math.min(8, h / 2));
  g.lineStyle(1, cor, 0.85).strokeRoundedRect(x, y, w, h, Math.min(8, h / 2));
}

/** Cor do texto (string) a partir de uma cor numérica do tema. */
export function corTexto(cor: number): string {
  return `#${cor.toString(16).padStart(6, '0')}`;
}

/** Barra com fundo, preenchimento e, opcionalmente, o rastro do valor que acabou de cair. */
export function barra(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  fracao: number,
  cor: number,
  rastro?: number,
): void {
  const f = Math.max(0, Math.min(1, fracao));
  g.fillStyle(0x000000, 0.55).fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle(COR.placaClara, 1).fillRect(x, y, w, h);
  if (rastro !== undefined && rastro > f)
    g.fillStyle(COR.luz, 0.55).fillRect(x + w * f, y, w * (Math.min(1, rastro) - f), h);
  g.fillStyle(cor, 1).fillRect(x, y, w * f, h);
  // Brilho chapado no terço de cima: lê como volume sem gradiente.
  if (h >= 6) g.fillStyle(0xffffff, 0.18).fillRect(x, y, w * f, Math.max(1, Math.floor(h / 3)));
}

export function estiloTexto(
  tamanho: number,
  cor = COR.texto,
  negrito = false,
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONTE_TEXTO,
    fontSize: `${tamanho}px`,
    fontStyle: negrito ? 'bold' : 'normal',
    color: cor,
    stroke: '#000000',
    strokeThickness: 3,
  };
}

/**
 * Texto comum que só se refaz quando o conteúdo ou a cor mudam (um Text do Phaser redesenha o canvas
 * e sobe a textura a cada `setText`, mesmo com o mesmo valor).
 */
export class TextoFixo {
  readonly objeto: Phaser.GameObjects.Text;
  private atual = '';
  private corAtual: string;

  constructor(
    cena: Phaser.Scene,
    x: number,
    y: number,
    estilo: Phaser.Types.GameObjects.Text.TextStyle,
  ) {
    this.objeto = cena.add.text(x, y, '', estilo).setResolution(2);
    this.corAtual = String(estilo.color ?? '');
  }

  texto(t: string, cor?: string): this {
    if (t !== this.atual) {
      this.atual = t;
      this.objeto.setText(t);
    }
    if (cor && cor !== this.corAtual) {
      this.corAtual = cor;
      this.objeto.setColor(cor);
    }
    return this;
  }
}
