import { describe, expect, it } from 'vitest';
import { resolucaoDasTexturas } from '../../../src/render/resolucao';
import { visual } from '../../../src/sim/content';

describe('resolução das texturas assadas', () => {
  const { zoomMax } = visual.camera;
  const teto = visual.volumes.resolucaoTexturaMax;

  it('tela comum: assa no zoom máximo da câmera, abaixo do teto', () => {
    expect(resolucaoDasTexturas(1, zoomMax, teto)).toBeCloseTo(zoomMax);
    expect(resolucaoDasTexturas(1, zoomMax, teto)).toBeLessThan(teto);
  });

  it('tela de alta densidade: para no teto', () => {
    expect(resolucaoDasTexturas(2, zoomMax, teto)).toBe(teto);
    expect(resolucaoDasTexturas(3, zoomMax, teto)).toBe(teto);
  });

  it('nunca abaixo de 1:1, nem com DPR estranho', () => {
    expect(resolucaoDasTexturas(0.5, 1, teto)).toBe(1);
    expect(resolucaoDasTexturas(Number.NaN, 1, teto)).toBe(1);
    expect(resolucaoDasTexturas(0, zoomMax, teto)).toBeCloseTo(zoomMax);
  });
});
