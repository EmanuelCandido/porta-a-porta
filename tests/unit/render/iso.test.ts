import { describe, expect, it } from 'vitest';
import { criarIso, direcaoDaCamera, doChao, paraTela } from '../../../src/render/iso';

const iso = criarIso({ largura: 64, altura: 32 });

describe('projeção isométrica 2:1', () => {
  it('leva os eixos do tile para as diagonais da tela', () => {
    expect(paraTela({ x: 1, y: 0, z: 0 }, iso)).toEqual({ x: 32, y: 16 });
    expect(paraTela({ x: 0, y: 1, z: 0 }, iso)).toEqual({ x: -32, y: 16 });
    expect(paraTela({ x: 0, y: 0, z: 24 }, iso)).toEqual({ x: 0, y: -24 });
  });

  it('volta da tela para o chão', () => {
    for (const p of [
      { x: 3.5, y: 7.25 },
      { x: 0, y: 0 },
      { x: 22, y: 8 },
    ]) {
      const volta = doChao(paraTela({ ...p, z: 0 }, iso), iso);
      expect(volta.x).toBeCloseTo(p.x, 9);
      expect(volta.y).toBeCloseTo(p.y, 9);
    }
  });

  it('deriva a escala vertical de um tile da elevação de 30°', () => {
    expect(iso.zPorTile).toBeCloseTo(39.19, 2);
  });

  it('a direção da câmera é unitária e some na projeção', () => {
    const d = direcaoDaCamera(iso);
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 9);
    const t = paraTela({ x: d.x, y: d.y, z: d.z * iso.zPorTile }, iso);
    expect(t.x).toBeCloseTo(0, 9);
    expect(t.y).toBeCloseTo(0, 9);
  });
});
