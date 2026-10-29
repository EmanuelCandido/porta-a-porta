import {
  comprimento,
  empurraoCirculoRetangulo,
  limitarA1,
  type Retangulo,
  type V2,
} from './geometria';
import type { Combatente } from './combate';
import type { Evento } from './eventos';
import { GradeEspacial } from './gradeEspacial';
import type { Carga, Lancador } from './habilidades';
import { Rng } from './rng';

export type IdEntidade = number;

export interface Entidade {
  id: IdEntidade;
  /** Lado: o jogador, os inimigos, ou neutros (Criança Perdida, Gato Preto fugindo). */
  tipo: 'jogador' | 'inimigo' | 'neutro';
  /** O que é (campeão, inimigo, chefe): escolhe o desenho e a definição. */
  especie: string;
  pos: V2;
  /** Posição no tick anterior, para a tela interpolar entre dois ticks. */
  posAnterior: V2;
  raio: number;
  /** Tiles por segundo. */
  velocidade: number;
  /** Bloqueia quem tenta passar (o jogador e os inimigos corpo a corpo). */
  solido: boolean;
  /** Passa por corpos sólidos (dashes). */
  atravessaCorpos: boolean;
  /** Passa por casas e objetos (o Atravessar do Fantasma). */
  atravessaParedes: boolean;
  /** Intenção por direção (teclado ou analógico), em tiles, comprimento até 1. */
  direcao: V2;
  /** Intenção por destino (clique). A direção, quando existe, tem prioridade. */
  destino: V2 | null;
  /** Multiplicador da velocidade neste tick (lentidão, lançamento parado); os sistemas o ajustam. */
  multVelocidade: number;
  /**
   * Arranque e frenagem (o jogador): segundos para ir do parado à velocidade cheia e dela ao
   * parado. Sem isso, a velocidade muda de uma vez. `vel` é a velocidade de agora (tiles/s).
   */
  aceleracao?: { arranqueS: number; freioS: number };
  vel?: V2;
  /** Movimento que ignora a intenção (dash, empurrão), até percorrer `restante` tiles. */
  forcado: MovimentoForcado | null;
  /** O movimento forçado que terminou neste tick (o executor fecha o dash: rastro, desvio). */
  forcadoAcabou?: MovimentoForcado | null;
  /** Coragem, Energia, atributos e estados de quem luta. */
  combate?: Combatente;
  /** Habilidades, recargas e lançamento em andamento de quem lança habilidades. */
  lancador?: Lancador;
  /** Para onde está virado (cones, "atrás do Fantasma"). */
  olhar: V2;
  /** Ponto do chão que o jogador está mirando (áreas que seguem o cursor). */
  mira?: V2;
  /** O Medo está mexendo na direção (o sistema de combate a devolve ao acabar). */
  emMedo?: boolean;
  /** Estado de auto-ataque (alvo, preparo, recarga), para quem ataca. */
  ataque?: import('./autoataque').EstadoAtaque;
  /** Estado da IA de um inimigo. */
  ia?: { estado: string; [chave: string]: unknown };
  /** Tick a partir do qual pode rolar de novo (o rolamento do jogador). */
  rolarEm?: number;
  /** Rolando: até qual tick, e quem já ficou tonto neste rolamento. */
  rolando?: { ate: number; atingidos: number[] };
  /** Tick do último comando de andar (o auto-ataque em andamento é cancelado por ele). */
  comandoMovTick?: number;
  /** Dados livres da regra que criou a entidade (ex.: índice do Poste). */
  marcas?: Record<string, number | string | boolean>;
}

export interface MovimentoForcado {
  /** O pequeno recuo de um acerto continua mesmo se o próprio golpe atordoar ou enraizar. */
  porImpacto?: boolean;
  /** Direção unitária. */
  dir: V2;
  velocidade: number;
  restante: number;
  /** Valores a restaurar quando o movimento acaba. */
  atravessaCorposAntes: boolean;
  atravessaParedesAntes: boolean;
  /** Habilidade que acerta quem o dash encostar (Investida, Rastro, Cão de Guarda). */
  carga?: Carga;
  atingidos?: Set<IdEntidade>;
  inicio?: V2;
  /** O estouro do pouso já saiu (Salto de Vassoura). */
  estourou?: boolean;
  /** Empurrão que atordoa se bater numa casa (Atropelo). */
  atordoaNaParede?: number;
}

export type Comando =
  | { tipo: 'direcao'; id: IdEntidade; x: number; y: number }
  | { tipo: 'moverPara'; id: IdEntidade; x: number; y: number }
  | { tipo: 'parar'; id: IdEntidade }
  | { tipo: 'lancar'; id: IdEntidade; tecla: string; alvo: V2 }
  | { tipo: 'mirar'; id: IdEntidade; x: number; y: number }
  | { tipo: 'atacar'; id: IdEntidade; alvo: IdEntidade }
  | { tipo: 'atacarMover'; id: IdEntidade; x: number; y: number }
  | { tipo: 'rolar'; id: IdEntidade; x: number; y: number }
  | { tipo: 'golpear'; id: IdEntidade; x: number; y: number }
  | { tipo: 'usar'; id: IdEntidade; acao: string; x: number; y: number };

/** Comando que não é de movimento: fica para os sistemas tratarem no mesmo tick. */
export type Acao = Exclude<Comando, { tipo: 'direcao' | 'moverPara' | 'parar' | 'mirar' }>;

/**
 * Regras que rodam a cada tick, em ordem: antes do movimento (comandos, recargas, lançamentos) e
 * depois dele (projéteis, áreas). Assim o mundo não depende de habilidades nem de combate.
 */
export interface Sistema {
  antesDeMover?(mundo: Mundo, acoes: readonly Acao[]): void;
  depoisDeMover?(mundo: Mundo): void;
  /** No fim do tick, com os eventos que aconteceram nele (XP, Susto, doces, tratos). */
  depoisDoTick?(mundo: Mundo, eventos: readonly Evento[]): void;
}

export interface ConfigSimulacao {
  ticksPorSegundo: number;
  celulaGradeTiles: number;
  iteracoesColisao: number;
}

export interface Mundo {
  readonly config: ConfigSimulacao;
  readonly dt: number;
  tick: number;
  readonly limites: Retangulo;
  readonly obstaculos: readonly Retangulo[];
  readonly gradeObstaculos: GradeEspacial<Retangulo>;
  /** Sempre em ordem de id: a ordem de atualização faz parte do determinismo. */
  readonly entidades: Entidade[];
  readonly gradeEntidades: GradeEspacial<Entidade>;
  proximoId: IdEntidade;
  readonly rng: Rng;
  /** Comandos que entram durante um tick só valem no tick seguinte. */
  fila: Comando[];
  readonly sistemas: readonly Sistema[];
  /** O que aconteceu (acertos, explosões); quem desenha lê e esvazia. */
  eventos: Evento[];
  /** Eventos que nasceram no fim de um tick (uma explosão de trato que derruba alguém): os sistemas
   * os leem no tick seguinte. */
  atrasados: Evento[];
  /** Mapa de luz da rua (quem está iluminado), quando houver. */
  luz?: {
    iluminado(p: V2): boolean;
    /** Zona que fica na sombra até o tick `ate` (Névoa). */
    adicionarSombra?(z: { x: number; y: number; raio: number; ate: number | null }): unknown;
  };
  /** Chamado quando um empurrão que atordoa bate numa casa. */
  aoBaterNaParede?: (e: Entidade, atordoa: number) => void;
}

export interface DefinicaoMundo {
  limites: Retangulo;
  obstaculos: Retangulo[];
  semente: number;
}

export type NovaEntidade = Pick<Entidade, 'tipo' | 'pos' | 'raio' | 'velocidade'> &
  Partial<
    Pick<
      Entidade,
      | 'especie'
      | 'solido'
      | 'atravessaCorpos'
      | 'atravessaParedes'
      | 'combate'
      | 'lancador'
      | 'ataque'
      | 'ia'
      | 'marcas'
      | 'aceleracao'
    >
  >;

/** Fração do raio que um corpo anda por subpasso: impede atravessar paredes finas em alta velocidade. */
const FRACAO_SUBPASSO = 0.5;

export function criarMundo(
  def: DefinicaoMundo,
  config: ConfigSimulacao,
  sistemas: readonly Sistema[] = [],
): Mundo {
  const gradeObstaculos = new GradeEspacial<Retangulo>(config.celulaGradeTiles);
  for (const r of def.obstaculos) gradeObstaculos.inserir(r, r);
  return {
    config,
    dt: 1 / config.ticksPorSegundo,
    tick: 0,
    limites: def.limites,
    obstaculos: def.obstaculos,
    gradeObstaculos,
    entidades: [],
    gradeEntidades: new GradeEspacial<Entidade>(config.celulaGradeTiles),
    proximoId: 1,
    rng: new Rng(def.semente),
    fila: [],
    sistemas,
    eventos: [],
    atrasados: [],
  };
}

function areaDoCorpo(c: V2, raio: number): Retangulo {
  return { x0: c.x - raio, y0: c.y - raio, x1: c.x + raio, y1: c.y + raio };
}

function reindexar(mundo: Mundo): void {
  mundo.gradeEntidades.limpar();
  for (const e of mundo.entidades) mundo.gradeEntidades.inserir(areaDoCorpo(e.pos, e.raio), e);
}

export function adicionarEntidade(mundo: Mundo, nova: NovaEntidade): Entidade {
  const e: Entidade = {
    id: mundo.proximoId++,
    especie: nova.tipo,
    olhar: { x: 1, y: 0 },
    solido: true,
    atravessaCorpos: false,
    atravessaParedes: false,
    ...nova,
    pos: { ...nova.pos },
    posAnterior: { ...nova.pos },
    direcao: { x: 0, y: 0 },
    destino: null,
    multVelocidade: 1,
    forcado: null,
  };
  mundo.entidades.push(e);
  reindexar(mundo);
  return e;
}

/** Põe um obstáculo novo (grade do portão, grades do Síndico). */
export function adicionarObstaculo(mundo: Mundo, r: Retangulo): void {
  (mundo.obstaculos as Retangulo[]).push(r);
  mundo.gradeObstaculos.inserir(r, r);
}

/** Tira um obstáculo (o portão abriu). */
export function removerObstaculo(mundo: Mundo, r: Retangulo): void {
  const lista = mundo.obstaculos as Retangulo[];
  const i = lista.indexOf(r);
  if (i < 0) return;
  lista.splice(i, 1);
  mundo.gradeObstaculos.limpar();
  for (const o of lista) mundo.gradeObstaculos.inserir(o, o);
}

/** Tira uma entidade do mundo (inimigo derrotado). */
export function removerEntidade(mundo: Mundo, id: IdEntidade): void {
  const i = mundo.entidades.findIndex((e) => e.id === id);
  if (i < 0) return;
  mundo.entidades.splice(i, 1);
  reindexar(mundo);
}

export function entidade(mundo: Mundo, id: IdEntidade): Entidade | undefined {
  return mundo.entidades.find((e) => e.id === id);
}

export function enfileirar(mundo: Mundo, comando: Comando): void {
  mundo.fila.push(comando);
}

/** Aplica os comandos de movimento e devolve os outros, para os sistemas. */
function aplicarComandos(mundo: Mundo): Acao[] {
  const fila = mundo.fila;
  mundo.fila = [];
  const acoes: Acao[] = [];
  for (const c of fila) {
    const e = entidade(mundo, c.id);
    if (!e) continue;
    switch (c.tipo) {
      case 'mirar':
        e.mira = { x: c.x, y: c.y };
        break;
      case 'lancar':
        e.mira = { ...c.alvo };
        acoes.push(c);
        break;
      case 'atacar':
      case 'atacarMover':
      case 'usar':
      case 'rolar':
      case 'golpear':
        acoes.push(c);
        break;
      case 'direcao':
        e.direcao = limitarA1({ x: c.x, y: c.y });
        if (c.x !== 0 || c.y !== 0) e.comandoMovTick = mundo.tick;
        break;
      case 'moverPara':
        e.destino = { x: c.x, y: c.y };
        e.comandoMovTick = mundo.tick;
        break;
      case 'parar':
        e.direcao = { x: 0, y: 0 };
        e.destino = null;
        e.comandoMovTick = mundo.tick;
        break;
    }
  }
  return acoes;
}

/** Começa um movimento forçado (dash, empurrão) a partir da posição atual. */
export function forcarMovimento(
  e: Entidade,
  dir: V2,
  distancia: number,
  velocidade: number,
  atravessaCorpos: boolean,
  atravessaParedes = false,
): MovimentoForcado | null {
  const n = comprimento(dir);
  if (n === 0 || distancia <= 0 || velocidade <= 0) return null;
  // Objetos quebráveis (lixeira, caixa de correio) ficam onde estão.
  if (e.marcas?.quebravel) return null;
  e.forcado = {
    dir: { x: dir.x / n, y: dir.y / n },
    velocidade,
    restante: distancia,
    atravessaCorposAntes: e.forcado?.atravessaCorposAntes ?? e.atravessaCorpos,
    atravessaParedesAntes: e.forcado?.atravessaParedesAntes ?? e.atravessaParedes,
  };
  e.atravessaCorpos = atravessaCorpos;
  e.atravessaParedes = atravessaParedes;
  return e.forcado;
}

/** Termina um movimento forçado e devolve as flags de antes. */
export function encerrarForcado(e: Entidade): void {
  if (!e.forcado) return;
  e.atravessaCorpos = e.forcado.atravessaCorposAntes;
  e.atravessaParedes = e.forcado.atravessaParedesAntes;
  e.forcado = null;
}

/** Deslocamento pedido neste tick, já limitado pela velocidade. */
function deslocamentoDesejado(e: Entidade, dt: number): V2 {
  if (e.forcado) {
    const f = e.forcado;
    const d = Math.min(f.velocidade * dt, f.restante);
    f.restante -= d;
    return { x: f.dir.x * d, y: f.dir.y * d };
  }
  const passo = e.velocidade * e.multVelocidade * dt;
  let pedido: V2;
  if (e.direcao.x !== 0 || e.direcao.y !== 0) {
    e.destino = null;
    pedido = { x: e.direcao.x * passo, y: e.direcao.y * passo };
  } else if (!e.destino) pedido = { x: 0, y: 0 };
  else {
    // Andar até um ponto (testes, bots) chega exato: a inércia passaria do ponto e voltaria.
    const falta = { x: e.destino.x - e.pos.x, y: e.destino.y - e.pos.y };
    const d = comprimento(falta);
    if (d <= passo) {
      e.destino = null;
      pedido = falta;
    } else pedido = { x: (falta.x / d) * passo, y: (falta.y / d) * passo };
    if (e.aceleracao) e.vel = e.destino ? { x: pedido.x / dt, y: pedido.y / dt } : { x: 0, y: 0 };
    return pedido;
  }
  return e.aceleracao ? comInercia(e, e.aceleracao, pedido, dt) : pedido;
}

/**
 * A velocidade de agora anda até a pedida: no máximo `velocidade / arranqueS` por segundo para
 * ganhar velocidade e `velocidade / freioS` para perder (virar para trás passa pelo parado).
 */
function comInercia(
  e: Entidade,
  a: { arranqueS: number; freioS: number },
  pedido: V2,
  dt: number,
): V2 {
  // Preso (raiz, atordoado, lançando parado): para na hora, sem escorregar.
  if (e.multVelocidade === 0) {
    e.vel = { x: 0, y: 0 };
    return { x: 0, y: 0 };
  }
  const alvo = { x: pedido.x / dt, y: pedido.y / dt };
  const vel = e.vel ?? { x: 0, y: 0 };
  const dif = { x: alvo.x - vel.x, y: alvo.y - vel.y };
  const falta = comprimento(dif);
  if (falta < 1e-9) {
    e.vel = alvo;
    return pedido;
  }
  // Ganhando velocidade na direção pedida é arranque; o resto (parar, virar) é freio.
  const ganha = alvo.x * dif.x + alvo.y * dif.y > 0 && comprimento(alvo) >= comprimento(vel);
  const max = (e.velocidade / (ganha ? a.arranqueS : a.freioS)) * dt;
  const k = Math.min(1, max / falta);
  e.vel = { x: vel.x + dif.x * k, y: vel.y + dif.y * k };
  return { x: e.vel.x * dt, y: e.vel.y * dt };
}

/** Resolve as colisões; devolve se bateu numa parede (casa ou objeto). */
function resolverColisoes(mundo: Mundo, e: Entidade): boolean {
  let bateu = false;
  for (let i = 0; i < mundo.config.iteracoesColisao; i++) {
    let mexeu = false;
    if (!e.atravessaParedes) {
      for (const r of mundo.gradeObstaculos.consultar(areaDoCorpo(e.pos, e.raio))) {
        const emp = empurraoCirculoRetangulo(e.pos, e.raio, r);
        if (emp.x !== 0 || emp.y !== 0) {
          e.pos = { x: e.pos.x + emp.x, y: e.pos.y + emp.y };
          mexeu = true;
          bateu = true;
        }
      }
    }
    if (!e.atravessaCorpos) {
      for (const outro of mundo.gradeEntidades.consultar(areaDoCorpo(e.pos, e.raio * 2))) {
        if (outro === e || !outro.solido) continue;
        const dx = e.pos.x - outro.pos.x;
        const dy = e.pos.y - outro.pos.y;
        const d = Math.hypot(dx, dy);
        const minimo = e.raio + outro.raio;
        if (d >= minimo) continue;
        // Quem se mexe é quem cede: o corpo parado não é empurrado. Aos poucos, como os subpassos
        // do movimento: um empurrão inteiro de uma vez atravessaria uma cerca fina.
        const nx = d > 0 ? dx / d : 1;
        const ny = d > 0 ? dy / d : 0;
        const passo = Math.min(minimo - d, e.raio * FRACAO_SUBPASSO);
        e.pos = { x: e.pos.x + nx * passo, y: e.pos.y + ny * passo };
        mexeu = true;
      }
    }
    const { limites: l } = mundo;
    const preso = {
      x: Math.max(l.x0 + e.raio, Math.min(e.pos.x, l.x1 - e.raio)),
      y: Math.max(l.y0 + e.raio, Math.min(e.pos.y, l.y1 - e.raio)),
    };
    if (preso.x !== e.pos.x || preso.y !== e.pos.y) {
      e.pos = preso;
      mexeu = true;
    }
    if (!mexeu) break;
  }
  return bateu;
}

function mover(mundo: Mundo, e: Entidade): void {
  const desejado = deslocamentoDesejado(e, mundo.dt);
  const d = comprimento(desejado);
  let bateu = false;
  if (d > 0) {
    const subpassos = Math.max(1, Math.ceil(d / (e.raio * FRACAO_SUBPASSO)));
    for (let s = 0; s < subpassos; s++) {
      e.pos = { x: e.pos.x + desejado.x / subpassos, y: e.pos.y + desejado.y / subpassos };
      if (resolverColisoes(mundo, e)) bateu = true;
    }
  }
  const f = e.forcado;
  if (f && bateu && f.atordoaNaParede) {
    mundo.aoBaterNaParede?.(e, f.atordoaNaParede);
    f.atordoaNaParede = 0;
  }
  if (f && f.restante <= 0) {
    encerrarForcado(e);
    e.forcadoAcabou = f;
  }
}

/**
 * Um tick de 1/ticksPorSegundo: aplica os comandos da fila, roda os sistemas e move cada entidade,
 * em ordem de id.
 */
export function passo(mundo: Mundo): void {
  const inicioEventos = mundo.eventos.length;
  const acoes = aplicarComandos(mundo);
  for (const e of mundo.entidades) {
    e.multVelocidade = 1;
    e.forcadoAcabou = null;
  }
  for (const s of mundo.sistemas) s.antesDeMover?.(mundo, acoes);
  for (const e of mundo.entidades) {
    e.posAnterior = { ...e.pos };
    mover(mundo, e);
    mundo.gradeEntidades.inserir(areaDoCorpo(e.pos, e.raio), e);
  }
  reindexar(mundo);
  for (const s of mundo.sistemas) s.depoisDeMover?.(mundo);
  const doTick = [...mundo.atrasados, ...mundo.eventos.slice(inicioEventos)];
  const fimDoTick = mundo.eventos.length;
  for (const s of mundo.sistemas) s.depoisDoTick?.(mundo, doTick);
  mundo.atrasados = mundo.eventos.slice(fimDoTick);
  mundo.tick++;
}
