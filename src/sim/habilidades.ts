import {
  alvosDeGolpe,
  aplicarEstado,
  avisarObjetoAtingido,
  causarDano,
  golpearObjeto,
  curar,
  miravel,
  podeAgir,
  recargaComPressa,
  vivo,
  type ConfigEstados,
  type Golpe,
} from './combate';
import type { Campeao, Efeito, Habilidade, Passiva } from './content/esquemas';
import { comprimento, type V2 } from './geometria';
import {
  entidade,
  forcarMovimento,
  type Acao,
  type Entidade,
  type IdEntidade,
  type Mundo,
  type Sistema,
} from './mundo';

export interface Slot {
  def: Habilidade;
  /** Posto atual (0 = ainda não aprendida; Q, W e E vão até 5, o R até 3). */
  posto: number;
  /** Segundos que faltam de recarga. */
  recarga: number;
  /** Recarga completa do último lançamento (para a interface mostrar a fração). */
  recargaTotal: number;
  /** Cargas guardadas (habilidades com mais de uma carga). */
  cargas: number;
  /** Evolução escolhida no posto 3 (id), se houver. */
  evolucao: string | null;
  /** Até qual tick a habilidade pode ser lançada de novo sem recarga (Corte Duplo). */
  relancarAte: number;
  /** O próximo lançamento sai sem custo de Energia (Pouso Leve). */
  gratis: boolean;
  /** Até qual tick o dash pode voltar ao ponto de partida, e qual é ele (Retorno). */
  retornoAte: number;
  retornoDe: V2 | null;
}

export interface Lancamento {
  chave: string;
  alvo: V2;
  /** Segundos que faltam para a habilidade sair. */
  restante: number;
  total: number;
  /** Ponto de onde o lançamento começou (o aviso fica onde foi anunciado). */
  origem: V2;
}

export interface Lancador {
  slots: Record<string, Slot>;
  lancando: Lancamento | null;
  /** Atordoamento ou Medo pediram para interromper o lançamento. */
  interrompido: boolean;
  /** Comando que chegou pouco antes do fim da ação atual e sai logo depois dela. */
  guardado: { chave: string; alvo: V2; ate: number } | null;
  passiva: Passiva | null;
  /** Habilidades lançadas desde a última fortalecida pelo Caldeirão. */
  contagemPassiva: number;
  /** Total de habilidades lançadas (interface, testes e pedidos). */
  lancadas: number;
}

/** Uma habilidade já lançada: o que ela carrega para aplicar quando acertar. */
export interface Carga {
  id: number;
  dono: IdEntidade;
  /** Lado de quem lançou: acerta os do outro lado. */
  lado: Entidade['tipo'];
  chave: string;
  def: Habilidade;
  efeitos: Efeito[];
  posto: number;
  /** Multiplicador de dano (Caldeirão, relançamento). */
  mult: number;
  /** Ainda vai soltar a explosão do Caldeirão no primeiro acerto. */
  explosao: boolean;
  /** Alvos atingidos por este lançamento (o Susto conta até 3). */
  acertos: number;
  /** Ataque inimigo anunciado no chão. */
  comAviso: boolean;
}

export interface Projetil extends Carga {
  pos: V2;
  posAnterior: V2;
  dir: V2;
  velocidade: number;
  largura: number;
  perfura: boolean;
  /** Tiles que ainda pode andar. */
  restante: number;
  atingidos: Set<IdEntidade>;
  /** Projétil teleguiado: persegue este alvo. */
  alvo: IdEntidade | null;
  /** Saltos de Ricochete que ainda faltam. */
  saltos: number;
  /** Golpe pronto (auto-ataque): no acerto vira dano direto, sem efeitos de habilidade. */
  golpe: Golpe | null;
}

export interface Area extends Carga {
  centro: V2;
  raio: number;
  /** Segundos até o próximo pulso. */
  proximo: number;
  pulsosRestantes: number;
  intervalo: number;
  /** Duração total, para a tela desenhar o tempo que falta. */
  duracao: number;
  idade: number;
  /** A área acompanha a mira de quem lançou (Tempestade). */
  segue: boolean;
  /** A área fica em volta de quem lançou. */
  presa: boolean;
  /** Quanto tempo cada alvo está dentro (Poção Grudenta, Ossuário). */
  tempoDentro: Map<IdEntidade, number>;
}

export interface Rastro extends Carga {
  /** Segmento que causa dano enquanto dura. */
  a: V2;
  b: V2;
  largura: number;
  restante: number;
  proximo: number;
  intervalo: number;
}

export interface EstadoHabilidades {
  projeteis: Projetil[];
  areas: Area[];
  rastros: Rastro[];
  /** Golpes adiados (Assombração aparece atrás do alvo depois de um tempo). */
  adiados: { faltam: number; executar: (mundo: Mundo) => void }[];
  proximoId: number;
}

export interface ConfigHabilidades {
  pressaMaxima: number;
  comandoGuardadoS: number;
  fracaoRecargaInterrompida: number;
  raioBuscaAlvo: number;
  quaseAcertoTiles: number;
  estados: ConfigEstados;
}

/** Sobra de deslocamento por subpasso do projétil, para não pular um alvo pequeno. */
const PASSO_PROJETIL_TILES = 0.25;
/** Direção usada quando o alvo cai exatamente em cima do lançador. */
const DIRECAO_PADRAO: V2 = { x: 1, y: 0 };
const EPS = 1e-9;

/** Direções de um leque de projéteis, centrado na mira (sem leque, só a própria mira). */
export function direcoesDoLeque(dir: V2, leque?: { n: number; angulo: number }): V2[] {
  if (!leque) return [dir];
  const base = Math.atan2(dir.y, dir.x);
  const passo = (leque.angulo * Math.PI) / 180;
  return Array.from({ length: leque.n }, (_, i) => {
    const t = base + (i - (leque.n - 1) / 2) * passo;
    return { x: Math.cos(t), y: Math.sin(t) };
  });
}

export function postoMaximo(chave: string): number {
  return chave === 'R' ? 3 : 5;
}

export function novoSlot(def: Habilidade, posto: number): Slot {
  return {
    def,
    posto,
    recarga: 0,
    recargaTotal: 0,
    cargas: def.cargas,
    evolucao: null,
    relancarAte: -1,
    gratis: false,
    retornoAte: -1,
    retornoDe: null,
  };
}

/** Lançador de um campeão: Q, W, E e R começam sem posto (os pontos vêm dos níveis). */
export function criarLancador(
  campeao: Campeao,
  porId: ReadonlyMap<string, Habilidade>,
  postoInicial = 0,
): Lancador {
  const slot = (tecla: 'Q' | 'W' | 'E' | 'R'): Slot => {
    const id = campeao.habilidades[tecla];
    const def = porId.get(id);
    if (!def) throw new Error(`habilidade ${id} não existe em content/habilidades.json`);
    if (def.tecla !== tecla) {
      throw new Error(`habilidade ${id} é da tecla ${def.tecla}, não ${tecla}`);
    }
    return novoSlot(def, postoInicial);
  };
  return {
    slots: { Q: slot('Q'), W: slot('W'), E: slot('E'), R: slot('R') },
    lancando: null,
    interrompido: false,
    guardado: null,
    passiva: campeao.passiva,
    contagemPassiva: 0,
    lancadas: 0,
  };
}

/** Lançador de um inimigo: cada ataque é um slot com o próprio id, sempre no posto 1. */
export function lancadorDeAtaques(defs: readonly Habilidade[]): Lancador {
  return {
    slots: Object.fromEntries(defs.map((d) => [d.id, novoSlot(d, 1)])),
    lancando: null,
    interrompido: false,
    guardado: null,
    passiva: null,
    contagemPassiva: 0,
    lancadas: 0,
  };
}

export function definirPosto(l: Lancador, chave: string, posto: number): void {
  const s = l.slots[chave];
  if (!s) return;
  s.posto = Math.max(0, Math.min(postoMaximo(chave), Math.round(posto)));
}

/** Direção unitária de `de` até `para`, ou a padrão se forem o mesmo ponto. */
export function direcao(de: V2, para: V2): V2 {
  const v = { x: para.x - de.x, y: para.y - de.y };
  const n = comprimento(v);
  return n < EPS ? DIRECAO_PADRAO : { x: v.x / n, y: v.y / n };
}

/** Áreas caem no ponto pedido ou, fora do alcance, no ponto mais distante possível. */
export function pontoNoAlcance(de: V2, para: V2, alcance: number): V2 {
  const v = { x: para.x - de.x, y: para.y - de.y };
  const n = comprimento(v);
  if (n <= alcance) return { ...para };
  return { x: de.x + (v.x / n) * alcance, y: de.y + (v.y / n) * alcance };
}

type EfeitoDano = Extract<Efeito, { tipo: 'dano' }>;

/** Dano bruto de um efeito no posto, antes da Resistência do alvo. */
export function danoBruto(
  efeito: Pick<EfeitoDano, 'base' | 'razao' | 'atributo' | 'razaoCoragemMax'>,
  posto: number,
  atributos: { forca: number; feitico: number; coragemMax?: number },
): number {
  const p = Math.max(1, posto);
  const base = efeito.base[p - 1] ?? efeito.base[efeito.base.length - 1]!;
  return (
    base +
    efeito.razao * atributos[efeito.atributo] +
    (efeito.razaoCoragemMax ?? 0) * (atributos.coragemMax ?? 0)
  );
}

function valorPorPosto(lista: readonly number[], posto: number): number {
  return lista[Math.max(1, posto) - 1] ?? lista[lista.length - 1]!;
}

/** Distância de um ponto a um segmento. */
export function distanciaAoSegmento(p: V2, a: V2, b: V2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  const t = l2 < EPS ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2));
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

export function pontoNaParede(mundo: Mundo, p: V2): boolean {
  return mundo.gradeObstaculos
    .consultar({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
    .some((r) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1);
}

type Motivo = 'recarga' | 'energia' | 'ocupado' | 'posto' | 'controle' | 'semAlvo';

/**
 * Executor genérico de habilidades: lê o JSON de cada uma (forma, números por posto e efeitos) e
 * cuida de recarga, Energia, lançamento, projéteis, áreas, dashes, cones, alvos e efeitos. Serve
 * para os campeões (Q, W, E e R) e para os ataques dos inimigos (com aviso vermelho no chão).
 */
export class Executor {
  readonly estado: EstadoHabilidades = {
    projeteis: [],
    areas: [],
    rastros: [],
    adiados: [],
    proximoId: 1,
  };

  readonly sistema: Sistema;
  /** Graus por segundo que os projéteis inimigos viram (condição Ventania). */
  curvaInimigos = 0;

  constructor(readonly cfg: ConfigHabilidades) {
    this.sistema = {
      antesDeMover: (mundo, acoes) => this.antesDeMover(mundo, acoes),
      depoisDeMover: (mundo) => this.depoisDeMover(mundo),
    };
  }

  // ---------------------------------------------------------------- pedidos e lançamento

  /**
   * Pede uma habilidade. Devolve se ela começou (ou ficou guardada para sair logo depois da ação
   * atual). Recusas viram evento.
   */
  pedir(mundo: Mundo, e: Entidade, chave: string, alvo: V2): boolean {
    const l = e.lancador;
    const c = e.combate;
    if (!l || !c || !vivo(e)) return false;
    const slot = l.slots[chave];
    if (!slot) return false;
    const recusar = (motivo: Motivo): boolean => {
      mundo.eventos.push({ tipo: 'recusado', id: e.id, tecla: chave, motivo });
      return false;
    };
    if (slot.posto <= 0) return recusar('posto');
    if (!podeAgir(e)) return recusar('controle');
    const ocupado = this.fimDaAcaoAtual(e);
    if (ocupado > EPS) {
      if (ocupado <= this.cfg.comandoGuardadoS + EPS) {
        l.guardado = {
          chave,
          alvo: { ...alvo },
          ate: mundo.tick + Math.ceil(ocupado / mundo.dt) + 2,
        };
        return true;
      }
      return recusar('ocupado');
    }
    // Retorno: apertar de novo, dentro da janela, volta ao ponto de partida do dash.
    if (slot.retornoDe && slot.retornoAte >= mundo.tick && slot.def.forma.tipo === 'dash') {
      const f = slot.def.forma;
      const volta = slot.retornoDe;
      slot.retornoAte = -1;
      slot.retornoDe = null;
      const dist = Math.hypot(volta.x - e.pos.x, volta.y - e.pos.y);
      forcarMovimento(e, direcao(e.pos, volta), dist, f.velocidade, true, f.atravessaParedes);
      mundo.eventos.push({
        tipo: 'lancou',
        id: e.id,
        tecla: chave,
        alvo: { ...volta },
        fortalecida: false,
        eco: false,
      });
      return true;
    }
    const relancar = slot.relancarAte >= mundo.tick;
    if (!relancar && slot.recarga > 0 && slot.cargas <= 0) return recusar('recarga');
    if (!relancar && c.energia + EPS < this.custo(e, slot)) return recusar('energia');
    if (slot.def.forma.tipo === 'alvo' && !this.acharAlvo(mundo, e, slot, alvo)) {
      return recusar('semAlvo');
    }

    const lanc = slot.def.lancamento;
    if (lanc <= 0) {
      this.executar(mundo, e, chave, alvo);
    } else {
      l.lancando = { chave, alvo: { ...alvo }, restante: lanc, total: lanc, origem: { ...e.pos } };
      mundo.eventos.push({ tipo: 'anunciou', id: e.id, chave, alvo: { ...alvo }, duracao: lanc });
    }
    return true;
  }

  /** Segundos até o lançador ficar livre (lançamento ou dash em andamento). */
  private fimDaAcaoAtual(e: Entidade): number {
    let t = 0;
    if (e.lancador?.lancando) t = Math.max(t, e.lancador.lancando.restante);
    if (e.forcado) t = Math.max(t, e.forcado.restante / Math.max(e.forcado.velocidade, EPS));
    return t;
  }

  custo(e: Entidade, slot: Slot): number {
    if (slot.gratis) return 0;
    return slot.def.custo * (e.combate?.attr.custoHabilidade ?? 1);
  }

  recargaDe(e: Entidade, chave: string, slot: Slot): number {
    const a = e.combate!.attr;
    let base = valorPorPosto(slot.def.recarga, slot.posto);
    base = recargaComPressa(base, a.pressa, this.cfg.pressaMaxima);
    base /= Math.max(a.velocidadeRecarga, EPS);
    if (chave === 'R') base /= Math.max(a.velocidadeRecargaR, EPS);
    return base;
  }

  /** Inimigo mais perto do ponto mirado, dentro do alcance (Assombração, Mordida). */
  acharAlvo(mundo: Mundo, e: Entidade, slot: Slot, ponto: V2): Entidade | null {
    const f = slot.def.forma;
    if (f.tipo !== 'alvo') return null;
    let melhor: Entidade | null = null;
    let melhorD = Infinity;
    for (const o of this.alvosDoLado(mundo, e.tipo)) {
      const doLancador = Math.hypot(o.pos.x - e.pos.x, o.pos.y - e.pos.y) - o.raio;
      if (doLancador > f.alcance) continue;
      const doPonto = Math.hypot(o.pos.x - ponto.x, o.pos.y - ponto.y);
      if (doPonto > this.cfg.raioBuscaAlvo + o.raio) continue;
      if (doPonto < melhorD) {
        melhorD = doPonto;
        melhor = o;
      }
    }
    return melhor;
  }

  /**
   * Gasta, põe em recarga, conta para a passiva e cria o projétil, a área, o dash ou o golpe. Com
   * `eco` (fração do dano), é a repetição de graça de um trato: não gasta, não recarrega e não conta.
   */
  executar(mundo: Mundo, e: Entidade, chave: string, alvo: V2, eco?: number): void {
    const l = e.lancador!;
    const c = e.combate!;
    const slot = l.slots[chave]!;
    const { def, posto } = slot;
    if (eco !== undefined) {
      // Dashes e habilidades no próprio lançador não se repetem.
      if (def.forma.tipo === 'dash' || def.forma.tipo === 'propria' || !vivo(e)) return;
    }
    const relancar = eco === undefined && slot.relancarAte >= mundo.tick;
    if (eco !== undefined) {
      // Repetição: nada a gastar.
    } else if (relancar) {
      slot.relancarAte = -1;
    } else {
      c.energia = Math.max(0, c.energia - this.custo(e, slot));
      slot.gratis = false;
      if (def.cargas > 1) {
        slot.cargas = Math.max(0, slot.cargas - 1);
        if (slot.recarga <= 0) {
          slot.recarga = this.recargaDe(e, chave, slot);
          slot.recargaTotal = slot.recarga;
        }
      } else {
        slot.recarga = this.recargaDe(e, chave, slot);
        slot.recargaTotal = slot.recarga;
        slot.cargas = 0;
      }
      if (def.relancamento) {
        slot.relancarAte = mundo.tick + Math.round(def.relancamento.janela / mundo.dt);
      }
    }
    if (eco === undefined) l.lancadas++;

    let mult = eco ?? (relancar && def.relancamento ? def.relancamento.fracaoDano : 1);
    let fortalecida = false;
    if (l.passiva?.tipo === 'caldeirao' && eco === undefined) {
      fortalecida = l.contagemPassiva >= l.passiva.aCada;
      if (fortalecida) {
        l.contagemPassiva = 0;
        mult *= 1 + l.passiva.bonusDano;
      } else {
        l.contagemPassiva++;
      }
    }
    // Feitiço Instável: às vezes sai em dobro, às vezes falha (já gastou e já recarrega).
    if (l.passiva?.tipo === 'instavel' && eco === undefined) {
      const r = mundo.rng.proximo();
      if (r < l.passiva.chanceFalha) {
        mundo.eventos.push({ tipo: 'feiticoFalhou', id: e.id, pos: { ...e.pos } });
        return;
      }
      if (r < l.passiva.chanceFalha + l.passiva.chanceDobro) {
        mult *= 2;
        fortalecida = true;
      }
    }
    // Ossos Ocos: o E bate mais forte.
    if (l.passiva?.tipo === 'ossosOcos' && chave === 'E') mult *= 1 + l.passiva.danoE;
    mundo.eventos.push({
      tipo: 'lancou',
      id: e.id,
      tecla: chave,
      alvo: { ...alvo },
      fortalecida,
      eco: eco !== undefined,
    });

    const carga: Carga = {
      id: this.estado.proximoId++,
      dono: e.id,
      lado: e.tipo,
      chave,
      def,
      efeitos: def.efeitos.filter((ef) => (ef.em ?? 'alvo') === 'alvo'),
      posto,
      mult,
      explosao: fortalecida,
      acertos: 0,
      comAviso: def.aviso,
    };
    // Efeitos no próprio lançador (escudo, invisível, bônus); a repetição não os dá de novo.
    for (const ef of def.efeitos) {
      if (ef.em === 'lancador' && eco === undefined) this.aplicarEfeito(mundo, carga, e, ef, 1);
    }

    const a = c.attr;
    const ehJogador = e.tipo === 'jogador';
    const origem = { ...e.pos };
    const dir = direcao(origem, alvo);
    e.olhar = dir;
    const f = def.forma;
    switch (f.tipo) {
      case 'linha': {
        const alcance = f.alcance * (ehJogador ? a.alcanceHabilidade : 1);
        for (const d of direcoesDoLeque(dir, def.leque)) {
          if (f.velocidade <= 0) {
            this.golpeEmLinha(mundo, carga, origem, d, alcance, f.largura, f.perfura);
            continue;
          }
          this.estado.projeteis.push({
            ...carga,
            pos: { ...origem },
            posAnterior: { ...origem },
            dir: d,
            velocidade: f.velocidade * (ehJogador ? a.velocidadeProjetil : 1),
            largura: f.largura,
            perfura: f.perfura,
            restante: alcance,
            atingidos: new Set(),
            alvo: null,
            saltos: def.ricochete?.alvos ?? 0,
            golpe: null,
          });
        }
        break;
      }
      case 'cone':
        this.golpeEmCone(mundo, carga, origem, dir, f.alcance, f.angulo);
        break;
      case 'area': {
        const centro = f.centradaNoLancador ? origem : pontoNoAlcance(origem, alvo, f.alcance);
        // Névoa: a área vira sombra para a regra da luz enquanto dura.
        if (def.sombra && mundo.luz?.adicionarSombra) {
          mundo.luz.adicionarSombra({
            x: centro.x,
            y: centro.y,
            raio: f.raio,
            ate: mundo.tick + Math.round((f.atraso + f.pulsos * f.intervalo) / mundo.dt),
          });
        }
        this.estado.areas.push({
          ...carga,
          centro,
          raio: f.raio,
          proximo: f.atraso,
          pulsosRestantes: f.pulsos,
          intervalo: f.intervalo,
          duracao: f.atraso + f.pulsos * f.intervalo,
          idade: 0,
          segue: f.segueCursor,
          presa: f.centradaNoLancador && f.acompanha,
          tempoDentro: new Map(),
        });
        break;
      }
      case 'dash': {
        const distancia = f.ateOCursor
          ? Math.min(f.distancia, Math.hypot(alvo.x - e.pos.x, alvo.y - e.pos.y))
          : f.distancia;
        forcarMovimento(e, dir, distancia, f.velocidade, f.atravessaCorpos, f.atravessaParedes);
        if (f.imune > 0) {
          aplicarEstado(
            e,
            { tipo: 'imune', restante: distancia / f.velocidade + f.imune },
            this.cfg.estados,
          );
        }
        if (e.forcado) {
          e.forcado.carga = carga;
          e.forcado.atingidos = new Set();
          e.forcado.inicio = origem;
        }
        if (def.retorno && eco === undefined) {
          slot.retornoAte = mundo.tick + Math.round(def.retorno.janela / mundo.dt);
          slot.retornoDe = { ...origem };
        }
        break;
      }
      case 'alvo': {
        const t = this.acharAlvo(mundo, e, slot, alvo);
        if (t) this.golpeNoAlvo(mundo, e, carga, t, f);
        break;
      }
      case 'propria':
        break;
    }
  }

  /**
   * Põe no chão a área de uma habilidade em nome de alguém, fora do lançamento (o chão em chamas de
   * Semente de Abóbora). Usa os atributos do dono e o posto 1.
   */
  criarArea(dono: Entidade, def: Habilidade, centro: V2, mult = 1): void {
    const f = def.forma;
    if (f.tipo !== 'area') return;
    this.estado.areas.push({
      id: this.estado.proximoId++,
      dono: dono.id,
      lado: dono.tipo,
      chave: def.id,
      def,
      efeitos: def.efeitos.filter((ef) => (ef.em ?? 'alvo') === 'alvo'),
      posto: 1,
      mult,
      explosao: false,
      acertos: 0,
      comAviso: def.aviso,
      centro: { ...centro },
      raio: f.raio,
      proximo: f.atraso,
      pulsosRestantes: f.pulsos,
      intervalo: f.intervalo,
      duracao: f.atraso + f.pulsos * f.intervalo,
      idade: 0,
      segue: false,
      presa: false,
      tempoDentro: new Map(),
    });
  }

  // ---------------------------------------------------------------- formas instantâneas

  /** Quem uma carga pode acertar: inimigos do lado dela; invisíveis não são mirados por inimigos. */
  private alvosDoLado(mundo: Mundo, lado: Entidade['tipo']): Entidade[] {
    return alvosDeGolpe(mundo, lado).filter((o) => lado === 'jogador' || miravel(o));
  }

  private golpeEmLinha(
    mundo: Mundo,
    carga: Carga,
    de: V2,
    dir: V2,
    alcance: number,
    largura: number,
    perfura: boolean,
  ): void {
    // Um ataque inimigo em linha para na primeira cobertura do caminho (os tijolos do Dono).
    if (carga.lado === 'inimigo') {
      for (const c of mundo.entidades) {
        if (!c.marcas?.cobertura) continue;
        const a = (c.pos.x - de.x) * dir.x + (c.pos.y - de.y) * dir.y;
        if (a <= 0 || a >= alcance) continue;
        const ponta = { x: de.x + dir.x * alcance, y: de.y + dir.y * alcance };
        if (distanciaAoSegmento(c.pos, de, ponta) <= largura / 2 + c.raio) alcance = a;
      }
    }
    const fim = { x: de.x + dir.x * alcance, y: de.y + dir.y * alcance };
    const ao = (o: Entidade) => (o.pos.x - de.x) * dir.x + (o.pos.y - de.y) * dir.y;
    const atingidos = this.alvosDoLado(mundo, carga.lado)
      .filter((o) => distanciaAoSegmento(o.pos, de, fim) <= largura / 2 + o.raio)
      .sort((p, q) => ao(p) - ao(q));
    for (const o of perfura ? atingidos : atingidos.slice(0, 1)) this.acertar(mundo, carga, o, 1);
    this.quaseAcertoLinha(mundo, carga, de, fim, largura);
    mundo.eventos.push({
      tipo: 'golpeLinha',
      chave: carga.chave,
      dono: carga.dono,
      lado: carga.lado,
      de: { ...de },
      ate: fim,
      largura,
    });
  }

  private golpeEmCone(
    mundo: Mundo,
    carga: Carga,
    de: V2,
    dir: V2,
    alcance: number,
    angulo: number,
  ): void {
    const meio = ((angulo / 2) * Math.PI) / 180;
    for (const o of this.alvosDoLado(mundo, carga.lado)) {
      const v = { x: o.pos.x - de.x, y: o.pos.y - de.y };
      const d = comprimento(v);
      if (d - o.raio > alcance) continue;
      if (d > o.raio) {
        const cos = (v.x * dir.x + v.y * dir.y) / d;
        const folga = Math.asin(Math.min(1, o.raio / d));
        if (Math.acos(Math.max(-1, Math.min(1, cos))) > meio + folga) continue;
      }
      this.acertar(mundo, carga, o, 1);
    }
    mundo.eventos.push({
      tipo: 'golpeCone',
      chave: carga.chave,
      dono: carga.dono,
      lado: carga.lado,
      de: { ...de },
      dir,
      alcance,
      angulo,
    });
  }

  private golpeNoAlvo(
    mundo: Mundo,
    e: Entidade,
    carga: Carga,
    t: Entidade,
    f: Extract<Habilidade['forma'], { tipo: 'alvo' }>,
  ): void {
    const def = carga.def;
    const ir = (): void => {
      if (!vivo(e) || !vivo(t)) return;
      const d = direcao(e.pos, t.pos);
      if (f.aparecerAtras) {
        const k = t.raio + e.raio + 0.05;
        const atras = { x: t.pos.x + d.x * k, y: t.pos.y + d.y * k };
        if (!pontoNaParede(mundo, atras)) {
          e.pos = atras;
          e.posAnterior = { ...atras };
        }
        e.olhar = { x: -d.x, y: -d.y };
      } else if (f.salto > 0) {
        const dist = Math.max(
          0,
          Math.hypot(t.pos.x - e.pos.x, t.pos.y - e.pos.y) - t.raio - e.raio,
        );
        forcarMovimento(e, d, Math.min(f.salto, dist), f.velocidadeSalto, true, false);
      }
      const antes = t.combate!.coragem;
      this.acertar(mundo, carga, t, 1);
      const dano = antes - (t.combate?.coragem ?? 0);
      if (def.curaPorDano > 0 && dano > 0) curar(mundo, e, dano * def.curaPorDano, carga.chave);
      if (!vivo(t) && def.reiniciaAoAbater) {
        const s = e.lancador?.slots[carga.chave];
        if (s) s.recarga = 0;
        mundo.eventos.push({ tipo: 'recargaReiniciada', id: e.id, tecla: carga.chave });
        const salto = def.saltaAoAbater;
        if (salto) {
          const prox = this.alvosDoLado(mundo, carga.lado)
            .filter((o) => Math.hypot(o.pos.x - t.pos.x, o.pos.y - t.pos.y) <= salto.raio)
            .sort((a, b) => a.combate!.coragem - b.combate!.coragem)[0];
          if (prox) {
            this.estado.adiados.push({
              faltam: f.atraso,
              executar: () => this.golpeNoAlvo(mundo, e, carga, prox, f),
            });
          }
        }
      }
    };
    if (def.medoAntes > 0) {
      aplicarEstado(t, { tipo: 'medo', restante: def.medoAntes, de: e.pos }, this.cfg.estados);
    }
    mundo.eventos.push({
      tipo: 'marcouAlvo',
      dono: e.id,
      alvo: t.id,
      chave: carga.chave,
      atraso: f.atraso,
    });
    if (f.atraso > 0) this.estado.adiados.push({ faltam: f.atraso, executar: ir });
    else ir();
  }

  // ---------------------------------------------------------------- efeitos

  /** Aplica todos os efeitos de uma carga num alvo atingido e conta o acerto. */
  acertar(mundo: Mundo, carga: Carga, alvo: Entidade, intervalo: number): void {
    if (!vivo(alvo)) return;
    // Objeto quebrável: só o dano vale (sem Susto, sem estados, sem interromper ninguém).
    if (alvo.marcas?.quebravel) {
      for (const ef of carga.efeitos)
        if (ef.tipo === 'dano') this.aplicarEfeito(mundo, carga, alvo, ef, intervalo);
      avisarObjetoAtingido(mundo, alvo);
      return;
    }
    if (carga.explosao) this.explodirCaldeirao(mundo, carga, alvo.pos, alvo.id);
    for (const ef of carga.efeitos) this.aplicarEfeito(mundo, carga, alvo, ef, intervalo);
    carga.acertos++;
    mundo.eventos.push({
      tipo: 'acerto',
      dono: carga.dono,
      alvo: alvo.id,
      chave: carga.chave,
      n: carga.acertos,
      cargaId: carga.id,
    });
    this.talvezInterromper(mundo, carga.lado, carga.dono, alvo);
  }

  /** Acertar um inimigo durante o aviso dele cancela o ataque (exceto chefes). */
  talvezInterromper(mundo: Mundo, lado: Entidade['tipo'], por: IdEntidade, alvo: Entidade): void {
    const l = alvo.lancador;
    if (lado !== 'jogador' || !l?.lancando || alvo.combate?.chefe) return;
    if (!l.slots[l.lancando.chave]?.def.aviso) return;
    l.lancando = null;
    mundo.eventos.push({ tipo: 'interrompeu', por, id: alvo.id, pos: { ...alvo.pos } });
  }

  aplicarEfeito(mundo: Mundo, carga: Carga, alvo: Entidade, ef: Efeito, intervalo: number): void {
    const dono = entidade(mundo, carga.dono);
    const attr = dono?.combate?.attr ?? { forca: 0, feitico: 0, coragemMax: 0 };
    const est = this.cfg.estados;
    switch (ef.tipo) {
      case 'dano': {
        let bruto = danoBruto(ef, carga.posto, attr) * (ef.porSegundo ? intervalo : 1) * carga.mult;
        const c = alvo.combate;
        if (ef.percentualDoAlvo && c) {
          bruto += c.attr.coragemMax * ef.percentualDoAlvo * (ef.porSegundo ? intervalo : 1);
        }
        if (ef.multAbaixoDe && c && c.coragem / c.attr.coragemMax < ef.multAbaixoDe.fracao) {
          bruto *= ef.multAbaixoDe.mult;
        }
        causarDano(mundo, alvo, {
          origem: carga.dono,
          bruto,
          tipo: carga.lado === 'jogador' ? 'habilidade' : 'ataque',
          podeCritar: carga.lado === 'jogador',
          comAviso: carga.comAviso,
          fonte: carga.chave,
          rouboExtra: ef.roubo,
          verdadeiro: ef.verdadeiro,
        });
        break;
      }
      case 'lentidao':
        aplicarEstado(alvo, { tipo: 'lentidao', valor: ef.valor, restante: ef.duracao }, est);
        break;
      case 'atordoar':
        aplicarEstado(alvo, { tipo: 'atordoado', restante: ef.duracao }, est);
        break;
      case 'enraizar':
        aplicarEstado(alvo, { tipo: 'enraizado', restante: ef.duracao }, est);
        break;
      case 'medo':
        aplicarEstado(
          alvo,
          { tipo: 'medo', restante: ef.duracao, de: dono ? { ...dono.pos } : { ...alvo.pos } },
          est,
        );
        break;
      case 'provocar':
        aplicarEstado(alvo, { tipo: 'provocado', restante: ef.duracao, alvo: carga.dono }, est);
        break;
      case 'marca':
        aplicarEstado(
          alvo,
          { tipo: 'marca', restante: ef.duracao, bonus: ef.bonus, origem: carga.dono },
          est,
        );
        break;
      case 'fragil':
        aplicarEstado(alvo, { tipo: 'fragil', restante: ef.duracao, valor: ef.valor }, est);
        break;
      case 'invisivel': {
        const naLuz = mundo.luz?.iluminado(alvo.pos) ?? false;
        const d = naLuz && ef.duracaoNaLuz !== undefined ? ef.duracaoNaLuz : ef.duracao;
        aplicarEstado(
          alvo,
          {
            tipo: 'invisivel',
            restante: d,
            ...(ef.renovaAoAbater ? { renova: d } : {}),
            ...(ef.aoSair ? { aoSair: ef.aoSair } : {}),
          },
          est,
        );
        break;
      }
      case 'imune':
        aplicarEstado(alvo, { tipo: 'imune', restante: ef.duracao }, est);
        break;
      case 'escudo': {
        const valor =
          valorPorPosto(ef.base, carga.posto) +
          ef.razaoCoragemMax * (alvo.combate?.attr.coragemMax ?? 0);
        aplicarEstado(
          alvo,
          {
            tipo: 'escudo',
            valor: valor * ef.fracao,
            restante: ef.duracao,
            origem: carga.chave,
            devolve: ef.devolve,
            espinhos: ef.espinhos,
          },
          est,
        );
        break;
      }
      case 'cura': {
        const max = alvo.combate?.attr.coragemMax ?? 0;
        curar(mundo, alvo, max * ef.percentual * (ef.porSegundo ? intervalo : 1), carga.chave);
        break;
      }
      case 'bonus': {
        // O mesmo bônus da mesma habilidade não empilha: renova (a Névoa reaplica a cada pulso).
        const origem = `${carga.chave}:${ef.atributo}`;
        const atual = alvo.combate?.mods.find((m) => m.origem === origem);
        if (atual) {
          atual.restante = Math.max(atual.restante ?? 0, ef.duracao);
          break;
        }
        alvo.combate?.mods.push({
          origem,
          atributo: ef.atributo,
          soma: ef.soma,
          mult: ef.mult,
          restante: ef.duracao,
        });
        break;
      }
      case 'empurrar': {
        if (!dono || alvo.combate?.chefe || ef.distancia <= 0) break;
        let d = direcao(dono.pos, alvo.pos);
        if (ef.modo === 'lado' && dono.forcado) {
          const f = dono.forcado.dir;
          const lado =
            f.x * (alvo.pos.y - dono.pos.y) - f.y * (alvo.pos.x - dono.pos.x) >= 0 ? 1 : -1;
          d = { x: -f.y * lado, y: f.x * lado };
        }
        if (ef.modo === 'puxar') d = { x: -d.x, y: -d.y };
        forcarMovimento(alvo, d, ef.distancia, ef.velocidade, false, false);
        if (alvo.forcado && ef.atordoaNaParede > 0)
          alvo.forcado.atordoaNaParede = ef.atordoaNaParede;
        break;
      }
      case 'banquete': {
        const c = alvo.combate;
        if (!c) break;
        c.estados = c.estados.filter((x) => x.tipo !== 'banquete');
        c.estados.push({
          tipo: 'banquete',
          restante: ef.duracao,
          rouboVida: ef.rouboVida,
          porGolpe: ef.porGolpe,
          maxVelocidade: ef.maxVelocidade,
          prolongaAoAbater: ef.prolongaAoAbater,
          curaAoFim: ef.curaAoFim,
          golpes: 0,
          aplicados: -1,
        });
        break;
      }
      case 'gratis': {
        const s = alvo.lancador?.slots[ef.tecla];
        if (s) s.gratis = true;
        break;
      }
      case 'dot': {
        const total = danoBruto(ef, carga.posto, attr) * ef.fracao * carga.mult;
        aplicarEstado(
          alvo,
          {
            tipo: 'dot',
            restante: ef.duracao,
            porSegundo: total / ef.duracao,
            origem: carga.dono,
            acumulado: 0,
          },
          est,
        );
        break;
      }
    }
  }

  /**
   * Explosão do Caldeirão: no primeiro acerto da habilidade fortalecida, atinge quem está em volta
   * (menos `exceto`) com o bônus de dano aplicado sobre o primeiro efeito de dano.
   */
  /**
   * Estouro (Vassoura no fim do voo, Salto no pouso): uma fração do dano da habilidade em quem está
   * no raio (menos `jaAtingidos`, que levaram o golpe cheio) e um empurrão para longe do centro.
   */
  private estourar(
    mundo: Mundo,
    carga: Carga,
    centro: V2,
    jaAtingidos: ReadonlySet<IdEntidade>,
  ): void {
    const est = carga.def.estouro;
    const dono = entidade(mundo, carga.dono);
    if (!est || !dono?.combate) return;
    mundo.eventos.push({
      tipo: 'estouro',
      dono: carga.dono,
      chave: carga.chave,
      lado: carga.lado,
      centro: { ...centro },
      raio: est.raio,
    });
    const dano = carga.efeitos.find((e): e is EfeitoDano => e.tipo === 'dano');
    const bruto = dano
      ? danoBruto(dano, carga.posto, dono.combate.attr) * est.fracaoDano * carga.mult
      : 0;
    for (const alvo of this.alvosDoLado(mundo, carga.lado)) {
      const dx = alvo.pos.x - centro.x;
      const dy = alvo.pos.y - centro.y;
      const d = Math.hypot(dx, dy);
      if (d > est.raio + alvo.raio) continue;
      if (bruto > 0 && !jaAtingidos.has(alvo.id)) {
        causarDano(mundo, alvo, {
          origem: carga.dono,
          bruto,
          tipo: 'explosao',
          fonte: carga.chave,
        });
        this.talvezInterromper(mundo, carga.lado, carga.dono, alvo);
      }
      if (est.empurrao > 0 && vivo(alvo) && !alvo.combate?.chefe) {
        const dir =
          d > EPS
            ? { x: dx / d, y: dy / d }
            : carga.lado === 'jogador'
              ? dono.olhar
              : DIRECAO_PADRAO;
        forcarMovimento(alvo, dir, est.empurrao, est.empurrao * 10, false, false);
      }
    }
  }

  private explodirCaldeirao(
    mundo: Mundo,
    carga: Carga,
    centro: V2,
    exceto: IdEntidade | null,
  ): void {
    carga.explosao = false;
    const dono = entidade(mundo, carga.dono);
    const p = dono?.lancador?.passiva;
    if (!dono || !p || p.tipo !== 'caldeirao') return;
    mundo.eventos.push({ tipo: 'explosaoCaldeirao', centro: { ...centro }, raio: p.raioExplosao });
    const dano = carga.efeitos.find((e): e is EfeitoDano => e.tipo === 'dano');
    if (!dano) return;
    const bruto = danoBruto(dano, carga.posto, dono.combate!.attr) * p.bonusDano;
    for (const alvo of this.alvosDoLado(mundo, carga.lado)) {
      if (alvo.id === exceto) continue;
      if (Math.hypot(alvo.pos.x - centro.x, alvo.pos.y - centro.y) <= p.raioExplosao + alvo.raio) {
        causarDano(mundo, alvo, {
          origem: carga.dono,
          bruto,
          tipo: 'explosao',
          fonte: 'caldeirao',
        });
      }
    }
  }

  // ---------------------------------------------------------------- desvio por pouco

  private jogadoresAvisados(mundo: Mundo, carga: Carga): Entidade[] {
    if (!carga.comAviso) return [];
    return mundo.entidades.filter((e) => e.tipo === 'jogador' && vivo(e));
  }

  private quaseAcertoLinha(mundo: Mundo, carga: Carga, a: V2, b: V2, largura: number): void {
    for (const j of this.jogadoresAvisados(mundo, carga)) {
      const folga = distanciaAoSegmento(j.pos, a, b) - largura / 2 - j.raio;
      if (folga > 0 && folga <= this.cfg.quaseAcertoTiles) {
        mundo.eventos.push({ tipo: 'quaseAcerto', id: j.id });
      }
    }
  }

  private quaseAcertoCirculo(mundo: Mundo, carga: Carga, centro: V2, raio: number): void {
    for (const j of this.jogadoresAvisados(mundo, carga)) {
      const folga = Math.hypot(j.pos.x - centro.x, j.pos.y - centro.y) - raio - j.raio;
      if (folga > 0 && folga <= this.cfg.quaseAcertoTiles) {
        mundo.eventos.push({ tipo: 'quaseAcerto', id: j.id });
      }
    }
  }

  // ---------------------------------------------------------------- por tick

  private antesDeMover(mundo: Mundo, acoes: readonly Acao[]): void {
    const dt = mundo.dt;
    for (const e of mundo.entidades) {
      const l = e.lancador;
      if (!l) continue;
      for (const [chave, s] of Object.entries(l.slots)) {
        if (s.recarga <= 0) {
          if (s.def.cargas <= 1) s.cargas = s.def.cargas;
          continue;
        }
        s.recarga = Math.max(0, s.recarga - dt);
        if (s.recarga <= 0 && s.def.cargas > 1) {
          s.cargas = Math.min(s.def.cargas, s.cargas + 1);
          if (s.cargas < s.def.cargas && e.combate) {
            s.recarga = this.recargaDe(e, chave, s);
            s.recargaTotal = s.recarga;
          }
        }
      }
      if (l.lancando) {
        if (l.interrompido || !vivo(e)) {
          const s = l.slots[l.lancando.chave];
          if (s && e.combate) {
            s.recarga = this.recargaDe(e, l.lancando.chave, s) * this.cfg.fracaoRecargaInterrompida;
            s.recargaTotal = s.recarga;
          }
          mundo.eventos.push({ tipo: 'lancamentoInterrompido', id: e.id, tecla: l.lancando.chave });
          l.lancando = null;
        } else {
          l.lancando.restante -= dt;
          if (l.lancando.restante <= EPS) {
            const { chave, alvo } = l.lancando;
            l.lancando = null;
            this.executar(mundo, e, chave, alvo);
          }
        }
      }
      l.interrompido = false;
    }
    for (const a of acoes) {
      if (a.tipo !== 'lancar') continue;
      const e = entidade(mundo, a.id);
      if (e) this.pedir(mundo, e, a.tecla, a.alvo);
    }
    for (const e of mundo.entidades) {
      const l = e.lancador;
      if (!l) continue;
      // Comando guardado: sai assim que a ação atual termina.
      if (l.guardado && !l.lancando && !e.forcado) {
        const g = l.guardado;
        l.guardado = null;
        if (g.ate >= mundo.tick) this.pedir(mundo, e, g.chave, g.alvo);
      }
      // Lançar é com o lançador parado.
      if (l.lancando) e.multVelocidade = 0;
    }
  }

  private depoisDeMover(mundo: Mundo): void {
    this.dashes(mundo);
    this.moverProjeteis(mundo);
    this.pulsarAreas(mundo);
    this.queimarRastros(mundo);
    for (const a of this.estado.adiados) a.faltam -= mundo.dt;
    const prontos = this.estado.adiados.filter((a) => a.faltam <= EPS);
    this.estado.adiados = this.estado.adiados.filter((a) => a.faltam > EPS);
    for (const a of prontos) a.executar(mundo);
  }

  /** Quem está em dash com efeitos acerta cada inimigo que encostar, uma vez por dash. */
  private dashes(mundo: Mundo): void {
    for (const e of mundo.entidades) {
      // O dash que acabou neste tick ainda acerta onde parou e fecha (rastro, desvio por pouco).
      const f = e.forcado ?? e.forcadoAcabou;
      const carga = f?.carga;
      if (!f || !carga) continue;
      for (const o of this.alvosDoLado(mundo, carga.lado)) {
        if (f.atingidos!.has(o.id)) continue;
        if (Math.hypot(o.pos.x - e.pos.x, o.pos.y - e.pos.y) > e.raio + o.raio + 0.1) continue;
        f.atingidos!.add(o.id);
        this.acertar(mundo, carga, o, 1);
      }
      if (f.restante > EPS) continue;
      if (carga.def.estouro && !f.estourou) {
        f.estourou = true;
        this.estourar(mundo, carga, e.pos, new Set());
      }
      const r = carga.def.rastro;
      if (r && f.inicio) {
        this.estado.rastros.push({
          ...carga,
          id: this.estado.proximoId++,
          efeitos: r.efeitos,
          a: { ...f.inicio },
          b: { ...e.pos },
          largura: r.largura,
          restante: r.duracao,
          proximo: 0,
          intervalo: r.intervalo,
        });
      }
      if (carga.comAviso) this.quaseAcertoLinha(mundo, carga, f.inicio ?? e.pos, e.pos, e.raio * 2);
    }
  }

  private moverProjeteis(mundo: Mundo): void {
    const fim = new Set<number>();
    for (const p of this.estado.projeteis) {
      p.posAnterior = { ...p.pos };
      if (p.alvo !== null) {
        const t = entidade(mundo, p.alvo);
        if (!t || !vivo(t)) {
          fim.add(p.id);
          continue;
        }
        p.dir = direcao(p.pos, t.pos);
        p.restante = Math.max(p.restante, Math.hypot(t.pos.x - p.pos.x, t.pos.y - p.pos.y) + 1);
      } else if (p.lado !== 'jogador' && this.curvaInimigos !== 0) {
        // Ventania: os projéteis inimigos fazem curva.
        const t = (this.curvaInimigos * Math.PI * mundo.dt) / 180;
        p.dir = {
          x: p.dir.x * Math.cos(t) - p.dir.y * Math.sin(t),
          y: p.dir.x * Math.sin(t) + p.dir.y * Math.cos(t),
        };
      }
      let falta = Math.min(p.velocidade * mundo.dt, p.restante);
      p.restante -= falta;
      while (falta > EPS && !fim.has(p.id)) {
        const d = Math.min(PASSO_PROJETIL_TILES, falta);
        falta -= d;
        p.pos = { x: p.pos.x + p.dir.x * d, y: p.pos.y + p.dir.y * d };
        if (p.alvo === null && pontoNaParede(mundo, p.pos)) {
          fim.add(p.id);
          break;
        }
        for (const alvo of this.alvosDoLado(mundo, p.lado)) {
          if (p.atingidos.has(alvo.id)) continue;
          if (p.alvo !== null && alvo.id !== p.alvo) continue;
          const dist = Math.hypot(alvo.pos.x - p.pos.x, alvo.pos.y - p.pos.y);
          if (dist > p.largura / 2 + alvo.raio) continue;
          p.atingidos.add(alvo.id);
          if (p.golpe) {
            if (alvo.marcas?.quebravel) golpearObjeto(mundo, alvo, p.golpe);
            else {
              causarDano(mundo, alvo, p.golpe);
              mundo.eventos.push({ tipo: 'acertoAuto', dono: p.dono, alvo: alvo.id });
              this.talvezInterromper(mundo, p.lado, p.dono, alvo);
            }
            fim.add(p.id);
            break;
          }
          this.acertar(mundo, p, alvo, 1);
          if (p.def.empurraAoAcertar > 0 && !alvo.combate?.chefe) {
            const dist2 = p.def.empurraAoAcertar;
            forcarMovimento(alvo, p.dir, dist2, dist2 * 10, false, false);
          }
          const r = p.def.ricochete;
          if (p.saltos > 0 && r) {
            const prox = this.alvosDoLado(mundo, p.lado)
              .filter((o) => !p.atingidos.has(o.id))
              .map((o) => ({ o, d: Math.hypot(o.pos.x - alvo.pos.x, o.pos.y - alvo.pos.y) }))
              .filter((x) => x.d <= r.raio)
              .sort((a, b) => a.d - b.d)[0];
            if (prox) {
              // Cada salto causa a fração do dano do primeiro acerto (não encolhe a cada salto).
              if (p.saltos === r.alvos) p.mult *= r.fracao;
              p.saltos--;
              p.alvo = prox.o.id;
              p.restante = prox.d + 1;
              continue;
            }
          }
          if (!p.perfura) {
            fim.add(p.id);
            break;
          }
        }
      }
      if (p.restante <= EPS) fim.add(p.id);
    }
    for (const p of this.estado.projeteis) {
      if (fim.has(p.id)) {
        if (p.def.estouro && !p.golpe) this.estourar(mundo, p, p.pos, p.atingidos);
        mundo.eventos.push({
          tipo: 'projetilFim',
          pos: { ...p.pos },
          chave: p.chave,
          lado: p.lado,
        });
      }
    }
    this.estado.projeteis = this.estado.projeteis.filter((p) => !fim.has(p.id));
  }

  private dentro(o: Entidade, a: Area): boolean {
    if (a.def.forma.tipo === 'area' && a.def.forma.quadrada) {
      const m = a.raio + o.raio;
      return Math.abs(o.pos.x - a.centro.x) <= m && Math.abs(o.pos.y - a.centro.y) <= m;
    }
    return Math.hypot(o.pos.x - a.centro.x, o.pos.y - a.centro.y) <= a.raio + o.raio;
  }

  private pulsarAreas(mundo: Mundo): void {
    const fim = new Set<number>();
    for (const a of this.estado.areas) {
      a.idade += mundo.dt;
      a.proximo -= mundo.dt;
      const dono = entidade(mundo, a.dono);
      if (a.presa && dono) a.centro = { ...dono.pos };
      if (a.segue && dono?.mira) {
        const f = a.def.forma;
        const alvo = f.tipo === 'area' ? pontoNoAlcance(dono.pos, dono.mira, f.alcance) : dono.mira;
        const d = Math.hypot(alvo.x - a.centro.x, alvo.y - a.centro.y);
        const passo = a.def.velocidadeSeguir * mundo.dt;
        if (d > EPS) {
          const k = Math.min(1, passo / d);
          a.centro = {
            x: a.centro.x + (alvo.x - a.centro.x) * k,
            y: a.centro.y + (alvo.y - a.centro.y) * k,
          };
        }
      }
      for (const o of this.alvosDoLado(mundo, a.lado)) {
        const v = { x: o.pos.x - a.centro.x, y: o.pos.y - a.centro.y };
        const d = comprimento(v);
        // Ossuário: quem estava dentro não sai.
        if (a.def.confina && a.tempoDentro.has(o.id) && d > a.raio - o.raio) {
          const k = Math.max(0, a.raio - o.raio) / Math.max(d, EPS);
          o.pos = { x: a.centro.x + v.x * k, y: a.centro.y + v.y * k };
        }
        if (!this.dentro(o, a)) {
          if (!a.def.confina) a.tempoDentro.delete(o.id);
          continue;
        }
        const t = (a.tempoDentro.get(o.id) ?? 0) + mundo.dt;
        a.tempoDentro.set(o.id, t);
        const g = a.def.enraizaSeFicar;
        if (g && t >= g.segundos && t - mundo.dt < g.segundos) {
          aplicarEstado(o, { tipo: 'enraizado', restante: g.duracao }, this.cfg.estados);
        }
      }
      while (a.pulsosRestantes > 0 && a.proximo <= EPS) {
        a.pulsosRestantes--;
        a.proximo += a.intervalo;
        mundo.eventos.push({
          tipo: 'pulso',
          tecla: a.chave,
          lado: a.lado,
          centro: { ...a.centro },
          raio: a.raio,
          dono: a.dono,
          final: false,
        });
        if (a.explosao) this.explodirCaldeirao(mundo, a, a.centro, null);
        for (const alvo of this.alvosDoLado(mundo, a.lado)) {
          if (this.dentro(alvo, a)) this.acertar(mundo, a, alvo, a.intervalo);
        }
        for (const ef of a.def.afetaAliados) {
          for (const alvo of mundo.entidades) {
            if (alvo.tipo === a.lado && vivo(alvo) && this.dentro(alvo, a)) {
              this.aplicarEfeito(mundo, a, alvo, ef, a.intervalo);
            }
          }
        }
        this.quaseAcertoCirculo(mundo, a, a.centro, a.raio);
      }
      if (a.pulsosRestantes <= 0 && a.idade >= a.duracao - EPS) {
        fim.add(a.id);
        this.fecharArea(mundo, a);
      }
    }
    this.estado.areas = this.estado.areas.filter((a) => !fim.has(a.id));
  }

  /** O que acontece quando a área some (Poção Explosiva, Ossuário). */
  private fecharArea(mundo: Mundo, a: Area): void {
    const fecha = a.def.aoFechar;
    if (fecha.length === 0) return;
    mundo.eventos.push({
      tipo: 'pulso',
      tecla: a.chave,
      lado: a.lado,
      centro: { ...a.centro },
      raio: a.raio,
      dono: a.dono,
      final: true,
    });
    const carga = { ...a, efeitos: fecha };
    for (const alvo of this.alvosDoLado(mundo, a.lado)) {
      if (this.dentro(alvo, a)) this.acertar(mundo, carga, alvo, 1);
    }
  }

  private queimarRastros(mundo: Mundo): void {
    for (const r of this.estado.rastros) {
      r.restante -= mundo.dt;
      r.proximo -= mundo.dt;
      if (r.proximo > EPS) continue;
      r.proximo += r.intervalo;
      for (const o of this.alvosDoLado(mundo, r.lado)) {
        if (distanciaAoSegmento(o.pos, r.a, r.b) <= r.largura / 2 + o.raio) {
          this.acertar(mundo, r, o, r.intervalo);
        }
      }
    }
    this.estado.rastros = this.estado.rastros.filter((r) => r.restante > 0);
  }

  /** Projétil teleguiado de auto-ataque: no acerto aplica o golpe pronto. */
  dispararTeleguiado(
    _mundo: Mundo,
    dono: Entidade,
    alvo: Entidade,
    velocidade: number,
    golpe: Golpe,
    def: Habilidade,
  ): void {
    this.estado.projeteis.push({
      id: this.estado.proximoId++,
      dono: dono.id,
      lado: dono.tipo,
      chave: 'auto',
      def,
      efeitos: [],
      posto: 1,
      mult: 1,
      explosao: false,
      acertos: 0,
      comAviso: false,
      pos: { ...dono.pos },
      posAnterior: { ...dono.pos },
      dir: direcao(dono.pos, alvo.pos),
      velocidade,
      largura: 0.3,
      perfura: false,
      restante: Math.hypot(alvo.pos.x - dono.pos.x, alvo.pos.y - dono.pos.y) + 1,
      atingidos: new Set(),
      alvo: alvo.id,
      saltos: 0,
      golpe,
    });
  }

  /** Projétil reto disparado por regra (ovos, tiros do Poste), sem passar pelo lançador. */
  dispararLinear(
    _mundo: Mundo,
    dono: Entidade,
    dir: V2,
    velocidade: number,
    alcance: number,
    golpe: Golpe,
    def: Habilidade,
    largura = 0.3,
  ): void {
    this.estado.projeteis.push({
      id: this.estado.proximoId++,
      dono: dono.id,
      lado: dono.tipo,
      chave: def.id,
      def,
      efeitos: [],
      posto: 1,
      mult: 1,
      explosao: false,
      acertos: 0,
      comAviso: golpe.comAviso ?? false,
      pos: { ...dono.pos },
      posAnterior: { ...dono.pos },
      dir,
      velocidade,
      largura,
      perfura: false,
      restante: alcance,
      atingidos: new Set(),
      alvo: null,
      saltos: 0,
      golpe,
    });
  }
}
