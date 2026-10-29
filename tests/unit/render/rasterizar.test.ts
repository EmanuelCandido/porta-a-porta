import { describe, expect, it } from 'vitest';
import { rasterizar, reduzir, type TrianguloRaster } from '../../../src/render/rasterizar';

const quadrado = (prof: number, cor: string, emissivo = false): TrianguloRaster[] => [
  {
    pts: [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 0, y: 8 },
    ],
    prof: [prof, prof, prof],
    cor,
    emissivo,
  },
  {
    pts: [
      { x: 8, y: 0 },
      { x: 8, y: 8 },
      { x: 0, y: 8 },
    ],
    prof: [prof, prof, prof],
    cor,
    emissivo,
  },
];

const corEm = (r: { base: Uint8ClampedArray; largura: number }, x: number, y: number) => {
  const i = (y * r.largura + x) * 4;
  return [r.base[i], r.base[i + 1], r.base[i + 2], r.base[i + 3]];
};

describe('raster com z-buffer das malhas', () => {
  it('em cada pixel fica o triângulo mais perto, em qualquer ordem', () => {
    const perto = quadrado(5, '#FF0000');
    const longe = quadrado(1, '#0000FF');
    for (const ordem of [
      [...perto, ...longe],
      [...longe, ...perto],
    ]) {
      const r = rasterizar(ordem, 8, 8);
      expect(corEm(r, 4, 4)).toEqual([255, 0, 0, 255]);
    }
  });

  it('fora dos triângulos fica transparente, e só o que brilha vai para a camada de brilho', () => {
    const r = rasterizar(
      [
        {
          pts: [
            { x: 0, y: 0 },
            { x: 4, y: 0 },
            { x: 0, y: 4 },
          ],
          prof: [1, 1, 1],
          cor: '#00FF00',
          emissivo: true,
        },
      ],
      8,
      8,
    );
    expect(corEm(r, 7, 7)[3]).toBe(0);
    expect(r.emissivo).not.toBeNull();
    expect(r.emissivo![3]).toBe(255);
    expect(rasterizar(quadrado(1, '#808080'), 8, 8).emissivo).toBeNull();
  });

  it('a redução faz a média de cada bloco, pesada pelo alfa (borda meio coberta)', () => {
    // 2 × 1: um pixel vermelho opaco e um transparente viram 1 pixel vermelho com metade do alfa.
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 0]);
    const red = reduzir(rgba, 2, 2, 2);
    expect(red.largura).toBe(1);
    expect(Array.from(red.rgba)).toEqual([255, 0, 0, 128]);
  });
});
