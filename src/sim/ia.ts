import { definirModificadores, miravel, podeAgir, podeMover, temEstado, vivo } from './combate';
import type { CampoDeFluxo } from './campoDeFluxo';
import { papelNoCerco } from './cerco';
import type { DefInimigo, Inimigos } from './content/esquemas';
import type { V2 } from './geometria';
import type { Executor } from './habilidades';
import type { MapaDeLuz } from './luz';
import type { Entidade, Mundo, Sistema } from './mundo';
import { esquivar, flanquear, mirarAdiante, saidaDeArea, separar, sorteioFixo } from './taticas';

/** Estado de IA guardado na entidade (e.ia). */
export interface EstadoIA {
  estado: string;
  def: string;
  /** Último alvo do Poste e quantos tiros seguidos nele (rampa de +10%). */
  ultimoAlvo?: number;
  seguidos?: number;
  /** Tick do último tiro do Poste (uma pausa longa zera a rampa). */
  ultimoTiro?: number;
  /** Onde o alvo estava há um segundo (a Abóbora prioriza quem está parado). */
  pontoAntigo?: V2;
  relogio?: number;
  [chave: string]: unknown;
}

export interface ContextoIA {
  executor: Executor;
  campo: CampoDeFluxo;
  luz: MapaDeLuz;
  defs: Readonly<Record<string, DefInimigo>>;
  /** Raio de atração da Doce-isca. */
  raioIsca: number;
  /** Comportamentos extras (elites, selvagens, chefes) registrados por outras regras. */
  extras?: Record<string, Comportamento>;
  /** Cerco das pestinhas e reações (inimigos.json → reacoes); sem ele, o jeito antigo. */
  reacoes?: Inimigos['reacoes'];
}

/** Hesitando (um aliado caiu perto): fica parado até o tick marcado. */
function hesitando(mundo: Mundo, e: Entidade): boolean {
  const ate = (e.ia as EstadoIA | undefined)?.hesitaAte;
  return typeof ate === 'number' && ate > mundo.tick;
}

export function ehIsca(e: Entidade): boolean {
  return !!e.marcas?.isca;
}

/** O jogador de verdade (a Doce-isca também é do lado do jogador, mas não conta). */
export function heroiDe(mundo: Mundo): Entidade | undefined {
  // A Criança Perdida anda do lado do jogador, mas ninguém a persegue.
  return mundo.entidades.find((e) => e.tipo === 'jogador' && !ehIsca(e) && !e.marcas?.crianca);
}

function distancia(a: V2, b: V2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function parar(e: Entidade): void {
  e.direcao = { x: 0, y: 0 };
  e.destino = null;
}

/** Anda na direção dada (unitária) e vira para ela. */
function andar(e: Entidade, dir: V2): void {
  e.direcao = dir;
  e.destino = null;
  if (dir.x !== 0 || dir.y !== 0) e.olhar = dir;
}

function rumoA(e: Entidade, alvo: Entidade, ctx: ContextoIA): V2 {
  if (alvo.tipo === 'jogador' && !ehIsca(alvo)) return ctx.campo.direcao(e.pos, alvo.pos);
  const d = distancia(e.pos, alvo.pos);
  return d < 1e-6
    ? { x: 0, y: 0 }
    : { x: (alvo.pos.x - e.pos.x) / d, y: (alvo.pos.y - e.pos.y) / d };
}

/**
 * Quem o inimigo persegue: quem o provocou; senão, uma Doce-isca a até 5 tiles dele; senão, o
 * jogador (se não estiver invisível e, para vigias, se estiver à vista).
 */
export function alvoDe(
  mundo: Mundo,
  e: Entidade,
  ctx: ContextoIA,
  enxerga = (_j: Entidade) => true,
): Entidade | null {
  const prov = e.combate?.estados.find((s) => s.tipo === 'provocado');
  if (prov && prov.tipo === 'provocado') {
    const t = mundo.entidades.find((x) => x.id === prov.alvo);
    if (t && vivo(t)) return t;
  }
  let isca: Entidade | null = null;
  let melhor = Infinity;
  for (const x of mundo.entidades) {
    if (!ehIsca(x) || !vivo(x)) continue;
    const d = distancia(x.pos, e.pos);
    if (d <= ctx.raioIsca && d < melhor) {
      melhor = d;
      isca = x;
    }
  }
  if (isca) return isca;
  const j = heroiDe(mundo);
  if (j && miravel(j) && enxerga(j)) return j;
  return null;
}

/** Vigias e torres: na luz enxergam longe; na sombra, só de perto. */
export function visivelPara(
  e: Entidade,
  j: Entidade,
  ctx: ContextoIA,
  alcance: number,
  naSombra: number,
): boolean {
  const d = distancia(e.pos, j.pos);
  const iluminado = ctx.luz.iluminado(j.pos);
  // Noite Eterna (Conjunto Sombra de 4): na sombra, os vigias não veem o jogador.
  if (!iluminado && j.marcas?.noiteEterna) return false;
  if (iluminado) return d <= alcance;
  return d <= naSombra;
}

export type Comportamento = (mundo: Mundo, e: Entidade, def: DefInimigo, ctx: ContextoIA) => void;

/**
 * Para onde o Saco-Surpresa foge: para longe do jogador, `dist` tiles, girando a direção até achar
 * chão livre (senão fica onde está).
 */
function pontoDeFuga(e: Entidade, de: V2, dist: number, ctx: ContextoIA): V2 {
  const base = Math.atan2(e.pos.y - de.y, e.pos.x - de.x);
  for (const giro of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
    const p = {
      x: e.pos.x + Math.cos(base + giro) * dist,
      y: e.pos.y + Math.sin(base + giro) * dist,
    };
    if (ctx.campo.grade.ehLivre(p)) return p;
  }
  return { ...e.pos };
}

/**
 * Rumo até o lado de ataque `lado` (um ponto colado ao jogador): se ainda falta girar mais de ~30°,
 * contorna o jogador a `raio` tiles; perto do ângulo, encosta. Null quando já está no lugar.
 */
function rumoAoLado(e: Entidade, centro: V2, lado: V2, raio: number): V2 | null {
  const ang = Math.atan2(e.pos.y - centro.y, e.pos.x - centro.x);
  const alvoAng = Math.atan2(lado.y - centro.y, lado.x - centro.x);
  let dif = alvoAng - ang;
  while (dif > Math.PI) dif -= Math.PI * 2;
  while (dif < -Math.PI) dif += Math.PI * 2;
  const d = distancia(e.pos, centro) || 1;
  const radial = { x: (e.pos.x - centro.x) / d, y: (e.pos.y - centro.y) / d };
  if (Math.abs(dif) > 0.5) {
    // Anda em volta (tangente) e corrige o raio: nem colado, nem longe.
    const s = Math.sign(dif);
    const t = { x: -radial.y * s, y: radial.x * s };
    const corr = Math.max(-1, Math.min(1, raio - d));
    const v = { x: t.x + radial.x * corr, y: t.y + radial.y * corr };
    const n = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / n, y: v.y / n };
  }
  const dl = distancia(e.pos, lado);
  if (dl < 0.15) return null;
  return { x: (lado.x - e.pos.x) / dl, y: (lado.y - e.pos.y) / dl };
}

/** Pulo de lado se vier um projétil do jogador (chance da espécie em `reacoes.taticas`). */
export function tentarEsquiva(mundo: Mundo, e: Entidade, ctx: ContextoIA): boolean {
  const t = ctx.reacoes?.taticas;
  if (!t) return false;
  return esquivar(mundo, e, ctx.executor.estado.projeteis, t.esquiva, (q) =>
    ctx.campo.grade.ehLivre(q),
  );
}

/** Se está numa área do jogador que ainda vai pulsar, sai dela (true = já decidiu o passo). */
function sairDeArea(e: Entidade, ctx: ContextoIA): boolean {
  const t = ctx.reacoes?.taticas;
  const dir = t ? saidaDeArea(e, ctx.executor.estado.areas, t.areas) : null;
  if (!dir) return false;
  andar(e, dir);
  return true;
}

/** Rumo de perseguição com o flanco da espécie (cada um curva para um lado de longe). */
export function rumoComFlanco(e: Entidade, alvo: Entidade, dir: V2, ctx: ContextoIA): V2 {
  const t = ctx.reacoes?.taticas;
  if (!t || alvo.tipo !== 'jogador' || ehIsca(alvo)) return dir;
  return flanquear(e, alvo.pos, dir, t.flanco, (q) => ctx.campo.grade.ehLivre(q));
}

/**
 * Anda de lado em volta do alvo (strafe), trocando de sentido a cada `trocaS` segundos (com uma
 * folga fixa por inimigo) ou quando o lado está bloqueado.
 */
export function andarDeLado(
  mundo: Mundo,
  e: Entidade,
  alvo: V2,
  trocaS: number,
  livre: (p: V2) => boolean,
): void {
  const ia = e.ia as EstadoIA;
  if (ia['lado'] === undefined) ia['lado'] = e.id % 2 === 0 ? 1 : -1;
  const trocas = Number(ia['trocas'] ?? 0);
  const ate = Number(ia['ladoAte'] ?? 0);
  if (mundo.tick >= ate) {
    if (ate > 0) ia['lado'] = -Number(ia['lado']);
    ia['trocas'] = trocas + 1;
    const s = trocaS * (0.7 + 0.6 * sorteioFixo(e.id, trocas));
    ia['ladoAte'] = mundo.tick + Math.round(s / mundo.dt);
  }
  const d = distancia(e.pos, alvo) || 1;
  const para = { x: (alvo.x - e.pos.x) / d, y: (alvo.y - e.pos.y) / d };
  for (const lado of [Number(ia['lado']), -Number(ia['lado'])]) {
    const dir = { x: -para.y * lado, y: para.x * lado };
    if (livre({ x: e.pos.x + dir.x * 0.7, y: e.pos.y + dir.y * 0.7 })) {
      ia['lado'] = lado;
      andar(e, dir);
      e.olhar = para;
      return;
    }
  }
  parar(e);
  e.olhar = para;
}

/** Onde mirar a habilidade `chave` no alvo, com a antecipação da espécie (`param.antecipacao`). */
export function mira(
  mundo: Mundo,
  e: Entidade,
  alvo: Entidade,
  chave: string,
  def: DefInimigo,
): V2 {
  const h = e.lancador?.slots[chave]?.def;
  return mirarAdiante(e.pos, alvo, h, def.param['antecipacao'] ?? 0, mundo.dt);
}

const COMPORTAMENTOS: Record<string, Comportamento> = {
  /**
   * Morceguinho: voa alto em volta do jogador (ninguém acerta), mergulha numa linha anunciada no chão
   * e fica um tempo baixo (aí dá para bater) antes de subir de novo.
   */
  morcego(mundo, e, def, ctx) {
    const p = def.param;
    const ia = e.ia as EstadoIA;
    const altura = p['alturaPx'] ?? 46;
    const tick = mundo.tick;
    const subir = (): void => {
      ia.estado = 'alto';
      ia['proximo'] = tick + Math.round((p['recargaS'] ?? 2.8) / mundo.dt);
      e.marcas = { ...e.marcas, voando: true, alturaPx: altura };
      e.atravessaParedes = true;
    };
    if (ia.estado === 'inicio') {
      subir();
      // O enxame não mergulha junto: cada um começa num ponto da recarga.
      ia['proximo'] = tick + Math.round(mundo.rng.entre(0.4, p['recargaS'] ?? 2.8) / mundo.dt);
    }
    if (ia.estado === 'mergulho') {
      if (e.lancador?.lancando) return parar(e);
      // O mergulho saiu: baixo até acabar o trajeto e o tempo no chão.
      e.marcas = { ...e.marcas, voando: false, alturaPx: 0 };
      if (e.forcado) return;
      ia.estado = 'baixo';
      ia['ate'] = tick + Math.round((p['baixoS'] ?? 1.4) / mundo.dt);
      e.atravessaParedes = false;
    }
    if (ia.estado === 'baixo') {
      parar(e);
      if (tick >= Number(ia['ate'] ?? 0)) subir();
      return;
    }
    const alvo = alvoDe(mundo, e, ctx);
    if (!alvo) return parar(e);
    // Rodeia o jogador numa órbita que gira.
    const ang =
      Math.atan2(e.pos.y - alvo.pos.y, e.pos.x - alvo.pos.x) +
      (p['giroPorS'] ?? 1.1) * mundo.dt * 4;
    const orbita = p['orbita'] ?? 3.2;
    const ponto = {
      x: alvo.pos.x + Math.cos(ang) * orbita,
      y: alvo.pos.y + Math.sin(ang) * orbita,
    };
    const d = distancia(e.pos, ponto);
    if (d > 0.1) andar(e, { x: (ponto.x - e.pos.x) / d, y: (ponto.y - e.pos.y) / d });
    else parar(e);
    const chave = def.ataques[0];
    const perto = distancia(e.pos, alvo.pos) <= (p['alcanceMergulho'] ?? 6);
    if (chave && perto && tick >= Number(ia['proximo'] ?? 0) && !e.lancador?.lancando) {
      if (ctx.executor.pedir(mundo, e, chave, { ...alvo.pos })) {
        ia.estado = 'mergulho';
        e.olhar = { x: alvo.pos.x - e.pos.x, y: alvo.pos.y - e.pos.y };
        // Desce um pouco durante o aviso (ainda fora do alcance dos golpes).
        e.marcas = { ...e.marcas, alturaPx: altura / 2 };
      }
    }
  },

  /**
   * Saco-Surpresa: disfarçado de lixeira, parado; acorda quando o jogador chega perto ou bate nele,
   * morde por um tempo e foge para longe, onde se disfarça de novo.
   */
  saco(mundo, e, def, ctx) {
    const p = def.param;
    const ia = e.ia as EstadoIA;
    const a = e.ataque;
    const c = e.combate;
    const j = heroiDe(mundo);
    const tick = mundo.tick;
    if (!c) return;
    if (ia.estado === 'inicio') {
      // Nasce disfarçado de lixeira (sem barra de vida: nada o entrega).
      ia.estado = 'disfarce';
      ia['coragem'] = c.coragem;
      e.marcas = { ...e.marcas, visual: 'lixeira', disfarcado: true };
    }
    if (ia.estado === 'disfarce') {
      parar(e);
      if (a) {
        a.alvo = null;
        a.preparo = null;
      }
      const ferido = c.coragem < Number(ia['coragem'] ?? c.attr.coragemMax) - 1e-6;
      if (j && vivo(j) && (distancia(e.pos, j.pos) <= (p['raioAcordar'] ?? 2) || ferido)) {
        ia.estado = 'ataque';
        ia['ate'] = tick + Math.round((p['ataqueS'] ?? 3.5) / mundo.dt);
        e.marcas = { ...e.marcas, visual: 'saco_surpresa', disfarcado: false };
        mundo.eventos.push({ tipo: 'surpresa', pos: { ...e.pos } });
      }
      return;
    }
    if (ia.estado === 'ataque') {
      const alvo = alvoDe(mundo, e, ctx);
      if (!alvo || tick >= Number(ia['ate'] ?? 0)) {
        ia.estado = 'fuga';
        ia['ate'] = tick + Math.round((p['fugaS'] ?? 4) / mundo.dt);
        ia['destino'] = pontoDeFuga(e, j?.pos ?? e.pos, p['distanciaFuga'] ?? 6, ctx);
        if (a) {
          a.alvo = null;
          a.preparo = null;
        }
        return;
      }
      const alcance = (a?.def.alcance ?? 0.8) + alvo.raio;
      if (a) {
        a.alvo = alvo.id;
        a.manual = true;
      }
      if (distancia(e.pos, alvo.pos) <= alcance - 0.05) parar(e);
      else andar(e, rumoA(e, alvo, ctx));
      return;
    }
    // Fugindo: chegou (ou cansou) e vira lixeira de novo.
    const destino = ia['destino'] as V2 | undefined;
    if (!destino || tick >= Number(ia['ate'] ?? 0) || distancia(e.pos, destino) < 0.3) {
      ia.estado = 'disfarce';
      ia['coragem'] = c.coragem;
      e.marcas = { ...e.marcas, visual: 'lixeira', disfarcado: true };
      return parar(e);
    }
    const d = distancia(e.pos, destino);
    andar(e, { x: (destino.x - e.pos.x) / d, y: (destino.y - e.pos.y) / d });
  },

  /**
   * Pestinha de Lençol: desce o campo de fluxo e bate quando encosta. Perto do jogador, entra no
   * cerco: se não for a vez dela, rodeia numa vaga do anel e espera.
   */
  onda(mundo, e, _def, ctx) {
    const alvo = alvoDe(mundo, e, ctx);
    const a = e.ataque;
    if (!alvo || hesitando(mundo, e)) {
      parar(e);
      if (a) a.alvo = null;
      return;
    }
    const ia = e.ia as EstadoIA;
    if (tentarEsquiva(mundo, e, ctx)) return;
    if (sairDeArea(e, ctx)) {
      if (a) a.alvo = null;
      return;
    }
    const cerco = ctx.reacoes?.cerco;
    const papel =
      cerco && alvo === heroiDe(mundo) && cerco.especies.includes(e.especie)
        ? papelNoCerco(mundo, e, alvo, cerco)
        : null;
    const atacando = !papel || papel.atacar;
    // Trocou de papel: os relógios recomeçam (espera de quem aguarda, turno de quem ataca).
    if (ia['atacante'] !== atacando) {
      ia['espera'] = 0;
      ia['turno'] = 0;
    }
    ia['atacante'] = atacando;
    if (atacando) ia['turno'] = Number(ia['turno'] ?? 0) + mundo.dt;
    else ia['espera'] = Number(ia['espera'] ?? 0) + mundo.dt;
    if (papel && !papel.atacar) {
      // Esperando a vez: não bate, rodeia o jogador pela vaga do anel olhando para ele.
      if (a) {
        a.alvo = null;
        a.preparo = null;
      }
      const olhar = { x: alvo.pos.x - e.pos.x, y: alvo.pos.y - e.pos.y };
      const ponto = papel.ponto;
      if (!ponto || distancia(e.pos, ponto) < 0.15) parar(e);
      else {
        const d = distancia(e.pos, ponto);
        andar(e, { x: (ponto.x - e.pos.x) / d, y: (ponto.y - e.pos.y) / d });
      }
      e.olhar = olhar;
      return;
    }
    const alcance = (a?.def.alcance ?? 0.8) + alvo.raio;
    const d = distancia(e.pos, alvo.pos);
    if (a) {
      a.alvo = alvo.id;
      a.manual = true;
    }
    // No cerco, cada atacante chega pelo seu lado: de perto, contorna o jogador até ele.
    const lado = papel?.atacar && cerco ? papel.ponto : null;
    if (lado && cerco && d <= cerco.contornarAte) {
      const dir = rumoAoLado(e, alvo.pos, lado, cerco.raioDeContorno);
      if (dir && ctx.campo.grade.ehLivre({ x: e.pos.x + dir.x * 0.5, y: e.pos.y + dir.y * 0.5 })) {
        andar(e, dir);
        return;
      }
    }
    if (d <= alcance - 0.05) parar(e);
    else andar(e, rumoComFlanco(e, alvo, rumoA(e, alvo, ctx), ctx));
  },

  /**
   * Espantalho de Quintal: fincado no chão, joga palha em quem chega à vista. Quando apanha, troca
   * de lugar com outro espantalho de pé (o golpe seguinte do jogador acerta o vazio).
   */
  espantalho(mundo, e, def, ctx) {
    const p = def.param;
    const ia = e.ia as EstadoIA;
    const c = e.combate;
    parar(e);
    if (!c) return;
    if (ia['coragem'] === undefined) ia['coragem'] = c.coragem;
    const ferido = c.coragem < Number(ia['coragem']) - 1e-6;
    ia['coragem'] = c.coragem;
    if (ferido && mundo.tick >= Number(ia['trocaEm'] ?? 0)) {
      let outro: Entidade | null = null;
      let melhor = p['raioTroca'] ?? 14;
      for (const o of mundo.entidades) {
        if (o === e || o.especie !== e.especie || !vivo(o)) continue;
        const d = distancia(o.pos, e.pos);
        if (d <= melhor) {
          melhor = d;
          outro = o;
        }
      }
      if (outro) {
        const a = { ...e.pos };
        e.pos = { ...outro.pos };
        e.posAnterior = { ...e.pos };
        outro.pos = a;
        outro.posAnterior = { ...a };
        const espera = Math.round((p['trocaS'] ?? 3) / mundo.dt);
        ia['trocaEm'] = mundo.tick + espera;
        (outro.ia as EstadoIA)['trocaEm'] = mundo.tick + espera;
        mundo.eventos.push({ tipo: 'surpresa', pos: { ...e.pos } });
        mundo.eventos.push({ tipo: 'surpresa', pos: { ...a } });
        return;
      }
    }
    const alvo = alvoDe(mundo, e, ctx);
    if (!alvo || distancia(e.pos, alvo.pos) > (p['visao'] ?? 7)) return;
    e.olhar = { x: alvo.pos.x - e.pos.x, y: alvo.pos.y - e.pos.y };
    const chave = def.ataques[0];
    const s = chave ? e.lancador?.slots[chave] : undefined;
    if (chave && s && s.recarga <= 0 && !e.lancador?.lancando)
      if (ctx.campo.grade.linhaLivre(e.pos, alvo.pos))
        ctx.executor.pedir(mundo, e, chave, mira(mundo, e, alvo, chave, def));
  },

  /**
   * Pestinha de Vela: não ataca. Anda atrás do grupo, longe do jogador, com a vela acesa; os
   * aliados perto dela batem mais forte (a aura fica nas regras da rua). Tem que cair primeiro.
   */
  vela(mundo, e, def, ctx) {
    const alvo = alvoDe(mundo, e, ctx);
    if (!alvo || hesitando(mundo, e)) return parar(e);
    const p = def.param;
    const longe = p['distancia'] ?? 4.5;
    const folga = p['folga'] ?? 0.8;
    // O centro dos aliados perto (sem a torre): ela fica do lado de lá deles.
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const o of mundo.entidades) {
      if (o === e || o.tipo !== 'inimigo' || !vivo(o)) continue;
      if (ctx.defs[o.especie]?.comportamento === 'torre') continue;
      if (distancia(o.pos, e.pos) > 8) continue;
      sx += o.pos.x;
      sy += o.pos.y;
      n++;
    }
    // O ponto dela: na direção do grupo, a `distancia` do jogador (atrás dos aliados).
    const ref = n > 0 ? { x: sx / n, y: sy / n } : e.pos;
    const dr = distancia(ref, alvo.pos) || 1;
    const ponto = {
      x: alvo.pos.x + ((ref.x - alvo.pos.x) / dr) * longe,
      y: alvo.pos.y + ((ref.y - alvo.pos.y) / dr) * longe,
    };
    e.olhar = { x: alvo.pos.x - e.pos.x, y: alvo.pos.y - e.pos.y };
    if (tentarEsquiva(mundo, e, ctx) || sairDeArea(e, ctx)) return;
    // O jogador chegou perto: corre para longe (mais rápida), de volta para trás do grupo.
    const fugindo = distancia(e.pos, alvo.pos) < (p['fugaDe'] ?? 0);
    if (e.combate)
      definirModificadores(
        e.combate,
        'fuga',
        fugindo ? [{ origem: 'fuga', atributo: 'velocidade', mult: p['bonusFuga'] ?? 0 }] : [],
      );
    if (fugindo) {
      const q = pontoDeFuga(e, alvo.pos, longe, ctx);
      const dq = distancia(e.pos, q);
      if (dq > 0.1) {
        andar(e, { x: (q.x - e.pos.x) / dq, y: (q.y - e.pos.y) / dq });
        return;
      }
    }
    const dp = distancia(e.pos, ponto);
    if (dp <= folga) parar(e);
    else if (distancia(e.pos, alvo.pos) > longe + 3) andar(e, rumoA(e, alvo, ctx));
    else andar(e, { x: (ponto.x - e.pos.x) / dp, y: (ponto.y - e.pos.y) / dp });
  },

  /**
   * Arremessador: mantém uns 5 tiles andando de lado em volta do jogador (troca de sentido de
   * tempos em tempos), recua de costas mais devagar, contorna as casas quando não tem linha de tiro
   * e joga ovos onde o jogador vai estar. Pula de lado quando vem um projétil.
   */
  arremessador(mundo, e, def, ctx) {
    const alvo = alvoDe(mundo, e, ctx);
    if (!alvo || hesitando(mundo, e)) return parar(e);
    const p = def.param;
    if (tentarEsquiva(mundo, e, ctx)) return;
    // Vida baixa: corre para perto de um aliado (não atira enquanto foge).
    const vb = ctx.reacoes?.vidaBaixa;
    const c = e.combate;
    if (vb && c && vb.especies.includes(e.especie) && c.coragem < c.attr.coragemMax * vb.fracao) {
      let aliado: Entidade | null = null;
      let melhor = vb.raioAliado;
      for (const o of mundo.entidades) {
        if (o === e || o.tipo !== 'inimigo' || !vivo(o)) continue;
        if (ctx.defs[o.especie]?.comportamento === 'torre') continue;
        const d = distancia(o.pos, e.pos);
        if (d < melhor) {
          melhor = d;
          aliado = o;
        }
      }
      if (aliado && melhor > 1.5) {
        andar(e, { x: (aliado.pos.x - e.pos.x) / melhor, y: (aliado.pos.y - e.pos.y) / melhor });
        return;
      }
    }
    const ideal = p['distancia'] ?? 5;
    const folga = p['folga'] ?? 0.8;
    const d = distancia(e.pos, alvo.pos);
    const livre = (q: V2) => ctx.campo.grade.ehLivre(q);
    const temLinha = ctx.campo.grade.linhaLivre(e.pos, alvo.pos);
    const fuga = { x: (e.pos.x - alvo.pos.x) / (d || 1), y: (e.pos.y - alvo.pos.y) / (d || 1) };
    // Recua de costas, mais devagar do que avança: quem chega perto consegue alcançá-lo. Encurralado
    // (parede atrás), anda de lado.
    const recuando =
      d < ideal - folga && livre({ x: e.pos.x + fuga.x * 0.7, y: e.pos.y + fuga.y * 0.7 });
    const deLado = !recuando && d <= ideal + folga && temLinha;
    if (e.combate) {
      definirModificadores(
        e.combate,
        'recuo',
        recuando
          ? [{ origem: 'recuo', atributo: 'velocidade', mult: -(p['lentidaoNoRecuo'] ?? 0) }]
          : deLado
            ? [{ origem: 'recuo', atributo: 'velocidade', mult: -(p['lentidaoDeLado'] ?? 0) }]
            : [],
      );
    }
    if (sairDeArea(e, ctx)) {
      // Saindo da área, ainda olha e atira.
    } else if (d > ideal + folga || !temLinha) andar(e, rumoA(e, alvo, ctx));
    else if (recuando) andar(e, fuga);
    else andarDeLado(mundo, e, alvo.pos, p['trocaLadoS'] ?? 2, livre);
    e.olhar = { x: alvo.pos.x - e.pos.x, y: alvo.pos.y - e.pos.y };
    const chave = def.ataques[0];
    if (chave && d <= (p['alcanceTiro'] ?? 6.5) && temLinha) {
      const s = e.lancador?.slots[chave];
      if (s && s.recarga <= 0 && !e.lancador?.lancando) {
        ctx.executor.pedir(mundo, e, chave, mira(mundo, e, alvo, chave, def));
      }
    }
  },

  /** Abóbora-Canhão: lenta, mais rápida contra quem está parado; para, anuncia e explode. */
  canhao(mundo, e, def, ctx) {
    const alvo = alvoDe(mundo, e, ctx);
    if (!alvo) return parar(e);
    const p = def.param;
    const ia = e.ia as EstadoIA;
    ia.relogio = (ia.relogio ?? 0) + mundo.dt;
    if (!ia.pontoAntigo || ia.relogio >= (p['segundosParado'] ?? 1)) {
      const parado = !!ia.pontoAntigo && distancia(ia.pontoAntigo, alvo.pos) < 0.5;
      ia['parado'] = parado;
      ia.pontoAntigo = { ...alvo.pos };
      ia.relogio = 0;
    }
    if (e.combate) {
      definirModificadores(
        e.combate,
        'parado',
        ia['parado']
          ? [{ origem: 'parado', atributo: 'velocidade', mult: p['bonusParado'] ?? 0.5 }]
          : [],
      );
    }
    const d = distancia(e.pos, alvo.pos);
    const [chave, rolada] = def.ataques;
    if (e.lancador?.lancando || e.forcado) return parar(e);
    if (chave && d <= (p['distanciaExplosao'] ?? 1.7) + alvo.raio) {
      parar(e);
      const s = e.lancador?.slots[chave];
      if (s && s.recarga <= 0) ctx.executor.pedir(mundo, e, chave, e.pos);
      return;
    }
    // De meia distância, com o caminho livre: se encolhe (anunciado) e rola até o jogador.
    const sr = rolada ? e.lancador?.slots[rolada] : undefined;
    if (
      rolada &&
      sr &&
      sr.recarga <= 0 &&
      d >= (p['rolarDesde'] ?? Infinity) &&
      d <= (p['rolarAte'] ?? 0) &&
      ctx.campo.grade.linhaLivre(e.pos, alvo.pos) &&
      ctx.executor.pedir(mundo, e, rolada, mira(mundo, e, alvo, rolada, def))
    )
      return parar(e);
    if (sairDeArea(e, ctx)) return;
    andar(e, rumoComFlanco(e, alvo, rumoA(e, alvo, ctx), ctx));
  },

  /**
   * Poste Corrompido (torre): mira primeiro a Doce-isca e depois o jogador, se enxergar (na sombra,
   * só de perto). Apanhou: fica em alerta e enxerga em todo o alcance, mesmo na sombra. Quem chega
   * perto leva o Pulso (anunciado, empurra para longe). Cada tiro seguido no mesmo alvo causa +10%,
   * e os tiros alternam entre onde o jogador está e onde ele vai estar. Com 3 ou mais pestinhas
   * perto, recebe 50% menos dano.
   */
  torre(mundo, e, def, ctx) {
    parar(e);
    const p = def.param;
    const alcance = p['alcance'] ?? 5;
    const ia = e.ia as EstadoIA;
    const perto = mundo.entidades.filter(
      (o) =>
        o !== e &&
        o.tipo === 'inimigo' &&
        vivo(o) &&
        ctx.defs[o.especie]?.comportamento !== 'torre' &&
        distancia(o.pos, e.pos) <= (p['raioPestinhas'] ?? 4),
    ).length;
    if (e.combate) {
      definirModificadores(
        e.combate,
        'protecao',
        perto >= (p['pestinhasPerto'] ?? 3)
          ? [{ origem: 'protecao', atributo: 'danoRecebido', mult: -(p['reducaoDano'] ?? 0.5) }]
          : [],
      );
      // Apanhou: alerta (a luz roxa acende forte e ele enxerga quem bateu, mesmo no escuro).
      const c = e.combate;
      const antes = Number(ia['coragem'] ?? c.coragem);
      ia['coragem'] = c.coragem;
      if (c.coragem < antes - 1e-6) {
        if (Number(ia['alertaAte'] ?? 0) <= mundo.tick)
          mundo.eventos.push({ tipo: 'grito', id: e.id, pos: { ...e.pos }, texto: 'Zzzt!' });
        ia['alertaAte'] = mundo.tick + Math.round((p['alertaS'] ?? 0) / mundo.dt);
      }
      e.marcas = {
        ...e.marcas,
        protegido: perto >= (p['pestinhasPerto'] ?? 3),
        alerta: Number(ia['alertaAte'] ?? 0) > mundo.tick,
      };
    }
    const alerta = Number(ia['alertaAte'] ?? 0) > mundo.tick;
    const alvo = alvoDe(mundo, e, ctx, (j) =>
      alerta
        ? distancia(e.pos, j.pos) <= alcance + j.raio
        : visivelPara(e, j, ctx, alcance, p['visaoNaSombra'] ?? 2),
    );
    const [chave, pulso] = def.ataques;
    if (!alvo || e.lancador?.lancando) return;
    const d = distancia(e.pos, alvo.pos);
    e.olhar = { x: alvo.pos.x - e.pos.x, y: alvo.pos.y - e.pos.y };
    // De perto, o pulso em volta (o jogador tem o aviso para sair); a isca só leva tiro.
    const sp = pulso ? e.lancador?.slots[pulso] : undefined;
    if (pulso && sp && !ehIsca(alvo) && sp.recarga <= 0 && d <= (p['raioPulso'] ?? 0) + alvo.raio) {
      ctx.executor.pedir(mundo, e, pulso, { ...e.pos });
      return;
    }
    if (!chave || d - alvo.raio > alcance) return;
    const s = e.lancador?.slots[chave];
    if (!s || s.recarga > 0) return;
    // Tiro seguido no mesmo alvo: +10% cada, até o teto; uma pausa longa zera a conta.
    const pausa = (mundo.tick - (ia.ultimoTiro ?? -Infinity)) * mundo.dt;
    const seguido = ia.ultimoAlvo === alvo.id && pausa <= (p['rampaZeraS'] ?? Infinity);
    ia.seguidos = seguido ? (ia.seguidos ?? 0) + 1 : 0;
    ia.ultimoAlvo = alvo.id;
    ia.ultimoTiro = mundo.tick;
    if (e.combate) {
      definirModificadores(e.combate, 'rampa', [
        {
          origem: 'rampa',
          atributo: 'dano',
          mult: Math.min(p['rampaMax'] ?? Infinity, (p['rampa'] ?? 0.1) * ia.seguidos),
        },
      ]);
    }
    // Um tiro onde o jogador está, o seguinte onde ele vai estar: correr em linha não basta.
    const ponto = ia.seguidos % 2 === 1 ? mira(mundo, e, alvo, chave, def) : { ...alvo.pos };
    ctx.executor.pedir(mundo, e, chave, ponto);
  },
};

/** O comportamento padrão de `nome` (as regras da rua podem embrulhá-lo em `extras`). */
export function comportamentoBase(nome: string): Comportamento | undefined {
  return COMPORTAMENTOS[nome];
}

/** A IA de todos os inimigos, uma vez por tick, antes de habilidades e auto-ataque. */
export function criarSistemaIA(ctx: ContextoIA): Sistema {
  let recalculo = 0;
  return {
    antesDeMover(mundo) {
      const j = heroiDe(mundo);
      // O campo de fluxo segue o jogador; só recalcula quando ele troca de célula.
      if (j && recalculo-- <= 0) {
        ctx.campo.calcular(j.pos);
        recalculo = 6;
      }
      for (const e of mundo.entidades) {
        const ia = e.ia as EstadoIA | undefined;
        if (!ia || e.tipo !== 'inimigo' || !vivo(e)) continue;
        if (e.emMedo) continue;
        // Grupo dormindo pelo caminho: as regras da rua o acordam quando o jogador chega.
        if (e.marcas?.adormecido) {
          parar(e);
          continue;
        }
        const def = ctx.defs[ia.def];
        if (!def) continue;
        if (!podeMover(e) && !temEstado(e.combate, 'enraizado')) {
          parar(e);
          continue;
        }
        if (!podeAgir(e)) {
          parar(e);
          continue;
        }
        const f = ctx.extras?.[def.comportamento] ?? COMPORTAMENTOS[def.comportamento];
        f?.(mundo, e, def, ctx);
        if (temEstado(e.combate, 'enraizado')) parar(e);
        // Ninguém se amontoa: quem anda se afasta um pouco dos aliados colados (os chefes não).
        const t = ctx.reacoes?.taticas;
        if (t && !def.chefe && !e.forcado) e.direcao = separar(mundo, e, e.direcao, t.separacao);
      }
    },
  };
}
