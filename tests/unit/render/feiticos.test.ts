import { describe, expect, it } from 'vitest';
import {
  arcoDaPocao,
  direcaoDaFaisca,
  estrela,
  pontoEspalhado,
  vassouraVoando,
} from '../../../src/render/feiticos';

describe('geometria dos feitiços', () => {
  it('a estrela alterna ponta e vão, todos em volta do centro', () => {
    const pts = estrela(10, 20, 6, 0, 4);
    expect(pts).toHaveLength(8);
    expect(Math.hypot(pts[0]!.x - 10, pts[0]!.y - 20)).toBeCloseTo(6, 9);
    expect(Math.hypot(pts[1]!.x - 10, pts[1]!.y - 20)).toBeLessThan(6);
  });

  it('a vassoura voa com o cabo para a frente e a palha aberta atrás', () => {
    const v = vassouraVoando(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { cabo: 0.5, palha: 0.3, larguraPalha: 0.4 },
    );
    expect(v.cabo[0].x).toBeGreaterThan(0);
    expect(Math.min(...v.palha.map((p) => p.x))).toBeLessThan(v.cabo[1].x);
    const largura = Math.max(...v.palha.map((p) => p.y)) - Math.min(...v.palha.map((p) => p.y));
    expect(largura).toBeCloseTo(0.4, 9);
  });

  it('a poção sai da mão, sobe no meio do caminho e cai no alvo', () => {
    const o = { x: 0, y: 0 };
    const d = { x: 4, y: 0 };
    expect(arcoDaPocao(o, d, 0, 70, 14)).toEqual({ chao: o, zPx: 14 });
    expect(arcoDaPocao(o, d, 0.5, 70, 14).zPx).toBeCloseTo(7 + 70, 9);
    const fim = arcoDaPocao(o, d, 1, 70, 14);
    expect(fim.chao).toEqual(d);
    expect(fim.zPx).toBeCloseTo(0, 9);
  });

  it('pontos espalhados ficam dentro do círculo e não se repetem', () => {
    const pts = Array.from({ length: 16 }, (_, k) => pontoEspalhado({ x: 3, y: 3 }, 2, k));
    for (const p of pts) expect(Math.hypot(p.x - 3, p.y - 3)).toBeLessThanOrEqual(2);
    expect(new Set(pts.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`)).size).toBe(16);
    const d = direcaoDaFaisca(1, 4);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 9);
  });
});
