import * as Phaser from 'phaser';

// Fonte pixel 5 × 7 desenhada por código (regra 4: nada de imagem externa; o GDD pede números de
// dano em fonte pixel). Vira um BitmapText, que troca o texto sem redesenhar canvas nem subir
// textura para a GPU a cada quadro.

export const FONTE_PIXEL = 'pixel';
/** Largura da célula de cada caractere (5 de desenho + 1 de espaço), em px. */
export const LARGURA_CELULA = 6;
/** Altura da célula (7 de desenho + 1 de espaço), em px. */
export const ALTURA_CELULA = 8;

const GLIFOS: Record<string, string> = {
  ' ': '00000,00000,00000,00000,00000,00000,00000',
  '0': '01110,10001,10011,10101,11001,10001,01110',
  '1': '00100,01100,00100,00100,00100,00100,01110',
  '2': '01110,10001,00001,00010,00100,01000,11111',
  '3': '11110,00001,00001,01110,00001,00001,11110',
  '4': '00010,00110,01010,10010,11111,00010,00010',
  '5': '11111,10000,11110,00001,00001,10001,01110',
  '6': '00110,01000,10000,11110,10001,10001,01110',
  '7': '11111,00001,00010,00100,01000,01000,01000',
  '8': '01110,10001,10001,01110,10001,10001,01110',
  '9': '01110,10001,10001,01111,00001,00010,01100',
  '/': '00001,00010,00010,00100,01000,01000,10000',
  ':': '00000,01100,01100,00000,01100,01100,00000',
  '.': '00000,00000,00000,00000,00000,01100,01100',
  ',': '00000,00000,00000,00000,01100,00100,01000',
  '+': '00000,00100,00100,11111,00100,00100,00000',
  '<': '00010,00100,01000,10000,01000,00100,00010',
  '>': '01000,00100,00010,00001,00010,00100,01000',
  '-': '00000,00000,00000,11111,00000,00000,00000',
  '%': '11000,11001,00010,00100,01000,10011,00011',
  '!': '00100,00100,00100,00100,00100,00000,00100',
  '?': '01110,10001,00001,00010,00100,00000,00100',
  '(': '00010,00100,01000,01000,01000,00100,00010',
  ')': '01000,00100,00010,00010,00010,00100,01000',
  '·': '00000,00000,00000,01100,01100,00000,00000',
  A: '01110,10001,10001,11111,10001,10001,10001',
  B: '11110,10001,10001,11110,10001,10001,11110',
  C: '01110,10001,10000,10000,10000,10001,01110',
  D: '11110,10001,10001,10001,10001,10001,11110',
  E: '11111,10000,10000,11110,10000,10000,11111',
  F: '11111,10000,10000,11110,10000,10000,10000',
  G: '01110,10001,10000,10111,10001,10001,01111',
  H: '10001,10001,10001,11111,10001,10001,10001',
  I: '01110,00100,00100,00100,00100,00100,01110',
  J: '00111,00010,00010,00010,00010,10010,01100',
  K: '10001,10010,10100,11000,10100,10010,10001',
  L: '10000,10000,10000,10000,10000,10000,11111',
  M: '10001,11011,10101,10101,10001,10001,10001',
  N: '10001,10001,11001,10101,10011,10001,10001',
  O: '01110,10001,10001,10001,10001,10001,01110',
  P: '11110,10001,10001,11110,10000,10000,10000',
  Q: '01110,10001,10001,10001,10101,10010,01101',
  R: '11110,10001,10001,11110,10100,10010,10001',
  S: '01111,10000,10000,01110,00001,00001,11110',
  T: '11111,00100,00100,00100,00100,00100,00100',
  U: '10001,10001,10001,10001,10001,10001,01110',
  V: '10001,10001,10001,10001,10001,01010,00100',
  W: '10001,10001,10001,10101,10101,10101,01010',
  X: '10001,10001,01010,00100,01010,10001,10001',
  Y: '10001,10001,01010,00100,00100,00100,00100',
  Z: '11111,00001,00010,00100,01000,10000,11111',
};

const CARACTERES = Object.keys(GLIFOS).join('');
const POR_LINHA = 16;

/** Tira acentos e passa para maiúsculas: a fonte pixel só tem o básico. */
export function paraFontePixel(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/×/g, 'X')
    .split('')
    .map((c) => (c in GLIFOS || c === '\n' ? c : ' '))
    .join('');
}

/** Registra a fonte uma vez por jogo (o cache de fontes e as texturas são do jogo inteiro). */
export function registrarFontePixel(cena: Phaser.Scene): void {
  if (cena.cache.bitmapFont.exists(FONTE_PIXEL)) return;
  const linhas = Math.ceil(CARACTERES.length / POR_LINHA);
  const canvas = document.createElement('canvas');
  canvas.width = POR_LINHA * LARGURA_CELULA;
  canvas.height = linhas * ALTURA_CELULA;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  [...CARACTERES].forEach((c, i) => {
    const ox = (i % POR_LINHA) * LARGURA_CELULA;
    const oy = Math.floor(i / POR_LINHA) * ALTURA_CELULA;
    GLIFOS[c]!.split(',').forEach((linha, y) => {
      [...linha].forEach((bit, x) => {
        if (bit === '1') ctx.fillRect(ox + x, oy + y, 1, 1);
      });
    });
  });
  if (!cena.textures.exists(FONTE_PIXEL)) cena.textures.addCanvas(FONTE_PIXEL, canvas);
  cena.textures.get(FONTE_PIXEL).setFilter(Phaser.Textures.FilterMode.NEAREST);
  const dados = Phaser.GameObjects.RetroFont.Parse(cena, {
    image: FONTE_PIXEL,
    width: LARGURA_CELULA,
    height: ALTURA_CELULA,
    chars: CARACTERES,
    charsPerRow: POR_LINHA,
    'offset.x': 0,
    'offset.y': 0,
    'spacing.x': 0,
    'spacing.y': 0,
    lineSpacing: 2,
  } as Phaser.Types.GameObjects.BitmapText.RetroFontConfig);
  cena.cache.bitmapFont.add(FONTE_PIXEL, dados);
}

/**
 * Texto em fonte pixel que só se refaz quando muda. `escala` multiplica os pixels (2 = cada pixel
 * da fonte vira 2 × 2 na tela).
 */
export class TextoPixel {
  readonly objeto: Phaser.GameObjects.BitmapText;
  private atual = '';

  constructor(cena: Phaser.Scene, x: number, y: number, escala: number, cor = 0xffffff) {
    this.objeto = cena.add.bitmapText(x, y, FONTE_PIXEL, '', LARGURA_CELULA * escala).setTint(cor);
  }

  texto(t: string): this {
    const limpo = paraFontePixel(t);
    if (limpo !== this.atual) {
      this.atual = limpo;
      this.objeto.setText(limpo);
    }
    return this;
  }
}
