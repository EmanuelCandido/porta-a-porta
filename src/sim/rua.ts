import type { Modelos, Rua } from './content/esquemas';
import { posicionador, transformarRetangulo, type Retangulo } from './geometria';

/**
 * Retângulos de colisão dos objetos da rua, já girados e posicionados no mundo. Objetos de um grupo
 * (a grade do portão) ficam de fora: a regra da rua põe e tira essa colisão.
 */
export function obstaculosDaRua(rua: Rua, modelos: Modelos): Retangulo[] {
  return rua.objetos.flatMap((o) => {
    if (o.grupo) return [];
    const { pegada, colisao } = modelos[o.modelo];
    const { ponto } = posicionador(pegada.largura, pegada.profundidade, o.x, o.y, o.rot);
    return colisao.map((r) => transformarRetangulo(r, ponto));
  });
}
