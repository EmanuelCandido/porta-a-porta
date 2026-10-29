import { describe, expect, it } from 'vitest';
import { faixa, indicadorDeMira } from '../../../src/render/mira';
import { habilidades } from '../../../src/sim/content';

const forma = (id: string) => habilidades.find((h) => h.id === id)!.forma;
const origem = { x: 5, y: 5 };

describe('indicadores de mira', () => {
  it('a linha do Q vai até o alcance máximo na direção do cursor, mesmo com o cursor perto', () => {
    const ind = indicadorDeMira(forma('bruxinha_q'), origem, { x: 6, y: 5 }, 12);
    expect(ind.ponta.x).toBeCloseTo(13, 9);
    expect(ind.ponta.y).toBeCloseTo(5, 9);
    expect(ind.alcance).toBeNull();
    // Faixa com a largura do projétil.
    const ys = ind.area.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.6, 9);
  });

  it('a área do W cai no cursor dentro do alcance e na borda fora dele', () => {
    const f = forma('bruxinha_w');
    expect(indicadorDeMira(f, origem, { x: 8, y: 9 }, 12).ponta).toEqual({ x: 8, y: 9 });
    const longe = indicadorDeMira(f, origem, { x: 5, y: 30 }, 12);
    expect(longe.ponta.y).toBeCloseTo(5 + 7, 9);
    expect(longe.alcance).toHaveLength(12);
  });

  it('o dash do E mostra o trajeto de 4 tiles', () => {
    const ind = indicadorDeMira(forma('bruxinha_e'), origem, { x: 5, y: 0 }, 12);
    expect(ind.ponta.x).toBeCloseTo(5, 9);
    expect(ind.ponta.y).toBeCloseTo(1, 9);
  });

  it('faixa: retângulo com a largura pedida', () => {
    const f = faixa({ x: 0, y: 0 }, { x: 1, y: 0 }, 4, 0.5);
    expect(f).toEqual([
      { x: 0, y: 0.5 },
      { x: 4, y: 0.5 },
      { x: 4, y: -0.5 },
      { x: 0, y: -0.5 },
    ]);
  });
});
