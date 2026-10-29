import {
  MARCAS,
  PAGINAS_DO_DIARIO,
  type Campeoes,
  type EntreRuns,
  type Evolucoes,
  type Habilidade,
  type Inimigos,
  type Noite,
  type PaginaDoDiario,
  type Precos,
  type Tratos,
} from './content/esquemas';

/**
 * Diário do Bairro (GAMEPLAY.md, "Diário do Bairro"): as páginas e as entradas de cada uma, tiradas
 * do conteúdo. O que ainda não foi visto aparece como silhueta com a dica.
 */

/** Arte do Codex de uma entrada (a tela desenha um cinza no lugar quando não há). */
export interface ArteDoDiario {
  tipo: 'trato' | 'preco' | 'marca' | 'condicao' | 'evolucao' | 'hud';
  id: string;
}

export interface EntradaDoDiario {
  id: string;
  nome: string;
  dica: string;
  arte: ArteDoDiario | null;
}

export interface ConteudoDoDiario {
  tratos: Tratos;
  precos: Precos;
  inimigos: Inimigos;
  noite: Noite;
  evolucoes: Evolucoes;
  campeoes: Campeoes;
  habilidades: readonly Habilidade[];
  entreRuns: EntreRuns;
}

/** Inimigos que não entram no Diário (o Gato Preto fica nos encontros raros). */
const FORA_DOS_INIMIGOS = new Set(['gato_preto']);

const PESOS: Record<string, string> = { leve: 'leve', medio: 'médio', pesado: 'pesado' };

export function paginasDoDiario(c: ConteudoDoDiario): Record<PaginaDoDiario, EntradaDoDiario[]> {
  const conj = c.tratos.conjuntos;
  const tratos: EntradaDoDiario[] = [
    ...Object.entries(c.tratos.tratos).map(([id, d]) => ({
      id,
      nome: d.nome,
      dica: `Um trato de ${d.marcas.map((m) => conj[m].nome).join(' e ')}`,
      arte: { tipo: 'trato', id } as ArteDoDiario,
    })),
    ...Object.entries(c.tratos.especiais).map(([id, d]) => ({
      id,
      nome: d.nome,
      dica: 'Quatro Medalhas de Bom Vizinho abrem esta porta',
      arte: { tipo: 'trato', id } as ArteDoDiario,
    })),
    ...Object.entries(c.tratos.lendarios).map(([id, d]) => ({
      id,
      nome: d.nome,
      dica: 'Um trato lendário, atrás de uma janela vermelha',
      arte: { tipo: 'trato', id } as ArteDoDiario,
    })),
  ];
  const precos = Object.entries(c.precos.precos).map(([id, d]) => ({
    id,
    nome: d.nome,
    dica: `Um preço ${PESOS[d.peso] ?? d.peso}`,
    arte: { tipo: 'preco', id } as ArteDoDiario,
  }));
  const conjuntos = MARCAS.flatMap((m) => [
    {
      id: `${m}:2`,
      nome: conj[m].nome,
      dica: `Dois tratos de ${conj[m].nome} na mesma run`,
      arte: { tipo: 'marca', id: m } as ArteDoDiario,
    },
    {
      id: `${m}:4`,
      nome: conj[m].quatro.nome,
      dica: `Quatro tratos de ${conj[m].nome} na mesma run`,
      arte: { tipo: 'marca', id: m } as ArteDoDiario,
    },
  ]);
  const inimigos = Object.entries(c.inimigos.inimigos)
    .filter(([id]) => !FORA_DOS_INIMIGOS.has(id))
    .map(([id, d]) => ({
      id,
      nome: d.nome,
      dica:
        d.comportamento === 'moradora'
          ? 'Ninguém sabe quem mora no 13'
          : d.chefe
            ? 'Espera no fim de um bairro'
            : d.elite
              ? 'Uma elite que chega depois do primeiro Poste'
              : 'Anda pelas ruas à noite',
      arte: null,
    }));
  const condicoes = Object.entries(c.noite.condicoes).map(([id, d]) => ({
    id,
    nome: d.nome,
    dica: d.rara ? `Uma noite rara: ${d.frase}` : d.frase,
    arte: { tipo: 'condicao', id } as ArteDoDiario,
  }));
  const encontros = Object.entries(c.entreRuns.diario.encontros).map(([id, d]) => ({
    id,
    nome: d.nome,
    dica: d.dica,
    arte: null,
  }));
  // De quem é cada habilidade (para a dica da evolução).
  const dono = new Map<string, string>();
  for (const camp of Object.values(c.campeoes))
    for (const h of Object.values(camp.habilidades)) dono.set(h, camp.nome);
  const nomeHab = new Map(c.habilidades.map((h) => [h.id, h.nome]));
  const evolucoes = Object.entries(c.evolucoes).flatMap(([hab, par]) =>
    par.map((e) => ({
      id: e.id,
      nome: e.nome,
      dica: `Posto 3 de ${nomeHab.get(hab) ?? hab} (${dono.get(hab) ?? '?'})`,
      arte: { tipo: 'evolucao', id: e.id } as ArteDoDiario,
    })),
  );
  return { tratos, precos, conjuntos, inimigos, condicoes, encontros, evolucoes };
}

/** Os ids de cada página (o que o progresso precisa para saber se ela fechou). */
export function idsDoDiario(c: ConteudoDoDiario): Record<PaginaDoDiario, string[]> {
  const p = paginasDoDiario(c);
  return Object.fromEntries(PAGINAS_DO_DIARIO.map((k) => [k, p[k].map((e) => e.id)])) as Record<
    PaginaDoDiario,
    string[]
  >;
}
