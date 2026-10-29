import {
  alvosDeGolpe,
  causarDano,
  golpearObjeto,
  inimigosDe,
  miravel,
  podeAgir,
  vivo,
  type Golpe,
} from './combate';
import type { Combate, DefAutoAtaque, Habilidade } from './content/esquemas';
import type { Evento } from './eventos';
import type { V2 } from './geometria';
import { direcoesDoLeque, type Executor } from './habilidades';
import {
  entidade,
  forcarMovimento,
  type Acao,
  type Entidade,
  type IdEntidade,
  type Mundo,
  type Sistema,
} from './mundo';

export interface EstadoAtaque {
  def: DefAutoAtaque;
  /** Segundos até poder começar outro golpe. */
  recarga: number;
  /** Segundos que faltam do preparo do golpe em andamento (null = sem golpe preparando). */
  preparo: number | null;
  /** O jogador acertou durante o preparo (as regras da rua cortam o ataque e põem recarga). */
  cortado?: boolean;
  alvo: IdEntidade | null;
  /** O alvo foi escolhido pelo jogador (persegue) ou achado sozinho (só se já estiver no alcance). */
  manual: boolean;
  /** Atacar e mover: anda até o ponto atacando o que achar no caminho. */
  rumo: V2 | null;
  /** Quem persegue o alvo andando (o jogador); os inimigos andam pela própria IA. */
  persegue: boolean;
  /** Golpes dados (testes, pedidos). */
  golpes: number;
  /** Ataque manual: o próximo golpe do combo (0, 1, 2...) e o tick do último golpe. */
  combo: number;
  ultimoGolpe: number;
}

export function estadoAtaque(def: DefAutoAtaque, persegue: boolean): EstadoAtaque {
  return {
    def,
    recarga: 0,
    preparo: null,
    alvo: null,
    manual: false,
    rumo: null,
    persegue,
    golpes: 0,
    combo: 0,
    ultimoGolpe: Number.NEGATIVE_INFINITY,
  };
}

/** Prioridade de alvo do "atacar e mover" (maior = primeiro). */
export type Prioridade = (e: Entidade) => number;

export interface ConfigAutoAtaque {
  aquisicaoTiles: number;
  prioridade: Prioridade;
  /**
   * Ataque manual do jogador (estilo Minecraft Dungeons): com ele, o jogador não acha alvo sozinho;
   * o golpe sai pelo comando "golpear". Sem ele, o jogador ataca sozinho como antes.
   */
  manual?: Combate['ataqueManual'];
}

const EPS = 1e-9;

/** Definição usada pelos projéteis do auto-ataque (só a cor e o nome importam). */
export const DEF_PROJETIL_AUTO = {
  id: 'auto',
  nome: 'Auto-ataque',
  tecla: 'ataque',
  descricao: '',
  forma: { tipo: 'linha', alcance: 99, largura: 0.3, velocidade: 12, perfura: false },
  custo: 0,
  recarga: [0],
  lancamento: 0,
  efeitos: [],
  cor: 'jogador',
  aviso: false,
  cargas: 1,
  empurraAoAcertar: 0,
  aoFechar: [],
  afetaAliados: [],
  confina: false,
  sombra: false,
  velocidadeSeguir: 4,
  curaPorDano: 0,
  reiniciaAoAbater: false,
  medoAntes: 0,
} satisfies Habilidade;

function distanciaAoAlvo(e: Entidade, t: Entidade): number {
  return Math.hypot(t.pos.x - e.pos.x, t.pos.y - e.pos.y) - t.raio;
}

/** Ninguém trava o auto-ataque num invisível (o jogador no Lençol, a Viúva no véu). */
function alvoValido(e: Entidade, t: Entidade | undefined): t is Entidade {
  return (
    !!t && vivo(t) && t.tipo !== e.tipo && t.tipo !== 'neutro' && miravel(t) && !t.marcas?.voando
  );
}

type Manual = NonNullable<ConfigAutoAtaque['manual']>;

/** Acerta um alvo do golpe de perto: dano, evento e interrupção. Devolve se contou como acerto. */
function acertarPerto(
  mundo: Mundo,
  executor: Executor,
  e: Entidade,
  t: Entidade,
  golpe: Golpe,
): boolean {
  // Objeto quebrável: lasca e treme, sem contar como acerto (Energia, Susto, combo).
  if (t.marcas?.quebravel) {
    golpearObjeto(mundo, t, golpe);
    return false;
  }
  causarDano(mundo, t, golpe);
  mundo.eventos.push({ tipo: 'acertoAuto', dono: e.id, alvo: t.id });
  executor.talvezInterromper(mundo, e.tipo, e.id, t);
  return true;
}

/** Quem recua e não está num empurrão de habilidade pode ser empurrado (ou puxado) pelo golpe. */
function podeEmpurrar(t: Entidade): boolean {
  return !!t.combate?.recuo && vivo(t) && (!t.forcado || !!t.forcado.porImpacto);
}

/**
 * Golpe corpo a corpo na direção `dir`: o arco à frente nos golpes comuns; no último do combo, o
 * golpe final do campeão (`autoAtaque.combo.final`). Devolve quantos inimigos acertou.
 */
function golpeCorpoACorpo(
  mundo: Mundo,
  executor: Executor,
  e: Entidade,
  dir: V2,
  m: Manual,
  ultimo: boolean,
  golpe: () => Golpe,
): number {
  const a = e.ataque!;
  const k = a.def.combo;
  const final = ultimo ? (k?.final ?? { tipo: 'arco' as const }) : null;
  const alcance = a.def.alcance + (k?.alcanceExtra ?? m.alcanceExtra);
  const alvos = alvosDeGolpe(mundo, e.tipo).filter(
    (t) => !!t.marcas?.quebravel || alvoValido(e, t),
  );
  let acertos = 0;

  if (final?.tipo === 'passagem') {
    // Atravessa a linha da frente: acerta todos na faixa e termina do outro lado.
    const de = { ...e.pos };
    const ate = { x: de.x + dir.x * final.distancia, y: de.y + dir.y * final.distancia };
    mundo.eventos.push({
      tipo: 'golpeLinha',
      chave: 'golpe',
      dono: e.id,
      lado: e.tipo,
      de,
      ate,
      largura: final.largura,
    });
    for (const t of alvos) {
      const dx = t.pos.x - de.x;
      const dy = t.pos.y - de.y;
      const ao = dx * dir.x + dy * dir.y;
      if (ao < -t.raio || ao > final.distancia + t.raio) continue;
      if (Math.abs(dx * dir.y - dy * dir.x) > final.largura / 2 + t.raio) continue;
      if (acertarPerto(mundo, executor, e, t, golpe())) acertos++;
    }
    forcarMovimento(e, dir, final.distancia, final.velocidade, true);
    return acertos;
  }

  if (final?.tipo === 'pancada') {
    // Bate no chão: todos em volta, empurrados para fora do círculo.
    mundo.eventos.push({
      tipo: 'golpeCone',
      chave: 'golpe',
      dono: e.id,
      lado: e.tipo,
      de: { ...e.pos },
      dir: { ...dir },
      alcance: final.raio,
      angulo: 360,
    });
    for (const t of alvos) {
      const dx = t.pos.x - e.pos.x;
      const dy = t.pos.y - e.pos.y;
      const d = Math.hypot(dx, dy);
      if (d - t.raio > final.raio) continue;
      if (!acertarPerto(mundo, executor, e, t, golpe())) continue;
      acertos++;
      if (final.empurrao > 0 && podeEmpurrar(t)) {
        const fora = d > EPS ? { x: dx / d, y: dy / d } : { ...dir };
        forcarMovimento(t, fora, final.empurrao, t.combate!.recuo!.velocidade, false, false);
      }
    }
    return acertos;
  }

  // O arco à frente (os golpes comuns, o final `arco` e o `puxao`).
  const arco = k?.arcoGraus ?? m.arcoGraus;
  const meio = Math.cos(((arco / 2) * Math.PI) / 180);
  // O rastro do corte na tela (o mesmo desenho dos golpes em cone das habilidades).
  mundo.eventos.push({
    tipo: 'golpeCone',
    chave: 'golpe',
    dono: e.id,
    lado: e.tipo,
    de: { ...e.pos },
    dir: { ...dir },
    alcance,
    angulo: arco,
  });
  for (const t of alvos) {
    const dx = t.pos.x - e.pos.x;
    const dy = t.pos.y - e.pos.y;
    const d = Math.hypot(dx, dy);
    if (d - t.raio > alcance) continue;
    if (d > EPS && (dx * dir.x + dy * dir.y) / d < meio) continue;
    const g = golpe();
    if (final?.tipo === 'puxao') g.rouboExtra = final.rouboExtra;
    if (!acertarPerto(mundo, executor, e, t, g)) continue;
    acertos++;
    if (!final || !podeEmpurrar(t) || d <= EPS) continue;
    if (final.tipo === 'puxao') {
      // As garras puxam até encostar em quem bateu (nunca para trás dele).
      const ate = Math.min(final.distancia, d - e.raio - t.raio);
      if (ate <= EPS) continue;
      forcarMovimento(t, { x: -dx / d, y: -dy / d }, ate, final.velocidade, false, false);
      mundo.eventos.push({
        tipo: 'golpeLinha',
        chave: 'puxao',
        dono: e.id,
        lado: e.tipo,
        de: { ...t.pos },
        ate: { ...e.pos },
        largura: 0.18,
      });
    } else if (m.empurraoUltimo > 0) {
      // O último golpe do combo empurra quem recua (elites, chefes e Postes não recuam), no lugar
      // do recuo comum do golpe; um empurrão de habilidade em andamento fica.
      forcarMovimento(
        t,
        { x: dx / d, y: dy / d },
        m.empurraoUltimo,
        t.combate!.recuo!.velocidade,
        false,
        false,
      );
    }
  }
  return acertos;
}

/**
 * Auto-ataque: o golpe tem preparo (0,2 s) e só sai se quem ataca não se mexer nesse tempo; mexer
 * cancela sem perder o ritmo. O jogador ataca o alvo clicado, ou o inimigo que estiver no alcance
 * quando está parado, ou o que achar no caminho com "atacar e mover".
 */
export function criarSistemaAutoAtaque(executor: Executor, cfg: ConfigAutoAtaque): Sistema {
  const melhorAlvo = (mundo: Mundo, e: Entidade, alcance: number): Entidade | null => {
    let melhor: Entidade | null = null;
    let chave = -Infinity;
    for (const t of inimigosDe(mundo, e.tipo)) {
      if (!alvoValido(e, t)) continue;
      const d = distanciaAoAlvo(e, t);
      if (d > alcance) continue;
      // Prioridade primeiro; no empate, o mais perto.
      const k = cfg.prioridade(t) * 1000 - d;
      if (k > chave) {
        chave = k;
        melhor = t;
      }
    }
    return melhor;
  };

  const disparar = (mundo: Mundo, e: Entidade, t: Entidade): void => {
    const a = e.ataque!;
    const attr = e.combate!.attr;
    const golpe: Golpe = {
      origem: e.id,
      bruto: a.def.base + a.def.razao * attr[a.def.atributo],
      tipo: 'autoAtaque',
      podeCritar: true,
    };
    a.golpes++;
    e.olhar = { x: t.pos.x - e.pos.x, y: t.pos.y - e.pos.y };
    mundo.eventos.push({ tipo: 'ataqueAuto', id: e.id, alvo: t.id });
    if (a.def.projetil) {
      executor.dispararTeleguiado(mundo, e, t, a.def.projetil.velocidade, golpe, DEF_PROJETIL_AUTO);
    } else {
      causarDano(mundo, t, golpe);
      mundo.eventos.push({ tipo: 'acertoAuto', dono: e.id, alvo: t.id });
      executor.talvezInterromper(mundo, e.tipo, e.id, t);
    }
  };

  /**
   * Golpe manual na direção `dir`: corpo a corpo acerta todos no arco à frente, em combo; quem atira
   * solta um projétil reto (puxado para o inimigo perto da mira). Devolve quantos acertou.
   */
  const golpearManual = (
    mundo: Mundo,
    e: Entidade,
    dir: V2,
    m: NonNullable<ConfigAutoAtaque['manual']>,
  ): void => {
    const a = e.ataque!;
    const attr = e.combate!.attr;
    // A janela do combo conta depois da recarga do golpe: quem bate devagar (o Esqueleto) também
    // chega ao golpe final.
    const recargaS = 1 / (a.def.porSegundo * Math.max(attr.velocidadeAtaque, EPS));
    const janela = Math.round((recargaS + m.janelaComboS) / mundo.dt);
    if (mundo.tick - a.ultimoGolpe > janela) a.combo = 0;
    const indice = a.combo;
    const golpes = a.def.combo?.golpes ?? m.golpesNoCombo;
    const ultimo = indice === golpes - 1;
    a.combo = (indice + 1) % golpes;
    a.ultimoGolpe = mundo.tick;
    a.golpes++;
    a.recarga = 1 / (a.def.porSegundo * Math.max(attr.velocidadeAtaque, EPS));
    e.olhar = { ...dir };
    const golpe = (): Golpe => ({
      origem: e.id,
      bruto:
        (a.def.base + a.def.razao * attr[a.def.atributo]) *
        (ultimo ? (a.def.combo?.multFinal ?? m.multUltimo) : 1),
      tipo: 'autoAtaque',
      podeCritar: true,
      forte: ultimo,
    });
    let acertos = 0;
    if (a.def.projetil) {
      // Assistência: o inimigo mais perto da linha da mira, se estiver a poucos graus dela.
      let mira = dir;
      let melhor = Math.cos((m.assistenciaGraus * Math.PI) / 180);
      for (const t of inimigosDe(mundo, e.tipo)) {
        if (!alvoValido(e, t)) continue;
        const dx = t.pos.x - e.pos.x;
        const dy = t.pos.y - e.pos.y;
        const d = Math.hypot(dx, dy);
        if (d < EPS || d > m.alcanceProjetil) continue;
        const cos = (dx * dir.x + dy * dir.y) / d;
        if (cos > melhor) {
          melhor = cos;
          mira = { x: dx / d, y: dy / d };
        }
      }
      e.olhar = { ...mira };
      // O último golpe do combo sai em leque (as faíscas da Bruxinha).
      for (const d of direcoesDoLeque(
        mira,
        ultimo && m.lequeUltimo.n > 1 ? m.lequeUltimo : undefined,
      ))
        executor.dispararLinear(
          mundo,
          e,
          d,
          a.def.projetil.velocidade,
          m.alcanceProjetil,
          golpe(),
          DEF_PROJETIL_AUTO,
        );
    } else {
      acertos = golpeCorpoACorpo(mundo, executor, e, dir, m, ultimo, golpe);
    }
    mundo.eventos.push({
      tipo: 'golpeou',
      id: e.id,
      combo: indice,
      final: ultimo,
      x: e.olhar.x,
      y: e.olhar.y,
      acertos,
    });
  };

  return {
    antesDeMover(mundo: Mundo, acoes: readonly Acao[]) {
      const dt = mundo.dt;
      for (const ac of acoes) {
        if (ac.tipo === 'golpear') {
          const e = entidade(mundo, ac.id);
          const a = e?.ataque;
          if (!e || !a || !e.combate || !cfg.manual) continue;
          if (a.recarga > EPS || !podeAgir(e) || e.forcado || e.lancador?.lancando) continue;
          const n = Math.hypot(ac.x, ac.y);
          const dir = n > EPS ? { x: ac.x / n, y: ac.y / n } : { ...e.olhar };
          a.alvo = null;
          a.preparo = null;
          golpearManual(mundo, e, dir, cfg.manual);
          continue;
        }
        if (ac.tipo !== 'atacar' && ac.tipo !== 'atacarMover') continue;
        const e = entidade(mundo, ac.id);
        if (!e?.ataque) continue;
        const a = e.ataque;
        a.preparo = null;
        if (ac.tipo === 'atacar') {
          a.alvo = ac.alvo;
          a.manual = true;
          a.rumo = null;
        } else {
          a.alvo = null;
          a.manual = false;
          a.rumo = { x: ac.x, y: ac.y };
          e.direcao = { x: 0, y: 0 };
          e.destino = { x: ac.x, y: ac.y };
        }
      }

      for (const e of mundo.entidades) {
        const a = e.ataque;
        if (!a || !e.combate) continue;
        a.recarga = Math.max(0, a.recarga - dt);
        if (!podeAgir(e)) {
          a.preparo = null;
          continue;
        }
        // Um comando de andar deste tick cancela o ataque em andamento.
        if (e.comandoMovTick === mundo.tick) {
          a.alvo = null;
          a.rumo = null;
          a.manual = false;
          a.preparo = null;
        }
        const andando = e.direcao.x !== 0 || e.direcao.y !== 0;
        const ocupado = !!e.forcado || !!e.lancador?.lancando;
        let t = a.alvo !== null ? entidade(mundo, a.alvo) : undefined;
        if (!alvoValido(e, t)) {
          t = undefined;
          a.alvo = null;
        }
        if (!t && a.rumo) {
          const achado = melhorAlvo(mundo, e, a.def.alcance + cfg.aquisicaoTiles);
          if (achado) {
            t = achado;
            a.alvo = achado.id;
            a.manual = true;
          } else if (Math.hypot(a.rumo.x - e.pos.x, a.rumo.y - e.pos.y) < 0.1) {
            a.rumo = null;
          } else {
            e.destino = { ...a.rumo };
          }
        }
        const parado = !andando && !e.destino && !ocupado;
        // No ataque manual, o jogador só bate pelo botão (ou por um "atacar" pedido, dos bots).
        const sozinho = !(cfg.manual && e.tipo === 'jogador');
        if (!t && parado && a.persegue && sozinho) {
          const achado = melhorAlvo(mundo, e, a.def.alcance);
          if (achado) {
            t = achado;
            a.alvo = achado.id;
            a.manual = false;
          }
        }
        if (!t) {
          a.preparo = null;
          continue;
        }
        const d = distanciaAoAlvo(e, t);
        if (d > a.def.alcance + EPS) {
          a.preparo = null;
          if (a.persegue && a.manual && !ocupado) e.destino = { ...t.pos };
          else if (!a.manual) a.alvo = null;
          continue;
        }
        if (a.persegue && a.manual && e.destino) e.destino = null;
        if (andando || ocupado) {
          a.preparo = null;
          continue;
        }
        if (a.preparo === null && a.recarga <= EPS) a.preparo = a.def.preparo;
        if (a.preparo !== null) {
          e.multVelocidade = 0;
          a.preparo -= dt;
          if (a.preparo <= EPS) {
            a.preparo = null;
            a.recarga = 1 / (a.def.porSegundo * Math.max(e.combate.attr.velocidadeAtaque, EPS));
            disparar(mundo, e, t);
          }
        }
      }
    },

    /** O golpe manual que acerta devolve Energia (uma vez por tick para cada quem bate). */
    depoisDoTick(mundo: Mundo, eventos: readonly Evento[]) {
      const ganho = cfg.manual?.energiaPorAcerto ?? 0;
      if (ganho <= 0) return;
      const ja = new Set<number>();
      for (const ev of eventos) {
        if (ev.tipo !== 'acertoAuto' || ja.has(ev.dono)) continue;
        ja.add(ev.dono);
        const c = entidade(mundo, ev.dono);
        if (c?.tipo === 'jogador' && c.combate)
          c.combate.energia = Math.min(c.combate.attr.energiaMax, c.combate.energia + ganho);
      }
    },
  };
}

/** Prioridade do "atacar e mover" (GAMEPLAY.md): Arremessadores, Lençóis, Abóboras e Postes. */
export function prioridadePorEspecie(tabela: Readonly<Record<string, number>>): Prioridade {
  return (e) => tabela[e.especie] ?? 0;
}
