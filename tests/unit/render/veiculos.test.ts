import { describe, expect, it } from 'vitest';
import { modeloDe } from '../../../src/render/catalogo';
import { ordenarPartes, poligonosDasPartes } from '../../../src/render/geometria';
import { criarIso } from '../../../src/render/iso';
import { instanciar, type Rotacao } from '../../../src/render/modelos';
import { visual } from '../../../src/sim/content';
import { VARIANTES_DE_CARRO, type ObjetoRua } from '../../../src/sim/content/esquemas';

const iso = criarIso(visual.tile);
const ctx = { iso, visual };
const ROTACOES: Rotacao[] = [0, 90, 180, 270];

type P = { x: number; y: number };

function dentro(p: P, poly: P[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/**
 * Pinta o carro como o pintor (amostrando a tela) e mede quanto do que é da cabine (as partes que
 * chegam ao teto) fica por cima no fim: a carroceria desenhada depois apagaria a parte de cima.
 */
function cabineVisivel(variante: string, rot: Rotacao): number {
  const objeto: ObjetoRua = { modelo: 'carro', x: 0, y: 0, rot: 0, variante };
  const partes = ordenarPartes(instanciar(modeloDe(objeto, ctx), 0, 0, rot).partes, iso);
  const zs = (p: (typeof partes)[number]) => p.faces.flatMap((f) => f.pts.map((q) => q.z));
  const teto = Math.max(...partes.flatMap(zs));
  const camadas = partes.map((p) => ({
    cabine: Math.max(...zs(p)) >= teto - 4,
    polys: poligonosDasPartes([p], iso, visual.paleta, visual.volumes.limiarTopo).map((q) => q.pts),
  }));
  const pts = camadas.flatMap((c) => c.polys.flat());
  const [x0, x1] = [Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x))];
  const [y0, y1] = [Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y))];
  let daCabine = 0;
  let vistos = 0;
  for (let y = y0; y <= y1; y += 1)
    for (let x = x0; x <= x1; x += 1) {
      let ultima = -1;
      let temCabine = false;
      camadas.forEach((c, i) => {
        if (!c.polys.some((poly) => dentro({ x, y }, poly))) return;
        ultima = i;
        temCabine ||= c.cabine;
      });
      if (!temCabine) continue;
      daCabine++;
      if (camadas[ultima]!.cabine) vistos++;
    }
  return vistos / daCabine;
}

describe('veículos', () => {
  it('a cabine de todo carro fica por cima da carroceria em todas as rotações', () => {
    for (const variante of VARIANTES_DE_CARRO)
      for (const rot of ROTACOES)
        expect(cabineVisivel(variante, rot), `${variante} rot${rot}`).toBeGreaterThan(0.9);
  }, 60_000);
});
