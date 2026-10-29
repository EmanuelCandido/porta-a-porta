import type { Campeao, Combate } from './content/esquemas';
import type { V2 } from './geometria';
import { forcarMovimento, type Entidade, type IdEntidade, type Mundo, type Sistema } from './mundo';

/** Tudo que tratos, itens, níveis e estados podem mexer. Multiplicadores começam em 1. */
export const ATRIBUTOS = [
  'forca',
  'feitico',
  'resistencia',
  'pressa',
  /** Multiplicador da velocidade de movimento. */
  'velocidade',
  /** Chance de crítico (0 a 1) e multiplicador do crítico. */
  'critico',
  'danoCritico',
  /** Fração do dano causado que volta como Coragem. */
  'rouboVida',
  /** Multiplicador de todo dano causado. */
  'dano',
  'danoAutoAtaque',
  /** Multiplicador de todo dano recebido. */
  'danoRecebido',
  /** Alcance e velocidade dos skillshots (Mira Torta). */
  'alcanceHabilidade',
  'velocidadeProjetil',
  /** Velocidade de recarga das habilidades (Frenesi) e só do R (Lua no Bolso). */
  'velocidadeRecarga',
  'velocidadeRecargaR',
  /** Multiplicador do custo de Energia (Frenesi: 0). */
  'custoHabilidade',
  'velocidadeAtaque',
  'coragemMax',
  'energiaMax',
  'regenEnergia',
  'luzMax',
  /** Multiplicador de toda cura recebida. */
  'cura',
  /** Multiplicadores de doces ganhos, do raio do ímã de doces e da duração da Doce-isca. */
  'doces',
  'imaDoces',
  'duracaoIsca',
  /** 1 = a lanterna não gasta Luz (Farol). */
  'luzSemCusto',
  /** Tiles a mais no raio da lanterna e do pulso (Lâmpada no Bolso, Lanterna Fraca). */
  'raioLanterna',
  /** Multiplicador da recarga da Luz perto dos postes (Lanterna de Pilha). */
  'recargaLuz',
] as const;
export type NomeAtributo = (typeof ATRIBUTOS)[number];
export type Atributos = Record<NomeAtributo, number>;

export interface Modificador {
  /** Quem deu (trato, item, nível, estado): permite trocar ou tirar um modificador. */
  origem: string;
  atributo: NomeAtributo;
  soma?: number;
  /** Fração somada ao multiplicador (0,4 = +40%, −0,15 = −15%). */
  mult?: number;
  /** Segundos até sumir; sem valor, dura até ser tirado. */
  restante?: number;
}

export type Estado =
  | { tipo: 'lentidao'; valor: number; restante: number }
  | { tipo: 'atordoado'; restante: number }
  | { tipo: 'enraizado'; restante: number }
  | { tipo: 'medo'; restante: number; de: V2 }
  | {
      tipo: 'escudo';
      valor: number;
      restante: number;
      origem: string;
      /** Fração do que sobrar devolvida como Coragem quando o escudo acaba inteiro. */
      devolve?: number;
      /** Fração do dano absorvido que volta para quem bateu (Espinhos). */
      espinhos?: number;
    }
  | {
      tipo: 'invisivel';
      restante: number;
      /** Derrubar alguém enquanto invisível renova por este tempo (Lençol Longo). */
      renova?: number;
      /** Ao sair da invisibilidade, o próximo golpe causa mais (Lençol Vazio). */
      aoSair?: { mult: number; duracao: number };
    }
  | {
      /** O próximo golpe (habilidade ou auto-ataque) sai mais forte ou crítico, e pode assustar. */
      tipo: 'preparado';
      restante: number;
      mult: number;
      critico: boolean;
      origem: string;
      medo?: { duracao: number; raio: number; alvos: readonly string[] };
    }
  | {
      /** Banquete do Vampirinho: roubo de vida e velocidade que cresce a cada golpe. */
      tipo: 'banquete';
      restante: number;
      rouboVida: number;
      porGolpe: number;
      maxVelocidade: number;
      prolongaAoAbater: number;
      curaAoFim: number;
      golpes: number;
      /** Golpes já transformados em velocidade (para refazer o modificador só quando muda). */
      aplicados: number;
    }
  | { tipo: 'imune'; restante: number }
  | { tipo: 'provocado'; restante: number; alvo: IdEntidade }
  | { tipo: 'marca'; restante: number; bonus: number; origem: IdEntidade }
  | { tipo: 'fragil'; restante: number; valor: number }
  | { tipo: 'dot'; restante: number; porSegundo: number; origem: IdEntidade; acumulado: number };
export type TipoEstado = Estado['tipo'];

export interface Combatente {
  base: Atributos;
  mods: Modificador[];
  /** Atributos finais, recalculados a cada tick a partir da base e dos modificadores. */
  attr: Atributos;
  coragem: number;
  energia: number;
  luz: number;
  estados: Estado[];
  /** Chefes não são atordoados nem enraizados: ficam lentos pela metade do tempo. */
  chefe: boolean;
  /** Recuo dos inimigos pequenos; ausente em elites, chefes, torres e bonecos de treino. */
  recuo?: Combate['recuo'];
  /** Bonecos de treino voltam com a Coragem cheia depois deste tempo; os outros ficam caídos. */
  renascerS: number | null;
  /** Segundos que faltam para renascer (só enquanto caído). */
  caido: number;
  /** Segundos desde o último dano causado ou recebido. */
  semCombate: number;
  /** Remontar do Esqueleto: uma vez por bairro, desmonta em vez de cair. */
  remontar?: { desmontadoS: number; voltaCom: number; usado: boolean };
  /** Segundos que faltam para remontar (só enquanto desmontado). */
  desmontado?: number;
}

export function atributosBase(parcial: Partial<Atributos>): Atributos {
  const a = Object.fromEntries(ATRIBUTOS.map((k) => [k, 0])) as Atributos;
  for (const k of [
    'velocidade',
    'dano',
    'danoAutoAtaque',
    'danoRecebido',
    'alcanceHabilidade',
    'velocidadeProjetil',
    'velocidadeRecarga',
    'velocidadeRecargaR',
    'custoHabilidade',
    'velocidadeAtaque',
    'cura',
    'doces',
    'imaDoces',
    'duracaoIsca',
    'recargaLuz',
  ] as const) {
    a[k] = 1;
  }
  return { ...a, ...parcial };
}

/**
 * Atributos finais: (base + somas) × produto de (1 + mult). Roda todo tick para cada combatente,
 * então evita alocar além do objeto de saída.
 */
export function calcularAtributos(base: Atributos, mods: readonly Modificador[]): Atributos {
  const r = { ...base };
  let mult: Partial<Record<NomeAtributo, number>> | null = null;
  for (const m of mods) {
    if (m.soma) r[m.atributo] += m.soma;
    if (m.mult) {
      mult ??= {};
      mult[m.atributo] = (mult[m.atributo] ?? 1) * (1 + m.mult);
    }
  }
  if (mult) for (const k in mult) r[k as NomeAtributo] *= mult[k as NomeAtributo]!;
  r.critico = Math.min(1, Math.max(0, r.critico));
  r.velocidade = Math.max(0, r.velocidade);
  return r;
}

function novoCombatente(base: Atributos, extra: Partial<Combatente> = {}): Combatente {
  const attr = calcularAtributos(base, []);
  return {
    base,
    mods: [],
    attr,
    coragem: attr.coragemMax,
    energia: attr.energiaMax,
    luz: attr.luzMax,
    estados: [],
    chefe: false,
    renascerS: null,
    caido: 0,
    semCombate: Infinity,
    ...extra,
  };
}

export function combatenteDoCampeao(c: Campeao, cfg: Combate): Combatente {
  const combatente = novoCombatente(
    atributosBase({
      ...c.atributos,
      coragemMax: c.coragem,
      energiaMax: c.energia,
      regenEnergia: c.regenEnergiaPorS,
      luzMax: cfg.luz.maxima,
      danoCritico: cfg.danoCritico,
    }),
  );
  if (c.passiva.tipo === 'remontar') {
    combatente.remontar = {
      desmontadoS: c.passiva.desmontadoS,
      voltaCom: c.passiva.voltaCom,
      usado: false,
    };
  }
  // Ossos Ocos: sem Remontar, mas mais rápido.
  if (c.passiva.tipo === 'ossosOcos')
    combatente.mods.push({
      origem: 'ossosOcos',
      atributo: 'velocidade',
      mult: c.passiva.velocidade,
    });
  combatente.attr = calcularAtributos(combatente.base, combatente.mods);
  return combatente;
}

export interface DefInimigoCombate {
  coragem: number;
  resistencia: number;
  dano?: number;
  chefe?: boolean;
  recua?: boolean;
}

export function combatenteInimigo(d: DefInimigoCombate, cfg: Combate): Combatente {
  return novoCombatente(
    atributosBase({
      coragemMax: d.coragem,
      resistencia: d.resistencia,
      danoCritico: cfg.danoCritico,
      dano: d.dano ?? 1,
    }),
    { chefe: d.chefe ?? false, energia: 0, recuo: d.recua && !d.chefe ? cfg.recuo : undefined },
  );
}

export function combatenteBoneco(
  cfg: { coragem: number; resistencia: number; renascerS: number },
  combate: Combate,
): Combatente {
  return { ...combatenteInimigo(cfg, combate), renascerS: cfg.renascerS };
}

/** GDD: dano final = bruto × 100 / (100 + Resistência do alvo). */
export function danoFinal(bruto: number, resistencia: number): number {
  return (bruto * 100) / (100 + Math.max(0, resistencia));
}

/** GDD: recarga = base × (1 − Pressa / 100), com a Pressa limitada. */
export function recargaComPressa(base: number, pressa: number, pressaMaxima: number): number {
  return base * (1 - Math.min(Math.max(0, pressa), pressaMaxima) / 100);
}

export function vivo(e: Entidade): boolean {
  return !!e.combate && e.combate.coragem > 0;
}

export function temEstado(c: Combatente | undefined, tipo: TipoEstado): boolean {
  return !!c && c.estados.some((e) => e.tipo === tipo);
}

/** Pode andar por vontade própria (sem atordoamento, raiz ou medo). */
export function podeMover(e: Entidade): boolean {
  const c = e.combate;
  return (
    !c ||
    !c.estados.some((s) => s.tipo === 'atordoado' || s.tipo === 'enraizado' || s.tipo === 'medo')
  );
}

/** Pode atacar e lançar (sem atordoamento nem medo). */
export function podeAgir(e: Entidade): boolean {
  const c = e.combate;
  return (
    !!c && c.coragem > 0 && !c.estados.some((s) => s.tipo === 'atordoado' || s.tipo === 'medo')
  );
}

/** Invisíveis não são mirados pelos inimigos. */
export function miravel(e: Entidade): boolean {
  return vivo(e) && !temEstado(e.combate, 'invisivel');
}

/** Alvos possíveis de quem é de `tipo`: os vivos do outro lado. */
export function inimigosDe(mundo: Mundo, tipo: Entidade['tipo']): Entidade[] {
  return mundo.entidades.filter((e) => e.tipo !== tipo && e.tipo !== 'neutro' && vivo(e));
}

/** O que os golpes de quem é do lado `tipo` acertam: os inimigos e, para o jogador, os quebráveis. */
export function alvosDeGolpe(mundo: Mundo, tipo: Entidade['tipo']): Entidade[] {
  if (tipo !== 'jogador') return inimigosDe(mundo, tipo);
  // Quem voa alto (o morceguinho fora do mergulho) não leva golpe.
  return mundo.entidades.filter(
    (e) =>
      vivo(e) &&
      !e.marcas?.voando &&
      ((e.tipo !== tipo && e.tipo !== 'neutro') || !!e.marcas?.quebravel),
  );
}

/** Um golpe acertou um objeto quebrável: a tela treme o objeto e toca o som do material. */
export function avisarObjetoAtingido(mundo: Mundo, alvo: Entidade, resistiu = false): void {
  mundo.eventos.push({
    tipo: 'objetoAtingido',
    id: alvo.id,
    objeto: Number(alvo.marcas?.objeto ?? -1),
    material: String(alvo.marcas?.material ?? 'madeira'),
    pos: { ...alvo.pos },
    ...(resistiu ? { resistiu: true } : {}),
  });
}

/**
 * Golpe básico num objeto quebrável: o portão do quintal só leva dano do golpe forte. Devolve se o
 * dano entrou.
 */
export function golpearObjeto(mundo: Mundo, alvo: Entidade, g: Golpe): boolean {
  if (alvo.marcas?.soForte && !g.forte) {
    avisarObjetoAtingido(mundo, alvo, true);
    return false;
  }
  // Quebra num número certo de golpes (a pilha de tijolos do Dono): cada golpe tira 1.
  if (alvo.marcas?.porGolpe) {
    causarDano(mundo, alvo, { ...g, bruto: 1, verdadeiro: true, critico: false });
    avisarObjetoAtingido(mundo, alvo);
    return true;
  }
  causarDano(mundo, alvo, g);
  avisarObjetoAtingido(mundo, alvo);
  return true;
}

export function adicionarModificador(c: Combatente, m: Modificador): void {
  c.mods.push(m);
}

/** Tira os modificadores de uma origem (ex.: ao trocar um item ou acabar um efeito). */
export function removerModificadores(c: Combatente, origem: string): void {
  c.mods = c.mods.filter((m) => m.origem !== origem);
}

/** Troca os modificadores de uma origem pelos novos (passivas que mudam a cada tick). */
export function definirModificadores(c: Combatente, origem: string, mods: Modificador[]): void {
  removerModificadores(c, origem);
  c.mods.push(...mods);
}

/** Recalcula os atributos; se a Coragem máxima subir, a atual sobe junto. */
export function recalcular(c: Combatente): void {
  const antes = c.attr.coragemMax;
  c.attr = calcularAtributos(c.base, c.mods);
  if (c.attr.coragemMax > antes && c.coragem > 0) c.coragem += c.attr.coragemMax - antes;
  c.coragem = Math.min(c.coragem, c.attr.coragemMax);
  c.energia = Math.min(c.energia, c.attr.energiaMax);
  c.luz = Math.min(c.luz, c.attr.luzMax);
}

export function curar(mundo: Mundo, alvo: Entidade, valor: number, origem?: string): number {
  const c = alvo.combate;
  if (!c || c.coragem <= 0 || valor <= 0) return 0;
  const real = Math.min(c.attr.coragemMax - c.coragem, valor * c.attr.cura);
  if (real <= 0) return 0;
  c.coragem += real;
  mundo.eventos.push({ tipo: 'cura', alvo: alvo.id, valor: real, pos: { ...alvo.pos }, origem });
  return real;
}

export type TipoGolpe = 'habilidade' | 'autoAtaque' | 'explosao' | 'dot' | 'reflexo' | 'ataque';

export interface Golpe {
  origem: IdEntidade;
  bruto: number;
  tipo: TipoGolpe;
  /** Rola crítico com a chance de quem bate (ou força o crítico). */
  podeCritar?: boolean;
  critico?: boolean;
  /** Ataque inimigo anunciado no chão (vale para o Susto). */
  comAviso?: boolean;
  /** Fração extra de roubo de vida só deste golpe (Mordida). */
  rouboExtra?: number;
  /** Ignora a Resistência (dano verdadeiro, ex.: % de Coragem). */
  verdadeiro?: boolean;
  /** Habilidade que causou, para tratos e pedidos. */
  fonte?: string;
  /** Golpe forte (o último do combo): abre o portão do quintal. */
  forte?: boolean;
}

/**
 * O caminho de todo dano: multiplicadores de quem bate, crítico, marca, fragilidade, Resistência,
 * imunidade e escudo; depois roubo de vida, eventos e derrota.
 */
export function causarDano(mundo: Mundo, alvo: Entidade, g: Golpe): number {
  const c = alvo.combate;
  if (!c || c.coragem <= 0 || g.bruto <= 0) return 0;
  // Encouraçado (inimigo encantado): o escudo aguenta alguns golpes inteiros antes do dano entrar.
  const escudo = alvo.marcas?.escudoGolpes;
  if (typeof escudo === 'number' && escudo > 0 && g.tipo !== 'dot') {
    alvo.marcas = { ...alvo.marcas, escudoGolpes: escudo - 1 };
    mundo.eventos.push({
      tipo: 'escudoBateu',
      id: alvo.id,
      pos: { ...alvo.pos },
      restam: escudo - 1,
    });
    return 0;
  }
  const origem = mundo.entidades.find((e) => e.id === g.origem);
  const oa = origem?.combate?.attr;
  let bruto = g.bruto * (oa?.dano ?? 1);
  if (g.tipo === 'autoAtaque') bruto *= oa?.danoAutoAtaque ?? 1;

  let critico = g.critico ?? false;
  // Golpes preparados (Arrepio, Lençol Vazio): o primeiro golpe de quem bate leva todos juntos.
  const golpeDeVerdade = g.tipo === 'habilidade' || g.tipo === 'autoAtaque';
  const oc = origem?.combate;
  const preparados = golpeDeVerdade
    ? (oc?.estados.filter(
        (s): s is Extract<Estado, { tipo: 'preparado' }> => s.tipo === 'preparado',
      ) ?? [])
    : [];
  if (preparados.length > 0 && oc) {
    oc.estados = oc.estados.filter((s) => s.tipo !== 'preparado');
    for (const p of preparados) {
      bruto *= 1 + p.mult;
      if (p.critico) critico = true;
    }
  }
  // Frio na Espinha: o alvo atrás de quem bate (pelo olhar dele) leva dano a mais.
  const passiva = origem?.lancador?.passiva;
  if (passiva?.tipo === 'frioNaEspinha' && golpeDeVerdade && origem) {
    const ox = alvo.pos.x - origem.pos.x;
    const oy = alvo.pos.y - origem.pos.y;
    if (ox * origem.olhar.x + oy * origem.olhar.y < 0) bruto *= 1 + passiva.bonus;
  }
  if (!critico && g.podeCritar && oa && oa.critico > 0) critico = mundo.rng.proximo() < oa.critico;
  if (critico) bruto *= oa?.danoCritico ?? 1.5;

  const marca = c.estados.find((s): s is Extract<Estado, { tipo: 'marca' }> => s.tipo === 'marca');
  if (marca && g.tipo !== 'dot') {
    bruto *= 1 + marca.bonus;
    c.estados = c.estados.filter((s) => s !== marca);
  }
  for (const s of c.estados) if (s.tipo === 'fragil') bruto *= 1 + s.valor;
  bruto *= c.attr.danoRecebido;

  let valor = g.verdadeiro ? bruto : danoFinal(bruto, c.attr.resistencia);
  if (temEstado(c, 'imune')) valor = 0;

  let absorvido = 0;
  let refletido = 0;
  for (const s of c.estados) {
    if (s.tipo !== 'escudo' || valor <= 0) continue;
    const a = Math.min(s.valor, valor);
    s.valor -= a;
    valor -= a;
    absorvido += a;
    if (s.espinhos && g.tipo !== 'reflexo') refletido += a * s.espinhos;
  }
  c.estados = c.estados.filter((s) => s.tipo !== 'escudo' || s.valor > 1e-9);

  valor = Math.min(c.coragem, valor);
  c.coragem -= valor;
  c.semCombate = 0;
  if (origem?.combate) origem.combate.semCombate = 0;
  // Golpe do jogador no preparo de um inimigo: as regras da rua decidem se corta o ataque.
  if (origem?.tipo === 'jogador' && valor > 0 && alvo.ataque && alvo.ataque.preparo !== null)
    alvo.ataque.cortado = true;
  mundo.eventos.push({
    tipo: 'dano',
    origem: g.origem,
    alvo: alvo.id,
    valor,
    absorvido,
    critico,
    golpe: g.tipo,
    comAviso: g.comAviso ?? false,
    fonte: g.fonte,
    pos: { ...alvo.pos },
    ...(alvo.marcas?.quebravel ? { objeto: true } : {}),
  });

  const roubo = (oa?.rouboVida ?? 0) + (g.rouboExtra ?? 0);
  if (origem && roubo > 0 && valor > 0 && g.tipo !== 'reflexo' && !alvo.marcas?.quebravel)
    curar(mundo, origem, valor * roubo, 'roubo');

  const caiu = c.coragem <= 0;
  // O recuo respeita casas, corpos e empurrões já em andamento. Dano contínuo não prende o alvo.
  if (
    origem?.tipo === 'jogador' &&
    alvo.tipo === 'inimigo' &&
    c.recuo &&
    !c.chefe &&
    !alvo.marcas?.elite &&
    !alvo.forcado &&
    !caiu &&
    valor + absorvido > 0 &&
    (golpeDeVerdade || g.tipo === 'explosao')
  ) {
    const recuo = forcarMovimento(
      alvo,
      { x: alvo.pos.x - origem.pos.x, y: alvo.pos.y - origem.pos.y },
      c.recuo.distancia,
      c.recuo.velocidade,
      false,
    );
    if (recuo) recuo.porImpacto = true;
  }
  if (origem && oc && golpeDeVerdade)
    depoisDoGolpe(mundo, origem, oc, alvo, valor, caiu, preparados);
  if (caiu) derrubar(mundo, alvo, g.origem);
  if (refletido > 0 && origem && vivo(origem)) {
    causarDano(mundo, origem, {
      origem: alvo.id,
      bruto: refletido,
      tipo: 'reflexo',
      verdadeiro: true,
      fonte: 'espinhos',
    });
  }
  return valor;
}

/**
 * O que um golpe de verdade (habilidade ou auto-ataque) muda em quem bateu: a invisibilidade se
 * renova se derrubou alguém (Lençol Longo), o Banquete conta o golpe e o abate, e o golpe preparado
 * do Arrepio assusta as pestinhas em volta do alvo.
 */
function depoisDoGolpe(
  mundo: Mundo,
  origem: Entidade,
  oc: Combatente,
  alvo: Entidade,
  valor: number,
  caiu: boolean,
  preparados: readonly Extract<Estado, { tipo: 'preparado' }>[],
): void {
  const inv = oc.estados.find(
    (s): s is Extract<Estado, { tipo: 'invisivel' }> => s.tipo === 'invisivel',
  );
  // Lençol Longo: derrubar alguém enquanto invisível renova a invisibilidade.
  if (inv && caiu && inv.renova) inv.restante = Math.max(inv.restante, inv.renova);
  for (const s of oc.estados) {
    if (s.tipo !== 'banquete') continue;
    if (valor > 0) s.golpes++;
    if (caiu) s.restante += s.prolongaAoAbater;
  }
  const medo = preparados.find((p) => p.medo)?.medo;
  if (medo) {
    for (const e of mundo.entidades) {
      if (!e.combate || !vivo(e) || !medo.alvos.includes(e.especie)) continue;
      if (Math.hypot(e.pos.x - alvo.pos.x, e.pos.y - alvo.pos.y) > medo.raio + e.raio) continue;
      if (temEstado(e.combate, 'imune')) continue;
      e.combate.estados = e.combate.estados.filter((s) => s.tipo !== 'medo');
      e.combate.estados.push({ tipo: 'medo', restante: medo.duracao, de: { ...origem.pos } });
    }
    mundo.eventos.push({ tipo: 'arrepio', id: origem.id, pos: { ...alvo.pos }, raio: medo.raio });
  }
}

/** Coragem a zero: o alvo cai (ou renasce depois, se for boneco). */
export function derrubar(mundo: Mundo, alvo: Entidade, por: IdEntidade): void {
  const c = alvo.combate!;
  // Remontar: em vez de cair, desmonta por um tempo e volta (uma vez por bairro).
  if (c.remontar && !c.remontar.usado) {
    c.remontar.usado = true;
    c.coragem = 0;
    c.estados = [];
    c.desmontado = c.remontar.desmontadoS;
    alvo.marcas = { ...alvo.marcas, remontando: true };
    alvo.direcao = { x: 0, y: 0 };
    alvo.destino = null;
    alvo.forcado = null;
    mundo.eventos.push({ tipo: 'desmontou', id: alvo.id, pos: { ...alvo.pos } });
    return;
  }
  c.coragem = 0;
  c.estados = [];
  c.caido = c.renascerS ?? 0;
  alvo.direcao = { x: 0, y: 0 };
  alvo.destino = null;
  alvo.forcado = null;
  mundo.eventos.push({ tipo: 'derrotado', id: alvo.id, por, pos: { ...alvo.pos } });
}

export interface ConfigEstados {
  chefeLentidao: number;
  chefeFracaoDuracao: number;
}

/**
 * Aplica um estado. Estados iguais não somam: renovam a duração (e a lentidão mais forte vale).
 * Em chefes, atordoar e enraizar viram lentidão pela metade do tempo.
 */
export function aplicarEstado(alvo: Entidade, estado: Estado, cfg: ConfigEstados): void {
  const c = alvo.combate;
  if (!c || c.coragem <= 0 || estado.restante <= 0) return;
  // A imunidade barra o que vem de fora; os bônus de si mesmo ainda entram.
  const proprio =
    estado.tipo === 'escudo' ||
    estado.tipo === 'invisivel' ||
    estado.tipo === 'preparado' ||
    estado.tipo === 'banquete';
  if (temEstado(c, 'imune') && !proprio) return;
  if (
    c.chefe &&
    (estado.tipo === 'atordoado' || estado.tipo === 'enraizado' || estado.tipo === 'medo')
  ) {
    aplicarEstado(
      alvo,
      {
        tipo: 'lentidao',
        valor: cfg.chefeLentidao,
        restante: estado.restante * cfg.chefeFracaoDuracao,
      },
      { ...cfg, chefeLentidao: cfg.chefeLentidao },
    );
    return;
  }
  if (estado.tipo === 'escudo' || estado.tipo === 'dot') {
    c.estados.push(estado);
    return;
  }
  const atual = c.estados.find(
    (s) =>
      s.tipo === estado.tipo &&
      (s.tipo !== 'lentidao' || estado.tipo !== 'lentidao' || s.valor === estado.valor),
  );
  if (atual) {
    atual.restante = Math.max(atual.restante, estado.restante);
    if (atual.tipo === 'medo' && estado.tipo === 'medo') atual.de = estado.de;
    if (atual.tipo === 'provocado' && estado.tipo === 'provocado') atual.alvo = estado.alvo;
    if (atual.tipo === 'marca' && estado.tipo === 'marca')
      atual.bonus = Math.max(atual.bonus, estado.bonus);
    if (atual.tipo === 'fragil' && estado.tipo === 'fragil')
      atual.valor = Math.max(atual.valor, estado.valor);
  } else {
    c.estados.push({ ...estado });
  }
  // Atordoamento e Medo interrompem o lançamento (a habilidade volta com metade da recarga).
  if ((estado.tipo === 'atordoado' || estado.tipo === 'medo') && alvo.lancador?.lancando) {
    alvo.lancador.interrompido = true;
  }
  if ((estado.tipo === 'atordoado' || estado.tipo === 'enraizado') && !alvo.forcado?.porImpacto)
    alvo.forcado = null;
}

export function aplicarLentidao(
  alvo: Entidade,
  valor: number,
  duracao: number,
  cfg: ConfigEstados,
): void {
  aplicarEstado(alvo, { tipo: 'lentidao', valor, restante: duracao }, cfg);
}

export function lentidao(c: Combatente): number {
  return c.estados.reduce((m, e) => (e.tipo === 'lentidao' ? Math.max(m, e.valor) : m), 0);
}

export function escudoTotal(c: Combatente): number {
  return c.estados.reduce((s, e) => (e.tipo === 'escudo' ? s + e.valor : s), 0);
}

/**
 * Estados correm, modificadores com prazo vencem, Energia regenera, dano por segundo pega, quem
 * está com medo foge, bonecos renascem e a velocidade final vira o multiplicador do movimento.
 */
/** Roubo de vida e a velocidade de cada golpe enquanto o Banquete dura; ao fim, a cura do Transfusão. */
function atualizarBanquete(
  mundo: Mundo,
  e: Entidade,
  c: Combatente,
  b: Extract<Estado, { tipo: 'banquete' }>,
): void {
  if (b.restante <= 0) {
    removerModificadores(c, 'banquete');
    if (b.curaAoFim > 0) curar(mundo, e, c.attr.coragemMax * b.curaAoFim, 'banquete');
    return;
  }
  const temMod = c.mods.some((m) => m.origem === 'banquete');
  if (temMod && b.aplicados === b.golpes) return;
  b.aplicados = b.golpes;
  definirModificadores(c, 'banquete', [
    { origem: 'banquete', atributo: 'rouboVida', soma: b.rouboVida },
    {
      origem: 'banquete',
      atributo: 'velocidade',
      mult: Math.min(b.maxVelocidade, b.golpes * b.porGolpe),
    },
  ]);
}

export function criarSistemaCombate(cfg: Combate): Sistema {
  const cfgEstados: ConfigEstados = cfg.estados;
  return {
    antesDeMover(mundo) {
      const dt = mundo.dt;
      for (const e of mundo.entidades) {
        const c = e.combate;
        if (!c) continue;
        if (c.coragem <= 0) {
          if (c.desmontado !== undefined && c.desmontado > 0 && c.remontar) {
            c.desmontado -= dt;
            if (c.desmontado <= 0) {
              c.desmontado = 0;
              c.coragem = c.attr.coragemMax * c.remontar.voltaCom;
              e.marcas = { ...e.marcas, remontando: false };
              mundo.eventos.push({ tipo: 'remontou', id: e.id, pos: { ...e.pos } });
            }
          }
          if (c.renascerS !== null) {
            c.caido -= dt;
            if (c.caido <= 0) {
              c.coragem = c.attr.coragemMax;
              mundo.eventos.push({ tipo: 'renasceu', id: e.id, pos: { ...e.pos } });
            }
          }
          e.multVelocidade = 0;
          continue;
        }
        c.semCombate += dt;
        let venceu = false;
        for (const m of c.mods) {
          if (m.restante === undefined) continue;
          m.restante -= dt;
          if (m.restante <= 0) venceu = true;
        }
        if (venceu) c.mods = c.mods.filter((m) => m.restante === undefined || m.restante > 0);
        const fora = c.semCombate >= cfg.foraDeCombate.segundos;
        const temFora = c.mods.some((m) => m.origem === 'foraDeCombate');
        if (fora && !temFora) {
          c.mods.push({
            origem: 'foraDeCombate',
            atributo: 'velocidade',
            mult: cfg.foraDeCombate.bonusVelocidade,
          });
        } else if (!fora && temFora) {
          removerModificadores(c, 'foraDeCombate');
        }
        recalcular(c);
        c.energia = Math.min(c.attr.energiaMax, c.energia + c.attr.regenEnergia * dt);

        for (const s of c.estados) {
          const passou = Math.min(dt, s.restante);
          s.restante -= dt;
          if (s.tipo === 'dot') {
            s.acumulado += s.porSegundo * passou;
            if (s.acumulado >= s.porSegundo * cfg.dotIntervaloDano - 1e-9 || s.restante <= 0) {
              const valor = s.acumulado;
              s.acumulado = 0;
              causarDano(mundo, e, { origem: s.origem, bruto: valor, tipo: 'dot' });
            }
          }
        }
        if (c.coragem <= 0) continue;
        const saindo: Estado[] = [];
        for (const s of c.estados) {
          if (s.tipo === 'escudo' && s.restante <= 0 && s.devolve && s.valor > 0)
            curar(mundo, e, s.valor * s.devolve, 'escudo');
          if (s.tipo === 'invisivel' && s.restante <= 0) {
            mundo.eventos.push({ tipo: 'apareceu', id: e.id, pos: { ...e.pos } });
            if (s.aoSair)
              saindo.push({
                tipo: 'preparado',
                restante: s.aoSair.duracao,
                mult: s.aoSair.mult,
                critico: false,
                origem: 'invisivel',
              });
          }
          if (s.tipo === 'banquete') atualizarBanquete(mundo, e, c, s);
        }
        c.estados = c.estados.filter((s) => s.restante > 0);
        c.estados.push(...saindo);

        let mult = (1 - lentidao(c)) * c.attr.velocidade;
        if (c.estados.some((s) => s.tipo === 'atordoado' || s.tipo === 'enraizado')) mult = 0;
        e.multVelocidade = mult;

        const medo = c.estados.find(
          (s): s is Extract<Estado, { tipo: 'medo' }> => s.tipo === 'medo',
        );
        if (medo) {
          const dx = e.pos.x - medo.de.x;
          const dy = e.pos.y - medo.de.y;
          const n = Math.hypot(dx, dy) || 1;
          e.direcao = { x: dx / n, y: dy / n };
          e.destino = null;
          e.emMedo = true;
        } else if (e.emMedo) {
          e.emMedo = false;
          e.direcao = { x: 0, y: 0 };
        }
      }
      void cfgEstados;
    },
  };
}
