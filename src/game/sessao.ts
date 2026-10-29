import type { LuzNoMundo } from '../render/luz';
import {
  album,
  campeoes,
  combate,
  conteudo,
  itens,
  noite,
  ruas,
  simulacao,
  susto,
} from '../sim/content';
import type { Rua } from '../sim/content/esquemas';
import { TECLAS } from '../sim/content/esquemas';
import { definirPosto } from '../sim/habilidades';
import type { MapaDeLuz } from '../sim/luz';
import { darXp, simularRua, type Partida } from '../sim/partida';
import type { PortaDeLuta } from '../sim/portaAPorta';
import type { RegrasDaRua } from '../sim/regrasDaRua';
import {
  matizDaFantasia,
  desafioDaSemana,
  maestria,
  objetivoDoDiario,
  opcoesDaRun,
  proximoDoAlbum,
  registrarFim,
  sementeDaSemana,
  sementeDoDia,
  verDica,
  type Maestria,
  type ModoDaRun,
  type Novidades,
} from '../sim/progresso';
import { Run, type ConteudoRun, type OpcoesDaRun, type ResumoDaRun } from '../sim/run';
import { faixaDoSusto } from '../sim/susto';
import type { TratosNaRua } from '../sim/tratos';
import type { PainelHUD } from './interface/painel';
import { CONTEUDO_DO_PROGRESSO, hoje, PAGINAS, progresso, salvar, semanaDeHoje } from './save';

/** O mapa que a cena desenha e joga agora. */
export interface Mapa {
  partida: Partida;
  rua: Rua;
  /** Regras de rua de luta (ondas, Postes, portão); ausente na rua de treino e na porta. */
  regras?: RegrasDaRua;
  /** Tratos que agem na luta. */
  tratos?: TratosNaRua;
  /** A fase Porta a Porta (casas, banco, saída). */
  porta?: PortaDeLuta;
  luz?: MapaDeLuz;
  titulo: string;
}

export interface Sessao {
  readonly modo: string;
  mapa: Mapa;
  /** A run inteira (ausente na rua de treino). */
  readonly run?: Run;
  /** Extras da interface (Susto, doces, régua, consumíveis). */
  painel(): Partial<PainelHUD>;
  /** O mapa acabou (vitória ou derrota): prepara o próximo. Devolve se a cena reinicia. */
  aoTerminar?(venceu: boolean): boolean;
  /** A run acabou: o que a tela do fim mostra (até `recomecar`). */
  readonly resumo?: ResumoDaRun | null;
  /** O que o fim da run liberou no Álbum (só nas runs que contam para o progresso). */
  readonly novidades?: Novidades | null;
  /** Barras e objetivo da tela do fim (só nas runs que contam para o progresso). */
  readonly rumo?: RumoDoFim | null;
  /** Outra run, com o mesmo campeão. */
  recomecar?(): void;
  /** Primeira run: true uma vez só, no mapa da rua 1-1 (as dicas da rua aparecem nele). */
  pegarDicasDaRua?(): boolean;
  /** A dica de uma linha `id` (Susto, evolução) aparece agora? Uma vez por save, e marca no save. */
  dicaDeUmaVez?(id: string): boolean;
}

function dentroDaArea(
  p: { x: number; y: number },
  r: { x0: number; y0: number; x1: number; y1: number },
): boolean {
  return p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
}

/** Converte as luzes da simulação para a tela. */
export function luzesParaTela(l: MapaDeLuz): LuzNoMundo[] {
  return l.acesas().map((f) => ({
    tipo: f.tipo === 'poste' || f.tipo === 'janela' ? f.tipo : 'pulso',
    x: f.x,
    y: f.y,
    raio: f.raio,
    recortaEscuridao: true,
    ...(f.feixe ? { feixe: f.feixe } : {}),
  }));
}

/** Rua de treino: a rua montada à mão, com bonecos, tudo no posto 1. */
export class SessaoDeTreino implements Sessao {
  readonly modo = 'treino';
  mapa: Mapa;

  constructor(params: URLSearchParams) {
    const rua = ruas.find((r) => r.id === (params.get('rua') ?? 'rua_teste')) ?? ruas[0]!;
    const semente = Number(params.get('semente') ?? simulacao.sementePadrao);
    const campeao = params.get('campeao') ?? 'bruxinha';
    const partida = simularRua(rua, conteudo, semente, campeao in campeoes ? campeao : 'bruxinha');
    const { ficha } = partida;
    for (const t of TECLAS) definirPosto(ficha.lancador, t, 1);
    ficha.progresso.pontos = 0;
    const nivel = Number(params.get('nivel') ?? 1);
    if (nivel > 1) {
      let xp = 0;
      for (let n = 1; n < nivel; n++)
        xp += combate.niveis.xpBase + combate.niveis.xpPorNivel * (n - 1);
      darXp(partida.mundo, partida.jogador, ficha, xp, combate);
    }
    this.mapa = { partida, rua, titulo: rua.nome };
  }

  painel(): Partial<PainelHUD> {
    return {};
  }
}

/**
 * A run (GDD, "Estrutura da run"): ruas de luta e fases Porta a Porta em sequência, com a ficha,
 * os doces, os tratos e o Susto passando de um mapa para o outro, e o chefe depois da 3ª rua de
 * cada bairro. Na derrota ou na vitória, a sessão guarda o resumo para a tela do fim, e `recomecar`
 * começa outra run.
 */
/** O que a tela do fim mostra para a próxima run (GAMEPLAY.md, "Tela de derrota"). */
export interface RumoDoFim {
  /** O desbloqueio mais barato que falta no Álbum e quantos Doces Guardados já tem. */
  album: { nome: string; preco: number; tem: number } | null;
  maestria: Maestria;
  /** Objetivo tirado do Diário ("Você nunca fechou o Conjunto Eco"). */
  objetivo: string | null;
}

/** Como a run começa: do título (conta para o progresso) ou da URL de depuração (não conta). */
export interface ConfigDaSessao {
  /** 'noite': a semente da noite de hoje, igual para todos. */
  modo?: ModoDaRun;
  /** Grava o fim da run no save (Doces Guardados, marcos, Lua e placar). */
  registrar?: boolean;
  /** Opções fixas (depuração): sem elas, vêm do save. */
  opcoes?: OpcoesDaRun;
  /** Depuração e testes: começa no duelo com A Moradora do 13. */
  comecarNaMoradora?: boolean;
}

/** Começa uma run pela tela de título: o save decide as opções; a noite usa a semente do dia. */
export function sessaoDoTitulo(
  campeao: string,
  modo: ModoDaRun,
  sementeDoRelogio: number,
): SessaoDaRun {
  const semente =
    modo === 'noite'
      ? sementeDoDia(hoje())
      : modo === 'desafio'
        ? sementeDaSemana(semanaDeHoje())
        : sementeDoRelogio;
  return new SessaoDaRun(semente, 0, campeao, 0, false, false, { modo, registrar: true });
}

export class SessaoDaRun implements Sessao {
  readonly modo = 'run';
  mapa!: Mapa;
  run: Run;
  resumo: ResumoDaRun | null = null;
  novidades: Novidades | null = null;
  rumo: RumoDoFim | null = null;
  private runs = 0;
  /** As dicas da rua 1-1 já apareceram nesta sessão. */
  private dicasDaRuaUsadas = false;
  /** A data da semente da noite (a do começo vale até o fim, mesmo depois da meia-noite). */
  readonly data = hoje();
  /** A semana do desafio (a do começo vale até o fim). */
  readonly semana = semanaDeHoje();
  readonly modoDaRun: ModoDaRun;
  private readonly registrar: boolean;

  constructor(
    private readonly semente: number,
    private readonly bairroInicial = 0,
    private readonly campeao = 'bruxinha',
    private readonly ruaInicial = 0,
    /** Depuração e testes: começa na fase Porta a Porta, como se a 1ª rua já tivesse sido vencida. */
    comecarNaPorta = false,
    /** Depuração e testes: começa direto na praça do chefe do bairro. */
    comecarNoChefe = false,
    private readonly config: ConfigDaSessao = {},
  ) {
    this.modoDaRun = config.modo ?? 'run';
    this.registrar = config.registrar ?? false;
    this.run = this.novaRun();
    if (config.comecarNaMoradora) {
      this.run.estado.bairro = this.run.totalDeBairros;
      this.run.estado.fase = 'moradora';
      this.run.estado.moradora = 'duelo';
    }
    if (comecarNoChefe) {
      this.run.estado.ruaNoBairro = this.run.conteudo.run.ruasPorBairro;
      this.run.estado.fase = 'chefe';
    }
    if (comecarNaPorta) {
      this.run.novaRua();
      this.run.venceuRua();
    }
    this.montar();
  }

  private novaRun(): Run {
    // A semente da noite é sempre a mesma; as outras runs da sessão mudam a semente.
    const fixa = this.modoDaRun === 'noite' || this.modoDaRun === 'desafio';
    const semente = fixa ? this.semente : this.semente + this.runs * 1009;
    this.runs++;
    const opcoes =
      this.config.opcoes ??
      (this.registrar
        ? opcoesDaRun(
            progresso(),
            CONTEUDO_DO_PROGRESSO,
            this.modoDaRun,
            this.campeao,
            desafioDaSemana(this.semana, CONTEUDO_DO_PROGRESSO.entreRuns),
          )
        : {});
    // Noite curta: só o primeiro bairro, na noite comum (sem Lua Cheia).
    if (this.modoDaRun === 'curta') {
      opcoes.bairros = conteudo.run.noiteCurta.bairros;
      opcoes.lua = 0;
    }
    const run = new Run(conteudo as ConteudoRun, semente, this.campeao, opcoes);
    // Depuração: `?bairro=` e `?posicao=b-r` começam no meio (só na primeira run da sessão).
    if (this.runs === 1) {
      run.estado.bairro = Math.max(0, Math.min(run.totalDeBairros - 1, this.bairroInicial));
      run.estado.ruaNoBairro = Math.max(0, Math.min(2, this.ruaInicial));
    }
    return run;
  }

  private montar(): void {
    const run = this.run;
    if (run.estado.fase === 'portaAPorta') {
      const p = run.novaPorta();
      this.mapa = {
        partida: p,
        rua: p.gerada.rua,
        luz: p.luz,
        porta: p,
        titulo: run.estado.porta?.comeco ? 'Começo: escolha um trato sem preço' : 'Porta a Porta',
      };
      this.pintar();
      return;
    }
    const chefe = run.estado.fase === 'chefe' || run.estado.fase === 'moradora';
    const r = chefe ? run.novaArena() : run.novaRua();
    this.mapa = {
      partida: r,
      rua: r.gerada.rua,
      regras: r.regras,
      tratos: r.tratos,
      luz: r.luz,
      titulo:
        run.estado.fase === 'moradora'
          ? `Segredo: ${r.gerada.rua.nome}`
          : chefe
            ? `Chefe: ${r.gerada.rua.nome}`
            : r.gerada.rua.nome,
    };
    this.pintar();
  }

  pegarDicasDaRua(): boolean {
    const regras = this.mapa.regras;
    if (this.dicasDaRuaUsadas || !this.run.opcoes.primeiraRun || !regras || regras.estado.chefe)
      return false;
    this.dicasDaRuaUsadas = true;
    return true;
  }

  dicaDeUmaVez(id: string): boolean {
    if (!this.registrar || !verDica(progresso(), id)) return false;
    salvar();
    return true;
  }

  /** A cor escolhida no Álbum vai no desenho do jogador. */
  private pintar(): void {
    if (!this.registrar) return;
    const matiz = matizDaFantasia(progresso(), album, this.campeao);
    const j = this.mapa.partida.jogador;
    if (matiz !== 0) j.marcas = { ...j.marcas, matiz };
  }

  /** A run acabou: guarda o resumo e, se a run conta, grava o progresso. */
  private terminou(): void {
    this.resumo = this.run.resumo();
    if (!this.registrar) return;
    this.novidades = registrarFim(
      progresso(),
      this.resumo,
      CONTEUDO_DO_PROGRESSO,
      this.modoDaRun,
      this.modoDaRun === 'desafio' ? `S${this.semana}` : this.data,
    );
    salvar();
    const prog = progresso();
    const c = CONTEUDO_DO_PROGRESSO;
    const proximo = proximoDoAlbum(prog, c.album, { campeoes, itens, tratos: c.tratos });
    this.rumo = {
      album: proximo ? { ...proximo, tem: prog.docesGuardados } : null,
      maestria: maestria(prog, this.campeao, c.entreRuns),
      objetivo: objetivoDoDiario(prog, PAGINAS),
    };
  }

  painel(): Partial<PainelHUD> {
    const run = this.run;
    const bolso = run.bolso;
    const s = bolso.susto;
    const j = this.mapa.partida.jogador;
    const regras = this.mapa.regras;
    const espacos = Array.from({ length: itens.maxConsumiveis }, (_, i) => bolso.consumiveis[i]);
    return {
      susto: { valor: s.valor, faixa: faixaDoSusto(s, susto).nome, frenesi: s.frenesi },
      doces: bolso.doces,
      relogio: `${run.relogio()}${run.passouDaMeiaNoite() ? ' · meia-noite!' : ''}`,
      itens: Array.from({ length: itens.maxItens }, (_, i) => {
        const id = run.estado.itens[i];
        return id ? { id, nome: itens.itens[id]?.nome ?? id } : null;
      }),
      consumiveis: espacos.map((e, i) => ({
        id: e?.id ?? null,
        nome: e ? (itens.itens[e.id]?.nome ?? e.id) : '—',
        qtd: e?.qtd ?? 0,
        tecla: String(i + 1),
      })),
      tratos: run
        .conjuntos()
        .filter((c) => c.tratos > 0)
        .map((c) => ({
          marca: c.nome,
          nomes: run.estado.tratos
            .filter((id) => run.defTrato(id).marcas.includes(c.marca))
            .map((id) => run.defTrato(id).nome),
          proximo: c.nivel >= 4 ? 'completo' : `${c.tratos}/${c.nivel >= 2 ? 4 : 2}`,
        })),
      pedido:
        regras && run.estado.pedido && !regras.estado.chefe
          ? {
              texto: noite.pedidos[run.estado.pedido]?.texto ?? run.estado.pedido,
              situacao: regras.estado.pedido,
            }
          : null,
      condicao:
        regras && !regras.estado.chefe && run.estado.rotaAtual
          ? (noite.condicoes[run.estado.rotaAtual.condicao]?.nome ?? null)
          : null,
      elites: regras ? regras.elitesVivas() : [],
      rua: this.mapa.titulo,
      lugar: regras?.gerada.zonas.find((z) => dentroDaArea(j.pos, z.area))?.nome ?? null,
      exploracao: regras?.exploracao
        ? {
            fracao: regras.exploracao.fracao(),
            segredos: regras.exploracao.estado.achados,
            segredosTotal: regras.exploracao.estado.segredos.length,
            campainhas: regras.exploracao.estado.tocadas,
            campainhasTotal: regras.exploracao.estado.campainhas.length,
          }
        : null,
      ondas: regras?.ondasNaTela() ?? null,
      chefe: regras?.chefeNaTela() ?? null,
      regua:
        regras && !regras.estado.chefe
          ? {
              jogador: regras.progressoDe(j.pos),
              postes: regras.estado.postes.map((p) => ({
                pos: regras.progressoDe(p.pos),
                caido: !p.combate || p.combate.coragem <= 0,
              })),
              portao: { pos: 1, aberto: regras.estado.portaoAberto },
            }
          : null,
    };
  }

  aoTerminar(venceu: boolean): boolean {
    const run = this.run;
    const regras = this.mapa.regras;
    if (this.mapa.porta) {
      run.sairDaPorta();
    } else if (venceu) {
      if (run.estado.fase === 'chefe' || run.estado.fase === 'moradora')
        run.venceuChefe(regras?.estado);
      else run.venceuRua(regras?.estado);
      if (run.estado.fase === 'vitoria') {
        this.terminou();
        return false;
      }
    } else {
      run.perdeu(regras?.estado, {
        onde: this.mapa.rua.nome.includes(run.nomeDoBairro)
          ? this.mapa.rua.nome
          : `${run.nomeDoBairro} · ${this.mapa.rua.nome}`,
        faltou: regras?.oQueFaltou() ?? null,
      });
      this.terminou();
      return false;
    }
    this.montar();
    return true;
  }

  recomecar(): void {
    this.resumo = null;
    this.novidades = null;
    this.rumo = null;
    this.run = this.novaRun();
    this.montar();
  }
}
