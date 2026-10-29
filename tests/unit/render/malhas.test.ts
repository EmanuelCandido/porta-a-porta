import { describe, expect, it } from 'vitest';
import { modeloDe } from '../../../src/render/catalogo';
import { poligonosDasPartes } from '../../../src/render/geometria';
import { criarIso, direcaoDaCamera, produtoEscalar } from '../../../src/render/iso';
import { dadosDaMalha, escurecer, modeloDaMalha, temMalha } from '../../../src/render/malhas';
import { instanciar } from '../../../src/render/modelos';
import { visual } from '../../../src/sim/content';
import type { NomeModelo } from '../../../src/sim/content/esquemas';

const iso = criarIso(visual.tile);
const ctx = { iso, visual };
const NOMES = Object.keys(visual.malhas.alturaPx) as NomeModelo[];

describe('malhas dos GLBs do Design Codex', () => {
  it('toda malha configurada existe, com paleta e cores válidas', () => {
    expect(NOMES.length).toBe(40);
    for (const n of NOMES) {
      expect(temMalha(n)).toBe(true);
      const d = dadosDaMalha(n)!;
      expect(d.triangulos.length).toBe(d.cores.length * 9);
      for (const c of d.cores) expect(d.paleta[c]).toMatch(/^#[0-9A-F]{6}$/);
      for (const i of d.brilham ?? []) expect(i).toBeLessThan(d.cores.length);
    }
  });

  it('cada uma fica com a altura do jogo, no chão e no centro da pegada', () => {
    for (const n of NOMES) {
      const m = modeloDaMalha(ctx, n);
      const pts = m.partes.flatMap((p) => p.faces.flatMap((f) => f.pts));
      const zs = pts.map((p) => p.z);
      expect(Math.min(...zs)).toBeCloseTo(0, 6);
      expect(Math.max(...zs)).toBeCloseTo(visual.malhas.alturaPx[n]!, 1);
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(m.largura / 2, 6);
      expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(m.profundidade / 2, 6);
    }
  });

  it('o catálogo desenha esses modelos pela malha', () => {
    const m = modeloDe({ modelo: 'bruxinha', x: 0, y: 0, rot: 0 }, ctx);
    expect(m.partes).toHaveLength(1);
    expect(m.partes[0]!.malha).toBe(true);
  });

  it('as faces da malha saem do fundo para a frente, em qualquer rotação', () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const inst = instanciar(modeloDaMalha(ctx, 'pestinha_lencol'), 0, 0, rot);
      const p = inst.partes[0]!;
      const polys = poligonosDasPartes([p], iso, visual.paleta, visual.volumes.limiarTopo);
      // As duas faces de cada triângulo aparecem (o lençol é aberto embaixo).
      expect(polys.length).toBe(p.faces.length);
      const camera = direcaoDaCamera(iso);
      const prof = p.faces
        .map((f) => {
          const c = f.pts.reduce((s, q) => ({ x: s.x + q.x, y: s.y + q.y, z: s.z + q.z }), {
            x: 0,
            y: 0,
            z: 0,
          });
          return produtoEscalar({ x: c.x / 3, y: c.y / 3, z: c.z / 3 / iso.zPorTile }, camera);
        })
        .sort((a, b) => a - b);
      expect(prof[0]!).toBeLessThan(prof.at(-1)!);
    }
  });

  it('os tons da face escurecem a cor dela pelos fatores do visual', () => {
    expect(escurecer('#808080', 0.5)).toBe('#404040');
    expect(escurecer('#FF8000', 1)).toBe('#FF8000');
    expect(escurecer('#C08040', 1.5)).toBe('#FFC060');
  });
});
