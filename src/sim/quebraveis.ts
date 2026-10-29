import { combatenteInimigo } from './combate';
import type { Combate, ConfigExploracao, Modelos, Rua } from './content/esquemas';
import { posicionador, transformarRetangulo, type V2 } from './geometria';
import {
  adicionarEntidade,
  removerEntidade,
  removerObstaculo,
  type Entidade,
  type Mundo,
} from './mundo';

// Objetos quebráveis (docs/PLANO_MUNDO_VIVO.md, frente 1): lixeiras, caixas de correio, abóboras de
// jardim, floreiras, cones e cavaletes levam golpes, quebram e soltam doces (a moeda do jogo), às
// vezes um consumível e raramente uma pestinha que estava escondida. São entidades neutras: os
// golpes e feitiços do jogador acertam, os inimigos não ligam, e não contam como inimigo derrotado.

export type ConfigQuebraveis = ConfigExploracao['quebraveis'];

/** O que os quebráveis pedem às regras da rua. */
export interface ServicosQuebraveis {
  soltarDoces(mundo: Mundo, pos: V2, base: number): void;
  darConsumivel(id: string): boolean;
  nascerPestinha(mundo: Mundo, pos: V2): number;
  /** Consumíveis que podem sair (os mesmos da campainha). */
  itens: readonly string[];
}

/** O objeto da rua é quebrável? */
export function ehQuebravel(e: Entidade | undefined): boolean {
  return !!e?.marcas?.quebravel;
}

/** Cria uma entidade neutra com Coragem em cada objeto da rua que a tabela diz que quebra. */
export function criarQuebraveis(
  mundo: Mundo,
  rua: Rua,
  modelos: Modelos,
  cfg: ConfigQuebraveis,
  combate: Combate,
): Entidade[] {
  const criados: Entidade[] = [];
  rua.objetos.forEach((o, i) => {
    const def = cfg.modelos[o.modelo];
    if (!def || o.grupo) return;
    const { pegada } = modelos[o.modelo];
    const { ponto } = posicionador(pegada.largura, pegada.profundidade, o.x, o.y, o.rot);
    const pos = ponto({ x: pegada.largura / 2, y: pegada.profundidade / 2 });
    criados.push(
      adicionarEntidade(mundo, {
        tipo: 'neutro',
        especie: o.modelo,
        pos,
        raio: def.raio,
        velocidade: 0,
        solido: false,
        combate: combatenteInimigo({ coragem: def.coragem, resistencia: 0 }, combate),
        marcas: { quebravel: true, objeto: i, material: def.material },
      }),
    );
  });
  return criados;
}

/** Tira os retângulos de colisão do objeto (os mesmos de `obstaculosDaRua`). */
function liberarLugar(mundo: Mundo, o: Rua['objetos'][number], modelos: Modelos): void {
  const { pegada, colisao } = modelos[o.modelo];
  const { ponto } = posicionador(pegada.largura, pegada.profundidade, o.x, o.y, o.rot);
  for (const r of colisao.map((c) => transformarRetangulo(c, ponto))) {
    const igual = mundo.obstaculos.find(
      (x) =>
        Math.abs(x.x0 - r.x0) < 1e-6 &&
        Math.abs(x.y0 - r.y0) < 1e-6 &&
        Math.abs(x.x1 - r.x1) < 1e-6 &&
        Math.abs(x.y1 - r.y1) < 1e-6,
    );
    if (igual) removerObstaculo(mundo, igual);
  }
}

/**
 * Tira um quebrável da rua em silêncio (a lixeira que, na verdade, é um Saco-Surpresa): o lugar fica
 * livre, a entidade sai e a tela esconde o objeto (`objetoVirou`).
 */
export function retirarObjeto(mundo: Mundo, e: Entidade, rua: Rua, modelos: Modelos): void {
  const indice = Number(e.marcas?.objeto ?? -1);
  const o = rua.objetos[indice];
  if (o) liberarLugar(mundo, o, modelos);
  mundo.eventos.push({ tipo: 'objetoVirou', objeto: indice });
  removerEntidade(mundo, e.id);
}

/**
 * O objeto quebrou: o lugar dele fica livre para andar, saem doces (e, às vezes, um consumível ou
 * uma pestinha escondida), a tela recebe `quebrou` e a entidade sai do mundo.
 */
export function quebrar(
  mundo: Mundo,
  e: Entidade,
  rua: Rua,
  modelos: Modelos,
  cfg: ConfigQuebraveis,
  servicos: ServicosQuebraveis,
): void {
  const indice = Number(e.marcas?.objeto ?? -1);
  const o = rua.objetos[indice];
  const def = o ? cfg.modelos[o.modelo] : undefined;
  if (o && def) {
    liberarLugar(mundo, o, modelos);
    servicos.soltarDoces(mundo, e.pos, mundo.rng.inteiro(def.doces[0], def.doces[1]));
    const sorte = mundo.rng.proximo();
    if (sorte < cfg.chanceSurpresa) {
      servicos.nascerPestinha(mundo, e.pos);
      mundo.eventos.push({ tipo: 'aviso', texto: 'Tinha uma pestinha escondida!' });
    } else if (sorte < cfg.chanceSurpresa + cfg.chanceItem && servicos.itens.length > 0) {
      servicos.darConsumivel(servicos.itens[mundo.rng.inteiro(0, servicos.itens.length - 1)]!);
    }
  }
  mundo.eventos.push({
    tipo: 'quebrou',
    id: e.id,
    objeto: indice,
    especie: e.especie,
    material: String(e.marcas?.material ?? 'madeira'),
    pos: { ...e.pos },
    ...(typeof e.marcas?.grupo === 'string' ? { grupo: e.marcas.grupo } : {}),
  });
  removerEntidade(mundo, e.id);
}
