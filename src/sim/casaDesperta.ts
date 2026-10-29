import type { Modelos, Rua } from './content/esquemas';
import { girar, posicionador, transformarRetangulo, type Retangulo, type V2 } from './geometria';
import type { FonteDeLuz, MapaDeLuz } from './luz';
import { adicionarObstaculo, removerObstaculo, type Entidade, type Mundo } from './mundo';

// A casa do lote que vira inimigo (a Casa Perseguidora e a Casa Desperta, Elenco v7): a casa some do
// cenário (sem colisão e sem a luz das janelas), o inimigo nasce no meio do lote, olhando para onde a
// casa olhava, e levanta numa transformação de `transformacaoS` (a tela troca os quadros da malha).
// A Desperta pode deitar de novo: a casa volta para o lote, com a colisão e as luzes de antes.

/** Os retângulos de colisão de um objeto da rua (os mesmos de `obstaculosDaRua`). */
export function colisaoDoObjeto(o: Rua['objetos'][number], modelos: Modelos): Retangulo[] {
  const { pegada, colisao } = modelos[o.modelo];
  const { ponto } = posicionador(pegada.largura, pegada.profundidade, o.x, o.y, o.rot);
  return colisao.map((c) => transformarRetangulo(c, ponto));
}

/** O meio da pegada do objeto e a frente dele (os modelos olham para +x antes de girar). */
export function meioDoLote(
  o: Rua['objetos'][number],
  modelos: Modelos,
): { centro: V2; frente: V2 } {
  const { pegada } = modelos[o.modelo];
  const { ponto } = posicionador(pegada.largura, pegada.profundidade, o.x, o.y, o.rot);
  return {
    centro: ponto({ x: pegada.largura / 2, y: pegada.profundidade / 2 }),
    frente: girar({ x: 1, y: 0 }, o.rot),
  };
}

/** Uma casa que saiu do lote: o que foi tirado, para devolver se ela deitar de novo. */
export interface LoteVazio {
  objeto: number;
  luzes: FonteDeLuz[];
}

/** Tira a casa do lote: a colisão, as luzes das janelas e o desenho (`objetoVirou`). */
export function esvaziarLote(
  mundo: Mundo,
  rua: Rua,
  modelos: Modelos,
  luz: MapaDeLuz,
  objeto: number,
): LoteVazio {
  const o = rua.objetos[objeto]!;
  for (const r of colisaoDoObjeto(o, modelos)) {
    const igual = mundo.obstaculos.find(
      (x) =>
        Math.abs(x.x0 - r.x0) < 1e-6 &&
        Math.abs(x.y0 - r.y0) < 1e-6 &&
        Math.abs(x.x1 - r.x1) < 1e-6 &&
        Math.abs(x.y1 - r.y1) < 1e-6,
    );
    if (igual) removerObstaculo(mundo, igual);
  }
  const luzes = luz.fontes.filter((f) => f.objeto === objeto);
  for (const f of luzes) luz.remover(f.id);
  mundo.eventos.push({ tipo: 'objetoVirou', objeto });
  return { objeto, luzes };
}

/** A casa volta para o lote: colisão, luzes e desenho (`objetoVoltou`). */
export function devolverLote(
  mundo: Mundo,
  rua: Rua,
  modelos: Modelos,
  luz: MapaDeLuz,
  lote: LoteVazio,
): void {
  const o = rua.objetos[lote.objeto]!;
  for (const r of colisaoDoObjeto(o, modelos)) adicionarObstaculo(mundo, r);
  // A luz volta com um id novo (`adicionar` troca o antigo).
  for (const f of lote.luzes) luz.adicionar(f);
  mundo.eventos.push({ tipo: 'objetoVoltou', objeto: lote.objeto });
}

/**
 * Começa a transformação: o inimigo fica parado até `transformacaoAte` (o comportamento `casa`
 * espera) e a tela mostra os quadros entre `transformacaoDe` e `transformacaoAte`.
 */
export function levantar(mundo: Mundo, e: Entidade, segundos: number, olhar?: V2): void {
  const ticks = Math.round(segundos / mundo.dt);
  if (olhar) e.olhar = { ...olhar };
  e.marcas = {
    ...e.marcas,
    transformacaoDe: mundo.tick,
    transformacaoAte: mundo.tick + ticks,
  };
}
