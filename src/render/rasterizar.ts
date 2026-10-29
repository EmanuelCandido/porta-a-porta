import type { Vec2 } from './iso';

/** Triângulo pronto para o raster: pontos em px do buffer, profundidade por vértice e a cor. */
export interface TrianguloRaster {
  pts: [Vec2, Vec2, Vec2];
  /** Maior = mais perto da câmera. */
  prof: [number, number, number];
  cor: string;
  emissivo: boolean;
}

export interface Raster {
  largura: number;
  altura: number;
  /** RGBA da cor de cada pixel (alfa 0 onde não há malha). */
  base: Uint8ClampedArray;
  /** RGBA só dos pixels que brilham; null se nenhum brilha. */
  emissivo: Uint8ClampedArray | null;
}

function rgb(cor: string): [number, number, number] {
  const n = Number.parseInt(cor.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Desenha os triângulos de uma malha com teste de profundidade por pixel (z-buffer): em cada pixel
 * fica o triângulo mais perto da câmera, sem depender da ordem. Malhas não convexas (chapéu sobre o
 * rosto, braço na frente do corpo) não têm uma ordem de pintor que sirva sempre.
 */
export function rasterizar(
  tris: readonly TrianguloRaster[],
  largura: number,
  altura: number,
): Raster {
  const n = largura * altura;
  const z = new Float64Array(n).fill(-Infinity);
  const cor = new Int32Array(n).fill(-1);
  const brilha = new Uint8Array(n);
  const cores = tris.map((t) => rgb(t.cor));
  tris.forEach((t, k) => {
    const [a, b, c] = t.pts;
    const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(area) < 1e-9) return;
    const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
    const x1 = Math.min(largura - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
    const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
    const y1 = Math.min(altura - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5;
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        // Coordenadas baricêntricas (o sinal da área cobre os dois sentidos de giro).
        const w0 = ((b.x - px) * (c.y - py) - (b.y - py) * (c.x - px)) / area;
        const w1 = ((c.x - px) * (a.y - py) - (c.y - py) * (a.x - px)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const d = w0 * t.prof[0] + w1 * t.prof[1] + w2 * t.prof[2];
        const i = y * largura + x;
        if (d <= z[i]!) continue;
        z[i] = d;
        cor[i] = k;
        brilha[i] = t.emissivo ? 1 : 0;
      }
    }
  });
  const base = new Uint8ClampedArray(n * 4);
  let algumBrilho = false;
  for (let i = 0; i < n; i++) {
    const k = cor[i]!;
    if (k < 0) continue;
    const c = cores[k]!;
    base[i * 4] = c[0];
    base[i * 4 + 1] = c[1];
    base[i * 4 + 2] = c[2];
    base[i * 4 + 3] = 255;
    if (brilha[i]) algumBrilho = true;
  }
  let emissivo: Uint8ClampedArray | null = null;
  if (algumBrilho) {
    emissivo = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      if (!brilha[i]) continue;
      for (let c = 0; c < 4; c++) emissivo[i * 4 + c] = base[i * 4 + c]!;
    }
  }
  return { largura, altura, base, emissivo };
}

/**
 * Reduz um buffer RGBA `fator` vezes, com média de cada bloco (cor ponderada pelo alfa): é a
 * superamostragem que tira o serrilhado das bordas.
 */
export function reduzir(
  rgba: Uint8ClampedArray,
  largura: number,
  altura: number,
  fator: number,
): { rgba: Uint8ClampedArray; largura: number; altura: number } {
  const l = Math.floor(largura / fator);
  const h = Math.floor(altura / fator);
  const saida = new Uint8ClampedArray(l * h * 4);
  const amostras = fator * fator;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < fator; dy++) {
        for (let dx = 0; dx < fator; dx++) {
          const i = ((y * fator + dy) * largura + x * fator + dx) * 4;
          const al = rgba[i + 3]!;
          r += rgba[i]! * al;
          g += rgba[i + 1]! * al;
          b += rgba[i + 2]! * al;
          a += al;
        }
      }
      const o = (y * l + x) * 4;
      if (a > 0) {
        saida[o] = r / a;
        saida[o + 1] = g / a;
        saida[o + 2] = b / a;
      }
      saida[o + 3] = a / amostras;
    }
  }
  return { rgba: saida, largura: l, altura: h };
}
