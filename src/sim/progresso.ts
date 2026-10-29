import { z } from 'zod';
import {
  PAGINAS_DO_DIARIO,
  type Album,
  type Campeoes,
  type DesafioDaSemana,
  type EntreRuns,
  type Itens,
  type LuaCheia,
  type PaginaDoDiario,
  type Tratos,
} from './content/esquemas';
import type { EntradaDoDiario } from './diario';
import type { OpcoesDaRun, ResumoDaRun } from './run';

/**
 * Progresso entre runs (GDD, "Álbum de Fantasias", "Lua Cheia" e "Semente da noite"): os Doces
 * Guardados, o que já foi comprado no Álbum, os marcos que liberam fantasias, a Lua Cheia e o
 * placar local da semente da noite; e, do complemento (GAMEPLAY.md, "Entre as runs"), a maestria
 * de cada campeão, o Diário do Bairro, os moradores que lembram e o desafio da semana. Tudo puro: a
 * tela só lê e grava o texto no localStorage.
 */

/** Uma tentativa na semente da noite (placar local de tempo e dano). */
const esquemaPlacar = z
  .object({
    campeao: z.string(),
    venceu: z.boolean(),
    ruasVencidas: z.number().int().min(0),
    chefesVencidos: z.number().int().min(0),
    danoCausado: z.number().min(0),
    tempoS: z.number().min(0),
  })
  .strict();

const esquemaProgresso = z
  .object({
    versao: z.number().int(),
    docesGuardados: z.number().int().min(0),
    /** Fantasias liberadas (pelo marco ou compradas no Álbum), além das iniciais. */
    campeoes: z.array(z.string()),
    paginas: z.array(z.string()),
    itens: z.array(z.string()),
    bonus: z
      .object({
        coragem: z.number().int().min(0),
        doces: z.number().int().min(0),
        reroll: z.number().int().min(0),
      })
      .strict(),
    cores: z.array(z.string()),
    /** Cor escolhida de cada fantasia (id da cor, ou ausente para a original). */
    corEscolhida: z.record(z.string(), z.string()),
    /** Maior nível de Lua Cheia que dá para escolher (0 até a primeira vitória). */
    luaLiberada: z.number().int().min(0),
    luaEscolhida: z.number().int().min(0),
    ultimoCampeao: z.string(),
    runs: z.number().int().min(0),
    vitorias: z.number().int().min(0),
    /** Mais chefes vencidos numa run (os marcos "vencer o bairro 1/2"). */
    maisChefes: z.number().int().min(0),
    moradoraVencida: z.boolean(),
    /** Placar local da semente da noite, por data (AAAA-MM-DD). */
    noites: z.record(z.string(), z.array(esquemaPlacar)),
    // Tarefa G9 (com padrão: um save da tarefa 13 continua valendo).
    /** Pontos de maestria de cada campeão. */
    maestria: z.record(z.string(), z.number().int().min(0)).default({}),
    /** Campeões jogando com a passiva alternativa (maestria 4). */
    passivaAlternativa: z.record(z.string(), z.boolean()).default({}),
    /** Diário do Bairro: o que já foi visto, por página. */
    diario: z.record(z.string(), z.array(z.string())).default({}),
    paginasFechadas: z.array(z.string()).default([]),
    /** Moradores que lembram: tratos aceitos na última run e recusas seguidas de cada um. */
    lembrados: z.array(z.string()).default([]),
    recusas: z.record(z.string(), z.number().int().min(0)).default({}),
    /** Semanas em que o desafio já foi vencido (a recompensa vale uma vez). */
    desafiosVencidos: z.array(z.string()).default([]),
    // Tarefa 14 (com padrão: um save antigo continua valendo).
    /** O jogador quer as dicas da primeira run (dá para desligar no título). */
    dicas: z.boolean().default(true),
    /** "Minijogos com folga" (Casa Desconfiada): janelas e tempos maiores, fora da semente e do desafio. */
    minijogosComFolga: z.boolean().default(false),
    /** Dicas de uma linha já mostradas (Susto, evolução): cada uma aparece uma vez. */
    dicasVistas: z.array(z.string()).default([]),
  })
  .strict();

export type Progresso = z.infer<typeof esquemaProgresso>;
export type PlacarDaNoite = z.infer<typeof esquemaPlacar>;

/** Quantas tentativas o placar de cada noite guarda, e de quantas noites. */
const PLACAR_POR_NOITE = 5;
const NOITES_GUARDADAS = 7;

export function progressoNovo(album: Album): Progresso {
  return {
    versao: album.save.versao,
    docesGuardados: 0,
    campeoes: [],
    paginas: [],
    itens: [],
    bonus: { coragem: 0, doces: 0, reroll: 0 },
    cores: [],
    corEscolhida: {},
    luaLiberada: 0,
    luaEscolhida: 0,
    ultimoCampeao: 'bruxinha',
    runs: 0,
    vitorias: 0,
    maisChefes: 0,
    moradoraVencida: false,
    noites: {},
    maestria: {},
    passivaAlternativa: {},
    diario: {},
    paginasFechadas: [],
    lembrados: [],
    recusas: {},
    desafiosVencidos: [],
    dicas: true,
    minijogosComFolga: false,
    dicasVistas: [],
  };
}

/** As dicas valem enquanto o jogador as quer e até a primeira vitória (GAMEPLAY.md). */
export function dicasAtivas(p: Progresso): boolean {
  return p.dicas && p.vitorias === 0;
}

/** A run que vai começar é a primeira: as dicas da rua 1-1 e a porta simples. */
export function ehPrimeiraRun(p: Progresso): boolean {
  return dicasAtivas(p) && p.runs === 0;
}

/** Mostra a dica de uma linha `id` agora? Só uma vez, e só com as dicas ativas. Marca como vista. */
export function verDica(p: Progresso, id: string): boolean {
  if (!dicasAtivas(p) || p.dicasVistas.includes(id)) return false;
  p.dicasVistas.push(id);
  return true;
}

/** Lê o save; texto ausente, corrompido ou de outra versão começa do zero. */
export function lerProgresso(texto: string | null, album: Album): Progresso {
  if (!texto) return progressoNovo(album);
  try {
    const p = esquemaProgresso.safeParse(JSON.parse(texto));
    if (p.success && p.data.versao === album.save.versao) return p.data;
  } catch {
    // JSON inválido: começa do zero.
  }
  return progressoNovo(album);
}

export function escreverProgresso(p: Progresso): string {
  return JSON.stringify(p);
}

// ------------------------------------------------------------------ o que está liberado

/** O marco de content/campeoes.json já foi alcançado? */
function marcoAlcancado(p: Progresso, desbloqueio: string): boolean {
  switch (desbloqueio) {
    case 'inicial':
      return true;
    case 'bairro1':
      return p.maisChefes >= 1;
    case 'bairro2':
      return p.maisChefes >= 2;
    case 'vitoria':
      return p.vitorias >= 1;
    default:
      return false;
  }
}

export function campeaoLiberado(p: Progresso, campeoes: Campeoes, id: string): boolean {
  const c = campeoes[id];
  return !!c && (c.desbloqueio === 'inicial' || p.campeoes.includes(id));
}

/** Tratos comuns que as portas oferecem: os 12 iniciais e os das páginas compradas. */
export function tratosDoAlbum(p: Progresso, album: Album): string[] {
  const extras = album.paginas.filter((g) => p.paginas.includes(g.id)).flatMap((g) => g.tratos);
  return [...album.tratosIniciais, ...extras];
}

/** O matiz da cor escolhida para a fantasia (0 = a original). */
export function matizDaFantasia(p: Progresso, album: Album, campeao: string): number {
  const id = p.corEscolhida[campeao];
  return album.cores[campeao]?.find((c) => c.id === id)?.matiz ?? 0;
}

/** `curta`: a Noite curta (1 bairro), com as mesmas regras da run normal. */
export type ModoDaRun = 'run' | 'curta' | 'noite' | 'desafio';

/** O conteúdo que o progresso usa (o jogo passa o de src/sim/content). */
export interface ConteudoDoProgresso {
  album: Album;
  luaCheia: LuaCheia;
  entreRuns: EntreRuns;
  campeoes: Campeoes;
  tratos: Tratos;
  /** Os ids de cada página do Diário (`idsDoDiario`). */
  diario: Record<PaginaDoDiario, string[]>;
}

/**
 * Opções da run para o modo. A run normal usa o Álbum, a Lua Cheia escolhida, a maestria do
 * campeão e os moradores que lembram. A semente da noite e o desafio da semana são iguais para
 * todos: tudo liberado, sem bônus nem maestria (o desafio põe as regras dele).
 */
export function opcoesDaRun(
  p: Progresso,
  c: ConteudoDoProgresso,
  modo: ModoDaRun,
  campeao: string,
  desafio?: DesafioDaSemana,
): OpcoesDaRun {
  const { album, luaCheia, entreRuns } = c;
  if (modo === 'noite') return { itensExtras: Object.keys(album.itens), lua: 0 };
  if (modo === 'desafio') {
    const marca = desafio?.marca;
    return {
      itensExtras: Object.keys(album.itens),
      lua: desafio?.lua ?? 0,
      ...(marca
        ? {
            tratos: Object.entries(c.tratos.tratos)
              .filter(([, d]) => d.marcas.includes(marca))
              .map(([id]) => id),
          }
        : {}),
      ...(desafio?.condicao ? { condicao: desafio.condicao } : {}),
    };
  }
  const b = album.bonus;
  const m = entreRuns.moradores;
  const nivel = maestria(p, campeao, entreRuns).nivel;
  const ofendido = Object.keys(p.recusas)
    .sort()
    .find((t) => (p.recusas[t] ?? 0) >= m.recusasParaOfender);
  return {
    tratos: tratosDoAlbum(p, album),
    itensExtras: p.itens,
    bonus: {
      coragem: b.coragem.mult * p.bonus.coragem,
      doces: b.doces.soma * p.bonus.doces,
      rerolls: b.reroll.soma * p.bonus.reroll,
    },
    lua: Math.min(p.luaEscolhida, p.luaLiberada, luaCheia.niveis.length),
    primeiraRun: ehPrimeiraRun(p),
    folgaMinijogos: p.minijogosComFolga,
    despertares: nivel >= 1,
    comeco: nivel >= 3 ? entreRuns.maestria.comeco.ofertas : undefined,
    passivaAlternativa: nivel >= 4 && (p.passivaAlternativa[campeao] ?? false),
    lembrados: {
      tratos: p.lembrados,
      fracaoPechincha: m.pechinchaLembrado,
      falas: m.cumprimentos,
    },
    ofendido: ofendido
      ? {
          trato: ofendido,
          especie: m.especieOfendido,
          aposRuas: m.ruaDoOfendido,
          fala: m.ofendido[p.runs % m.ofendido.length]!,
        }
      : undefined,
  };
}

// ------------------------------------------------------------------ maestria

export interface Maestria {
  /** 0 a 5. */
  nivel: number;
  pontos: number;
  /** Pontos do nível atual e do próximo (null no 5). */
  desde: number;
  proximo: number | null;
}

export function maestria(p: Progresso, campeao: string, e: EntreRuns): Maestria {
  const niveis = e.maestria.niveis;
  const pontos = p.maestria[campeao] ?? 0;
  const nivel = niveis.filter((n) => pontos >= n).length;
  return {
    nivel,
    pontos,
    desde: nivel > 0 ? niveis[nivel - 1]! : 0,
    proximo: niveis[nivel] ?? null,
  };
}

/** Pontos de maestria que a run dá: a XP dela, os chefes e a vitória. */
export function pontosDaRun(r: ResumoDaRun, e: EntreRuns): number {
  const m = e.maestria;
  return (
    Math.floor(r.xpTotal * m.pontosPorXp) +
    r.chefesVencidos * m.pontosPorChefe +
    (r.venceu ? m.pontosPorVitoria : 0)
  );
}

/** Troca entre a passiva normal e a alternativa (só com a maestria 4). */
export function alternarPassiva(p: Progresso, campeao: string, e: EntreRuns): boolean {
  if (maestria(p, campeao, e).nivel < 4) return false;
  p.passivaAlternativa[campeao] = !(p.passivaAlternativa[campeao] ?? false);
  return true;
}

// ------------------------------------------------------------------ Diário do Bairro

export function vistosNoDiario(p: Progresso, pagina: PaginaDoDiario): string[] {
  return p.diario[pagina] ?? [];
}

/** Quanto do Diário (ou de uma página) já foi visto, de 0 a 1. */
export function fracaoDoDiario(
  p: Progresso,
  ids: Record<PaginaDoDiario, string[]>,
  pagina?: PaginaDoDiario,
): number {
  const paginas = pagina ? [pagina] : PAGINAS_DO_DIARIO;
  let vistos = 0;
  let total = 0;
  for (const k of paginas) {
    const v = new Set(vistosNoDiario(p, k));
    total += ids[k].length;
    vistos += ids[k].filter((id) => v.has(id)).length;
  }
  return total > 0 ? vistos / total : 1;
}

/**
 * Um objetivo para a próxima run, tirado do Diário ("Você nunca fechou o Conjunto Eco"): a primeira
 * entrada que falta em cada página, alternando de uma run para a outra.
 */
export function objetivoDoDiario(
  p: Progresso,
  paginas: Record<PaginaDoDiario, EntradaDoDiario[]>,
): string | null {
  const ordem: [PaginaDoDiario, (e: EntradaDoDiario) => string][] = [
    ['conjuntos', (e) => `Você nunca fechou o Conjunto ${e.nome}`],
    ['encontros', (e) => `Procure no caminho: ${e.dica.toLowerCase()}`],
    ['evolucoes', (e) => `Experimente a evolução ${e.nome}: ${e.dica.toLowerCase()}`],
    ['condicoes', (e) => `Uma noite que falta no Diário: ${e.nome}`],
    ['inimigos', (e) => `Falta um inimigo no Diário: ${e.dica.toLowerCase()}`],
    ['tratos', (e) => `Falta um trato no Diário: ${e.dica.toLowerCase()}`],
    ['precos', (e) => `Falta um preço no Diário: ${e.dica.toLowerCase()}`],
  ];
  const opcoes: string[] = [];
  for (const [pagina, frase] of ordem) {
    const vistos = new Set(vistosNoDiario(p, pagina));
    const falta = paginas[pagina].find((e) => !vistos.has(e.id));
    if (falta) opcoes.push(frase(falta));
  }
  return opcoes.length > 0 ? opcoes[p.runs % opcoes.length]! : null;
}

// ------------------------------------------------------------------ desafio da semana

/** Número da semana (segunda a domingo), contado desde 1970. */
export function semanaDe(ano: number, mes: number, dia: number): number {
  const d = Math.floor(Date.UTC(ano, mes - 1, dia) / 86_400_000);
  // 5/1/1970 foi segunda-feira (dia 4).
  return Math.floor((d - 4) / 7);
}

export function desafioDaSemana(semana: number, e: EntreRuns): DesafioDaSemana {
  const lista = e.desafios.lista;
  return lista[((semana % lista.length) + lista.length) % lista.length]!;
}

/** A semente do desafio: a mesma para todos na mesma semana. */
export function sementeDaSemana(semana: number): number {
  return sementeDoDia(`semana:${semana}`);
}

// ------------------------------------------------------------------ Álbum: compras

export type TipoDeCompra = 'campeao' | 'pagina' | 'item' | 'bonus' | 'cor';
export interface Compra {
  tipo: TipoDeCompra;
  id: string;
}

export type NomeDoBonus = keyof Album['bonus'];

/** Preço da compra agora, ou null se já foi feita (ou chegou ao máximo). */
export function precoDaCompra(p: Progresso, album: Album, c: Compra): number | null {
  switch (c.tipo) {
    case 'campeao':
      return p.campeoes.includes(c.id) ? null : (album.campeoes[c.id]?.preco ?? null);
    case 'pagina':
      return p.paginas.includes(c.id)
        ? null
        : (album.paginas.find((g) => g.id === c.id)?.preco ?? null);
    case 'item':
      return p.itens.includes(c.id) ? null : (album.itens[c.id]?.preco ?? null);
    case 'bonus': {
      const b = album.bonus[c.id as NomeDoBonus];
      if (!b) return null;
      return b.precos[p.bonus[c.id as NomeDoBonus]] ?? null;
    }
    case 'cor': {
      if (p.cores.includes(c.id)) return null;
      const cor = Object.values(album.cores)
        .flat()
        .find((x) => x.id === c.id);
      return cor?.preco ?? null;
    }
  }
}

/** Compra com Doces Guardados. Devolve se comprou. */
export function comprar(p: Progresso, album: Album, c: Compra): boolean {
  const preco = precoDaCompra(p, album, c);
  if (preco === null || p.docesGuardados < preco) return false;
  p.docesGuardados -= preco;
  switch (c.tipo) {
    case 'campeao':
      p.campeoes.push(c.id);
      break;
    case 'pagina':
      p.paginas.push(c.id);
      break;
    case 'item':
      p.itens.push(c.id);
      break;
    case 'bonus':
      p.bonus[c.id as NomeDoBonus]++;
      break;
    case 'cor':
      p.cores.push(c.id);
      break;
  }
  return true;
}

/** Uma linha do Álbum na tela. */
export interface EntradaDoAlbum {
  compra: Compra;
  grupo: 'Fantasias' | 'Tratos' | 'Itens' | 'Bônus iniciais' | 'Cores';
  nome: string;
  descricao: string;
  /** null: já tem (ou chegou ao máximo). */
  preco: number | null;
  /** Nível do bônus (quantos já comprou) e o máximo. */
  nivel?: { atual: number; maximo: number };
}

const NOMES_DOS_BONUS: Record<NomeDoBonus, { nome: string; descricao: (a: Album) => string }> = {
  coragem: {
    nome: 'Coragem extra',
    descricao: (a) => `+${Math.round(a.bonus.coragem.mult * 100)}% de Coragem máxima`,
  },
  doces: { nome: 'Bolso cheio', descricao: (a) => `+${a.bonus.doces.soma} doces no início` },
  reroll: {
    nome: 'Pechincha guardada',
    descricao: (a) => `+${a.bonus.reroll.soma} pechincha de graça`,
  },
};

const MARCOS: Record<string, string> = {
  bairro1: 'ou vença o bairro 1',
  bairro2: 'ou vença o bairro 2',
  vitoria: 'ou vença uma run',
};

/** Todas as linhas do Álbum, na ordem da tela. */
export function entradasDoAlbum(
  p: Progresso,
  album: Album,
  c: { campeoes: Campeoes; itens: Itens; tratos: Tratos },
): EntradaDoAlbum[] {
  const out: EntradaDoAlbum[] = [];
  for (const id of Object.keys(album.campeoes)) {
    const def = c.campeoes[id];
    if (!def) continue;
    out.push({
      compra: { tipo: 'campeao', id },
      grupo: 'Fantasias',
      nome: def.nome,
      descricao: `${def.papel} · ${MARCOS[def.desbloqueio] ?? ''}`.trim(),
      preco: precoDaCompra(p, album, { tipo: 'campeao', id }),
    });
  }
  for (const g of album.paginas) {
    out.push({
      compra: { tipo: 'pagina', id: g.id },
      grupo: 'Tratos',
      nome: g.nome,
      descricao: g.tratos.map((t) => c.tratos.tratos[t]?.nome ?? t).join(', '),
      preco: precoDaCompra(p, album, { tipo: 'pagina', id: g.id }),
    });
  }
  for (const id of Object.keys(album.itens)) {
    const def = c.itens.itens[id];
    out.push({
      compra: { tipo: 'item', id },
      grupo: 'Itens',
      nome: def?.nome ?? id,
      descricao: def?.descricao ?? '',
      preco: precoDaCompra(p, album, { tipo: 'item', id }),
    });
  }
  for (const id of Object.keys(album.bonus) as NomeDoBonus[]) {
    out.push({
      compra: { tipo: 'bonus', id },
      grupo: 'Bônus iniciais',
      nome: NOMES_DOS_BONUS[id].nome,
      descricao: NOMES_DOS_BONUS[id].descricao(album),
      preco: precoDaCompra(p, album, { tipo: 'bonus', id }),
      nivel: { atual: p.bonus[id], maximo: album.bonus[id].precos.length },
    });
  }
  for (const [campeao, cores] of Object.entries(album.cores)) {
    for (const cor of cores) {
      out.push({
        compra: { tipo: 'cor', id: cor.id },
        grupo: 'Cores',
        nome: cor.nome,
        descricao: c.campeoes[campeao]?.nome ?? campeao,
        preco: precoDaCompra(p, album, { tipo: 'cor', id: cor.id }),
      });
    }
  }
  return out;
}

/** Quanto do Álbum já foi comprado (0 a 1). */
export function fracaoDoAlbum(
  p: Progresso,
  album: Album,
  c: Parameters<typeof entradasDoAlbum>[2],
): number {
  const e = entradasDoAlbum(p, album, c);
  let feitos = 0;
  let total = 0;
  for (const x of e) {
    const max = x.nivel?.maximo ?? 1;
    total += max;
    feitos += x.nivel ? x.nivel.atual : x.preco === null ? 1 : 0;
  }
  return total > 0 ? feitos / total : 1;
}

/** O desbloqueio mais barato que ainda falta no Álbum (null: o Álbum está completo). */
export function proximoDoAlbum(
  p: Progresso,
  album: Album,
  c: Parameters<typeof entradasDoAlbum>[2],
): { nome: string; preco: number } | null {
  const falta = entradasDoAlbum(p, album, c)
    .filter((e): e is EntradaDoAlbum & { preco: number } => e.preco !== null)
    .sort((a, b) => a.preco - b.preco)[0];
  return falta ? { nome: falta.nome, preco: falta.preco } : null;
}

/** Escolhe a cor da fantasia (só uma comprada; null volta à original). */
export function escolherCor(
  p: Progresso,
  album: Album,
  campeao: string,
  cor: string | null,
): boolean {
  if (cor === null) {
    p.corEscolhida = Object.fromEntries(
      Object.entries(p.corEscolhida).filter(([k]) => k !== campeao),
    );
    return true;
  }
  if (!p.cores.includes(cor) || !album.cores[campeao]?.some((c) => c.id === cor)) return false;
  p.corEscolhida[campeao] = cor;
  return true;
}

// ------------------------------------------------------------------ fim da run

export interface Novidades {
  /** Doces Guardados da run, mais as páginas do Diário fechadas e o desafio. */
  docesGuardados: number;
  /** Fantasias liberadas agora pelo marco. */
  campeoes: string[];
  /** Nível de Lua Cheia liberado agora (null: nada novo). */
  lua: number | null;
  /** A tentativa entrou no placar da noite (e em que lugar, 1 = melhor). */
  lugarNaNoite: number | null;
  /** Nível de maestria novo do campeão (null: não subiu). */
  maestria: number | null;
  /** Cor ganha com a maestria 2. */
  cor: string | null;
  /** Páginas do Diário fechadas agora (os nomes). */
  paginas: string[];
  /** Primeira vitória no desafio desta semana. */
  desafio: boolean;
}

/** Ordem do placar: mais chefes, mais ruas, mais dano e menos tempo. */
function melhorQue(a: PlacarDaNoite, b: PlacarDaNoite): number {
  return (
    b.chefesVencidos - a.chefesVencidos ||
    b.ruasVencidas - a.ruasVencidas ||
    b.danoCausado - a.danoCausado ||
    a.tempoS - b.tempoS
  );
}

/**
 * Guarda o que a run deixou: Doces Guardados, marcos das fantasias, a próxima Lua Cheia (vencer
 * no nível mais alto libera o seguinte), a maestria do campeão, o Diário (fechar uma página dá
 * doces), os moradores que lembram e, na semente da noite e no desafio, o placar e a recompensa.
 * `quando` é a data da semente da noite ou a semana do desafio.
 */
export function registrarFim(
  p: Progresso,
  r: ResumoDaRun,
  c: ConteudoDoProgresso,
  modo: ModoDaRun,
  quando?: string,
): Novidades {
  const { campeoes, luaCheia, entreRuns, album } = c;
  const novas: Novidades = {
    docesGuardados: r.docesGuardados,
    campeoes: [],
    lua: null,
    lugarNaNoite: null,
    maestria: null,
    cor: null,
    paginas: [],
    desafio: false,
  };
  p.runs++;
  p.docesGuardados += r.docesGuardados;
  p.ultimoCampeao = r.campeaoId;
  p.maisChefes = Math.max(p.maisChefes, r.chefesVencidos);
  // A Noite curta conta os chefes (libera o que o bairro 1 libera), mas não é a vitória da run.
  if (r.venceu && modo !== 'curta') {
    p.vitorias++;
    const max = luaCheia.niveis.length;
    if (modo === 'run' && r.lua >= p.luaLiberada && p.luaLiberada < max) {
      p.luaLiberada = Math.min(max, r.lua + 1);
      novas.lua = p.luaLiberada;
    }
  }
  if (r.moradora === 'venceu') p.moradoraVencida = true;
  for (const [id, def] of Object.entries(campeoes)) {
    if (def.desbloqueio === 'inicial' || p.campeoes.includes(id)) continue;
    if (marcoAlcancado(p, def.desbloqueio)) {
      p.campeoes.push(id);
      novas.campeoes.push(id);
    }
  }

  // Maestria: a XP da run, os chefes e a vitória; a 2 dá uma cor da fantasia.
  const antes = maestria(p, r.campeaoId, entreRuns).nivel;
  p.maestria[r.campeaoId] = (p.maestria[r.campeaoId] ?? 0) + pontosDaRun(r, entreRuns);
  const depois = maestria(p, r.campeaoId, entreRuns).nivel;
  if (depois > antes) novas.maestria = depois;
  if (antes < 2 && depois >= 2) {
    const cor = album.cores[r.campeaoId]?.find((x) => !p.cores.includes(x.id));
    if (cor) {
      p.cores.push(cor.id);
      novas.cor = cor.nome;
    }
  }

  // Diário do Bairro: junta o que a run viu; cada página fechada dá Doces Guardados.
  for (const pagina of PAGINAS_DO_DIARIO) {
    const lista = new Set([...vistosNoDiario(p, pagina), ...(r.vistos[pagina] ?? [])]);
    p.diario[pagina] = [...lista].filter((id) => c.diario[pagina].includes(id));
    const fechou = c.diario[pagina].every((id) => lista.has(id));
    if (fechou && !p.paginasFechadas.includes(pagina)) {
      p.paginasFechadas.push(pagina);
      const pg = entreRuns.diario.paginas[pagina];
      p.docesGuardados += pg.doces;
      novas.docesGuardados += pg.doces;
      novas.paginas.push(pg.nome);
    }
  }

  // Moradores que lembram (só na run normal e na curta, onde as casas são as do Álbum).
  if (modo === 'run' || modo === 'curta') {
    const comuns = r.tratoIds.filter((t) => t in c.tratos.tratos);
    p.lembrados = [...new Set(comuns)];
    for (const t of r.recusados) p.recusas[t] = (p.recusas[t] ?? 0) + 1;
    const fizeramAsPazes = new Set(comuns);
    p.recusas = Object.fromEntries(
      Object.entries(p.recusas).filter(([t]) => !fizeramAsPazes.has(t)),
    );
  }

  if (modo === 'noite' && quando) {
    const t: PlacarDaNoite = {
      campeao: r.campeaoId,
      venceu: r.venceu,
      ruasVencidas: r.ruasVencidas,
      chefesVencidos: r.chefesVencidos,
      danoCausado: r.danoCausado,
      tempoS: Math.round(r.tempoS),
    };
    const lista = [...(p.noites[quando] ?? []), t].sort(melhorQue).slice(0, PLACAR_POR_NOITE);
    const lugar = lista.indexOf(t);
    p.noites[quando] = lista;
    novas.lugarNaNoite = lugar >= 0 ? lugar + 1 : null;
    // Só as últimas noites ficam guardadas.
    const datas = Object.keys(p.noites).sort();
    const fica = new Set(datas.slice(-NOITES_GUARDADAS));
    p.noites = Object.fromEntries(Object.entries(p.noites).filter(([d]) => fica.has(d)));
  }

  if (modo === 'desafio' && quando && r.venceu && !p.desafiosVencidos.includes(quando)) {
    p.desafiosVencidos.push(quando);
    p.docesGuardados += entreRuns.desafios.doces;
    novas.docesGuardados += entreRuns.desafios.doces;
    novas.desafio = true;
  }
  return novas;
}

// ------------------------------------------------------------------ semente da noite

/** A semente do dia: a mesma para todos os jogadores na mesma data (AAAA-MM-DD). */
export function sementeDoDia(data: string): number {
  // FNV-1a de 32 bits sobre o texto da data.
  let h = 0x811c9dc5;
  for (const ch of `noite:${data}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 1_000_000;
}

/** A data local no formato do placar. */
export function dataDoPlacar(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}
