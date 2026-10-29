import type { V2 } from './geometria';

/**
 * Assistência de mira do controle: se algum alvo estiver a até `graus` da direção do analógico e
 * dentro do alcance, a mira gruda nele (o mais alinhado). Sem alvo, devolve o ponto no alcance.
 */
export function assistenciaDeMira(
  origem: V2,
  dir: V2,
  alvos: readonly V2[],
  alcance: number,
  graus: number,
): V2 {
  const n = Math.hypot(dir.x, dir.y);
  const d = n > 0 ? { x: dir.x / n, y: dir.y / n } : { x: 1, y: 0 };
  const limite = (graus * Math.PI) / 180;
  let melhor: V2 | null = null;
  let melhorAng = Infinity;
  for (const a of alvos) {
    const v = { x: a.x - origem.x, y: a.y - origem.y };
    const dist = Math.hypot(v.x, v.y);
    if (dist === 0 || dist > alcance) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, (v.x * d.x + v.y * d.y) / dist)));
    if (ang <= limite && ang < melhorAng) {
      melhorAng = ang;
      melhor = a;
    }
  }
  return melhor ? { ...melhor } : { x: origem.x + d.x * alcance, y: origem.y + d.y * alcance };
}

/** Como a mira automática das habilidades de área se comporta (content/controles.json). */
export interface MiraAutomatica {
  /** Cone em volta da direção (do analógico direito, ou de onde a personagem anda ou olha). */
  graus: number;
  /** Sem inimigo no cone, o mais perto em qualquer direção, se estiver a até isso (tiles). */
  qualquerLadoAte: number;
  /** Sem inimigo nenhum ao alcance, a área cai a esta distância à frente (não no fim do alcance). */
  semAlvoTiles: number;
}

/**
 * Mira automática do controle para áreas, alvos e cones: entre os inimigos ao alcance e no cone,
 * o ponto que pega mais deles dentro de `raio` (o do mais perto, no empate); sem nenhum no cone, o
 * mais perto em qualquer direção (até `qualquerLadoAte`); sem nenhum, `semAlvoTiles` à frente.
 */
export function miraAutomatica(
  origem: V2,
  dir: V2,
  alvos: readonly V2[],
  alcance: number,
  raio: number,
  cfg: MiraAutomatica,
): V2 {
  const n = Math.hypot(dir.x, dir.y);
  const d = n > 0 ? { x: dir.x / n, y: dir.y / n } : { x: 1, y: 0 };
  const limite = (cfg.graus * Math.PI) / 180;
  const aoAlcance = alvos.filter((a) => {
    const dist = Math.hypot(a.x - origem.x, a.y - origem.y);
    return dist > 0 && dist <= alcance;
  });
  const noCone = aoAlcance.filter((a) => {
    const v = { x: a.x - origem.x, y: a.y - origem.y };
    const dist = Math.hypot(v.x, v.y);
    return Math.acos(Math.max(-1, Math.min(1, (v.x * d.x + v.y * d.y) / dist))) <= limite;
  });
  const distDe = (a: V2) => Math.hypot(a.x - origem.x, a.y - origem.y);
  if (noCone.length > 0) {
    let melhor = noCone[0]!;
    let pega = -1;
    for (const a of noCone) {
      const quantos = alvos.filter((b) => Math.hypot(b.x - a.x, b.y - a.y) <= raio).length;
      if (quantos > pega || (quantos === pega && distDe(a) < distDe(melhor))) {
        melhor = a;
        pega = quantos;
      }
    }
    return { ...melhor };
  }
  const perto = aoAlcance
    .filter((a) => distDe(a) <= cfg.qualquerLadoAte)
    .sort((a, b) => distDe(a) - distDe(b))[0];
  if (perto) return { ...perto };
  const l = Math.min(alcance, cfg.semAlvoTiles);
  return { x: origem.x + d.x * l, y: origem.y + d.y * l };
}
