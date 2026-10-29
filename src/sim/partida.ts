import {
  criarSistemaAutoAtaque,
  estadoAtaque,
  prioridadePorEspecie,
  type EstadoAtaque,
} from './autoataque';
import {
  aplicarEstado,
  combatenteBoneco,
  combatenteDoCampeao,
  criarSistemaCombate,
  recalcular,
  type Combatente,
} from './combate';
import type {
  Campeao,
  Campeoes,
  Combate,
  ConfigExploracao,
  Evolucoes,
  ConfigRun,
  ConfigSusto,
  Gerador,
  Habilidade,
  Inimigos,
  Itens,
  Jogador,
  Luz,
  Modelos,
  Noite,
  Ondas,
  Precos,
  Rua,
  Simulacao,
  Tratos,
} from './content/esquemas';
import type { Evento } from './eventos';
import { criarLancador, Executor, type Lancador } from './habilidades';
import { adicionarEntidade, criarMundo, type Entidade, type Mundo, type Sistema } from './mundo';
import {
  aplicarBonusDeNivel,
  ganharXp,
  novoProgresso,
  subirPosto,
  type Progresso,
} from './progressao';
import type { Retangulo } from './geometria';
import { criarSistemaPassivas } from './passivas';
import { criarSistemaRolamento } from './rolamento';
import { obstaculosDaRua } from './rua';

export interface Conteudo {
  modelos: Modelos;
  simulacao: Simulacao;
  jogador: Jogador;
  campeoes: Campeoes;
  habilidades: readonly Habilidade[];
  combate: Combate;
  /** Prioridade de alvo do "atacar e mover", por espécie. */
  prioridadeAlvo?: Readonly<Record<string, number>>;
  inimigos?: Inimigos;
  ondas?: Ondas;
  susto?: ConfigSusto;
  gerador?: Gerador;
  luz?: Luz;
  tratos?: Tratos;
  precos?: Precos;
  itens?: Itens;
  run?: ConfigRun;
  noite?: Noite;
  exploracao?: ConfigExploracao;
  evolucoes?: Evolucoes;
}

/**
 * O que o jogador carrega de um mapa para o outro durante a run: atributos, Coragem, habilidades e
 * postos, auto-ataque e níveis. Cada mapa novo cria uma entidade nova que usa os mesmos objetos.
 */
export interface Ficha {
  campeaoId: string;
  campeao: Campeao;
  combate: Combatente;
  lancador: Lancador;
  ataque: EstadoAtaque;
  progresso: Progresso;
  /**
   * O R pode ganhar um Despertar no posto 3. A maestria (G9) vai liberar só depois do primeiro
   * nível 12 com o campeão; até lá, valem desde a primeira run.
   */
  despertares: boolean;
}

export function criarFicha(campeaoId: string, conteudo: Conteudo): Ficha {
  const campeao = conteudo.campeoes[campeaoId];
  if (!campeao) throw new Error(`campeão ${campeaoId} não existe em content/campeoes.json`);
  const porId = new Map(conteudo.habilidades.map((h) => [h.id, h]));
  const progresso = novoProgresso(campeao.atributoPrincipal);
  const combate = combatenteDoCampeao(campeao, conteudo.combate);
  aplicarBonusDeNivel(combate, progresso, conteudo.combate.niveis);
  recalcular(combate);
  return {
    campeaoId,
    campeao,
    combate,
    lancador: criarLancador(campeao, porId),
    ataque: estadoAtaque(campeao.autoAtaque, true),
    progresso,
    despertares: true,
  };
}

/** Sobe o posto de uma habilidade com um ponto de nível (Ctrl + tecla, ou o + na interface). */
export function gastarPonto(ficha: Ficha, chave: string, cfg: Combate): boolean {
  return subirPosto(ficha.lancador, ficha.progresso, chave, cfg.niveis) !== null;
}

export interface Partida {
  mundo: Mundo;
  jogador: Entidade;
  ficha: Ficha;
  executor: Executor;
  bonecos: Entidade[];
}

export interface OpcoesPartida {
  /** Sistemas que rodam antes das habilidades (IA dos inimigos). */
  antes?: Sistema[];
  /** Sistemas a mais (regras da rua), depois do auto-ataque. */
  sistemas?: Sistema[];
  /** Obstáculos a mais (invisíveis), além dos objetos da rua. */
  obstaculos?: Retangulo[];
}

/**
 * Monta o mundo de um mapa: obstáculos, sistemas na ordem (combate, habilidades, auto-ataque,
 * extras, XP), o jogador na entrada com a ficha da run e os bonecos de treino.
 */
export function montarPartida(
  rua: Rua,
  ficha: Ficha,
  conteudo: Conteudo,
  semente: number,
  opcoes: OpcoesPartida = {},
  executorPronto?: Executor,
): Partida {
  const cfg = conteudo.combate;
  const executor = executorPronto ?? novoExecutor(cfg);
  const autoAtaque = criarSistemaAutoAtaque(executor, {
    aquisicaoTiles: cfg.aquisicaoTiles,
    prioridade: prioridadePorEspecie(conteudo.prioridadeAlvo ?? {}),
    manual: cfg.ataqueManual,
  });
  const experiencia: Sistema = {
    depoisDoTick(mundo, eventos) {
      for (const ev of eventos) {
        if (ev.tipo === 'ganhouXp') {
          darXp(mundo, jogador, ficha, ev.valor, cfg);
          continue;
        }
        if (ev.tipo !== 'derrotado') continue;
        const caido = mundo.entidades.find((e) => e.id === ev.id);
        const xp = Number(caido?.marcas?.xp ?? 0);
        if (xp > 0) darXp(mundo, jogador, ficha, xp, cfg);
      }
    },
  };
  const mundo = criarMundo(
    {
      limites: { x0: 0, y0: 0, x1: rua.largura, y1: rua.profundidade },
      obstaculos: [...obstaculosDaRua(rua, conteudo.modelos), ...(opcoes.obstaculos ?? [])],
      semente,
    },
    conteudo.simulacao,
    [
      criarSistemaCombate(cfg),
      criarSistemaPassivas(),
      ...(opcoes.antes ?? []),
      executor.sistema,
      criarSistemaRolamento(conteudo.jogador.rolamento, cfg.estados),
      autoAtaque,
      ...(opcoes.sistemas ?? []),
      experiencia,
    ],
  );
  mundo.aoBaterNaParede = (e, atordoa) =>
    aplicarEstado(e, { tipo: 'atordoado', restante: atordoa }, cfg.estados);

  const jogador = adicionarEntidade(mundo, {
    tipo: 'jogador',
    especie: ficha.campeaoId,
    pos: rua.entrada,
    raio: conteudo.jogador.raio,
    velocidade: conteudo.jogador.velocidade,
    ...(conteudo.jogador.aceleracao ? { aceleracao: { ...conteudo.jogador.aceleracao } } : {}),
    combate: ficha.combate,
    lancador: ficha.lancador,
    ataque: ficha.ataque,
  });
  const cfgBoneco = cfg.bonecoTreino;
  const bonecos = rua.bonecos.map((b) =>
    adicionarEntidade(mundo, {
      tipo: 'inimigo',
      especie: 'boneco',
      pos: b,
      raio: cfgBoneco.raio,
      velocidade: 0,
      combate: combatenteBoneco(cfgBoneco, cfg),
      marcas: { xp: cfgBoneco.xp },
    }),
  );
  return { mundo, jogador, ficha, executor, bonecos };
}

export function novoExecutor(cfg: Combate): Executor {
  return new Executor({
    pressaMaxima: cfg.pressaMaxima,
    comandoGuardadoS: cfg.comandoGuardadoS,
    fracaoRecargaInterrompida: cfg.fracaoRecargaInterrompida,
    raioBuscaAlvo: cfg.raioBuscaAlvo,
    quaseAcertoTiles: cfg.quaseAcertoTiles,
    estados: cfg.estados,
  });
}

/** Dá XP ao jogador e aplica o bônus de cada nível novo. */
export function darXp(
  mundo: Mundo,
  jogador: Entidade,
  ficha: Ficha,
  valor: number,
  cfg: Combate,
): void {
  const subiu = ganharXp(ficha.progresso, valor, cfg.niveis);
  mundo.eventos.push({ tipo: 'xp', id: jogador.id, valor });
  if (subiu <= 0) return;
  aplicarBonusDeNivel(ficha.combate, ficha.progresso, cfg.niveis);
  recalcular(ficha.combate);
  mundo.eventos.push({ tipo: 'nivel', id: jogador.id, nivel: ficha.progresso.nivel });
}

/** Eventos de um tipo, com o tipo certo (para testes e regras). */
export function eventosDo<T extends Evento['tipo']>(
  eventos: readonly Evento[],
  tipo: T,
): Extract<Evento, { tipo: T }>[] {
  return eventos.filter((e): e is Extract<Evento, { tipo: T }> => e.tipo === tipo);
}

/** Atalho para testes e para a rua de treino: uma ficha nova e o mapa montado. */
export function simularRua(
  rua: Rua,
  conteudo: Conteudo,
  semente: number,
  campeaoId = 'bruxinha',
  opcoes: OpcoesPartida = {},
): Partida {
  return montarPartida(rua, criarFicha(campeaoId, conteudo), conteudo, semente, opcoes);
}
