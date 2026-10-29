import * as Phaser from 'phaser';
import { paraTela } from '../../render/iso';
import { passoDaFase, temMalha, type PoseDaMalha } from '../../render/malhas';
import {
  curvaDoAtingido,
  curvaDoGolpe,
  girarAte,
  grausDaDirecao,
  ladoNaTela,
  vistaDoAngulo,
} from '../../render/movimento';
import {
  fixa,
  flutua,
  modeloCaido,
  modeloDaEspecie,
  quadroDaTransformacao,
  treme,
} from '../../render/especies';
import { exploracao, inimigos, visual } from '../../sim/content';
import {
  FONTE_PIXEL,
  LARGURA_CELULA,
  paraFontePixel,
  registrarFontePixel,
} from '../interface/fontePixel';
import { rotacaoDaDirecao, type Rotacao, type V2 } from '../../sim/geometria';
import type { Evento } from '../../sim/eventos';
import type { Entidade, IdEntidade, Mundo } from '../../sim/mundo';
import { corNumerica, type CenarioDaRua, type FiguraMovel } from './CenarioDaRua';

interface Vista {
  e: Entidade;
  figura: FiguraMovel;
  rot: Rotacao;
  /** Para onde o corpo está virado agora (graus, vira aos poucos até a direção nova). */
  angulo: number;
  /** Guinada do desenho entre as 4 rotações (graus). */
  guinada: number;
  /** Último golpe levado: quando (ms) e de que lado veio (direção no mundo, de quem bateu). */
  atingido: { em: number; de: V2 } | null;
  barra: Phaser.GameObjects.Graphics | null;
  assinaturaBarra?: string;
  /** Aura no chão de quem tem brilho próprio (`luzNaTela.brilhoProprio`). */
  aura: Phaser.GameObjects.Image | null;
  /** Fase do passo (andar) e da respiração. */
  fase: number;
  /** Instante (ms) do último golpe ou lançamento, para o pulo de escala. */
  golpe: number;
  /** Instante (ms) em que caiu, ou null se vivo. */
  caiu: number | null;
  /** Posição desenhada neste quadro (interpolada). */
  pos: V2;
  /** Já trocou para o desenho de caído (Poste derrubado). */
  trocouParaCaido: boolean;
  /** Espécie desenhada agora (o baú vira baú aberto). */
  especie: string;
  /** Inclinação atual (suavizada) do corpo, em radianos. */
  inclinacao: number;
  /** Pose do corpo (braços e pernas) no último quadro. */
  corpo: PoseDaMalha;
  /** Nome do encanto (Apressado, Encouraçado...) acima da barra. */
  rotulo: Phaser.GameObjects.BitmapText | null;
  /** Poses diferentes já mostradas (para os testes). */
  poses: Set<string>;
}

/**
 * Desenha e anima tudo que anda no mundo: jogador, inimigos e bonecos. A simulação não sabe nada
 * disso; aqui só se lê o estado e os eventos. Animação por transformação das figuras assadas: o
 * corpo pula a cada passo, respira parado, agacha no preparo, estica no golpe, pisca no dano e
 * afunda ao cair.
 */
export class VistaEntidades {
  private readonly vistas = new Map<IdEntidade, Vista>();
  private readonly vistos = new Set<IdEntidade>();

  constructor(
    private readonly cena: Phaser.Scene,
    private readonly cenario: CenarioDaRua,
  ) {}

  /** Onde a entidade está sendo desenhada (para a câmera e os efeitos). */
  posDesenhada(id: IdEntidade): V2 | null {
    return this.vistas.get(id)?.pos ?? null;
  }

  /**
   * A pose do corpo, quantas poses diferentes já apareceram e para onde o corpo está virado (para
   * os testes).
   */
  corpoDe(
    id: IdEntidade,
  ): { passo: number; golpe: boolean; poses: number; angulo: number; guinada: number } | null {
    const v = this.vistas.get(id);
    return v ? { ...v.corpo, poses: v.poses.size, angulo: v.angulo, guinada: v.guinada } : null;
  }

  topoDe(id: IdEntidade): { x: number; y: number } | null {
    return this.vistas.get(id)?.figura.topo ?? null;
  }

  consumir(eventos: readonly Evento[]): void {
    const agora = this.cena.time.now;
    for (const ev of eventos) {
      switch (ev.tipo) {
        case 'dano': {
          if (ev.valor <= 0 && ev.absorvido <= 0) break;
          const v = this.vistas.get(ev.alvo);
          if (!v) break;
          v.figura.piscar();
          const quem = this.vistas.get(ev.origem)?.pos ?? ev.pos;
          v.atingido = { em: agora, de: { x: v.pos.x - quem.x, y: v.pos.y - quem.y } };
          break;
        }
        case 'lancou':
        case 'golpeou':
        case 'ataqueAuto': {
          const v = this.vistas.get(ev.id);
          if (v) v.golpe = agora;
          break;
        }
        case 'derrotado': {
          const v = this.vistas.get(ev.id);
          if (v) v.caiu = agora;
          break;
        }
        case 'renasceu':
        case 'remontou': {
          const v = this.vistas.get(ev.id);
          if (v) v.caiu = null;
          break;
        }
        case 'desmontou': {
          const v = this.vistas.get(ev.id);
          if (v) v.caiu = agora;
          break;
        }
        default:
          break;
      }
    }
  }

  /** Condição Neblina: só aparecem os inimigos a até `raio` tiles do jogador. */
  neblina: { centro: V2; raio: number } | null = null;
  /** Chamado a cada passo de quem levanta poeira (o jogador, elites e chefes). */
  aoPisar: ((pos: V2) => void) | null = null;

  sincronizar(mundo: Mundo, alfa: number, dtS: number): void {
    const vistos = this.vistos;
    vistos.clear();
    const anim = visual.animacao;
    const brilho = visual.luzNaTela.brilhoProprio;
    const agora = this.cena.time.now;
    const heroi = mundo.entidades.find((e) => e.tipo === 'jogador');
    for (const e of mundo.entidades) {
      // Objetos quebráveis já são desenhados pelo cenário (a lixeira da calçada); o alarme do
      // carro é uma isca sem desenho.
      if ((e.marcas?.quebravel && !e.marcas?.dinamico) || e.marcas?.semDesenho) continue;
      vistos.add(e.id);
      // Recorte antes de criar a figura, calcular poses, luminosidade ou barras. A simulação segue.
      const tela = paraTela(
        { x: e.pos.x, y: e.pos.y, z: Number(e.marcas?.alturaPx ?? 0) },
        this.cenario.iso,
      );
      const area = this.cena.cameras.main.worldView;
      const folga = visual.desempenho.folgaEntidadesPx + e.raio * visual.tile.largura;
      if (
        e.tipo !== 'jogador' &&
        (tela.x < area.x - folga ||
          tela.x > area.right + folga ||
          tela.y < area.y - folga ||
          tela.y > area.bottom + folga)
      ) {
        const antiga = this.vistas.get(e.id);
        if (antiga) {
          antiga.e = e;
          antiga.pos.x = e.pos.x;
          antiga.pos.y = e.pos.y;
          antiga.figura.setVisible(false);
          antiga.barra?.setVisible(false);
          antiga.aura?.setVisible(false);
          antiga.rotulo?.setVisible(false);
        }
        continue;
      }
      // O desenho segue a espécie, ou a marca `visual` (o rosto do Dono no andar 3); levantando do
      // lote, a Casa Perseguidora mostra o quadro da transformação.
      // A Moradora do 13 copia a fantasia do jogador: com o reflexo do Codex (moradora_13_<fantasia>)
      // ele vem pronto, sem girar o matiz.
      const reflexo = `moradora_13_${String(e.marcas?.visual ?? '')}`;
      const comReflexo = e.especie === 'moradora_do_13' && temMalha(reflexo);
      const base = comReflexo ? reflexo : String(e.marcas?.visual ?? e.especie);
      const desenho =
        e.marcas?.transformacaoAte !== undefined
          ? (quadroDaTransformacao(
              visual.malhas.transformacoes[modeloDaEspecie(base)],
              Number(e.marcas.transformacaoDe ?? 0),
              Number(e.marcas.transformacaoAte),
              mundo.tick,
              !!e.marcas.reversa,
            ) ?? base)
          : base;
      // A cor alternativa (Álbum) e o reflexo da Moradora giram o matiz do desenho.
      const matiz = comReflexo ? 0 : Number(e.marcas?.matiz ?? 0);
      let v = this.vistas.get(e.id);
      if (!v) {
        v = {
          e,
          figura: this.cenario.criarFigura(
            modeloDaEspecie(desenho),
            matiz,
            e.tipo === 'jogador' ? rotacaoDaDirecao(e.olhar, 0) : null,
          ),
          rot: rotacaoDaDirecao(e.olhar, 0),
          angulo: grausDaDirecao(e.olhar),
          guinada: 0,
          atingido: null,
          barra: e.tipo === 'inimigo' ? this.cena.add.graphics() : null,
          aura: brilho.especies.includes(e.especie) ? this.cenario.criarAura(brilho.raio) : null,
          fase: (e.id * 0.37) % (Math.PI * 2),
          golpe: -Infinity,
          caiu: e.combate && e.combate.coragem <= 0 ? agora - anim.morteMs : null,
          pos: { ...e.pos },
          trocouParaCaido: false,
          especie: desenho,
          inclinacao: 0,
          corpo: { passo: 0, golpe: false },
          poses: new Set(),
          rotulo: null,
        };
        this.vistas.set(e.id, v);
      }
      v.e = e;
      // A aura só volta a aparecer lá embaixo, se a figura for desenhada neste quadro.
      v.aura?.setVisible(false);
      // A espécie mudou (o baú abriu) ou o desenho dela: troca o desenho.
      if (v.especie !== desenho) {
        v.figura.trocarModelo(this.cenario.criarFigura(modeloDaEspecie(desenho), matiz));
        v.especie = desenho;
      }
      const pos = v.pos;
      pos.x = e.posAnterior.x + (e.pos.x - e.posAnterior.x) * alfa;
      pos.y = e.posAnterior.y + (e.pos.y - e.posAnterior.y) * alfa;
      const andou = { x: e.pos.x - e.posAnterior.x, y: e.pos.y - e.posAnterior.y };
      const passo = Math.hypot(andou.x, andou.y);
      // Fração da velocidade cheia (o jogador arranca e freia; o passo e a inclinação acompanham).
      const ritmo = e.velocidade > 0 ? Math.min(1, passo / (e.velocidade * mundo.dt)) : 0;
      const golpeando = agora - v.golpe < anim.golpeMs || !!e.lancador?.lancando;
      if (!fixa(e.especie)) {
        // O corpo vira aos poucos até para onde anda (ou para onde mira, no golpe e parado).
        const alvo = passo > 1e-4 && !golpeando ? andou : e.olhar;
        if (alvo.x !== 0 || alvo.y !== 0)
          v.angulo = girarAte(v.angulo, grausDaDirecao(alvo), anim.giroGrausPorS * dtS);
        const vista = vistaDoAngulo(v.angulo, v.figura.direcoes);
        v.rot = vista.rot;
        v.guinada = vista.guinada;
      }
      v.pos = pos;

      // Morte: afunda e some.
      let sy = 1;
      let sx = 1;
      // Quem está no alto (a Viúva na sacada do mirante) sobe pela altura que a simulação marca.
      let z = Number(e.marcas?.alturaPx ?? 0);
      let alfaFig = 1;
      let alvoInclinacao = 0;
      // Inclinação que não passa pela suavização (golpe, golpe levado, tontura): é rápida.
      let inclinaExtra = 0;
      // Braços e pernas (só quem tem esqueleto usa): balançam no passo e sobem no golpe.
      const corpo: PoseDaMalha = { passo: 0, golpe: false };
      const caido = modeloCaido(e.especie);
      if (v.caiu !== null && caido) {
        // Quem fica no chão (o Poste) troca de desenho em vez de sumir.
        if (!v.trocouParaCaido) {
          v.figura.trocarModelo(this.cenario.criarFigura(caido));
          v.trocouParaCaido = true;
        }
        v.figura.setVisible(true);
        v.barra?.setVisible(false);
        const r0 = e.raio;
        v.figura.posicionar(
          pos,
          v.rot,
          this.cenario.luminosidade({
            x0: pos.x - r0,
            y0: pos.y - r0,
            x1: pos.x + r0,
            y1: pos.y + r0,
          }),
        );
        continue;
      }
      if (v.caiu !== null) {
        const t = Math.min(1, (agora - v.caiu) / anim.morteMs);
        if (t >= 1) {
          v.figura.setVisible(false);
          v.barra?.setVisible(false);
          continue;
        }
        sy = 1 - 0.8 * t;
        sx = 1 + 0.3 * t;
        alfaFig = 1 - t;
      } else {
        v.figura.setVisible(true);
        if (passo > 1e-4) {
          const antes = Math.floor(v.fase / Math.PI);
          v.fase += (passo / mundo.dt) * dtS * anim.passosPorTile * Math.PI;
          const s = Math.abs(Math.sin(v.fase));
          z += s * anim.bobPx * ritmo;
          // O pé toca o chão: o corpo achata um pouco e, em quem pesa, sobe poeira.
          if (!flutua(e.especie)) {
            const contato = (1 - s) ** 4;
            sy -= contato * anim.achatarNoPasso * ritmo;
            sx += contato * anim.achatarNoPasso * 0.5 * ritmo;
            const pisou = Math.floor(v.fase / Math.PI) !== antes;
            if (pisou && this.levantaPoeira(e)) this.aoPisar?.(pos);
          }
          corpo.passo = passoDaFase(v.fase, visual.malhas.degrausDoPasso);
          // Inclina para onde anda (na tela, só o lado conta), mais quanto mais rápido.
          const naTela = (andou.x - andou.y) / passo;
          alvoInclinacao = naTela * anim.inclinacao * ritmo;
        } else {
          v.fase += dtS * anim.respiracaoPorS * Math.PI * 2;
          sy += Math.sin(v.fase) * anim.respiracao;
          // Parado, o corpo balança de leve no ritmo da respiração.
          if (!flutua(e.especie)) alvoInclinacao = Math.sin(v.fase * 0.5) * anim.balancoParado;
        }
        if (flutua(e.especie)) {
          z +=
            anim.flutuarPx * (1 + Math.sin((agora / 1000) * anim.flutuarPorS * Math.PI * 2)) * 0.5;
        }
        // Preparo de golpe ou lançamento: agacha um pouco.
        if (e.lancador?.lancando || e.ataque?.preparo != null) sy -= anim.preparoAgacha;
        // O inimigo que vai bater recua um passo e treme: é o aviso do golpe dele.
        const a = e.ataque;
        if (e.tipo === 'inimigo' && a && a.preparo != null && a.def.preparo > 0) {
          const t = 1 - a.preparo / a.def.preparo;
          const n = Math.hypot(e.olhar.x, e.olhar.y) || 1;
          const tremor = Math.sin(agora * 0.09) * anim.preparoTremor;
          pos.x += (-e.olhar.x / n) * anim.preparoRecuo * t + (-e.olhar.y / n) * tremor;
          pos.y += (-e.olhar.y / n) * anim.preparoRecuo * t + (e.olhar.x / n) * tremor;
        }
        const tg = (agora - v.golpe) / anim.golpeMs;
        if (tg >= 0 && tg < 1) {
          // O golpe estica para a frente e se acomoda; o braço fica no alto só na esticada.
          const g = curvaDoGolpe(tg, anim.golpeEscala, anim.golpeFracaoEstica);
          if (tg < anim.golpeFracaoEstica * 2) {
            corpo.golpe = true;
            corpo.passo = 0;
          }
          sy *= g.sy;
          sx *= g.sx;
          inclinaExtra += ladoNaTela(e.olhar) * anim.golpeInclina * g.inclina;
        }
        // Levou um golpe: achata e inclina para longe de quem bateu.
        if (v.atingido) {
          const ta = (agora - v.atingido.em) / anim.atingidoMs;
          if (ta >= 1) v.atingido = null;
          else {
            const d = curvaDoAtingido(ta, anim.atingidoAchata);
            sy *= d.sy;
            sx *= d.sx;
            inclinaExtra -= ladoNaTela(v.atingido.de) * anim.atingidoInclina * d.inclina;
          }
        }
        // Tonto: balança de um lado para o outro.
        if (e.combate?.estados.some((s) => s.tipo === 'atordoado'))
          inclinaExtra +=
            Math.sin((agora / 1000) * anim.tontoPorS * Math.PI * 2) * anim.tontoInclina;
        if (e.combate?.estados.some((s) => s.tipo === 'invisivel')) {
          alfaFig = e.tipo === 'jogador' ? anim.alfaInvisivelJogador : anim.alfaInvisivelInimigo;
        }
      }
      const r = e.raio;
      let luz = this.cenario.luminosidade({
        x0: pos.x - r,
        y0: pos.y - r,
        x1: pos.x + r,
        y1: pos.y + r,
      });
      // Brilho próprio: no escuro o corpo não some e a aura marca onde ele está.
      if (v.aura) {
        luz = Math.max(luz, brilho.luzMinima);
        const pe = paraTela({ x: pos.x, y: pos.y, z: 0 }, this.cenario.iso);
        v.aura
          .setPosition(pe.x, pe.y)
          .setAlpha(brilho.alfa * alfaFig)
          .setVisible(this.cenario.noite && v.caiu === null);
      }
      // Abóbora Dourada: só aparece de perto ou na luz (lanterna, poste, janela).
      if (e.marcas?.segredo) {
        const perto =
          !!heroi &&
          Math.hypot(pos.x - heroi.pos.x, pos.y - heroi.pos.y) <= exploracao.segredo.raioVer;
        if (!perto && !mundo.luz?.iluminado(pos)) {
          v.figura.setVisible(false);
          continue;
        }
      }
      // Neblina: inimigos longe do jogador não aparecem.
      const n = this.neblina;
      if (
        n &&
        e.tipo === 'inimigo' &&
        Math.hypot(pos.x - n.centro.x, pos.y - n.centro.y) > n.raio
      ) {
        v.figura.setVisible(false);
        v.barra?.setVisible(false);
        continue;
      }
      v.inclinacao +=
        (alvoInclinacao - v.inclinacao) * (1 - Math.exp(-anim.rigidezInclinacao * dtS));
      // O baú amaldiçoado treme no lugar (sem passar pela suavização da inclinação).
      const tremor = treme(e.especie)
        ? anim.tremer.inclinacao * Math.sin((agora / 1000) * anim.tremer.porS * Math.PI * 2)
        : 0;
      v.figura.posicionar(pos, v.rot, luz, {
        z,
        sy,
        sx,
        alfa: alfaFig,
        inclinacao: v.inclinacao + tremor + inclinaExtra,
        corpo,
        guinada: v.guinada,
      });
      v.corpo = corpo;
      v.poses.add(`${corpo.passo}:${corpo.golpe}`);
      this.desenharBarra(v, pos);
    }
    for (const [id, v] of this.vistas) {
      if (vistos.has(id)) continue;
      v.figura.destruir();
      v.barra?.destroy();
      v.aura?.destroy();
      v.rotulo?.destroy();
      this.vistas.delete(id);
    }
  }

  /** Quem levanta poeira ao andar: o jogador e os inimigos grandes (elites, chefes). */
  private levantaPoeira(e: Entidade): boolean {
    return e.tipo === 'jogador' || !!e.marcas?.elite || !!e.combate?.chefe;
  }

  /** Barra fina de Coragem sobre cada inimigo (elites e chefes ganham a barra grande na interface). */
  private desenharBarra(v: Vista, pos: V2): void {
    const g = v.barra;
    const c = v.e.combate;
    if (!g) return;
    v.rotulo?.setVisible(false);
    // O Saco-Surpresa disfarçado de lixeira não pode se entregar pela barra.
    if (!c || c.coragem <= 0 || v.e.marcas?.semBarra || v.e.marcas?.disfarcado) {
      g.setVisible(false);
      return;
    }
    g.setVisible(true);
    const { barraInimigo } = visual.combateNaTela;
    const acima =
      Number(v.e.marcas?.barraAcimaPx ?? 0) ||
      (v.e.especie === 'poste_corrompido' ? 84 : barraInimigo.acimaPx) +
        Number(v.e.marcas?.alturaPx ?? 0);
    const topo = paraTela({ ...pos, z: acima }, this.cenario.iso);
    const escala = v.e.especie === 'poste_corrompido' ? 1.8 : Number(v.e.marcas?.escalaBarra ?? 1);
    const largura = barraInimigo.larguraPx * escala;
    const fr = Math.max(0, c.coragem / c.attr.coragemMax);
    const escudo = c.estados.reduce((s, e) => (e.tipo === 'escudo' ? s + e.valor : s), 0);
    const encanto = v.e.marcas?.encanto;
    g.setDepth(pos.x + pos.y + 0.02);
    if (typeof encanto !== 'string') {
      g.setPosition(topo.x, topo.y);
      const assinatura = `${fr}:${escudo}:${c.attr.coragemMax}:${largura}:${v.e.marcas?.protegido}:${v.e.marcas?.alerta}`;
      if (assinatura === v.assinaturaBarra) return;
      v.assinaturaBarra = assinatura;
      topo.x = 0;
      topo.y = 0;
    } else {
      g.setPosition(0, 0);
      v.assinaturaBarra = undefined;
    }
    g.clear();
    const x = topo.x - largura / 2;
    g.setDepth(pos.x + pos.y + 0.02)
      .fillStyle(corNumerica(barraInimigo.fundo), 0.9)
      .fillRect(x - 1, topo.y - 1, largura + 2, barraInimigo.alturaPx + 2)
      .fillStyle(corNumerica(visual.acentos.perigo), 1)
      .fillRect(x, topo.y, largura * fr, barraInimigo.alturaPx);
    // Poste protegido pelas pestinhas: contorno roxo na barra.
    if (v.e.marcas?.protegido) {
      g.lineStyle(1, corNumerica(visual.acentos.magia), 1).strokeRect(
        x - 2,
        topo.y - 2,
        largura + 4,
        barraInimigo.alturaPx + 4,
      );
    }
    // Poste em alerta (apanhou e está de olho em quem bateu, mesmo no escuro): contorno vermelho.
    if (v.e.marcas?.alerta) {
      g.lineStyle(1, corNumerica(visual.acentos.perigo), 1).strokeRect(
        x - 4,
        topo.y - 4,
        largura + 8,
        barraInimigo.alturaPx + 8,
      );
    }
    if (typeof encanto === 'string') this.desenharEncanto(v, g, pos, encanto, x, topo.y, largura);
    if (escudo > 0) {
      g.fillStyle(corNumerica(visual.paleta.luz), 0.9).fillRect(
        x,
        topo.y - 2,
        largura * Math.min(1, escudo / c.attr.coragemMax),
        2,
      );
    }
  }

  /**
   * Inimigo encantado: anel colorido no chão, contorno da barra na cor do encanto e o nome acima
   * (Encouraçado mostra os golpes que o escudo ainda aguenta).
   */
  private desenharEncanto(
    v: Vista,
    g: Phaser.GameObjects.Graphics,
    pos: V2,
    encanto: string,
    x: number,
    y: number,
    largura: number,
  ): void {
    const cfg = visual.combateNaTela.encantos;
    const cor = corNumerica(cfg.cores[encanto] ?? visual.paleta.luz);
    const pe = paraTela({ ...pos, z: 0 }, this.cenario.iso);
    const pulso = 0.5 + 0.5 * Math.sin(this.cena.time.now / 220 + v.e.id);
    g.lineStyle(2, cor, 0.45 + 0.4 * pulso).strokeEllipse(
      pe.x,
      pe.y,
      34 + v.e.raio * 30,
      16 + v.e.raio * 14,
    );
    g.lineStyle(1, cor, 1).strokeRect(
      x - 2,
      y - 2,
      largura + 4,
      visual.combateNaTela.barraInimigo.alturaPx + 4,
    );
    const golpes = Number(v.e.marcas?.escudoGolpes ?? 0);
    const nome = inimigos.encantos.nomes[encanto] ?? encanto;
    const texto = paraFontePixel(golpes > 0 ? `${nome} ${golpes}` : nome);
    if (!v.rotulo) {
      registrarFontePixel(this.cena);
      v.rotulo = this.cena.add
        .bitmapText(0, 0, FONTE_PIXEL, texto, LARGURA_CELULA)
        .setOrigin(0.5, 1)
        .setDropShadow(1, 1, 0x000000, 1);
    }
    if (v.rotulo.text !== texto) v.rotulo.setText(texto);
    v.rotulo
      .setTint(cor)
      .setPosition(x + largura / 2, y - cfg.rotuloAcimaPx)
      .setDepth(pos.x + pos.y + 0.03)
      .setVisible(true);
  }

  /** Entidade sob o ponto da tela (para clicar num inimigo), pelo retângulo do corpo. */
  entidadeEm(telaX: number, telaY: number, filtro: (e: Entidade) => boolean): Entidade | null {
    let melhor: Entidade | null = null;
    let melhorD = Infinity;
    for (const v of this.vistas.values()) {
      if (!filtro(v.e) || v.caiu !== null) continue;
      const pe = paraTela({ ...v.pos, z: 0 }, this.cenario.iso);
      const meia = 18 + v.e.raio * 20;
      const alto = 44 + v.e.raio * 40;
      if (telaX < pe.x - meia || telaX > pe.x + meia || telaY > pe.y + 10 || telaY < pe.y - alto)
        continue;
      const d = Math.hypot(telaX - pe.x, telaY - (pe.y - alto / 2));
      if (d < melhorD) {
        melhorD = d;
        melhor = v.e;
      }
    }
    return melhor;
  }
}
