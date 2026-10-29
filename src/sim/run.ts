import { definirModificadores, recalcular, type Modificador, type NomeAtributo } from './combate';
import {
  MARCAS,
  TECLAS,
  type ConfigRun,
  type DefItem,
  type DefTrato,
  type EfeitoDaLua,
  type EfeitoDeRun,
  type Gerador,
  type Itens,
  type LuaCheia,
  type Luz,
  type Marca,
  type Noite,
  type PaginaDoDiario,
  PAGINAS_DO_DIARIO,
  type Precos,
  type Tratos,
} from './content/esquemas';
import { gerarArena } from './arena';
import type { EcoDaCobranca } from './chefes';
import {
  pontoNoCaminho,
  progressoNoCaminho,
  type EncontroDaRua,
  type TipoDeEncontro,
} from './encontros';
import { gerarRua, type RuaGerada } from './gerador';
import type { Mundo, Sistema } from './mundo';
import { criarFicha, type Conteudo, type Ficha } from './partida';
import { gerarPortaAPorta, montarPortaAPorta, type PortaDeLuta } from './portaAPorta';
import type { V2 } from './geometria';
import type {
  Bolso,
  ConteudoBau,
  EliteDaRua,
  EstadoRua,
  OpcoesRua,
  Recompensa,
} from './regrasDaRua';
import { Rng } from './rng';
import { montarRua, type RuaDeLuta } from './ruaDeLuta';
import { xpAteNivel } from './progressao';
import { novoSusto } from './susto';
import { TratosNaRua } from './tratos';

/** O que um mapa de luta rendeu, somado à run quando ele acaba. */
type DaRua = Pick<EstadoRua, 'derrotados' | 'docesNaRua'> &
  Partial<Pick<EstadoRua, 'danoCausado' | 'especiesVistas'>>;

function diarioVazio(): Record<PaginaDoDiario, string[]> {
  return Object.fromEntries(PAGINAS_DO_DIARIO.map((p) => [p, []])) as unknown as Record<
    PaginaDoDiario,
    string[]
  >;
}

/** Conteúdo que a run inteira usa (o de montarPartida e o da economia). */
export interface ConteudoRun extends Conteudo {
  gerador: Gerador;
  luz: Luz;
  tratos: Tratos;
  precos: Precos;
  itens: Itens;
  run: ConfigRun;
  noite: Noite;
  luaCheia: LuaCheia;
}

export type FaseRun = 'rua' | 'portaAPorta' | 'chefe' | 'moradora' | 'vitoria' | 'derrota';

/**
 * O que vem de fora da run: o que o Álbum de Fantasias já liberou e a Lua Cheia escolhida. Sem
 * opções (bots e testes), a run oferece todos os tratos, só os itens iniciais e nenhuma Lua.
 */
export interface OpcoesDaRun {
  /** Tratos comuns que as portas, o Gato Preto e os baús podem oferecer (sem a lista: todos). */
  tratos?: readonly string[];
  /** Itens comprados no Álbum: entram na loja e nas recompensas, além dos iniciais. */
  itensExtras?: readonly string[];
  /** Pequenos bônus iniciais do Álbum: fração de Coragem, doces e rerolls. */
  bonus?: { coragem: number; doces: number; rerolls: number };
  /** Nível de Lua Cheia (0 = sem Lua). */
  lua?: number;
  /** Maestria 1: o R ganha Despertar no posto 3 (sem a opção: sim). */
  despertares?: boolean;
  /** Maestria 4: a passiva alternativa do campeão no lugar da normal. */
  passivaAlternativa?: boolean;
  /** Maestria 3: antes da 1-1, escolher 1 entre tantos tratos sem preço. */
  comeco?: number;
  /** Moradores que lembram: quem teve o trato aceito na run anterior pechincha mais barato. */
  lembrados?: { tratos: readonly string[]; fracaoPechincha: number; falas: readonly string[] };
  /** O morador recusado vezes demais aparece como elite numa rua e dá o trato sem preço. */
  ofendido?: { trato: string; especie: string; aposRuas: number; fala: string };
  /** Desafio da semana: todas as ruas com esta condição da noite. */
  condicao?: string;
  /**
   * Primeira run (GAMEPLAY.md): a primeira fase Porta a Porta mostra só `run.primeiraRun.tratos`
   * tratos, todos com o preço mais leve, e a tela explica as marcas.
   */
  primeiraRun?: boolean;
  /** Noite curta (game jam): a run acaba no chefe deste bairro (1 = só o primeiro). */
  bairros?: number;
  /** Casa Desconfiada: "Minijogos com folga" (só no Álbum; nunca na semente da noite e no desafio). */
  folgaMinijogos?: boolean;
}

/** Como terminou o duelo com A Moradora do 13 (null: ela não apareceu). */
export type DueloDaMoradora = 'duelo' | 'venceu' | 'perdeu' | null;

/** Um preço aceito: fica até o fim da run (ou até o Recibo Rasgado apagá-lo). */
export interface PrecoPago {
  id: string;
  trato: string;
}

/** O que uma casa acesa oferece: um trato e o preço sorteado. */
export interface OfertaDeTrato {
  casa: number;
  trato: string;
  precos: string[];
  pechinchou: boolean;
  aceito: boolean;
  /** Janela Vermelha: a casa oferece um trato lendário (com 2 preços). */
  vermelha?: boolean;
}

export interface EstadoPorta {
  ofertas: OfertaDeTrato[];
  aceitos: number;
  /** Tratos que dá para aceitar nesta fase (1; o Gato Preto dá um segundo). */
  limite: number;
  banco: boolean;
  curouNoBanco: boolean;
  /** Começo alternativo (maestria 3): tratos sem preço e nada de Medalha ao recusar. */
  comeco?: boolean;
  /** A primeira fase da primeira run: poucos tratos, preços leves e a explicação das marcas. */
  primeira?: boolean;
  /** Itens comuns à venda no banco nesta fase (os consumíveis estão sempre). */
  loja: string[];
}

export interface EstadoRun {
  semente: number;
  fase: FaseRun;
  bairro: number;
  ruaNoBairro: number;
  /** Mapas já montados (para a semente de cada um). */
  mapas: number;
  ruasVencidas: number;
  tratos: string[];
  precos: PrecoPago[];
  itens: string[];
  medalhas: number;
  /** Ruas sem luz ainda por vir (o preço vale para a próxima rua). */
  ruasSemLuz: number;
  doisPrecosNoProximo: boolean;
  reciboUsado: boolean;
  /** Segundos de jogo da run (Relógio da Meia-Noite). */
  tempoS: number;
  porta: EstadoPorta | null;
  /** Rerolls de preço guardados (pechinchar de graça). */
  rerolls: number;
  /** Tratos extras sem preço (Gato Preto). */
  tratosGratis: number;
  chefesVencidos: number;
  /** Os portões no fim da rua atual (vazio quando a próxima é a praça do chefe). */
  rotas: Rota[];
  /** A rota escolhida para a próxima rua e a da rua de agora. */
  proximaRota: Rota | null;
  rotaAtual: Rota | null;
  /** Pedido do morador da rua de agora. */
  pedido: string | null;
  pendentes: Pendentes;
  /** Condições raras já mostradas neste bairro. */
  rarasNoBairro: number;
  /** Baús raros que já nasceram neste bairro (todo bairro tem ao menos `baus.rarosPorBairro`). */
  rarosNoBairro: number;
  /** O primeiro erro numa Casa Desconfiada já foi perdoado nesta run. */
  desconfiadaPerdoada: boolean;
  /** Baú amaldiçoado aberto: o trato que espera o sim ou o não do jogador. */
  ofertaDoBau: { trato: string; precos: string[] } | null;
  /** Relógio Parado: segundos em que o relógio ainda fica parado e quanto já ficou. */
  relogioParadoFalta: number;
  relogioParadoS: number;
  /** Janelas Vermelhas que já apareceram na run (encontro raro da fase Porta a Porta). */
  janelasVermelhas: number;
  /** Encontros raros da run (no máximo um por rua), para a regra de frequência e o relatório. */
  encontros: { bairro: number; rua: number; tipo: TipoDeEncontro }[];
  /** O Carrinho de Pipoca já apareceu nesta run (vem uma vez só). */
  carrinhoVisto: boolean;
  /** A loja do Carrinho de Pipoca na rua de agora (3 itens comuns com desconto). */
  lojaDoCarrinho: { itens: string[]; desconto: number; aberta: boolean } | null;
  /** Totais para a tela do fim da run. */
  derrotados: number;
  docesGanhos: number;
  /** Dano causado pelo jogador na run inteira (placar da semente da noite). */
  danoCausado: number;
  moradora: DueloDaMoradora;
  /** Diário do Bairro: o que a run mostrou, por página. */
  vistos: Record<PaginaDoDiario, string[]>;
  /** Tratos oferecidos numa porta e deixados lá (moradores que lembram). */
  recusados: string[];
  /** O Morador Ofendido desta run e onde ele está. */
  ofendido: { trato: string; situacao: 'esperando' | 'naRua' | 'vencido' } | null;
  /** Onde a run acabou e o quanto faltou (só na derrota). */
  fim: { onde: string; faltou: string | null } | null;
}

/** O que a tela do fim da run mostra (GAMEPLAY.md, "Tela de derrota"). */
export interface ResumoDaRun {
  venceu: boolean;
  campeao: string;
  campeaoId: string;
  /** Bairro e mapa onde acabou ("Vila das Lanternas · Rua do Corvo Manso"). */
  onde: string;
  /** O quanto faltou ("O Síndico Zeloso ficou com 12% de Coragem"). */
  faltou: string | null;
  nivel: number;
  evolucoes: { tecla: string; habilidade: string; id: string; nome: string }[];
  tratos: { nome: string; marcas: string[] }[];
  conjuntos: { nome: string; tratos: number; nivel: number }[];
  precos: string[];
  itens: string[];
  medalhas: number;
  ruasVencidas: number;
  chefesVencidos: number;
  derrotados: number;
  docesGanhos: number;
  relogio: string;
  /** Segundos de run e dano causado (placar da semente da noite). */
  tempoS: number;
  danoCausado: number;
  lua: number;
  moradora: DueloDaMoradora;
  /** Para o progresso (Diário, maestria e moradores). */
  tratoIds: string[];
  recusados: string[];
  vistos: Record<PaginaDoDiario, string[]>;
  xpTotal: number;
  ofendido: 'esperando' | 'naRua' | 'vencido' | null;
  /** Doces Guardados que a run rende para o Álbum: 10% dos doces e 50 por chefe. */
  docesGuardados: number;
}

export interface ConjuntoAtivo {
  marca: Marca;
  nome: string;
  tratos: number;
  /** 0, 2 ou 4: qual bônus do Conjunto está ligado. */
  nivel: 0 | 2 | 4;
}

/** Um caminho mostrado num portão: a próxima rua, com condição, elite e recompensa. */
export interface Rota {
  condicao: string;
  elites: EliteDaRua[];
  recompensa: string;
  semente: number;
  /** Postes amigos que ainda acendem lá, com os preços de agora. */
  postes: number;
}

/** O que pedidos cumpridos e portões deixam para depois. */
export interface Pendentes {
  casasExtras: number;
  precoLeve: boolean;
  portaoExtra: boolean;
  susto: number;
}

export interface RuaDaRun extends RuaDeLuta {
  tratos: TratosNaRua;
}

/** Atributos que a Chave da Cidade aumenta ("todos os atributos"). */
const TODOS_OS_ATRIBUTOS: readonly NomeAtributo[] = [
  'coragemMax',
  'energiaMax',
  'forca',
  'feitico',
  'resistencia',
  'pressa',
  'velocidade',
  'luzMax',
];

const ORIGEM = 'run';
/** O "trato" dos preços que a Lua Cheia já paga no início. */
export const LUA = 'lua_cheia';

/**
 * Uma run (GDD, "Estrutura da run"): 3 bairros de 3 ruas e um chefe; entre as ruas, a fase Porta a
 * Porta com tratos, preços e o banco. Guarda a ficha e o bolso que passam de um mapa para o outro,
 * aplica tratos, Conjuntos, preços, itens e Medalhas, e monta cada mapa com as opções certas.
 */
export class Run {
  readonly ficha: Ficha;
  readonly bolso: Bolso;
  readonly estado: EstadoRun;
  private readonly rng: Rng;
  /** A primeira fase Porta a Porta já foi sorteada (a da primeira run é a mais simples). */
  private primeiraPortaSorteada = false;

  constructor(
    readonly conteudo: ConteudoRun,
    semente: number,
    campeao = 'bruxinha',
    readonly opcoes: OpcoesDaRun = {},
  ) {
    this.rng = new Rng(semente * 7919 + 17);
    // Maestria 4: a passiva alternativa entra no lugar da normal.
    const def = conteudo.campeoes[campeao];
    const alt = opcoes.passivaAlternativa && def ? def.passivaAlternativa : null;
    this.ficha = criarFicha(
      campeao,
      alt && def
        ? {
            ...conteudo,
            campeoes: {
              ...conteudo.campeoes,
              [campeao]: {
                ...def,
                passiva: alt.passiva,
                nomePassiva: alt.nome,
                descricaoPassiva: alt.descricao,
              },
            },
          }
        : conteudo,
    );
    this.ficha.despertares = opcoes.despertares ?? true;
    this.bolso = {
      doces: conteudo.run.docesIniciais,
      consumiveis: conteudo.run.consumiveisIniciais.map((c) => ({ ...c })),
      susto: novoSusto(),
    };
    this.estado = {
      semente,
      fase: 'rua',
      bairro: 0,
      ruaNoBairro: 0,
      mapas: 0,
      ruasVencidas: 0,
      tratos: [],
      precos: [],
      itens: [],
      medalhas: 0,
      ruasSemLuz: 0,
      doisPrecosNoProximo: false,
      reciboUsado: false,
      tempoS: 0,
      porta: null,
      rerolls: 0,
      tratosGratis: 0,
      chefesVencidos: 0,
      rotas: [],
      proximaRota: null,
      rotaAtual: null,
      pedido: null,
      pendentes: { casasExtras: 0, precoLeve: false, portaoExtra: false, susto: 0 },
      rarasNoBairro: 0,
      rarosNoBairro: 0,
      desconfiadaPerdoada: false,
      ofertaDoBau: null,
      relogioParadoFalta: 0,
      relogioParadoS: 0,
      janelasVermelhas: 0,
      encontros: [],
      carrinhoVisto: false,
      lojaDoCarrinho: null,
      derrotados: 0,
      docesGanhos: 0,
      danoCausado: 0,
      moradora: null,
      vistos: diarioVazio(),
      recusados: [],
      ofendido: opcoes.ofendido ? { trato: opcoes.ofendido.trato, situacao: 'esperando' } : null,
      fim: null,
    };
    const bonus = opcoes.bonus;
    if (bonus) {
      this.bolso.doces += bonus.doces;
      this.estado.rerolls += bonus.rerolls;
    }
    // Lua Cheia 3: a run já começa com preços pagos.
    for (const ef of this.daLua('precoInicial')) {
      for (let k = 0; k < ef.n; k++) {
        const ids = Object.keys(conteudo.precos.precos).filter(
          (id) => !this.estado.precos.some((p) => p.id === id),
        );
        if (ids.length === 0) break;
        const id = ids[this.rng.inteiro(0, ids.length - 1)]!;
        this.estado.precos.push({ id, trato: LUA });
        if (this.defPreco(id).efeitos.some((x) => x.tipo === 'ruaSemLuz')) this.estado.ruasSemLuz++;
      }
    }
    this.aplicarNaFicha();
    // Maestria 3: a run começa numa porta com tratos sem preço.
    if (opcoes.comeco) {
      this.estado.fase = 'portaAPorta';
      this.estado.porta = this.sortearComeco(opcoes.comeco);
    }
  }

  /** Marca no Diário o que a run mostrou. */
  ver(pagina: PaginaDoDiario, id: string): void {
    const lista = this.estado.vistos[pagina];
    if (!lista.includes(id)) lista.push(id);
  }

  /** A porta do começo alternativo: `n` tratos liberados, sem preço, sem banco e sem loja. */
  private sortearComeco(n: number): EstadoPorta {
    const ofertas = this.embaralhar(this.tratosLiberados())
      .slice(0, n)
      .map((trato, casa) => {
        this.ver('tratos', trato);
        return { casa, trato, precos: [], pechinchou: true, aceito: false };
      });
    return {
      ofertas,
      aceitos: 0,
      limite: 1,
      banco: false,
      curouNoBanco: false,
      loja: [],
      comeco: true,
    };
  }

  // ------------------------------------------------------------------ consultas

  /** Nível de Lua Cheia da run. */
  get lua(): number {
    return Math.max(0, Math.min(this.conteudo.luaCheia.niveis.length, this.opcoes.lua ?? 0));
  }

  /** Os efeitos da Lua Cheia: cada nível soma o seu aos de baixo. */
  efeitosDaLua(): EfeitoDaLua[] {
    return this.conteudo.luaCheia.niveis.slice(0, this.lua).map((n) => n.efeito);
  }

  private daLua<T extends EfeitoDaLua['tipo']>(tipo: T): Extract<EfeitoDaLua, { tipo: T }>[] {
    return this.efeitosDaLua().filter(
      (e): e is Extract<EfeitoDaLua, { tipo: T }> => e.tipo === tipo,
    );
  }

  /** Tratos comuns que esta run pode oferecer (os do Álbum, ou todos). */
  tratosLiberados(): string[] {
    const todos = Object.keys(this.conteudo.tratos.tratos);
    const lista = this.opcoes.tratos;
    return lista ? todos.filter((id) => lista.includes(id)) : todos;
  }

  /** O item entra na loja e nas recompensas: inicial ou comprado no Álbum. */
  private itemLiberado(id: string, d: DefItem): boolean {
    return d.inicial || (this.opcoes.itensExtras?.includes(id) ?? false);
  }

  defTrato(id: string): DefTrato {
    const t = this.conteudo.tratos;
    const d = t.tratos[id] ?? t.especiais[id] ?? t.lendarios[id];
    if (!d) throw new Error(`trato ${id} não existe em content/tratos.json`);
    return d;
  }

  defItem(id: string): DefItem {
    const d = this.conteudo.itens.itens[id];
    if (!d) throw new Error(`item ${id} não existe em content/itens.json`);
    return d;
  }

  /** Quantos tratos de cada marca a run tem. */
  marcas(tratos: readonly string[] = this.estado.tratos): Record<Marca, number> {
    const n = Object.fromEntries(MARCAS.map((m) => [m, 0])) as Record<Marca, number>;
    for (const id of tratos) for (const m of this.defTrato(id).marcas) n[m]++;
    return n;
  }

  conjuntos(tratos: readonly string[] = this.estado.tratos): ConjuntoAtivo[] {
    const n = this.marcas(tratos);
    return MARCAS.map((marca) => {
      const c = this.conteudo.tratos.conjuntos[marca];
      const k = n[marca];
      return {
        marca,
        nome: k >= 4 ? c.quatro.nome : c.nome,
        tratos: k,
        nivel: k >= 4 ? 4 : k >= 2 ? 2 : 0,
      };
    });
  }

  /** Todos os efeitos ativos: tratos, Conjuntos (de 2 e de 4), preços e itens. */
  efeitos(): EfeitoDeRun[] {
    const out: EfeitoDeRun[] = [];
    for (const id of this.estado.tratos) out.push(...this.defTrato(id).efeitos);
    for (const c of this.conjuntos()) {
      if (c.nivel >= 2) this.ver('conjuntos', `${c.marca}:2`);
      if (c.nivel >= 4) this.ver('conjuntos', `${c.marca}:4`);
      const def = this.conteudo.tratos.conjuntos[c.marca];
      if (c.nivel >= 2) out.push(...def.dois.efeitos);
      if (c.nivel >= 4) out.push(...def.quatro.efeitos);
    }
    for (const p of this.estado.precos) out.push(...this.defPreco(p.id).efeitos);
    for (const id of this.estado.itens) out.push(...this.defItem(id).efeitos);
    return out;
  }

  private defPreco(id: string) {
    const d = this.conteudo.precos.precos[id];
    if (!d) throw new Error(`preço ${id} não existe em content/precos.json`);
    return d;
  }

  private de<T extends EfeitoDeRun['tipo']>(tipo: T): Extract<EfeitoDeRun, { tipo: T }>[] {
    return this.efeitos().filter((e): e is Extract<EfeitoDeRun, { tipo: T }> => e.tipo === tipo);
  }

  get nomeDoBairro(): string {
    const nomes = this.conteudo.run.nomesDosBairros;
    return nomes[Math.min(this.estado.bairro, nomes.length - 1)]!;
  }

  get totalDeBairros(): number {
    const todos = this.conteudo.run.nomesDosBairros.length;
    return Math.max(1, Math.min(todos, this.opcoes.bairros ?? todos));
  }

  // ------------------------------------------------------------------ relógio da meia-noite

  /** Minutos reais da run, contando o Relógio adiantado pelos preços. */
  private minutosReais(): number {
    const adiantado = [...this.de('relogioAdiantado'), ...this.daLua('relogioAdiantado')].reduce(
      (s, e) => s + e.minutos,
      0,
    );
    // Relógio Parado: o tempo em que ele ficou parado não conta.
    return (this.estado.tempoS - this.estado.relogioParadoS) / 60 + adiantado;
  }

  private minutosAteMeiaNoite(): number {
    const r = this.conteudo.run.relogio;
    return ((r.horaMeiaNoite - r.horaInicial) * 60) / r.minutosDeJogoPorMinuto;
  }

  /** A hora no relógio do jogo, como "21:32". */
  relogio(): string {
    const r = this.conteudo.run.relogio;
    const total = r.horaInicial * 60 + this.minutosReais() * r.minutosDeJogoPorMinuto;
    const h = Math.floor(total / 60) % 24;
    const m = Math.floor(total % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  passouDaMeiaNoite(): boolean {
    return this.minutosReais() >= this.minutosAteMeiaNoite();
  }

  /** Depois da meia-noite, inimigos ganham +10% de Coragem e de dano por minuto. */
  multMeiaNoite(): number {
    const passou = this.minutosReais() - this.minutosAteMeiaNoite();
    return 1 + Math.max(0, passou) * this.conteudo.run.relogio.bonusPorMinuto;
  }

  /** Sistema que conta o tempo da run em todos os mapas. */
  private sistemaRelogio(): Sistema {
    return {
      antesDeMover: (mundo: Mundo) => {
        const e = this.estado;
        e.tempoS += mundo.dt;
        if (e.relogioParadoFalta > 0) {
          e.relogioParadoFalta -= mundo.dt;
          e.relogioParadoS += mundo.dt;
        }
      },
    };
  }

  // ------------------------------------------------------------------ ficha

  /**
   * Põe na ficha os bônus fixos da run (tratos, Conjuntos, itens, preços e Medalhas). O que muda
   * durante a luta (sombra, Fome de Doce) fica com os tratos da rua.
   */
  aplicarNaFicha(): void {
    const c = this.ficha.combate;
    // Noite Sem Fim: o Frenesi dura mais e o Susto não esvazia sozinho (o bolso leva para a rua).
    const noite = this.de('frenesiDobrado');
    this.bolso.susto.duracaoFrenesiMult = noite.reduce((m, ef) => m * ef.mult, 1);
    this.bolso.susto.naoEsvazia = noite.length > 0;
    const mods: Modificador[] = [];
    const nPrecos = this.estado.precos.length;
    for (const ef of this.efeitos()) {
      switch (ef.tipo) {
        case 'atributo':
          mods.push({ origem: ORIGEM, atributo: ef.atributo, soma: ef.soma, mult: ef.mult });
          break;
        case 'atributoPrincipal':
          mods.push({
            origem: ORIGEM,
            atributo: this.ficha.campeao.atributoPrincipal,
            soma: ef.soma,
          });
          break;
        case 'todosAtributos':
          for (const atributo of TODOS_OS_ATRIBUTOS)
            mods.push({ origem: ORIGEM, atributo, mult: ef.mult });
          break;
        case 'raioLanterna':
          mods.push({ origem: ORIGEM, atributo: 'raioLanterna', soma: ef.soma });
          break;
        case 'danoPorPreco':
          if (nPrecos > 0)
            mods.push({ origem: ORIGEM, atributo: 'dano', mult: ef.porPreco * nPrecos });
          break;
        case 'recargaPorPreco': {
          // "Reduz 4% da recarga" vira velocidade de recarga: recarga × (1 − r) = recarga / (1 + v).
          const r = Math.min(ef.maximo, ef.porPreco * nPrecos);
          if (r > 0)
            mods.push({ origem: ORIGEM, atributo: 'velocidadeRecarga', mult: 1 / (1 - r) - 1 });
          break;
        }
        default:
          break;
      }
    }
    const med = this.conteudo.tratos.medalha;
    if (this.estado.medalhas > 0) {
      mods.push({ origem: ORIGEM, atributo: 'dano', mult: med.dano * this.estado.medalhas });
      mods.push({
        origem: ORIGEM,
        atributo: 'coragemMax',
        mult: med.coragem * this.estado.medalhas,
      });
    }
    // Bônus do Álbum: Coragem extra.
    const bonusCoragem = this.opcoes.bonus?.coragem ?? 0;
    if (bonusCoragem > 0) mods.push({ origem: ORIGEM, atributo: 'coragemMax', mult: bonusCoragem });
    definirModificadores(
      c,
      ORIGEM,
      mods.filter((m) => m.soma || m.mult),
    );
    recalcular(c);
  }

  // ------------------------------------------------------------------ mapas

  private sementeDoMapa(): number {
    return (this.estado.semente * 101 + this.estado.mapas++ * 7 + 1) >>> 0;
  }

  /** Opções da próxima rua de luta, com os preços e tratos ativos. */
  opcoesDaRua(): OpcoesRua {
    const intervalos = [...this.de('intervaloOndas'), ...this.daLua('intervaloOndas')].map(
      (e) => e.segundos,
    );
    const inimigos = this.daLua('inimigos');
    const extra = this.daLua('extraPorOnda').reduce((s, e) => s + e.n, 0);
    const curaPostes = this.de('curaPostes').reduce((p, e) => p * e.mult, 1);
    return {
      bairro: this.estado.bairro,
      intervaloOndas: intervalos.length > 0 ? Math.min(...intervalos) : undefined,
      multCuraPostes: curaPostes,
      multMeiaNoite: () => this.multMeiaNoite(),
      multCoragemInimigo: 1 + inimigos.reduce((s, e) => s + e.coragem, 0),
      multDanoInimigo: 1 + inimigos.reduce((s, e) => s + e.dano, 0),
      multCoragemChefe: 1 + this.daLua('chefes').reduce((s, e) => s + e.coragem, 0),
      multRecargaPostes: 1 + this.daLua('recargaPostes').reduce((s, e) => s + e.mult, 0),
      extraPorOnda: extra > 0 ? extra : undefined,
      docesPorInimigo: this.de('docesPorInimigo').reduce((s, e) => s + e.soma, 0),
      iscasGratis: this.de('iscaGratisPorRua').reduce((s, e) => s + e.n, 0),
      janelasCuram: this.de('janelasCuram').length > 0,
      tratosAceitos: this.estado.tratos.length,
      docesDoCobrador: this.de('cobradorSoltaDoces').reduce((s, e) => s + e.doces, 0),
      aoGanhar: (r) => this.ganhar(r),
      folgaMinijogos: !!this.opcoes.folgaMinijogos,
      perdoarDesconfiada: () => {
        if (this.estado.desconfiadaPerdoada) return false;
        this.estado.desconfiadaPerdoada = true;
        return true;
      },
      itemDaCasaDesperta: () => this.sortearItem(),
    };
  }

  /** Guarda o que a rua deu: item (ou doces, se não couber), reroll ou o trato do Gato Preto. */
  ganhar(r: Recompensa): void {
    if (r.tipo === 'item') {
      if (
        !this.estado.itens.includes(r.id) &&
        this.estado.itens.length < this.conteudo.itens.maxItens
      ) {
        this.estado.itens.push(r.id);
        this.aplicarNaFicha();
      } else this.bolso.doces += Math.round(this.defItem(r.id).preco / 2);
    } else if (r.tipo === 'reroll') this.estado.rerolls += r.n;
    else if (r.tipo === 'ofertaDoBau')
      this.estado.ofertaDoBau = { trato: r.trato, precos: r.precos };
    else if (r.tipo === 'medalhas') {
      this.estado.medalhas += r.n;
      this.aplicarNaFicha();
    } else if (r.tipo === 'carrinho') this.abrirCarrinho();
    else if (r.tipo === 'tratoDoMorador') {
      // O Morador Ofendido derrotado entrega o trato dele, sem preço.
      if (!this.estado.tratos.includes(r.trato)) this.pagarTrato(r.trato, []);
      if (this.estado.ofendido) this.estado.ofendido.situacao = 'vencido';
    } else this.estado.tratosGratis++;
  }

  // ------------------------------------------------------------------ Carrinho de Pipoca

  /** F no Carrinho: a loja abre (os 3 itens são sorteados na primeira vez da rua). */
  abrirCarrinho(): void {
    const cfg = this.conteudo.run.encontros.carrinhoDePipoca;
    const loja = this.estado.lojaDoCarrinho;
    if (loja) {
      loja.aberta = true;
      return;
    }
    const livres = Object.entries(this.conteudo.itens.itens)
      .filter(
        ([id, d]) =>
          d.tipo === 'item' && this.itemLiberado(id, d) && !this.estado.itens.includes(id),
      )
      .map(([id]) => id);
    this.estado.lojaDoCarrinho = {
      itens: this.embaralhar(livres).slice(0, cfg.itens),
      desconto: cfg.desconto,
      aberta: true,
    };
  }

  fecharCarrinho(): void {
    if (this.estado.lojaDoCarrinho) this.estado.lojaDoCarrinho.aberta = false;
  }

  /** Preço no Carrinho: o do banco com o desconto dele. */
  precoNoCarrinho(id: string): number {
    const desconto = this.estado.lojaDoCarrinho?.desconto ?? 0;
    return Math.round(this.precoNoBanco(id) * (1 - desconto));
  }

  motivoParaNaoComprarNoCarrinho(id: string): string | null {
    const loja = this.estado.lojaDoCarrinho;
    if (!loja?.itens.includes(id)) return 'Fora do carrinho';
    if (this.estado.itens.includes(id)) return 'Já tem';
    if (this.estado.itens.length >= this.conteudo.itens.maxItens) return 'Bolso cheio';
    if (this.bolso.doces < this.precoNoCarrinho(id)) return 'Faltam doces';
    return null;
  }

  comprarNoCarrinho(id: string): boolean {
    if (this.motivoParaNaoComprarNoCarrinho(id) !== null) return false;
    this.bolso.doces -= this.precoNoCarrinho(id);
    this.estado.itens.push(id);
    this.aplicarNaFicha();
    return true;
  }

  /**
   * O encontro raro da rua (GAMEPLAY.md, "Encontros raros"): no máximo um. O Carrinho de Pipoca
   * vem uma vez por run, numa rua dos bairros dele (cada rua que falta tem a mesma chance, e a
   * última é certa); a Chuva de Doces traz o Gato Preto; senão, Gato, Criança ou Festa, cada um
   * pela sua chance.
   */
  private sortearEncontro(gatoCerto: boolean): TipoDeEncontro | null {
    const cfg = this.conteudo.run.encontros;
    const e = this.estado;
    const c = cfg.carrinhoDePipoca;
    const ruas = this.conteudo.run.ruasPorBairro;
    const restantes = c.bairros.includes(e.bairro)
      ? c.bairros.filter((b) => b >= e.bairro).length * ruas - e.ruaNoBairro
      : 0;
    const carrinho = !e.carrinhoVisto && restantes > 0;
    if (carrinho && (restantes === 1 || (!gatoCerto && this.rng.proximo() < 1 / restantes))) {
      e.carrinhoVisto = true;
      return 'carrinho_de_pipoca';
    }
    if (gatoCerto) return 'gato_preto';
    let r = this.rng.proximo();
    for (const [tipo, chance] of Object.entries(cfg.chances) as [TipoDeEncontro, number][]) {
      if (r < chance) return tipo;
      r -= chance;
    }
    return null;
  }

  /** Onde o encontro fica na rua gerada (null se ela não tem lugar para ele). */
  private lugarDoEncontro(tipo: TipoDeEncontro, g: RuaGerada): EncontroDaRua | null {
    const cfg = this.conteudo.run.encontros;
    if (tipo === 'crianca_perdida')
      return { tipo, pos: pontoNoCaminho(g.rota, cfg.criancaPerdida.noCaminho) };
    if (tipo === 'carrinho_de_pipoca')
      return { tipo, pos: pontoNoCaminho(g.rota, cfg.carrinhoDePipoca.noCaminho) };
    if (tipo === 'festa_na_garagem') {
      const longe = g.portas.filter(
        (p) => progressoNoCaminho(g.rota, p) >= cfg.festaNaGaragem.desdeOCaminho,
      );
      if (longe.length === 0) return null;
      const p = longe[this.rng.inteiro(0, longe.length - 1)]!;
      return { tipo, pos: { x: p.x, y: p.y } };
    }
    return null;
  }

  /** Aceita o trato do baú amaldiçoado: o poder entra na hora e o preço vale nas próximas ruas. */
  aceitarOfertaDoBau(): boolean {
    const o = this.estado.ofertaDoBau;
    if (!o) return false;
    this.estado.ofertaDoBau = null;
    this.pagarTrato(o.trato, o.precos);
    return true;
  }

  /** Recusa o trato do baú amaldiçoado (ele some com o baú). */
  recusarOfertaDoBau(): void {
    this.estado.ofertaDoBau = null;
  }

  /** Um item comum que a run ainda não tem (baús raros, pedidos, recompensas de portão). */
  sortearItem(): string | null {
    const livres = Object.entries(this.conteudo.itens.itens)
      .filter(
        ([id, d]) =>
          d.tipo === 'item' && this.itemLiberado(id, d) && !this.estado.itens.includes(id),
      )
      .map(([id]) => id);
    return livres.length > 0 ? livres[this.rng.inteiro(0, livres.length - 1)]! : null;
  }

  /**
   * Baú de quintal (GAMEPLAY.md, "Baús"): comum (60 a 100 doces), raro (item comum, ou reroll e
   * 50 doces) ou amaldiçoado (um trato forte com 1 preço, aceito ou recusado na hora), por peso.
   */
  sortearBau(pos: V2): ConteudoBau {
    const cfg = this.conteudo.run.baus;
    // Coleção de Chaves: baús de quintal dão 1 item comum extra.
    const extra = this.de('bauDaItem').length > 0 ? this.sortearItem() : null;
    const { raro, amaldicoado } = cfg.pesos;
    // Chave Mestra Dourada: todos os baús são raros ou melhores.
    const comum = this.de('bausMelhores').length > 0 ? 0 : cfg.pesos.comum;
    const r = this.rng.proximo() * (comum + raro + amaldicoado);
    if (r >= comum + raro) {
      const oferta = this.tratoAmaldicoado();
      if (oferta) return { pos, tipo: 'amaldicoado', doces: 0, item: extra, rerolls: 0, ...oferta };
    }
    if (r >= comum) {
      const item = this.sortearItem();
      return item && item !== extra
        ? { pos, tipo: 'raro', doces: 0, item, rerolls: 0 }
        : { pos, tipo: 'raro', doces: cfg.docesRaro, item: extra, rerolls: cfg.rerollsRaro };
    }
    const [a, b] = cfg.docesComum;
    return { pos, tipo: 'comum', doces: this.rng.inteiro(a, b), item: extra, rerolls: 0 };
  }

  /** O trato do baú amaldiçoado: o mais forte que a run ainda não tem (até a força do baú). */
  tratoAmaldicoado(): { trato: string; precos: string[] } | null {
    const max = this.conteudo.run.baus.forcaAmaldicoado;
    const liberados = new Set(this.tratosLiberados());
    const livres = Object.entries(this.conteudo.tratos.tratos).filter(
      ([id, d]) => liberados.has(id) && !this.estado.tratos.includes(id) && d.forca <= max,
    );
    if (livres.length === 0) return null;
    const forca = Math.max(...livres.map(([, d]) => d.forca));
    const fortes = livres.filter(([, d]) => d.forca === forca).map(([id]) => id);
    const trato = fortes[this.rng.inteiro(0, fortes.length - 1)]!;
    return { trato, precos: this.sortearPrecos(this.defTrato(trato), 1) };
  }

  /** Conteúdo de um baú raro (item comum, ou doces e um reroll se não houver item). */
  private bauRaro(): Omit<ConteudoBau, 'pos'> {
    const cfg = this.conteudo.run.baus;
    const item = this.sortearItem();
    return item
      ? { tipo: 'raro', doces: 0, item, rerolls: 0 }
      : { tipo: 'raro', doces: cfg.docesRaro, item: null, rerolls: cfg.rerollsRaro };
  }

  /** Um selvagem por quintal; com o encontro do Gato Preto, ele entra no lugar de um. */
  private sortearSelvagens(n: number, gato: boolean): (string | null)[] {
    const cfg = this.conteudo.run.selvagens;
    const pesos = Object.entries(cfg.pesos).filter(([, p]) => p > 0);
    const total = pesos.reduce((s, [, p]) => s + p, 0);
    const lista = Array.from({ length: n }, () => {
      let r = this.rng.proximo() * total;
      for (const [k, p] of pesos) {
        r -= p;
        if (r <= 0) return k;
      }
      return pesos[pesos.length - 1]?.[0] ?? null;
    });
    if (n > 0 && gato) lista[this.rng.inteiro(0, n - 1)] = 'gato_preto';
    return lista;
  }

  /** Elites da posição atual (bairro × rua), sorteadas da curva do complemento. */
  sortearElites(): EliteDaRua[] {
    const pos = this.conteudo.run.elites.porPosicao[this.estado.bairro]?.[this.estado.ruaNoBairro];
    if (!pos || pos.n <= 0 || pos.opcoes.length === 0) return [];
    const opcoes = this.embaralhar([...pos.opcoes]);
    return Array.from({ length: pos.n }, (_, k) => ({
      especie: opcoes[k % opcoes.length]!,
      reforcado: pos.reforcado,
    }));
  }

  /** Postes amigos que nascem apagados em cada rua (Poste Apagado, Vela Apagada). */
  postesApagados(): number {
    return this.de('postesApagados').reduce((s, e) => s + e.n, 0);
  }

  /** Monta a próxima rua de luta, com preços, tratos e relógio. */
  novaRua(): RuaDaRun {
    const e = this.estado;
    const c = this.conteudo;
    const n = c.noite;
    const rota = e.proximaRota ?? this.sortearRota(e.bairro, e.ruaNoBairro, 0);
    e.proximaRota = null;
    e.rotaAtual = rota;
    const cond = n.condicoes[rota.condicao];
    const semente = rota.semente;
    const semLuz = e.ruasSemLuz > 0;
    if (semLuz) e.ruasSemLuz--;
    // Os portões do fim desta rua (a última do bairro leva só à praça do chefe).
    const ultima = e.ruaNoBairro >= c.run.ruasPorBairro - 1;
    const nPortoes = ultima ? 1 : n.portoes + (e.pendentes.portaoExtra ? 1 : 0);
    e.pendentes.portaoExtra = false;
    const curva = c.run.curva[e.bairro]?.[e.ruaNoBairro];
    const g = gerarRua(semente, c.gerador, c.modelos, c.luz, {
      bairro: e.bairro,
      postesApagados: this.postesApagados(),
      fracaoApagados: curva?.postesApagados,
      semLuz,
      janelasApagadas: cond?.janelasApagadas,
      saidas: nPortoes,
      nome: `Rua ${e.ruaNoBairro + 1} · ${this.nomeDoBairro}`,
    });
    // Os portões sorteiam juntos: elites e recompensas diferentes em cada um.
    const base = this.rng.inteiro(0, 99);
    const recompensas = this.embaralhar(Object.keys(n.recompensas));
    e.rotas = ultima
      ? []
      : Array.from({ length: nPortoes }, (_, k) =>
          this.sortearRota(
            e.bairro,
            e.ruaNoBairro + 1,
            k,
            base,
            recompensas[k % recompensas.length],
          ),
        );
    const opcoes = this.opcoesDaRua();
    // Chave Mestra: um baú de doces diante de uma porta da rua.
    const baus: ConteudoBau[] = this.de('bauTrancado').map((ef) => {
      const p = g.portas[this.rng.inteiro(0, g.portas.length - 1)]!;
      return { pos: { x: p.x, y: p.y }, tipo: 'comum', doces: ef.doces, item: null, rerolls: 0 };
    });
    // Nem todo quintal tem baú: a rota tem muitos becos.
    for (const q of g.quintais)
      if (this.rng.proximo() < c.run.baus.chanceNoQuintal) baus.push(this.sortearBau(q.bau));
    // O atalho escuro sempre esconde um baú no meio.
    if (g.atalho) baus.push(this.sortearBau(g.atalho.bau));
    // Chuva de Doces: baús extras diante das portas; recompensa de portão: baú raro na entrada.
    for (let k = 0; k < (cond?.bausExtras ?? 0); k++) {
      const p = g.portas[this.rng.inteiro(0, g.portas.length - 1)]!;
      baus.push(this.sortearBau({ x: p.x, y: p.y }));
    }
    const naEntrada = { x: g.rua.entrada.x + 1.5, y: g.rua.entrada.y - 1 };
    if (rota.recompensa === 'bau_raro') baus.push({ pos: naEntrada, ...this.bauRaro() });
    // Regra de frequência: todo bairro tem ao menos `rarosPorBairro` baús raros. Na última rua, o
    // que faltar vira raro (o primeiro baú comum, ou um baú novo na entrada).
    const raros = () => baus.filter((b) => b.tipo === 'raro').length;
    while (ultima && e.rarosNoBairro + raros() < c.run.baus.rarosPorBairro) {
      const comum = baus.findIndex((b) => b.tipo === 'comum');
      if (comum >= 0) baus[comum] = { pos: baus[comum]!.pos, ...this.bauRaro() };
      else baus.push({ pos: naEntrada, ...this.bauRaro() });
    }
    e.rarosNoBairro += raros();
    // Encontro raro: no máximo um por rua (o Gato Preto precisa de um quintal).
    e.lojaDoCarrinho = null;
    let tipo = this.sortearEncontro(!!cond?.gatoCerto);
    if (tipo === 'gato_preto' && g.quintais.length === 0) tipo = null;
    const encontro = tipo && tipo !== 'gato_preto' ? this.lugarDoEncontro(tipo, g) : null;
    if (tipo && tipo !== 'gato_preto' && !encontro) tipo = null;
    if (tipo) {
      e.encontros.push({ bairro: e.bairro, rua: e.ruaNoBairro, tipo });
      this.ver('encontros', tipo);
    }
    const selvagens = this.sortearSelvagens(g.quintais.length, tipo === 'gato_preto');
    // O Morador Ofendido aparece numa rua, depois de algumas vencidas.
    const of = this.opcoes.ofendido;
    let ofendido: OpcoesRua['ofendido'];
    if (of && e.ofendido?.situacao === 'esperando' && e.ruasVencidas >= of.aposRuas) {
      e.ofendido.situacao = 'naRua';
      ofendido = { trato: of.trato, especie: of.especie, fala: of.fala };
    }
    const elitesExtras = this.de('eliteExtra').map((x) => x.elite);
    // Pedido do morador.
    const ids = Object.keys(n.pedidos);
    e.pedido = ids.length > 0 ? ids[this.rng.inteiro(0, ids.length - 1)]! : null;
    const susto = e.pendentes.susto;
    e.pendentes.susto = 0;
    e.fase = 'rua';
    return this.montarLuta(g, semente, {
      ...opcoes,
      encontro: encontro ?? undefined,
      ofendido,
      composicaoOndas: curva?.composicao,
      baus,
      selvagens,
      elites: rota.elites,
      elitesExtras,
      portoes: nPortoes,
      multDanoInimigo: (cond?.multDanoInimigo ?? 1) * (opcoes.multDanoInimigo ?? 1),
      multDoces: (cond?.multDoces ?? 1) * (rota.recompensa === 'doces_em_dobro' ? 2 : 1),
      extraPorOnda: (cond?.extraPorOnda ?? 0) + (opcoes.extraPorOnda ?? 0) || undefined,
      multXp: cond?.multXp,
      silencio: cond?.silencio,
      curvaProjeteis: cond?.curvaProjeteis,
      ventania:
        cond?.apagaPosteACadaS && cond.posteApagadoS
          ? { aCadaS: cond.apagaPosteACadaS, apagadoS: cond.posteApagadoS }
          : undefined,
      multCuraPostes: (opcoes.multCuraPostes ?? 1) * (cond?.multCuraPostes ?? 1),
      pedido: e.pedido ? { id: e.pedido, def: n.pedidos[e.pedido]! } : undefined,
      sustoInicial: susto,
      bauDosSegredos: this.bauRaro(),
    });
  }

  /**
   * Um caminho para a rua da posição dada: condição da noite (as raras em no máximo 1 portão por
   * bairro; a 1-1 é sempre Noite Comum), elite da curva e recompensa extra.
   */
  sortearRota(
    bairro: number,
    rua: number,
    portao: number,
    base = this.rng.inteiro(0, 99),
    recompensaFixa?: string,
  ): Rota {
    const n = this.conteudo.noite;
    const c = this.conteudo;
    // Desafio da semana: a mesma condição em todas as ruas.
    let condicao = this.opcoes.condicao ?? 'noite_comum';
    if (!this.opcoes.condicao && !(bairro === 0 && rua === 0)) {
      const candidatas = Object.entries(n.condicoes).filter(
        ([, d]) => d.peso > 0 && (!d.rara || this.estado.rarasNoBairro < n.rarasPorBairro),
      );
      const total = candidatas.reduce((s, [, d]) => s + d.peso, 0);
      let r = this.rng.proximo() * total;
      for (const [id, d] of candidatas) {
        r -= d.peso;
        if (r <= 0) {
          condicao = id;
          break;
        }
      }
      if (n.condicoes[condicao]?.rara) this.estado.rarasNoBairro++;
    }
    // Cada portão sorteia a elite da lista da posição, então o jogador escolhe entre duas.
    const pos = c.run.elites.porPosicao[bairro]?.[rua];
    const elites: EliteDaRua[] = [];
    if (pos && pos.n > 0 && pos.opcoes.length > 0) {
      for (let k = 0; k < pos.n; k++) {
        elites.push({
          especie: pos.opcoes[(base + portao + k) % pos.opcoes.length]!,
          reforcado: pos.reforcado,
        });
      }
    }
    this.ver('condicoes', condicao);
    const recompensas = Object.keys(n.recompensas);
    const recompensa = recompensaFixa ?? recompensas[this.rng.inteiro(0, recompensas.length - 1)]!;
    const semente = this.sementeDoMapa();
    const cond = n.condicoes[condicao];
    const g = gerarRua(semente, c.gerador, c.modelos, c.luz, {
      bairro,
      postesApagados: this.postesApagados(),
      fracaoApagados: c.run.curva[bairro]?.[rua]?.postesApagados,
      janelasApagadas: cond?.janelasApagadas,
    });
    return {
      condicao,
      elites,
      recompensa,
      semente,
      postes: g.luzes.filter((l) => l.tipo === 'poste').length,
    };
  }

  /** O que um pedido cumprido dá (GAMEPLAY.md, "Pedidos dos moradores"). */
  private recompensaDoPedido(id: string): void {
    const d = this.conteudo.noite.pedidos[id];
    if (!d) return;
    const p = this.estado.pendentes;
    switch (d.recompensa) {
      case 'reroll':
        this.estado.rerolls++;
        break;
      case 'casa_extra':
        p.casasExtras++;
        break;
      case 'doces':
        this.bolso.doces += d.doces ?? 60;
        break;
      case 'preco_leve':
        p.precoLeve = true;
        break;
      case 'item_comum': {
        const item = this.sortearItem();
        if (item) this.ganhar({ tipo: 'item', id: item });
        break;
      }
      case 'portao_extra':
        p.portaoExtra = true;
        break;
      case 'susto':
        p.susto += d.susto ?? 25;
        break;
    }
  }

  /** O chefe do bairro atual. */
  get chefeDoBairro(): string {
    const chefes = this.conteudo.run.chefes;
    return chefes[Math.min(this.estado.bairro, chefes.length - 1)]!;
  }

  /** Um eco por preço pago, para a Cobrança do Dono do Bairro (o efeito do preço escolhe qual). */
  ecosDaCobranca(): EcoDaCobranca[] {
    const cfg = this.conteudo.inimigos?.cobranca;
    if (!cfg) return [];
    return this.estado.precos.map((pago): EcoDaCobranca => {
      const def = this.conteudo.precos.precos[pago.id];
      const nome = def?.nome ?? pago.id;
      const ef = def?.efeitos[0];
      const tipo = (ef && cfg.porEfeito[ef.tipo]) ?? cfg.padrao;
      if (tipo !== 'elite') return { nome, tipo };
      return ef?.tipo === 'eliteExtra'
        ? { nome, tipo, especie: ef.elite }
        : { nome, tipo: 'areaEscura' };
    });
  }

  /** Monta a praça do chefe do bairro, com os preços e tratos valendo como numa rua. */
  novaArena(): RuaDaRun {
    const semente = this.sementeDoMapa();
    const semLuz = this.estado.ruasSemLuz > 0;
    if (semLuz) this.estado.ruasSemLuz--;
    const c = this.conteudo;
    const chefe = this.estado.fase === 'moradora' ? c.run.chefeSecreto : this.chefeDoBairro;
    const nome = c.inimigos?.inimigos[chefe]?.nome ?? chefe;
    const g = gerarArena(semente, c.gerador, c.modelos, c.luz, {
      bairro: this.estado.bairro,
      postesApagados: this.postesApagados(),
      semLuz,
      nome: `${nome} · ${this.nomeDoBairro}`,
      chefe,
    });
    return this.montarLuta(g, semente, {
      ...this.opcoesDaRua(),
      chefe,
      ecos: this.ecosDaCobranca(),
    });
  }

  /** Monta o mundo de luta (rua ou praça) com os tratos da rua e o relógio. */
  private montarLuta(g: RuaGerada, semente: number, opcoes: OpcoesRua): RuaDaRun {
    const c = this.conteudo;
    let tratos: TratosNaRua | null = null;
    const ponte: Sistema = {
      antesDeMover: (m, a) => tratos?.sistema.antesDeMover?.(m, a),
      depoisDoTick: (m, e) => tratos?.sistema.depoisDoTick?.(m, e),
    };
    const r = montarRua(g, this.ficha, c, semente, this.bolso, opcoes, [
      ponte,
      this.sistemaRelogio(),
    ]);
    tratos = new TratosNaRua({
      efeitos: this.efeitos(),
      heroi: r.jogador,
      luz: r.luz,
      executor: r.executor,
      regras: r.regras,
      habilidades: new Map(c.habilidades.map((h) => [h.id, h])),
      combate: c.combate,
      atributoPrincipal: this.ficha.campeao.atributoPrincipal,
    });
    this.aplicarNaFicha();
    return { ...r, tratos };
  }

  /** Monta a fase Porta a Porta que já foi sorteada em `venceuRua`. */
  novaPorta(): PortaDeLuta {
    const p = this.estado.porta!;
    const c = this.conteudo;
    const g = gerarPortaAPorta(this.sementeDoMapa(), c.gerador, c.modelos, c.luz, {
      bairro: this.estado.bairro,
      acesas: p.ofertas.length,
      banco: p.banco,
    });
    // As ofertas seguem as casas acesas, de sul para norte.
    const acesas = g.casas.map((casa, i) => ({ casa, i })).filter((x) => x.casa.acesa);
    p.ofertas.forEach((o, k) => (o.casa = acesas[k]?.i ?? -1));
    p.ofertas = p.ofertas.filter((o) => o.casa >= 0);
    return montarPortaAPorta(g, this.ficha, c, this.sementeDoMapa(), c.run.porta.raioInteracao, [
      this.sistemaRelogio(),
    ]);
  }

  // ------------------------------------------------------------------ fluxo da run

  /** A rua acabou com vitória: conta e decide o próximo mapa (porta, chefe ou próximo bairro). */
  venceuRua(daRua?: DaRua & Pick<EstadoRua, 'pedido' | 'portaoEscolhido'>): void {
    const e = this.estado;
    if (daRua) {
      this.contar(daRua);
      if (daRua.pedido === 'cumprido' && e.pedido) this.recompensaDoPedido(e.pedido);
    }
    // A recompensa extra da rota (as de dentro da rua já valeram).
    const rec = e.rotaAtual?.recompensa;
    if (rec === 'reroll') e.rerolls++;
    else if (rec === 'casa_extra') e.pendentes.casasExtras++;
    else if (rec === 'item_comum') {
      const item = this.sortearItem();
      if (item) this.ganhar({ tipo: 'item', id: item });
    }
    e.proximaRota = e.rotas[daRua?.portaoEscolhido ?? 0] ?? e.rotas[0] ?? null;
    e.rotas = [];
    e.ruasVencidas++;
    e.ruaNoBairro++;
    if (e.ruaNoBairro >= this.conteudo.run.ruasPorBairro) {
      e.fase = 'chefe';
      return;
    }
    e.fase = 'portaAPorta';
    e.porta = this.sortearPorta();
  }

  /** O chefe do bairro caiu: próximo bairro, ou vitória no último. */
  venceuChefe(daRua?: DaRua): void {
    const e = this.estado;
    if (daRua) this.contar(daRua);
    // A Moradora do 13 não é chefe de bairro: vencê-la encerra a run com vitória.
    if (e.fase === 'moradora') {
      e.moradora = 'venceu';
      e.fase = 'vitoria';
      return;
    }
    e.chefesVencidos++;
    e.rarasNoBairro = 0;
    e.rarosNoBairro = 0;
    // O Remontar do Esqueleto volta a valer no bairro novo.
    if (this.ficha.combate.remontar) this.ficha.combate.remontar.usado = false;
    e.proximaRota = null;
    e.bairro++;
    e.ruaNoBairro = 0;
    e.porta = null;
    e.fase = e.bairro >= this.totalDeBairros ? 'vitoria' : 'rua';
    // Lua Cheia 5: quem termina o último bairro sem nenhum trato encontra A Moradora do 13.
    if (e.fase === 'vitoria' && this.moradoraEspera()) {
      e.fase = 'moradora';
      e.moradora = 'duelo';
    }
  }

  /** A Moradora do 13 aparece: Lua Cheia com ela liberada e zero tratos na run (GDD). */
  moradoraEspera(): boolean {
    return this.daLua('moradora').length > 0 && this.estado.tratos.length === 0;
  }

  /** Soma o que um mapa rendeu. */
  private contar(daRua: DaRua): void {
    const e = this.estado;
    e.derrotados += daRua.derrotados;
    e.docesGanhos += daRua.docesNaRua;
    e.danoCausado += daRua.danoCausado ?? 0;
    for (const id of daRua.especiesVistas ?? []) this.ver('inimigos', id);
  }

  /** A Coragem acabou: conta o que a rua rendeu e guarda onde e o quanto faltou. */
  perdeu(daRua?: DaRua, fim?: { onde: string; faltou: string | null }): void {
    const e = this.estado;
    if (daRua) this.contar(daRua);
    // Perder o duelo secreto não tira a vitória: o Dono do Bairro já caiu.
    if (e.fase === 'moradora') {
      e.moradora = 'perdeu';
      e.fase = 'vitoria';
      return;
    }
    e.fim = fim ?? null;
    e.fase = 'derrota';
  }

  /** Fotografia da run para a tela do fim: build, números e os Doces Guardados. */
  resumo(): ResumoDaRun {
    const e = this.estado;
    const c = this.conteudo;
    const venceu = e.fase === 'vitoria';
    const ficha = this.ficha;
    const evolucoes = TECLAS.flatMap((t) => {
      const s = ficha.lancador.slots[t]!;
      if (!s.evolucao) return [];
      const evo = Object.values(c.evolucoes ?? {})
        .flat()
        .find((x) => x.id === s.evolucao);
      return [{ tecla: t, habilidade: s.def.nome, id: s.evolucao, nome: evo?.nome ?? s.evolucao }];
    });
    const album = c.run.album;
    const guardados =
      (e.docesGanhos * album.fracaoDoces + album.porChefe * e.chefesVencidos) *
      (1 + album.porLua * this.lua);
    return {
      venceu,
      campeao: ficha.campeao.nome,
      campeaoId: ficha.campeaoId,
      onde: e.fim?.onde ?? this.nomeDoBairro,
      faltou: venceu ? null : (e.fim?.faltou ?? null),
      nivel: ficha.progresso.nivel,
      evolucoes,
      tratos: e.tratos.map((id) => {
        const d = this.defTrato(id);
        return { nome: d.nome, marcas: d.marcas.map((m) => c.tratos.conjuntos[m].nome) };
      }),
      conjuntos: this.conjuntos()
        .filter((k) => k.nivel > 0)
        .map((k) => ({ nome: k.nome, tratos: k.tratos, nivel: k.nivel })),
      precos: e.precos.map((p) => c.precos.precos[p.id]?.nome ?? p.id),
      itens: e.itens.map((id) => c.itens.itens[id]?.nome ?? id),
      medalhas: e.medalhas,
      ruasVencidas: e.ruasVencidas,
      chefesVencidos: e.chefesVencidos,
      derrotados: e.derrotados,
      docesGanhos: e.docesGanhos,
      relogio: this.relogio(),
      tempoS: e.tempoS,
      tratoIds: [...e.tratos],
      recusados: [...e.recusados],
      vistos: this.vistosComEvolucoes(),
      xpTotal: xpAteNivel(ficha.progresso.nivel, c.combate.niveis) + ficha.progresso.xp,
      ofendido: e.ofendido?.situacao ?? null,
      danoCausado: Math.round(e.danoCausado),
      lua: this.lua,
      moradora: e.moradora,
      docesGuardados: Math.floor(guardados) + (e.moradora === 'venceu' ? album.moradora : 0),
    };
  }

  /**
   * Sai da fase Porta a Porta. Sem nenhum trato aceito, o jogador ganha os doces de "bom vizinho"
   * e uma Medalha de Bom Vizinho (GAMEPLAY.md, "Duas rotas de run").
   */
  sairDaPorta(): { recusou: boolean } {
    const e = this.estado;
    const comeco = e.porta?.comeco ?? false;
    const recusou = !comeco && (e.porta?.aceitos ?? 0) === 0;
    // Moradores que lembram: quem ofereceu e ficou sem resposta conta uma recusa.
    if (!comeco)
      for (const o of e.porta?.ofertas ?? [])
        if (!o.aceito && o.trato in this.conteudo.tratos.tratos) e.recusados.push(o.trato);
    if (recusou) {
      const med = this.conteudo.tratos.medalha;
      this.bolso.doces += med.docesRecusa;
      e.medalhas++;
    }
    e.porta = null;
    e.fase = 'rua';
    this.aplicarNaFicha();
    return { recusou };
  }

  /** O Diário da run, com as evoluções vistas: a escolhida e a outra do par. */
  private vistosComEvolucoes(): Record<PaginaDoDiario, string[]> {
    const pares = Object.values(this.conteudo.evolucoes ?? {}) as { id: string }[][];
    for (const t of TECLAS) {
      const id = this.ficha.lancador.slots[t]?.evolucao;
      const par = id ? pares.find((p) => p.some((x) => x.id === id)) : undefined;
      for (const x of par ?? []) this.ver('evolucoes', x.id);
    }
    const copia = diarioVazio();
    for (const p of PAGINAS_DO_DIARIO) copia[p] = [...this.estado.vistos[p]];
    return copia;
  }

  // ------------------------------------------------------------------ porta a porta

  private embaralhar<T>(lista: T[]): T[] {
    for (let i = lista.length - 1; i > 0; i--) {
      const k = this.rng.inteiro(0, i);
      [lista[i], lista[k]] = [lista[k]!, lista[i]!];
    }
    return lista;
  }

  /** Sorteia `n` preços entre os possíveis do trato, evitando os já pagos e os de `fora`. */
  private sortearPrecos(def: DefTrato, n: number, fora: readonly string[] = []): string[] {
    const pagos = new Set(this.estado.precos.map((p) => p.id));
    const todos = def.precos.filter((p) => !fora.includes(p));
    const novos = todos.filter((p) => !pagos.has(p));
    const fonte = novos.length >= n ? novos : todos.length >= n ? todos : def.precos;
    return this.embaralhar([...fonte]).slice(0, n);
  }

  /** Os `n` preços mais leves do trato (pedido Frenesi duplo). */
  private precosMaisLeves(def: DefTrato, n: number): string[] {
    const pesos = this.conteudo.precos.pesos;
    return [...def.precos]
      .sort((a, b) => pesos[this.defPreco(a).peso] - pesos[this.defPreco(b).peso])
      .slice(0, n);
  }

  /** As casas acesas, os tratos oferecidos com o preço, o banco e a loja desta fase. */
  sortearPorta(): EstadoPorta {
    const c = this.conteudo;
    const primeira = (this.opcoes.primeiraRun ?? false) && !this.primeiraPortaSorteada;
    this.primeiraPortaSorteada = true;
    const normal = Math.max(
      1,
      c.gerador.portaAPorta.casas -
        this.de('casasAMenos').reduce((s, e) => s + e.n, 0) +
        this.estado.pendentes.casasExtras,
    );
    const acesas = primeira ? Math.min(normal, c.run.primeiraRun.tratos) : normal;
    this.estado.pendentes.casasExtras = 0;
    const precoLeve = this.estado.pendentes.precoLeve || primeira;
    this.estado.pendentes.precoLeve = false;
    const nPrecos = this.estado.doisPrecosNoProximo ? 2 : 1;
    const ofertas: OfertaDeTrato[] = [];
    const med = c.tratos.medalha;
    // Com 4 Medalhas, uma porta oferece a Chave da Cidade (sem preço).
    if (this.estado.medalhas >= med.paraChave && !this.estado.tratos.includes('chave_da_cidade')) {
      ofertas.push({
        casa: 0,
        trato: 'chave_da_cidade',
        precos: [],
        pechinchou: true,
        aceito: false,
      });
    }
    const disponiveis = this.embaralhar(
      this.tratosLiberados().filter((id) => !this.estado.tratos.includes(id)),
    );
    for (const id of disponiveis) {
      if (ofertas.length >= acesas) break;
      ofertas.push({
        casa: ofertas.length,
        trato: id,
        precos: precoLeve
          ? this.precosMaisLeves(this.defTrato(id), nPrecos)
          : this.sortearPrecos(this.defTrato(id), nPrecos),
        pechinchou: false,
        aceito: false,
      });
    }
    // Janela Vermelha (GAMEPLAY.md, "Encontros raros"): numa fração das fases.
    if (!primeira && this.rng.proximo() < c.run.encontros.janelaVermelha.chance)
      this.acenderJanelaVermelha(ofertas);
    for (const o of ofertas) {
      this.ver('tratos', o.trato);
      for (const id of o.precos) this.ver('precos', id);
    }
    const loja = this.embaralhar(
      Object.entries(c.itens.itens)
        .filter(
          ([id, d]) =>
            d.tipo === 'item' && this.itemLiberado(id, d) && !this.estado.itens.includes(id),
        )
        .map(([id]) => id),
    ).slice(0, c.run.loja.itensOferecidos);
    return {
      ofertas,
      aceitos: 0,
      limite: c.tratos.tratosPorFase + this.estado.tratosGratis,
      banco: this.de('semBanco').length === 0,
      curouNoBanco: false,
      loja,
      ...(primeira ? { primeira: true } : {}),
    };
  }

  /**
   * Janela Vermelha: a última casa com trato comum passa a oferecer um trato lendário que a run
   * ainda não tem, com 2 preços. Devolve a casa (ou -1 se não deu). Os testes também chamam.
   */
  acenderJanelaVermelha(ofertas = this.estado.porta?.ofertas ?? []): number {
    const c = this.conteudo;
    const lendarios = Object.keys(c.tratos.lendarios).filter(
      (id) => !this.estado.tratos.includes(id),
    );
    const comum = ofertas.map((o) => o.trato in c.tratos.tratos).lastIndexOf(true);
    if (comum < 0 || lendarios.length === 0) return -1;
    const id = lendarios[this.rng.inteiro(0, lendarios.length - 1)]!;
    const casa = ofertas[comum]!.casa;
    ofertas[comum] = {
      casa,
      trato: id,
      precos: this.sortearPrecos(this.defTrato(id), c.run.encontros.janelaVermelha.precos),
      pechinchou: false,
      aceito: false,
      vermelha: true,
    };
    this.estado.janelasVermelhas++;
    this.ver('encontros', 'janela_vermelha');
    this.ver('tratos', id);
    return casa;
  }

  oferta(casa: number): OfertaDeTrato | undefined {
    return this.estado.porta?.ofertas.find((o) => o.casa === casa);
  }

  /** Quantos tratos faltam, por marca, para o próximo Conjunto se este trato for aceito. */
  conjuntosCom(trato: string): ConjuntoAtivo[] {
    return this.conjuntos([...this.estado.tratos, trato]);
  }

  /** Aceita o trato de uma casa: o poder entra na hora e o preço passa a valer. */
  aceitar(casa: number): boolean {
    const p = this.estado.porta;
    const o = this.oferta(casa);
    if (!p || !o || o.aceito || p.aceitos >= p.limite) return false;
    const e = this.estado;
    // Gato Preto: o trato além do normal sai sem preço.
    const gratis = p.aceitos >= this.conteudo.tratos.tratosPorFase && e.tratosGratis > 0;
    if (gratis) {
      e.tratosGratis--;
      o.precos = [];
    }
    o.aceito = true;
    p.aceitos++;
    this.pagarTrato(o.trato, o.precos);
    return true;
  }

  /** Um trato aceito (na porta ou no baú amaldiçoado): o poder entra e os preços passam a valer. */
  private pagarTrato(trato: string, precos: readonly string[]): void {
    const e = this.estado;
    e.tratos.push(trato);
    this.ver('tratos', trato);
    for (const id of precos) this.ver('precos', id);
    for (const id of precos) {
      e.precos.push({ id, trato });
      if (this.defPreco(id).efeitos.some((ef) => ef.tipo === 'ruaSemLuz')) e.ruasSemLuz++;
    }
    e.doisPrecosNoProximo = false;
    for (const ef of this.defTrato(trato).efeitos) {
      if (ef.tipo === 'proximoComDoisPrecos') e.doisPrecosNoProximo = true;
      if (ef.tipo === 'relogioParado') e.relogioParadoFalta += ef.minutos * 60;
      if (ef.tipo === 'apagaPrecoMaisAntigo' && !e.reciboUsado && e.precos.length > 0) {
        e.reciboUsado = true;
        const apagado = e.precos.shift()!;
        if (
          this.defPreco(apagado.id).efeitos.some((x) => x.tipo === 'ruaSemLuz') &&
          e.ruasSemLuz > 0
        )
          e.ruasSemLuz--;
      }
    }
    this.aplicarNaFicha();
  }

  /** Pechinchar: paga doces para sortear outro preço para o mesmo poder, uma vez por casa. */
  /** O morador lembra de você: devolve o cumprimento (null: não lembra). */
  lembra(trato: string): string | null {
    const l = this.opcoes.lembrados;
    if (!l || !l.tratos.includes(trato) || l.falas.length === 0) return null;
    return l.falas[trato.length % l.falas.length]!;
  }

  /** Quanto custa pechinchar nesta casa (mais barato com quem lembra de você). */
  custoDaPechincha(casa: number): number {
    const o = this.oferta(casa);
    const base = this.conteudo.tratos.pechincha;
    const l = this.opcoes.lembrados;
    return o && l && this.lembra(o.trato) ? Math.round(base * l.fracaoPechincha) : base;
  }

  pechinchar(casa: number): boolean {
    const o = this.oferta(casa);
    // Um reroll guardado paga a pechincha.
    const custo = this.estado.rerolls > 0 ? 0 : this.custoDaPechincha(casa);
    if (!o || o.aceito || o.pechinchou || this.bolso.doces < custo) return false;
    const novos = this.sortearPrecos(this.defTrato(o.trato), o.precos.length, o.precos);
    if (this.estado.rerolls > 0) this.estado.rerolls--;
    else this.bolso.doces -= custo;
    o.precos = novos;
    o.pechinchou = true;
    for (const id of novos) this.ver('precos', id);
    return true;
  }

  /** Preço de um item no banco, com o Cofre de Porquinho. */
  precoNoBanco(id: string): number {
    const mult = [...this.de('precoDoBanco'), ...this.daLua('precoDoBanco')].reduce(
      (m, e) => m * (1 + e.mult),
      1,
    );
    return Math.round(this.defItem(id).preco * mult);
  }

  /** Por que não dá para comprar (ou null se dá). */
  motivoParaNaoComprar(id: string): string | null {
    const p = this.estado.porta;
    const c = this.conteudo.itens;
    const d = this.defItem(id);
    if (!p?.banco) return 'Sem banco';
    if (this.bolso.doces < this.precoNoBanco(id)) return 'Faltam doces';
    if (d.tipo === 'item') {
      if (this.estado.itens.includes(id)) return 'Já tem';
      if (this.estado.itens.length >= c.maxItens) return 'Bolso cheio';
      if (!p.loja.includes(id)) return 'Fora da loja';
    } else {
      const espaco = this.bolso.consumiveis.find((e) => e.id === id);
      if (espaco && espaco.qtd >= c.pilhaMaxima) return 'Pilha cheia';
      if (!espaco && this.bolso.consumiveis.length >= c.maxConsumiveis) return 'Sem espaço';
    }
    return null;
  }

  /** Compra no banco um item comum ou um consumível. */
  comprar(id: string): boolean {
    if (this.motivoParaNaoComprar(id) !== null) return false;
    const d = this.defItem(id);
    this.bolso.doces -= this.precoNoBanco(id);
    if (d.tipo === 'item') {
      this.estado.itens.push(id);
    } else {
      const espaco = this.bolso.consumiveis.find((e) => e.id === id);
      if (espaco) espaco.qtd++;
      else this.bolso.consumiveis.push({ id, qtd: 1 });
    }
    // Bala de Coco: comprar no banco cura.
    for (const ef of this.de('curaAoComprar')) this.curarFicha(ef.fracao);
    this.aplicarNaFicha();
    return true;
  }

  /** Sentar no banco cura 30% da Coragem, uma vez por fase. */
  sentarNoBanco(): boolean {
    const p = this.estado.porta;
    if (!p?.banco || p.curouNoBanco) return false;
    p.curouNoBanco = true;
    this.curarFicha(this.conteudo.itens.curaDoBanco);
    return true;
  }

  private curarFicha(fracao: number): void {
    const c = this.ficha.combate;
    if (c.coragem <= 0) return;
    c.coragem = Math.min(c.attr.coragemMax, c.coragem + c.attr.coragemMax * fracao * c.attr.cura);
  }
}
