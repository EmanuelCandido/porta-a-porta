import {
  esquemaHabilidade,
  TECLAS,
  type Combate,
  type Efeito,
  type Evolucao,
  type Evolucoes,
  type Habilidade,
} from './content/esquemas';
import type { Ficha } from './partida';

/** O que a escolha de evolução usa da ficha (os bots e os testes montam só isso). */
type FichaDeEvolucao = Pick<Ficha, 'lancador' | 'despertares'>;

// Evoluções de habilidade (docs/GAMEPLAY.md): quando Q, W ou E chegam ao posto 3, o jogo pausa e o
// jogador escolhe 1 entre 2; quando o R chega ao posto 3, escolhe 1 entre 2 Despertares. A escolha
// troca a definição da habilidade na ficha até o fim da run. Tudo vem de content/evolucoes.json.

type Objeto = Record<string, unknown>;

function ehObjeto(v: unknown): v is Objeto {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Mescla `muda` sobre `base`: objetos se mesclam, listas e valores são substituídos. */
function mesclar(base: Objeto, muda: Objeto): Objeto {
  const r: Objeto = { ...base };
  for (const [k, v] of Object.entries(muda)) {
    const atual = r[k];
    r[k] = ehObjeto(atual) && ehObjeto(v) ? mesclar(atual, v) : v;
  }
  return r;
}

function multiplicarDano(ef: Efeito, m: number): Efeito {
  if (m === 1 || ef.tipo !== 'dano') return ef;
  return {
    ...ef,
    base: ef.base.map((b) => b * m),
    razao: ef.razao * m,
    ...(ef.razaoCoragemMax !== undefined ? { razaoCoragemMax: ef.razaoCoragemMax * m } : {}),
  };
}

/**
 * A habilidade com a evolução aplicada. Mantém o id (ícones, tratos e interface continuam
 * reconhecendo a habilidade) e é validada de novo pelo esquema: uma evolução mal escrita quebra ao
 * carregar o conteúdo.
 */
export function evoluir(def: Habilidade, evo: Evolucao): Habilidade {
  const m = evo.multDano;
  const bruto = mesclar(def as unknown as Objeto, evo.muda);
  // Listas trocadas em `muda` valem no lugar das da habilidade.
  const efeitos = ((bruto['efeitos'] as Efeito[] | undefined) ?? def.efeitos).map((ef) =>
    multiplicarDano(ef, m),
  );
  const aoFechar = ((bruto['aoFechar'] as Efeito[] | undefined) ?? def.aoFechar).map((ef) =>
    multiplicarDano(ef, m),
  );
  if (evo.explodeAoFechar !== undefined) {
    const f = evo.explodeAoFechar;
    for (const ef of efeitos) {
      if (ef.tipo !== 'dano' || !ef.porSegundo) continue;
      aoFechar.push({
        ...ef,
        porSegundo: false,
        base: ef.base.map((b) => b * f),
        razao: ef.razao * f,
      });
    }
  }
  return esquemaHabilidade.parse({
    ...bruto,
    id: def.id,
    tecla: def.tecla,
    recarga: def.recarga.map((r) => r + evo.recargaExtra),
    efeitos: [...efeitos, ...evo.efeitos],
    aoFechar,
    descricao: `${def.descricao} ${evo.nome}: ${evo.descricao}`.trim(),
  });
}

/** As evoluções prontas de cada habilidade, já montadas e validadas. */
export interface OpcaoDeEvolucao {
  evo: Evolucao;
  def: Habilidade;
}

export type TabelaDeEvolucoes = ReadonlyMap<string, readonly OpcaoDeEvolucao[]>;

export function montarEvolucoes(
  evolucoes: Evolucoes,
  habilidades: readonly Habilidade[],
): TabelaDeEvolucoes {
  const porId = new Map(habilidades.map((h) => [h.id, h]));
  const tabela = new Map<string, OpcaoDeEvolucao[]>();
  for (const [id, lista] of Object.entries(evolucoes)) {
    const def = porId.get(id);
    if (!def) throw new Error(`evolução de ${id}, que não existe em content/habilidades.json`);
    if (def.tecla === 'ataque') throw new Error(`${id} é ataque de inimigo e não evolui`);
    tabela.set(
      id,
      lista.map((evo) => ({ evo, def: evoluir(def, evo) })),
    );
  }
  return tabela;
}

/** As 2 opções da habilidade nesta tecla, se ela já pode evoluir e ainda não evoluiu. */
export function opcoesDeEvolucao(
  ficha: FichaDeEvolucao,
  tecla: string,
  tabela: TabelaDeEvolucoes,
  niveis: Combate['niveis'],
): readonly OpcaoDeEvolucao[] {
  const s = ficha.lancador.slots[tecla];
  if (!s || s.evolucao !== null || s.posto < niveis.postoDaEvolucao) return [];
  if (tecla === 'R' && !ficha.despertares) return [];
  return tabela.get(s.def.id) ?? [];
}

/** A primeira tecla com uma escolha de evolução esperando (a tela pausa o jogo para ela). */
export function evolucaoPendente(
  ficha: FichaDeEvolucao,
  tabela: TabelaDeEvolucoes,
  niveis: Combate['niveis'],
): string | null {
  return TECLAS.find((t) => opcoesDeEvolucao(ficha, t, tabela, niveis).length > 0) ?? null;
}

/** Escolhe a evolução `id` da habilidade da tecla. Devolve se a escolha valeu. */
export function escolherEvolucao(
  ficha: FichaDeEvolucao,
  tecla: string,
  id: string,
  tabela: TabelaDeEvolucoes,
  niveis: Combate['niveis'],
): boolean {
  const opcao = opcoesDeEvolucao(ficha, tecla, tabela, niveis).find((o) => o.evo.id === id);
  if (!opcao) return false;
  const s = ficha.lancador.slots[tecla]!;
  const cargasAntes = s.def.cargas;
  s.def = opcao.def;
  s.evolucao = opcao.evo.id;
  if (opcao.def.cargas > cargasAntes) s.cargas += opcao.def.cargas - cargasAntes;
  return true;
}

/** Nome da evolução escolhida (interface). */
export function nomeDaEvolucao(tabela: TabelaDeEvolucoes, id: string | null): string | null {
  if (id === null) return null;
  for (const lista of tabela.values()) {
    const o = lista.find((x) => x.evo.id === id);
    if (o) return o.evo.nome;
  }
  return null;
}
