import { describe, expect, it } from 'vitest';
import { chaveDeTextura, modeloDe } from '../../../src/render/catalogo';
import { criarIso } from '../../../src/render/iso';
import { comMatiz, girarMatiz, tingir } from '../../../src/render/matiz';
import { album, visual } from '../../../src/sim/content';

const ctx = { iso: criarIso(visual.tile), visual };

/** Matiz (graus) de uma cor #RRGGBB. */
function matiz(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function cores(m: ReturnType<typeof modeloDe>): string[] {
  return m.partes.flatMap((p) =>
    p.faces.flatMap((f) =>
      f.material.tipo === 'tom'
        ? [f.material.tons.faceEsquerda]
        : f.material.tipo === 'emissivo'
          ? [f.material.cor]
          : ['solido'],
    ),
  );
}

describe('cores alternativas (giro de matiz)', () => {
  it('tingir mantém o cinza claro ou escuro e puxa para a cor da tinta', () => {
    const t = tingir('#808080', '#7CF2B0', 0.5);
    const [r, g] = [1, 3].map((i) => Number.parseInt(t.slice(i, i + 2), 16));
    expect(g!).toBeGreaterThan(r!);
    expect(Math.abs(g! - 0x80)).toBeLessThan(24);
    expect(tingir('#808080', '#7CF2B0', 0)).toBe('#808080');
  });

  it('cinzas ficam iguais; cores vivas giram e mantêm o brilho', () => {
    for (const cinza of [visual.paleta.chao, visual.paleta.topo, visual.paleta.luz, '#000000'])
      expect(girarMatiz(cinza, 120)).toBe(cinza.toUpperCase());
    const laranja = visual.acentos.jogador;
    const verde = girarMatiz(laranja, 118);
    expect(Math.abs(matiz(verde) - matiz(visual.acentos.fantasma))).toBeLessThan(6);
    expect(girarMatiz(laranja, 360)).toBe(laranja.toUpperCase());
    expect(girarMatiz(girarMatiz(laranja, 90), -90)).toBe(laranja.toUpperCase());
  });

  it('as cores do Álbum mudam o desenho de cada fantasia e a textura ganha outra chave', () => {
    for (const [campeao, lista] of Object.entries(album.cores)) {
      const fig = { modelo: campeao as 'bruxinha', x: 0, y: 0, rot: 0 as const };
      const original = cores(modeloDe(fig, ctx));
      for (const cor of lista) {
        const outra = cores(modeloDe({ ...fig, matiz: cor.matiz }, ctx));
        expect(outra).toHaveLength(original.length);
        expect(outra.filter((c, i) => c !== original[i]).length).toBeGreaterThan(0);
        expect(chaveDeTextura({ ...fig, matiz: cor.matiz })).not.toBe(chaveDeTextura(fig));
      }
    }
  });

  it('sem matiz, o modelo é o mesmo objeto', () => {
    const m = modeloDe({ modelo: 'bruxinha', x: 0, y: 0, rot: 0 }, ctx);
    expect(comMatiz(m, { graus: 0, tinta: '#FFFFFF', fracao: 1, solido: visual.paleta })).toBe(m);
  });
});
