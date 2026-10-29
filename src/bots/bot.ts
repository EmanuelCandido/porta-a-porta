import type { Grade } from '../sim/campoDeFluxo';
import { vivo } from '../sim/combate';
import type {
  Combate,
  ConfigBots,
  Habilidade,
  PerfilBot,
  UsoDeHabilidade,
} from '../sim/content/esquemas';
import {
  escolherEvolucao,
  evolucaoPendente,
  opcoesDeEvolucao,
  type TabelaDeEvolucoes,
} from '../sim/evolucoes';
import type { V2 } from '../sim/geometria';
import {
  danoBruto,
  direcoesDoLeque,
  distanciaAoSegmento,
  pontoNoAlcance,
  type Executor,
} from '../sim/habilidades';
import type { MapaDeLuz } from '../sim/luz';
import type { EntradaMinijogo, Minijogo } from '../sim/minijogos';
import { enfileirar, type Entidade, type Mundo } from '../sim/mundo';
import type { Ficha } from '../sim/partida';
import { podeSubirPosto, subirPosto } from '../sim/progressao';
import type { RegrasDaRua } from '../sim/regrasDaRua';
import { Rng } from '../sim/rng';

/** O que o bot enxerga de um mapa de luta (rua ou praça do chefe). */
export interface MapaDoBot {
  mundo: Mundo;
  jogador: Entidade;
  ficha: Ficha;
  executor: Executor;
  grade: Grade;
  luz: MapaDeLuz;
  regras: RegrasDaRua;
  /** Portão por onde sair (índice, do oeste para o leste). */
  portao: number;
}

/** O que o bot precisa das regras do jogo, além do próprio perfil. */
export interface RegrasDoBot {
  cfg: ConfigBots;
  combate: Combate;
  evolucoes: TabelaDeEvolucoes;
  /** Espécies que só brigam se o jogador chegar perto (quintais). */
  selvagens: ReadonlySet<string>;
  /** Custo de Luz do pulso da lanterna, o raio e a duração dele. */
  lanterna: { custo: number; raio: number; duracao: number };
}

/** Uma área que vai machucar: o aviso vermelho de um ataque ou o caminho de um projétil. */
interface Perigo {
  tipo: 'circulo' | 'quadrado' | 'faixa';
  centro: V2;
  raio: number;
  a: V2;
  b: V2;
  largura: number;
  /** Segundos até o impacto. */
  em: number;
}

/** Peso de cada inimigo na escolha do alvo (maior primeiro); os outros valem 3. */
const PRIORIDADE: Readonly<Record<string, number>> = {
  arremessador: 6,
  pestinha_lencol: 5,
  abobora_canhao: 4,
  guarda_condominio: 5,
  poste_corrompido: 1,
};
/** Folga em volta do corpo ao conferir se um ponto está no perigo, em tiles. */
const FOLGA_PERIGO = 0.35;
/** Distâncias tentadas para fugir de um aviso, em tiles. */
const PASSOS_DE_FUGA = [1.4, 2.2, 3.2];
const DIRECOES_DE_FUGA = 16;
/** Chegou ao ponto do caminho. */
const PERTO_DO_PONTO = 0.6;
/** Por quanto tempo os projéteis de quem anunciou um tiro continuam conhecidos, em s. */
const MEMORIA_DO_TIRO_S = 1.5;
/** Tão perto do ponto contra o Poste que já pode bater, em tiles. */
const PERTO_DO_LUGAR = 0.08;
/** Quantos postes amigos (os mais perto) o bot tenta ao procurar onde se curar. */
const TENTATIVAS_DE_LUZ = 3;
/** Pontos tentados em volta do poste e a distância deles ao poste, em tiles. */
const DIRECOES_NA_LUZ = 8;
const DENTRO_DA_LUZ = 1.2;
/** A Bruxinha pode lançar o E para fugir quando o impacto está a menos disso, em s. */
const DASH_SE_FALTA_S = 0.35;

/**
 * Bot que joga um mapa de luta como uma pessoa jogaria (GDD, "Perfis de bot"): enxerga com atraso
 * (tempo de reação), erra a mira numa fração do alcance, desvia (ou não) dos avisos vermelhos, usa a
 * luz e a lanterna, gasta os pontos de nível e escolhe as evoluções. A cada decisão, só enfileira
 * comandos, como a tela faz com o mouse e o teclado.
 */
export class BotDeCombate {
  private readonly rng: Rng;
  private proximaDecisao = 0;
  private readonly historico: { tick: number; pos: Map<number, V2> }[] = [];
  /** Avisos já notados: quando foram vistos e se o bot decidiu desviar. */
  private readonly vistos = new Map<string, { tick: number; desvia: boolean }>();
  /** Inimigos cujo aviso de tiro o bot viu, até quando (os projéteis deles já são conhecidos). */
  private readonly atiradores = new Map<number, number>();
  private caminho: V2[] = [];
  private destinoDoCaminho: V2 | null = null;
  private caminhoEm = -Infinity;
  private pontoPedido: V2 | null = null;
  private parado = false;
  private curando = false;
  private preso = { pos: { x: 0, y: 0 }, tick: 0 };
  /** Atirador que o bot de corpo a corpo persegue e até quando. */
  private perseguicao: { id: number; ate: number } | null = null;
  /** Luz escolhida para se curar e até quando a escolha vale. */
  private luzEscolhida: { p: V2; ate: number } | null = null;
  /** Tick a partir do qual pode pulsar a lanterna de novo (o pulso dura um tempo). */
  private lanternaDe = 0;
  /** Lançamentos de habilidade pedidos (relatório). */
  lancamentos = 0;
  /** Rolamentos pedidos (estatística da run). */
  rolamentos = 0;

  /** Casas Desconfiadas em que o bot já bateu nesta rua (a porta que recusou não é tentada de novo). */
  private readonly casasTentadas = new Set<number>();

  constructor(
    readonly perfil: PerfilBot,
    readonly regras: RegrasDoBot,
    semente: number,
  ) {
    this.rng = new Rng(semente);
  }

  // ------------------------------------------------------------------ fora do mapa

  /** Gasta os pontos de nível: o R quando dá, e Q, W e E pela ordem do perfil. */
  gastarPontos(ficha: Ficha): void {
    const niveis = this.regras.combate.niveis;
    const l = ficha.lancador;
    const p = ficha.progresso;
    while (p.pontos > 0) {
      if (podeSubirPosto(l, p, 'R', niveis)) {
        subirPosto(l, p, 'R', niveis);
        continue;
      }
      const possiveis = (['Q', 'W', 'E'] as const).filter((t) => podeSubirPosto(l, p, t, niveis));
      if (possiveis.length === 0) break;
      let tecla: string = this.rng.escolher(possiveis);
      if (this.perfil.pontos === 'ordem') {
        // A primeira tecla da ordem que ainda está abaixo do posto que a ordem pede até ali.
        const pedidos: Record<string, number> = {};
        for (const t of this.regras.cfg.ordemDosPontos) {
          pedidos[t] = (pedidos[t] ?? 0) + 1;
          if (pedidos[t]! > l.slots[t]!.posto && possiveis.includes(t)) {
            tecla = t;
            break;
          }
        }
      }
      subirPosto(l, p, tecla, niveis);
    }
    for (let t = evolucaoPendente(ficha, this.regras.evolucoes, niveis); t;) {
      const opcoes = opcoesDeEvolucao(ficha, t, this.regras.evolucoes, niveis);
      const chanceA =
        this.perfil.evolucoes === 'preferencia'
          ? (this.regras.cfg.chanceDaEvolucaoA[l.slots[t]!.def.id] ?? 0.5)
          : 0.5;
      const escolha = this.rng.proximo() < chanceA ? opcoes[0]! : opcoes[1]!;
      escolherEvolucao(ficha, t, escolha.evo.id, this.regras.evolucoes, niveis);
      t = evolucaoPendente(ficha, this.regras.evolucoes, niveis);
    }
  }

  // ------------------------------------------------------------------ no mapa

  /** Começo de um mapa novo: o mundo recomeça do tick 0 e tudo que o bot lembrava fica para trás. */
  novoMapa(): void {
    this.casasTentadas.clear();
    this.proximaDecisao = 0;
    this.historico.length = 0;
    this.vistos.clear();
    this.atiradores.clear();
    this.caminho = [];
    this.destinoDoCaminho = null;
    this.caminhoEm = -Infinity;
    this.pontoPedido = null;
    this.parado = false;
    this.curando = false;
    this.preso = { pos: { x: 0, y: 0 }, tick: 0 };
    this.lanternaDe = 0;
    this.luzEscolhida = null;
    this.perseguicao = null;
  }

  /** Chamado antes de cada tick do mundo. */
  agir(m: MapaDoBot): void {
    const { mundo, jogador: j } = m;
    if (mundo.tick < this.proximaDecisao || !vivo(j)) return;
    this.proximaDecisao = mundo.tick + Math.max(1, Math.round(this.regras.cfg.decisaoS / mundo.dt));
    this.lembrar(mundo);
    this.gastarPontos(m.ficha);

    const perigos = this.perigos(m);
    const emPerigo = perigos.filter((p) => this.dentro(j.pos, p, j.raio + FOLGA_PERIGO));
    if (emPerigo.length > 0) {
      // Golpeia quem estiver no alcance enquanto desvia (o golpe manual não pede ficar parado).
      this.golpearNoCaminho(m);
      this.fugir(m, perigos, Math.min(...emPerigo.map((p) => p.em)));
      return;
    }

    const c = j.combate!;
    const fracao = c.coragem / c.attr.coragemMax;
    if (this.perfil.usaLuz) {
      if (fracao < this.regras.cfg.luzCuraAbaixo) this.curando = true;
      else if (fracao >= this.regras.cfg.luzCuraAte) this.curando = false;
    }

    const inimigos = this.inimigosPerto(m);
    const alvo = inimigos[0] ?? null;
    // Na praça do chefe, com ninguém perto ainda, enche a Coragem na luz antes de ir para a briga
    // (a run vai da 3ª rua direto para o chefe, sem banco).
    const chefe = m.regras.estado.chefe;
    if (
      this.perfil.usaLuz &&
      chefe &&
      vivo(chefe) &&
      !alvo &&
      fracao < this.regras.cfg.luzCuraAte &&
      this.luzMaisPerto(m)
    )
      this.curando = true;
    if (alvo && !j.lancador?.lancando && !j.forcado) this.usarHabilidades(m, alvo, inimigos);
    this.talvezLanterna(m, inimigos);

    // Corpo a corpo atrás de um atirador: vai até derrubar ou até o tempo da perseguição acabar,
    // sem trocar de ideia a cada decisão (senão nunca alcança e nunca se cura).
    const perseguido = this.perseguido(m);
    if (perseguido && !this.deLonge(m)) {
      if (!j.lancador?.lancando && !j.forcado) this.usarHabilidades(m, perseguido, inimigos);
      this.lutar(m, perseguido, inimigos);
      return;
    }
    if (this.curando && this.deLonge(m)) {
      // Quem ataca de longe se cura brigando: vai para a luz e troca tiros dali.
      const luz = this.luzMaisPerto(m);
      if (luz && m.luz.postesQueCuram(j.pos) === 0) {
        this.irPara(m, luz);
        return;
      }
      // Na luz e sem ninguém por perto: espera a Coragem encher ali.
      if (!alvo && m.luz.postesQueCuram(j.pos) > 0) {
        this.mover(m, j.pos);
        return;
      }
    } else if (this.curando) {
      // Só a luz de poste amigo cura (a de janela não).
      const naLuz = m.luz.postesQueCuram(j.pos) > 0;
      const atiradores = this.atiradoresAVista(inimigos);
      if (!naLuz || atiradores.some((a) => this.noAlcanceDe(a, j.pos))) {
        const luz = this.luzMaisPerto(m, atiradores);
        // Sem luz fora do alcance de quem atira, ficar parado na luz só serve de alvo: briga.
        if (luz) {
          this.irPara(m, luz);
          return;
        }
        this.curando = false;
      } else {
        // Na luz e a salvo dos tiros: só bate em quem encostar, sem sair da luz.
        const encostado = inimigos.find((e) => this.alcancavel(m, e));
        if (encostado) this.lutar(m, encostado, inimigos);
        else this.mover(m, j.pos);
        return;
      }
    }
    if (alvo) {
      this.lutar(m, alvo, inimigos);
      return;
    }
    const bau = this.bauPerto(m);
    if (bau) {
      if (Math.hypot(bau.x - j.pos.x, bau.y - j.pos.y) < 1) {
        enfileirar(mundo, { tipo: 'usar', id: j.id, acao: 'interagir', x: 0, y: 0 });
      }
      this.irPara(m, bau);
      return;
    }
    const casa = this.casaPerto(m);
    if (casa) {
      if (Math.hypot(casa.pos.x - j.pos.x, casa.pos.y - j.pos.y) < 0.9) {
        this.casasTentadas.add(casa.indice);
        enfileirar(mundo, { tipo: 'usar', id: j.id, acao: 'interagir', x: 0, y: 0 });
      }
      this.irPara(m, casa.pos);
      return;
    }
    const objetivo = this.objetivo(m);
    if (objetivo) this.irPara(m, objetivo);
  }

  /** Uma Casa Desconfiada perto, ainda fechada, para bater (só quem bate nas casas). */
  private casaPerto(m: MapaDoBot): { pos: V2; indice: number } | null {
    if (!this.perfil.bateNasCasas) return null;
    const j = m.jogador;
    let melhor: { pos: V2; indice: number } | null = null;
    let melhorD = this.regras.cfg.raioBau;
    (m.regras.exploracao?.estado.desconfiadas ?? []).forEach((d, indice) => {
      if (d.batida || this.casasTentadas.has(indice)) return;
      const dist = Math.hypot(d.x - j.pos.x, d.y - j.pos.y);
      if (dist < melhorD) {
        melhorD = dist;
        melhor = { pos: { x: d.x, y: d.y }, indice };
      }
    });
    return melhor;
  }

  /**
   * Joga o minijogo da Casa Desconfiada até o fim (a rua fica parada): acerta com a chance do
   * perfil; dos acertos, `minijogo.chancePerfeito` saem perfeitos e os outros respondem atrasado.
   * Quem não acerta fica parado até o tempo acabar.
   */
  jogarMinijogo(mj: Minijogo): void {
    const cfg = this.regras.cfg.minijogo;
    const acerta = this.rng.proximo() < this.perfil.acertoMinijogo;
    const perfeito = acerta && this.rng.proximo() < cfg.chancePerfeito;
    const atrasoS =
      mj.vista.tipo === 'toque'
        ? cfg.atrasoToque * mj.vista.janelaS
        : mj.vista.tipo === 'olho'
          ? cfg.atrasoOlhoS
          : mj.vista.tipo === 'quem'
            ? cfg.atrasoQuemS
            : 0;
    const atraso = perfeito ? 0 : Math.round(atrasoS / mj.dt);
    const fila: { tick: number; e: EntradaMinijogo }[] = [];
    let anterior = mj.vista.tipo === 'fresta' ? mj.vista.doce : 0;
    for (let guarda = 0; guarda < 60 * 30 && !mj.terminou; guarda++) {
      if (acerta) {
        const v = mj.vista;
        if (v.tipo === 'fresta' && !perfeito) {
          // Bate na beira do vão (dentro, mas longe do meio), olhando onde o doce vai estar no
          // passo em que a batida conta.
          const prox = v.doce + (v.doce - anterior);
          const desvio = Math.abs(prox - v.centro);
          if (desvio <= v.vao * cfg.vaoDaFresta && desvio >= v.vao / 4)
            mj.entrar({ tipo: 'toque' });
          anterior = v.doce;
        } else {
          const certa = mj.respostaCerta();
          if (certa && !fila.some((f) => f.tick >= mj.tick))
            fila.push({ tick: mj.tick + atraso, e: certa });
          const pronta = fila.findIndex((f) => f.tick === mj.tick);
          if (pronta >= 0) mj.entrar(fila.splice(pronta, 1)[0]!.e);
        }
      }
      mj.passo();
    }
  }

  /** Guarda onde cada inimigo estava, para enxergar com o atraso da reação. */
  private lembrar(mundo: Mundo): void {
    const pos = new Map<number, V2>();
    for (const e of mundo.entidades) if (e.tipo === 'inimigo') pos.set(e.id, { ...e.pos });
    this.historico.push({ tick: mundo.tick, pos });
    const guardar = Math.ceil((this.perfil.reacaoS + 1) / this.regras.cfg.decisaoS) + 2;
    while (this.historico.length > guardar) this.historico.shift();
  }

  /** Onde o bot acha que o inimigo está: a posição de `reacaoS` atrás. */
  private vistaDe(mundo: Mundo, e: Entidade, atrasoS = this.perfil.reacaoS): V2 {
    const alvoTick = mundo.tick - atrasoS / mundo.dt;
    for (let i = this.historico.length - 1; i >= 0; i--) {
      const h = this.historico[i]!;
      if (h.tick <= alvoTick) return h.pos.get(e.id) ?? e.pos;
    }
    return this.historico[0]?.pos.get(e.id) ?? e.pos;
  }

  // ------------------------------------------------------------------ perigos

  private notado(mundo: Mundo, chave: string, jaVisto = false): boolean {
    let v = this.vistos.get(chave);
    if (!v) {
      v = {
        tick: jaVisto ? -Infinity : mundo.tick,
        desvia: jaVisto || this.rng.proximo() < this.perfil.chanceDesvio,
      };
      this.vistos.set(chave, v);
    }
    return v.desvia && mundo.tick - v.tick >= this.perfil.reacaoS / mundo.dt;
  }

  /** Avisos vermelhos e projéteis inimigos que o bot já viu e decidiu evitar. */
  private perigos(m: MapaDoBot): Perigo[] {
    const { mundo } = m;
    const lista: Perigo[] = [];
    const ativos = new Set<string>();
    for (const e of mundo.entidades) {
      const l = e.lancador;
      if (e.tipo !== 'inimigo' || !l?.lancando || !vivo(e)) continue;
      const def = l.slots[l.lancando.chave]?.def;
      if (!def?.aviso) continue;
      const lanc = l.lancando;
      const chave = `${e.id}:${lanc.origem.x.toFixed(2)}:${lanc.origem.y.toFixed(2)}:${lanc.total}`;
      ativos.add(chave);
      if (!this.notado(mundo, chave)) continue;
      // Quem viu o aviso já sabe para onde o projétil vai quando ele sair.
      this.atiradores.set(e.id, mundo.tick + Math.round(MEMORIA_DO_TIRO_S / mundo.dt));
      lista.push(...this.zonaDoAtaque(def, lanc.origem, lanc.alvo, lanc.restante));
    }
    for (const p of m.executor.estado.projeteis) {
      if (p.lado === 'jogador') continue;
      const chave = `p${p.id}`;
      ativos.add(chave);
      const jaVisto = (this.atiradores.get(p.dono) ?? -1) >= mundo.tick;
      if (!this.notado(mundo, chave, jaVisto)) continue;
      const alcance = Math.min(p.restante, p.velocidade * 1.5);
      lista.push({
        tipo: 'faixa',
        centro: p.pos,
        raio: 0,
        a: { ...p.pos },
        b: { x: p.pos.x + p.dir.x * alcance, y: p.pos.y + p.dir.y * alcance },
        largura: p.largura,
        em: Math.hypot(m.jogador.pos.x - p.pos.x, m.jogador.pos.y - p.pos.y) / p.velocidade,
      });
    }
    for (const k of this.vistos.keys()) if (!ativos.has(k)) this.vistos.delete(k);
    return lista;
  }

  private zonaDoAtaque(def: Habilidade, origem: V2, alvo: V2, em: number): Perigo[] {
    const f = def.forma;
    const dir = (() => {
      const d = Math.hypot(alvo.x - origem.x, alvo.y - origem.y) || 1;
      return { x: (alvo.x - origem.x) / d, y: (alvo.y - origem.y) / d };
    })();
    switch (f.tipo) {
      case 'area': {
        const centro = f.centradaNoLancador ? origem : pontoNoAlcance(origem, alvo, f.alcance);
        return [
          {
            tipo: f.quadrada ? 'quadrado' : 'circulo',
            centro,
            raio: f.raio,
            a: centro,
            b: centro,
            largura: 0,
            em,
          },
        ];
      }
      case 'linha':
        return direcoesDoLeque(dir, def.leque).map((d) => ({
          tipo: 'faixa' as const,
          centro: origem,
          raio: 0,
          a: origem,
          b: { x: origem.x + d.x * f.alcance, y: origem.y + d.y * f.alcance },
          largura: f.largura,
          em,
        }));
      case 'dash':
        return [
          {
            tipo: 'faixa',
            centro: origem,
            raio: 0,
            a: origem,
            b: { x: origem.x + dir.x * f.distancia, y: origem.y + dir.y * f.distancia },
            largura: 1,
            em,
          },
        ];
      case 'cone':
        return [
          {
            tipo: 'circulo',
            centro: origem,
            raio: f.alcance,
            a: origem,
            b: origem,
            largura: 0,
            em,
          },
        ];
      default:
        return [];
    }
  }

  private dentro(p: V2, z: Perigo, folga: number): boolean {
    if (z.tipo === 'circulo')
      return Math.hypot(p.x - z.centro.x, p.y - z.centro.y) <= z.raio + folga;
    if (z.tipo === 'quadrado')
      return (
        Math.abs(p.x - z.centro.x) <= z.raio + folga && Math.abs(p.y - z.centro.y) <= z.raio + folga
      );
    return distanciaAoSegmento(p, z.a, z.b) <= z.largura / 2 + folga;
  }

  /** Quanto o ponto está fora da área do perigo (negativo: dentro), em tiles. */
  private margem(p: V2, z: Perigo): number {
    if (z.tipo === 'circulo') return Math.hypot(p.x - z.centro.x, p.y - z.centro.y) - z.raio;
    if (z.tipo === 'quadrado')
      return Math.max(Math.abs(p.x - z.centro.x), Math.abs(p.y - z.centro.y)) - z.raio;
    return distanciaAoSegmento(p, z.a, z.b) - z.largura / 2;
  }

  /**
   * Sai do aviso pelo ponto livre mais perto e, entre os da mesma distância, pelo que fica mais
   * longe dos perigos (para longe do centro, como uma pessoa correria); com o impacto em cima, usa
   * o E.
   */
  private fugir(m: MapaDoBot, perigos: Perigo[], em: number): void {
    const j = m.jogador;
    const folga = (p: V2) => Math.min(...perigos.map((z) => this.margem(p, z)));
    let melhor: V2 | null = null;
    let melhorFolga = -Infinity;
    for (const passo of PASSOS_DE_FUGA) {
      for (let k = 0; k < DIRECOES_DE_FUGA; k++) {
        const ang = (k / DIRECOES_DE_FUGA) * Math.PI * 2;
        const p = { x: j.pos.x + Math.cos(ang) * passo, y: j.pos.y + Math.sin(ang) * passo };
        if (!m.grade.ehLivre(p) || !m.grade.linhaLivre(j.pos, p)) continue;
        const f = folga(p);
        if (f <= j.raio + FOLGA_PERIGO) continue;
        if (f > melhorFolga) {
          melhorFolga = f;
          melhor = p;
        }
      }
      if (melhor) break;
    }
    if (!melhor) return;
    // Com o impacto em cima, rola (Espaço) para o ponto livre; sem rolamento pronto, o dash.
    if (this.perfil.usaE && em < DASH_SE_FALTA_S && (j.rolarEm ?? 0) <= m.mundo.tick) {
      enfileirar(m.mundo, {
        tipo: 'rolar',
        id: j.id,
        x: melhor.x - j.pos.x,
        y: melhor.y - j.pos.y,
      });
      this.rolamentos++;
      return;
    }
    const fuga = ['E', 'W', 'Q', 'R'].find((t) => {
      const uso = this.usoDe(m, t);
      return (uso === 'fuga' || uso === 'investida') && this.pronta(m, t);
    });
    if (this.perfil.usaE && em < DASH_SE_FALTA_S && fuga) {
      this.lancar(m, fuga, melhor);
      return;
    }
    this.mover(m, melhor);
  }

  // ------------------------------------------------------------------ alvos

  private ehSelvagem(e: Entidade): boolean {
    return this.regras.selvagens.has(e.especie);
  }

  /** Inimigos que valem a briga, do mais importante para o menos. */
  private inimigosPerto(m: MapaDoBot): Entidade[] {
    const j = m.jogador;
    const raio = this.regras.cfg.raioCombate;
    // Até a borda: o Dono do Bairro é uma casa, e o centro dele fica longe de quem bate na fachada.
    const ate = (e: Entidade) =>
      Math.max(0, Math.hypot(e.pos.x - j.pos.x, e.pos.y - j.pos.y) - e.raio);
    const lista = m.mundo.entidades.filter((e) => {
      if (e.tipo !== 'inimigo' || !vivo(e) || !e.combate) return false;
      if (e.combate.estados.some((x) => x.tipo === 'invisivel')) return false;
      const d = ate(e);
      if (this.ehSelvagem(e)) return d < 2.5;
      return d <= raio;
    });
    // De longe, a prioridade manda; corpo a corpo, o que está perto (correr atrás do Arremessador
    // atravessando a onda custa mais que ele).
    const peso = this.deLonge(m)
      ? this.regras.cfg.pesoDistanciaDeLonge
      : this.regras.cfg.pesoDistanciaCorpoACorpo;
    const nota = (e: Entidade) => {
      const d = ate(e);
      const elite = e.combate!.chefe || m.regras.estado.elites.includes(e) ? 4 : 0;
      return (PRIORIDADE[e.especie] ?? 3) + elite - d * peso;
    };
    return lista.sort((a, b) => nota(b) - nota(a));
  }

  private pontoComErro(p: V2, alcance: number): V2 {
    const r = this.perfil.erroMira * alcance * this.rng.proximo();
    const ang = this.rng.proximo() * Math.PI * 2;
    return { x: p.x + Math.cos(ang) * r, y: p.y + Math.sin(ang) * r };
  }

  /** Onde mirar no alvo: onde ele estava (com o atraso), ou onde vai estar, e o erro do perfil. */
  private mira(m: MapaDoBot, alvo: Entidade, alcance: number, velocidadeProjetil: number): V2 {
    const visto = this.vistaDe(m.mundo, alvo);
    let p = visto;
    if (this.perfil.miraFutura && velocidadeProjetil > 0) {
      const antes = this.vistaDe(m.mundo, alvo, this.perfil.reacaoS + 0.3);
      const v = { x: (visto.x - antes.x) / 0.3, y: (visto.y - antes.y) / 0.3 };
      const t =
        Math.hypot(visto.x - m.jogador.pos.x, visto.y - m.jogador.pos.y) / velocidadeProjetil;
      p = {
        x: visto.x + v.x * (t + this.perfil.reacaoS),
        y: visto.y + v.y * (t + this.perfil.reacaoS),
      };
    }
    return this.pontoComErro(p, alcance);
  }

  private pronta(m: MapaDoBot, tecla: string): boolean {
    const s = m.ficha.lancador.slots[tecla]!;
    return (
      s.posto > 0 &&
      (s.recarga <= 0 || s.cargas > 0) &&
      m.jogador.combate!.energia >= m.executor.custo(m.jogador, s)
    );
  }

  /** Como o bot usa cada habilidade (content/bots.json, `usos`): o mesmo jeito serve a todos. */
  private usoDe(m: MapaDoBot, tecla: string): UsoDeHabilidade | null {
    return this.regras.cfg.usos[m.ficha.lancador.slots[tecla]!.def.id] ?? null;
  }

  private importante(m: MapaDoBot, e: Entidade): boolean {
    return (
      e.combate!.chefe || e.especie === 'poste_corrompido' || m.regras.estado.elites.includes(e)
    );
  }

  private usarHabilidades(m: MapaDoBot, alvo: Entidade, inimigos: Entidade[]): void {
    const j = m.jogador;
    const dist = (e: { pos: V2 }, p: V2 = j.pos) => Math.hypot(e.pos.x - p.x, e.pos.y - p.y);
    const d = dist(alvo);
    const importante = this.importante(m, alvo);
    const fracao = j.combate!.coragem / j.combate!.attr.coragemMax;
    // O R primeiro (muda a luta), depois W, Q e E.
    for (const tecla of ['R', 'W', 'Q', 'E']) {
      if (!this.pronta(m, tecla)) continue;
      const uso = this.usoDe(m, tecla);
      const def = m.ficha.lancador.slots[tecla]!.def;
      const f = def.forma;
      const alcance = 'alcance' in f ? f.alcance : 0;
      const raio = f.tipo === 'area' ? f.raio : 0;
      const minimo = tecla === 'R' ? 3 : 2;
      const emVolta = (p: V2, r: number) => inimigos.filter((o) => dist(o, p) <= r).length;
      switch (uso) {
        case 'disparo': {
          const alvoQ = this.alvoDaLinha(m, tecla, inimigos, alcance);
          if (!alvoQ) break;
          this.lancar(
            m,
            tecla,
            this.mira(m, alvoQ, alcance, f.tipo === 'linha' ? f.velocidade : 0),
          );
          return;
        }
        case 'area':
          if (d <= alcance && (importante || emVolta(alvo.pos, raio) >= minimo)) {
            this.lancar(m, tecla, this.mira(m, alvo, alcance, 0));
            return;
          }
          break;
        case 'emVolta': {
          const perto = inimigos.filter((o) => dist(o) <= raio);
          if (perto.length >= minimo || perto.some((o) => this.importante(m, o))) {
            this.lancar(m, tecla, { ...j.pos });
            return;
          }
          break;
        }
        case 'execucao': {
          const presa = inimigos
            .filter((o) => dist(o) <= alcance && o.especie !== 'poste_corrompido')
            .sort(
              (a, b) =>
                a.combate!.coragem / a.combate!.attr.coragemMax -
                b.combate!.coragem / b.combate!.attr.coragemMax,
            )[0];
          if (
            presa &&
            (this.importante(m, presa) ||
              presa.combate!.coragem / presa.combate!.attr.coragemMax < 0.5)
          ) {
            this.lancar(m, tecla, { ...presa.pos });
            return;
          }
          break;
        }
        case 'alvo':
        case 'perto':
          if (d <= alcance) {
            this.lancar(m, tecla, this.mira(m, alvo, alcance, 0));
            return;
          }
          break;
        case 'escudo':
          if (d <= 2.5 && (fracao < 0.85 || emVolta(j.pos, 2.5) >= 2 || importante)) {
            this.lancar(m, tecla, { ...j.pos });
            return;
          }
          break;
        case 'buff':
          if (emVolta(j.pos, 3) >= 2 || (importante && d <= 4)) {
            this.lancar(m, tecla, { ...j.pos });
            return;
          }
          break;
        case 'sumir':
          if (fracao < 0.45 && emVolta(j.pos, 4) >= 1) {
            this.lancar(m, tecla, { ...j.pos });
            this.curando = true;
            return;
          }
          break;
        case 'investida':
          if (f.tipo === 'dash' && d >= 2.5 && d <= f.distancia + 0.5) {
            this.lancar(m, tecla, { ...alvo.pos });
            return;
          }
          break;
        default:
          break;
      }
    }
  }

  /**
   * Alvo de uma habilidade em linha: quem ela derruba de uma vez vale mais (o Arremessador cai com
   * uma Q), depois a prioridade e a distância; só quem está no alcance e com a linha livre.
   */
  private alvoDaLinha(
    m: MapaDoBot,
    tecla: string,
    inimigos: Entidade[],
    alcance: number,
  ): Entidade | null {
    const j = m.jogador;
    const s = m.ficha.lancador.slots[tecla]!;
    const dano = s.def.efeitos.find((e) => e.tipo === 'dano');
    const bruto = dano && dano.tipo === 'dano' ? danoBruto(dano, s.posto, j.combate!.attr) : 0;
    let melhor: Entidade | null = null;
    let melhorNota = -Infinity;
    for (const e of inimigos) {
      const d = Math.hypot(e.pos.x - j.pos.x, e.pos.y - j.pos.y);
      if (d > alcance || !m.grade.linhaLivre(j.pos, e.pos)) continue;
      const real = (bruto * 100) / (100 + e.combate!.attr.resistencia);
      const mata = real >= e.combate!.coragem ? 3 : 0;
      const nota = mata + (PRIORIDADE[e.especie] ?? 3) - d * 0.25;
      if (nota > melhorNota) {
        melhorNota = nota;
        melhor = e;
      }
    }
    return melhor;
  }

  private talvezLanterna(m: MapaDoBot, inimigos: Entidade[]): void {
    if (!this.perfil.usaLanterna) return;
    const j = m.jogador;
    const { custo, raio } = this.regras.lanterna;
    if (j.combate!.luz < custo) return;
    // Iluminado, o bot fica à vista do Poste Corrompido (na sombra ele mal enxerga).
    if (this.postePerto(m)) return;
    const perto = inimigos.filter(
      (e) =>
        e.especie !== 'poste_corrompido' &&
        !e.combate!.chefe &&
        Math.hypot(e.pos.x - j.pos.x, e.pos.y - j.pos.y) <= raio * 0.7,
    );
    if (perto.length >= 2 && m.mundo.tick >= this.lanternaDe) {
      enfileirar(m.mundo, { tipo: 'usar', id: j.id, acao: 'lanterna', x: 0, y: 0 });
      this.lanternaDe = m.mundo.tick + Math.round(this.regras.lanterna.duracao / m.mundo.dt);
    }
  }

  /**
   * O atirador que o bot de corpo a corpo está perseguindo, se ainda vale: vivo e dentro do tempo
   * da perseguição. Começa quando o alvo escolhido para a briga é um atirador.
   */
  private perseguido(m: MapaDoBot): Entidade | null {
    const p = this.perseguicao;
    if (!p) return null;
    const e = m.mundo.entidades.find((x) => x.id === p.id);
    if (!e || !vivo(e) || m.mundo.tick > p.ate) {
      this.perseguicao = null;
      return null;
    }
    return e;
  }

  /** Algum Poste Corrompido vivo alcançaria o bot se ele estivesse na luz. */
  private postePerto(m: MapaDoBot): boolean {
    const j = m.jogador;
    return m.regras.estado.postes.some((p) => {
      if (!vivo(p) || !p.lancador) return false;
      const alcance = Math.max(
        0,
        ...Object.values(p.lancador.slots).map((s) =>
          'alcance' in s.def.forma ? s.def.forma.alcance : 0,
        ),
      );
      return (
        Math.hypot(p.pos.x - j.pos.x, p.pos.y - j.pos.y) <=
        alcance + this.regras.cfg.folgaDaLuzSegura
      );
    });
  }

  /** Briga: recua das pestinhas que encostam, chega perto o bastante e ataca parado. */
  private lutar(m: MapaDoBot, alvoInicial: Entidade, inimigos: Entidade[]): void {
    let alvo = alvoInicial;
    const j = m.jogador;
    const cfg = this.regras.cfg;
    if (!this.deLonge(m) && !this.perseguicao && this.atiradoresAVista([alvo]).length > 0) {
      this.perseguicao = {
        id: alvo.id,
        ate: m.mundo.tick + Math.round(cfg.perseguicaoS / m.mundo.dt),
      };
    }
    const deLonge = this.deLonge(m);
    const alcanceAtaque = this.alcanceAtaque(m);
    if (this.perfil.recua && deLonge) {
      const encostados = inimigos.filter(
        (e) =>
          e.especie !== 'poste_corrompido' &&
          Math.hypot(e.pos.x - j.pos.x, e.pos.y - j.pos.y) < cfg.distanciaKite,
      );
      // Anda e ataca: com o golpe pronto (ou saindo), para e bate; no resto da recarga, recua.
      const a = j.ataque;
      const golpeProximo = !!a && (a.preparo !== null || a.recarga <= cfg.decisaoS);
      if (encostados.length > 0 && !golpeProximo) {
        const fuga = this.pontoDeRecuo(m, inimigos);
        if (fuga) {
          this.mover(m, fuga);
          return;
        }
      }
    }
    // Chefes e elites: brigar na ponta do alcance, onde os leques e os golpes em volta erram.
    const grande = inimigos.find(
      (e) =>
        (e.combate!.chefe || m.regras.estado.elites.includes(e)) &&
        Math.hypot(e.pos.x - j.pos.x, e.pos.y - j.pos.y) < cfg.distanciaDoChefe,
    );
    const a2 = j.ataque;
    const golpe2 = !!a2 && (a2.preparo !== null || a2.recarga <= cfg.decisaoS);
    if (grande && this.perfil.recua && deLonge && !golpe2) {
      const fuga = this.pontoDeRecuo(m, [grande]);
      if (fuga) {
        this.mover(m, fuga);
        return;
      }
    }
    // Quem está encostado apanha primeiro (o alvo da lista pode estar longe).
    const encostado = inimigos.find(
      (e) => Math.hypot(e.pos.x - j.pos.x, e.pos.y - j.pos.y) < cfg.distanciaKite,
    );
    if (encostado && encostado !== alvo && !this.ehSelvagem(encostado)) alvo = encostado;
    // Contra o Poste: um ponto na sombra, no alcance do auto-ataque (na sombra ele mal enxerga).
    if (alvo.especie === 'poste_corrompido' && this.perfil.usaLuz) {
      const lugar = this.lugarContraOPoste(m, alvo);
      const falta = lugar ? Math.hypot(lugar.x - j.pos.x, lugar.y - j.pos.y) : 0;
      if (lugar && falta > PERTO_DO_LUGAR) {
        // De perto, direto ao ponto: o caminho para com folga e o bot passaria do ponto.
        if (falta < PERTO_DO_PONTO * 3 && m.grade.linhaLivre(j.pos, lugar)) this.mover(m, lugar);
        else this.irPara(m, lugar);
        return;
      }
      if (lugar) {
        // No ponto: bate dali mesmo, sem dar o passo que o poria à vista do Poste.
        this.golpearAlvo(m, alvo);
        return;
      }
    }
    // O auto-ataque mede até a borda do alvo.
    const d = Math.hypot(alvo.pos.x - j.pos.x, alvo.pos.y - j.pos.y) - alvo.raio;
    // O Dono do Bairro é a própria casa: o centro dele nunca fica à vista. Bate de um ponto livre
    // diante dele, no alcance do auto-ataque.
    const casa = !!alvo.combate?.chefe && !m.grade.linhaLivre(j.pos, alvo.pos);
    if (casa && d > alcanceAtaque) {
      this.irPara(m, this.lugarContraOChefe(m, alvo) ?? alvo.pos);
      return;
    }
    if (!casa && (d > alcanceAtaque || !m.grade.linhaLivre(j.pos, alvo.pos))) {
      this.irPara(m, alvo.pos);
      return;
    }
    // No alcance: para e golpeia o alvo escolhido (ataque manual, botão esquerdo).
    this.golpearAlvo(m, alvo);
  }

  /** Fugindo: golpeia o inimigo mais perto, se ele estiver no alcance e o golpe pronto. */
  private golpearNoCaminho(m: MapaDoBot): void {
    const j = m.jogador;
    if ((j.ataque?.recarga ?? 0) > 0) return;
    const auto = m.ficha.campeao.autoAtaque;
    const alcance = auto.projetil ? this.alcanceAtaque(m) : auto.alcance;
    const alvo = this.inimigosPerto(m).find(
      (e) => Math.hypot(e.pos.x - j.pos.x, e.pos.y - j.pos.y) - e.raio <= alcance,
    );
    if (!alvo) return;
    const p = this.mira(m, alvo, auto.alcance, auto.projetil?.velocidade ?? 0);
    enfileirar(m.mundo, { tipo: 'golpear', id: j.id, x: p.x - j.pos.x, y: p.y - j.pos.y });
  }

  /**
   * Golpe manual como quem joga: parado, golpeia na direção do alvo a cada decisão (a simulação
   * respeita a recarga), mirando com o atraso e o erro do perfil.
   */
  private golpearAlvo(m: MapaDoBot, alvo: Entidade): void {
    const j = m.jogador;
    if (!this.parado) {
      enfileirar(m.mundo, { tipo: 'parar', id: j.id });
      this.parado = true;
      this.pontoPedido = null;
    }
    if ((j.ataque?.recarga ?? 0) > 0) return;
    const auto = m.ficha.campeao.autoAtaque;
    const p = this.mira(m, alvo, auto.alcance, auto.projetil?.velocidade ?? 0);
    enfileirar(m.mundo, { tipo: 'golpear', id: j.id, x: p.x - j.pos.x, y: p.y - j.pos.y });
  }

  /** Quem ataca de longe (a Bruxinha) recua entre os golpes; quem bate de perto vai para cima. */
  private deLonge(m: MapaDoBot): boolean {
    return m.ficha.campeao.autoAtaque.projetil !== null;
  }

  /** Distância (até a borda do alvo) para parar e bater: um pouco dentro do alcance do auto-ataque. */
  private alcanceAtaque(m: MapaDoBot): number {
    return Math.min(this.regras.cfg.alcanceAtaque, m.ficha.campeao.autoAtaque.alcance - 0.15);
  }

  /** Ponto livre na borda do alcance do auto-ataque em volta de um chefe, o mais perto do bot. */
  private lugarContraOChefe(m: MapaDoBot, chefe: Entidade): V2 | null {
    const j = m.jogador;
    const raio = this.alcanceAtaque(m) + chefe.raio - 0.1;
    let melhor: V2 | null = null;
    let melhorD = Infinity;
    for (let k = 0; k < 24; k++) {
      const ang = (k / 24) * Math.PI * 2;
      const p = { x: chefe.pos.x + Math.cos(ang) * raio, y: chefe.pos.y + Math.sin(ang) * raio };
      if (!m.grade.ehLivre(p)) continue;
      const d = Math.hypot(p.x - j.pos.x, p.y - j.pos.y);
      if (d < melhorD) {
        melhorD = d;
        melhor = p;
      }
    }
    return melhor;
  }

  /** Ponto livre na sombra a um passo dentro do alcance do auto-ataque, o mais perto do bot. */
  private lugarContraOPoste(m: MapaDoBot, poste: Entidade): V2 | null {
    const j = m.jogador;
    // Na borda do alcance do auto-ataque (medido até a borda do Poste).
    // Dentro do alcance que o bot usa para bater (o do auto-ataque menos 0,15) e fora da visão do
    // Poste na sombra (1,6 do centro); senão o bot avança e entra na mira dele.
    const raio = m.ficha.campeao.autoAtaque.alcance + poste.raio - 0.2;
    let melhor: V2 | null = null;
    let melhorD = Infinity;
    for (let k = 0; k < 24; k++) {
      const ang = (k / 24) * Math.PI * 2;
      const p = { x: poste.pos.x + Math.cos(ang) * raio, y: poste.pos.y + Math.sin(ang) * raio };
      if (!m.grade.ehLivre(p) || m.luz.iluminado(p) || !m.grade.linhaLivre(p, poste.pos)) continue;
      const d = Math.hypot(p.x - j.pos.x, p.y - j.pos.y);
      if (d < melhorD) {
        melhorD = d;
        melhor = p;
      }
    }
    return melhor;
  }

  /**
   * Para onde recuar: entre 16 direções livres, a que deixa mais longe das pestinhas e tem mais
   * caminho livre adiante (recuar para um beco é pior que ficar).
   */
  private pontoDeRecuo(m: MapaDoBot, inimigos: Entidade[]): V2 | null {
    const j = m.jogador;
    const corpo = inimigos.filter((e) => e.especie !== 'poste_corrompido');
    let melhor: V2 | null = null;
    let melhorNota = -Infinity;
    for (let k = 0; k < DIRECOES_DE_FUGA; k++) {
      const ang = (k / DIRECOES_DE_FUGA) * Math.PI * 2;
      const dir = { x: Math.cos(ang), y: Math.sin(ang) };
      const p = { x: j.pos.x + dir.x * 2.2, y: j.pos.y + dir.y * 2.2 };
      if (!m.grade.ehLivre(p) || !m.grade.linhaLivre(j.pos, p)) continue;
      let livre = 2.2;
      for (const alcance of [4, 6, 8]) {
        const q = { x: j.pos.x + dir.x * alcance, y: j.pos.y + dir.y * alcance };
        if (!m.grade.ehLivre(q) || !m.grade.linhaLivre(j.pos, q)) break;
        livre = alcance;
      }
      const perto = Math.min(6, ...corpo.map((e) => Math.hypot(e.pos.x - p.x, e.pos.y - p.y)));
      const nota = perto + 0.45 * livre;
      if (nota > melhorNota) {
        melhorNota = nota;
        melhor = p;
      }
    }
    return melhor;
  }

  // ------------------------------------------------------------------ andar

  private objetivo(m: MapaDoBot): V2 | null {
    const est = m.regras.estado;
    if (est.chefe && vivo(est.chefe)) return est.chefe.pos;
    const poste = est.postes.find((p) => vivo(p));
    if (poste) return poste.pos;
    const s = m.regras.gerada.saida;
    const n = Math.max(1, m.regras.opcoes.portoes ?? 1);
    const ramal = m.regras.gerada.saidas?.[Math.min(m.portao, n - 1)];
    if (ramal) return { x: (ramal.x0 + ramal.x1) / 2, y: ramal.y1 - 0.4 };
    return { x: s.x0 + ((s.x1 - s.x0) * (Math.min(m.portao, n - 1) + 0.5)) / n, y: s.y1 - 0.4 };
  }

  private bauPerto(m: MapaDoBot): V2 | null {
    if (!this.perfil.abreBaus) return null;
    const j = m.jogador;
    let melhor: V2 | null = null;
    let melhorD = this.regras.cfg.raioBau;
    for (const b of m.regras.estado.baus) {
      if (b.aberto) continue;
      const d = Math.hypot(b.entidade.pos.x - j.pos.x, b.entidade.pos.y - j.pos.y);
      if (d < melhorD) {
        melhorD = d;
        melhor = b.entidade.pos;
      }
    }
    return melhor;
  }

  /** Inimigos à vista que atiram de longe (um ataque em linha), com o alcance do tiro. */
  private atiradoresAVista(inimigos: Entidade[]): { e: Entidade; alcance: number }[] {
    const lista: { e: Entidade; alcance: number }[] = [];
    for (const e of inimigos) {
      if (e.especie === 'poste_corrompido' || !e.lancador) continue;
      let alcance = 0;
      for (const s of Object.values(e.lancador.slots)) {
        const f = s.def.forma;
        if (f.tipo === 'linha') alcance = Math.max(alcance, f.alcance);
      }
      if (alcance > 0) lista.push({ e, alcance });
    }
    return lista;
  }

  private noAlcanceDe(a: { e: Entidade; alcance: number }, p: V2): boolean {
    return (
      Math.hypot(a.e.pos.x - p.x, a.e.pos.y - p.y) <= a.alcance + this.regras.cfg.folgaDaLuzSegura
    );
  }

  /** O alvo está a um golpe: dentro do alcance que o bot usa para bater e com a linha livre. */
  private alcancavel(m: MapaDoBot, e: Entidade): boolean {
    const j = m.jogador;
    const d = Math.hypot(e.pos.x - j.pos.x, e.pos.y - j.pos.y) - e.raio;
    return d <= this.alcanceAtaque(m) && m.grade.linhaLivre(j.pos, e.pos);
  }

  /**
   * O poste amigo mais perto que cura, fora do alcance dos atiradores à vista, com um ponto livre
   * na luz dele e caminho até lá (um poste do outro lado do muro não serve). A escolha vale por
   * `caminhoACadaS`, para não refazer a busca a cada decisão.
   */
  private luzMaisPerto(
    m: MapaDoBot,
    atiradores: { e: Entidade; alcance: number }[] = [],
  ): V2 | null {
    const j = m.jogador;
    const { mundo } = m;
    const seguro = (p: V2) => !atiradores.some((a) => this.noAlcanceDe(a, p));
    if (this.luzEscolhida && mundo.tick < this.luzEscolhida.ate && seguro(this.luzEscolhida.p))
      return this.luzEscolhida.p;
    const fontes = m.luz.fontes
      .filter((f) => f.cura && (f.desligadaAte === null || f.desligadaAte <= mundo.tick))
      .filter((f) => seguro(f))
      .map((f) => ({ f, d: Math.hypot(f.x - j.pos.x, f.y - j.pos.y) }))
      .filter((x) => x.d < this.regras.cfg.raioBuscaLuz)
      .sort((x, y) => x.d - y.d)
      .slice(0, TENTATIVAS_DE_LUZ);
    for (const { f } of fontes) {
      // Um pouco para dentro da luz (o poste é obstáculo), começando pelo lado do bot.
      const base = Math.atan2(j.pos.y - f.y, j.pos.x - f.x);
      for (let k = 0; k < DIRECOES_NA_LUZ; k++) {
        const ang = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * ((Math.PI * 2) / DIRECOES_NA_LUZ);
        const p = {
          x: f.x + Math.cos(ang) * DENTRO_DA_LUZ,
          y: f.y + Math.sin(ang) * DENTRO_DA_LUZ,
        };
        if (!m.grade.ehLivre(p) || m.luz.postesQueCuram(p) === 0) continue;
        if (!m.grade.linhaLivre(j.pos, p) && !m.grade.caminho(j.pos, p)) continue;
        this.luzEscolhida = {
          p,
          ate: mundo.tick + Math.round(this.regras.cfg.caminhoACadaS / mundo.dt),
        };
        return p;
      }
    }
    this.luzEscolhida = null;
    return null;
  }

  /** Segue o caminho da grade até `destino`, refazendo-o de vez em quando ou se empacar. */
  private irPara(m: MapaDoBot, destino: V2): void {
    const { mundo, jogador: j } = m;
    const cfg = this.regras.cfg;
    const mudou =
      !this.destinoDoCaminho ||
      Math.hypot(destino.x - this.destinoDoCaminho.x, destino.y - this.destinoDoCaminho.y) > 1.5;
    const velho = (mundo.tick - this.caminhoEm) * mundo.dt > cfg.caminhoACadaS;
    // Empacado: não andou meio tile no tempo de `presoS`.
    if (Math.hypot(j.pos.x - this.preso.pos.x, j.pos.y - this.preso.pos.y) > 0.5) {
      this.preso = { pos: { ...j.pos }, tick: mundo.tick };
    }
    const empacou = (mundo.tick - this.preso.tick) * mundo.dt > cfg.presoS;
    if (mudou || velho || empacou || this.caminho.length === 0) {
      this.caminho = m.grade.caminho(j.pos, destino) ?? [destino];
      this.destinoDoCaminho = { ...destino };
      this.caminhoEm = mundo.tick;
      if (empacou) {
        // Um passo de lado para soltar.
        const ang = this.rng.proximo() * Math.PI * 2;
        this.caminho.unshift({
          x: j.pos.x + Math.cos(ang) * 1.5,
          y: j.pos.y + Math.sin(ang) * 1.5,
        });
        this.preso = { pos: { ...j.pos }, tick: mundo.tick };
      }
    }
    while (
      this.caminho.length > 1 &&
      Math.hypot(this.caminho[0]!.x - j.pos.x, this.caminho[0]!.y - j.pos.y) < PERTO_DO_PONTO
    ) {
      this.caminho.shift();
    }
    const proximo = this.caminho[0];
    if (proximo) this.mover(m, proximo);
  }

  private mover(m: MapaDoBot, p: V2): void {
    const j = m.jogador;
    const igual =
      this.pontoPedido && Math.hypot(p.x - this.pontoPedido.x, p.y - this.pontoPedido.y) < 0.05;
    if (igual && j.destino) return;
    enfileirar(m.mundo, { tipo: 'moverPara', id: j.id, x: p.x, y: p.y });
    this.pontoPedido = { ...p };
    this.parado = false;
  }

  private lancar(m: MapaDoBot, tecla: string, alvo: V2): void {
    enfileirar(m.mundo, { tipo: 'lancar', id: m.jogador.id, tecla, alvo });
    this.lancamentos++;
    this.parado = false;
  }
}
