import * as Phaser from 'phaser';
import { paraTela } from '../../render/iso';
import {
  aoLongoDaLinha,
  distanciaNaLinha,
  fiapoDeFumaca,
  saltoDoGato,
  SorteioDaTela,
  vento,
  vooDoMorcego,
} from '../../render/vida';
import { modelos, visual } from '../../sim/content';
import { MODELOS_DE_CASA, type ObjetoRua } from '../../sim/content/esquemas';
import { posicionador, rotacaoDaDirecao, type V2 } from '../../sim/geometria';
import { corNumerica, type CenarioDaRua, type FiguraMovel } from './CenarioDaRua';

// Vida no cenário (PLANO_MUNDO_VIVO.md, passo 12): fumaça nas chaminés, folhas no vento, morcegos,
// crianças fantasiadas, gatos nos muros e janelas da cidade acendendo e apagando. Tudo só desenho,
// perto da câmera; nada disso existe na simulação.

/** O que a vida precisa saber da rua neste quadro. */
export interface ContextoDaVida {
  /** Onde o jogador está desenhado. */
  jogador: V2;
  /** Inimigos acordados e de pé (para a luta perto das crianças). */
  inimigos: readonly V2[];
  /** Há luta perto do jogador: crianças não aparecem e as que estão na rua fogem. */
  emLuta: boolean;
  /** Por onde as crianças andam (a rota da rua), ou null. */
  rota: readonly V2[] | null;
}

interface Fiapo {
  img: Phaser.GameObjects.Image;
  origem: V2;
  nasceu: number;
  ventoPx: V2;
}

interface Folha {
  img: Phaser.GameObjects.Image;
  pos: V2;
  z: number;
  fase: number;
}

interface Morcego {
  img: Phaser.GameObjects.Image;
  de: V2;
  para: V2;
  fase: number;
}

interface Crianca {
  figura: FiguraMovel;
  distancia: number;
  sentido: 1 | -1;
  /** Para que lado do meio da rua ela anda (tiles, na calçada). */
  lado: number;
  pos: V2;
  fase: number;
  fugindo: { desde: number; dir: V2 } | null;
}

interface Gato {
  figura: FiguraMovel;
  muro: V2;
  alturaPx: number;
  estado: 'sentado' | 'pulando' | 'fugindo';
  desde: number;
  pos: V2;
  destino: V2;
  dir: V2;
}

const TEX_FUMACA = 'vida:fumaca';
const TEX_FOLHA = 'vida:folha';
const TEX_MORCEGO = ['vida:morcego0', 'vida:morcego1'];
/** Profundidade dos morcegos: acima de todo o mundo (a interface fica noutra cena). */
const PROFUNDIDADE_MORCEGOS = 1e6;
/** Folga em volta da câmera (px) para o que nasce e some fora da vista. */
const FOLGA_PX = 80;
/** Crianças e gatos longe disso do jogador somem (tiles). */
const LONGE_TILES = 26;
/** Uma criança nasce entre estas distâncias do jogador (tiles): à vista, sem surgir do nada ao lado. */
const PERTO_DEMAIS = 6;
const LONGE_DEMAIS = 13;
const MUROS: ReadonlySet<string> = new Set(['muro', 'cerca', 'cerca_viva']);
const CASAS: ReadonlySet<string> = new Set(MODELOS_DE_CASA);

export class VidaDoCenario {
  private readonly sorteio = new SorteioDaTela();
  private readonly fiapos: Fiapo[] = [];
  private readonly reserva: Phaser.GameObjects.Image[] = [];
  private readonly ultimoFiapo = new Map<number, number>();
  private readonly folhas: Folha[] = [];
  private morcegos: Morcego[] = [];
  private bando: { desde: number; ate: number } | null = null;
  private proximoBando: number;
  private readonly criancas: Crianca[] = [];
  private proximaCrianca = 0;
  private readonly gatos: Gato[] = [];
  private readonly murosUsados = new Set<number>();
  private proximaJanela: number;
  /** Para os testes: quantas janelas da cidade já acenderam ou apagaram. */
  janelasTrocadas = 0;

  constructor(
    private readonly cena: Phaser.Scene,
    private readonly cenario: CenarioDaRua,
  ) {
    this.criarTexturas();
    const agora = cena.time.now;
    const m = visual.vida.morcegos;
    this.proximoBando = agora + this.sorteio.entre(m.aCadaS[0], m.aCadaS[1]) * 500;
    this.proximaJanela = agora + visual.vida.janelas.aCadaS * 1000;
  }

  /** Quanto há de cada coisa agora (para os testes). */
  get contagem(): Record<string, number> {
    return {
      fumaca: this.fiapos.length,
      folhas: this.folhas.length,
      folhasNaVista: this.folhas.filter((f) =>
        this.cena.cameras.main.worldView.contains(f.img.x, f.img.y),
      ).length,
      morcegos: this.morcegos.length,
      criancas: this.criancas.length,
      gatos: this.gatos.length,
      janelasTrocadas: this.janelasTrocadas,
    };
  }

  atualizar(agora: number, dtS: number, ctx: ContextoDaVida): void {
    const vista = this.cena.cameras.main.worldView;
    const area = new Phaser.Geom.Rectangle(
      vista.x - FOLGA_PX,
      vista.y - FOLGA_PX,
      vista.width + 2 * FOLGA_PX,
      vista.height + 2 * FOLGA_PX,
    );
    const ventoMundo = vento(agora / 1000, 1);
    this.fumaca(agora, area, ventoMundo);
    this.atualizarFolhas(dtS, area, ventoMundo);
    this.atualizarMorcegos(agora, vista);
    this.atualizarCriancas(agora, dtS, area, ctx);
    this.atualizarGatos(agora, dtS, ctx);
    this.janelas(agora);
  }

  destruir(): void {
    for (const f of this.fiapos) f.img.destroy();
    for (const i of this.reserva) i.destroy();
    for (const f of this.folhas) f.img.destroy();
    for (const m of this.morcegos) m.img.destroy();
    for (const c of this.criancas) c.figura.destruir();
    for (const g of this.gatos) g.figura.destruir();
  }

  // ------------------------------------------------------------------ texturas (por código)

  private criarTexturas(): void {
    const tex = this.cena.textures;
    const g = this.cena.add.graphics();
    const v = visual.vida;
    if (!tex.exists(TEX_FUMACA)) {
      // Um fiapo de borda macia: branco no meio sumindo até a borda (o tint dá o cinza).
      const r = v.fumaca.tamanhoPx * 2;
      const canvas = tex.createCanvas(TEX_FUMACA, r * 2, r * 2);
      const c2d = canvas?.getContext();
      if (canvas && c2d) {
        const grad = c2d.createRadialGradient(r, r, 0, r, r, r);
        grad.addColorStop(0, 'rgba(255,255,255,0.9)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        c2d.fillStyle = grad;
        c2d.fillRect(0, 0, r * 2, r * 2);
        canvas.refresh();
      }
    }
    if (!tex.exists(TEX_FOLHA)) {
      const t = v.folhas.tamanhoPx;
      g.clear()
        .fillStyle(0xffffff, 1)
        .fillTriangle(0, t, t * 1.2, 0, t * 2.4, t)
        .fillTriangle(0, t, t * 1.2, t * 2, t * 2.4, t);
      g.generateTexture(TEX_FOLHA, Math.ceil(t * 2.4), t * 2);
    }
    const s = v.morcegos.tamanhoPx;
    if (!tex.exists(TEX_MORCEGO[0]!)) {
      // Asas abertas: um V largo; fechadas: um V estreito, com o corpo no meio.
      g.clear()
        .fillStyle(0xffffff, 1)
        .fillCircle(s, s * 0.9, s * 0.25);
      g.fillTriangle(s, s * 0.9, 0, s * 0.2, s * 0.6, s * 1.1);
      g.fillTriangle(s, s * 0.9, s * 2, s * 0.2, s * 1.4, s * 1.1);
      g.generateTexture(TEX_MORCEGO[0]!, s * 2, s * 2);
      g.clear()
        .fillStyle(0xffffff, 1)
        .fillCircle(s, s * 0.9, s * 0.25);
      g.fillTriangle(s, s * 0.9, s * 0.45, s * 1.7, s * 0.8, s * 0.7);
      g.fillTriangle(s, s * 0.9, s * 1.55, s * 1.7, s * 1.2, s * 0.7);
      g.generateTexture(TEX_MORCEGO[1]!, s * 2, s * 2);
    }
    g.destroy();
  }

  private ventoNaTela(v: V2): V2 {
    const p = paraTela({ x: v.x, y: v.y, z: 0 }, this.cenario.iso);
    const o = paraTela({ x: 0, y: 0, z: 0 }, this.cenario.iso);
    return { x: p.x - o.x, y: p.y - o.y };
  }

  // ------------------------------------------------------------------ fumaça

  private fumaca(agora: number, area: Phaser.Geom.Rectangle, ventoMundo: V2): void {
    const cfg = visual.vida.fumaca;
    // As chaminés à vista, as mais perto do meio da tela primeiro (no máximo `maxChamines`).
    const vistas: { i: number; tela: V2; prof: number }[] = [];
    this.cenario.chamines.forEach((c, i) => {
      const tela = paraTela(c, this.cenario.iso);
      if (area.contains(tela.x, tela.y)) vistas.push({ i, tela, prof: c.x + c.y });
    });
    const meio = { x: area.centerX, y: area.centerY };
    vistas.sort(
      (a, b) =>
        Math.hypot(a.tela.x - meio.x, a.tela.y - meio.y) -
        Math.hypot(b.tela.x - meio.x, b.tela.y - meio.y),
    );
    const ventoPx = this.ventoNaTela({
      x: ventoMundo.x * cfg.vidaS,
      y: ventoMundo.y * cfg.vidaS,
    });
    for (const c of vistas.slice(
      0,
      Math.ceil(cfg.maxChamines * this.cenario.qualidade.particulas),
    )) {
      const ultimo = this.ultimoFiapo.get(c.i) ?? -Infinity;
      if (agora - ultimo < cfg.aCadaS * 1000) continue;
      this.ultimoFiapo.set(c.i, agora + this.sorteio.entre(0, cfg.aCadaS * 300));
      const img = this.reserva.pop() ?? this.cena.add.image(0, 0, TEX_FUMACA);
      img
        .setVisible(true)
        .setTint(corNumerica(cfg.cor))
        .setDepth(c.prof + 0.5);
      this.fiapos.push({ img, origem: c.tela, nasceu: agora, ventoPx });
    }
    for (let k = this.fiapos.length - 1; k >= 0; k--) {
      const f = this.fiapos[k]!;
      const t = (agora - f.nasceu) / (cfg.vidaS * 1000);
      if (t >= 1) {
        f.img.setVisible(false);
        this.reserva.push(f.img);
        this.fiapos.splice(k, 1);
        continue;
      }
      const d = fiapoDeFumaca(t, cfg.subidaPx);
      f.img
        .setPosition(
          f.origem.x + f.ventoPx.x * d.arrasto,
          f.origem.y - d.subida + f.ventoPx.y * d.arrasto,
        )
        .setScale(d.escala)
        .setAlpha(cfg.alfa * d.alfa);
    }
  }

  // ------------------------------------------------------------------ folhas

  private atualizarFolhas(dtS: number, area: Phaser.Geom.Rectangle, ventoMundo: V2): void {
    const cfg = visual.vida.folhas;
    const { iso } = this.cenario;
    while (this.folhas.length < Math.ceil(cfg.quantas * this.cenario.qualidade.particulas)) {
      const img = this.cena.add.image(0, 0, TEX_FOLHA).setTint(corNumerica(cfg.cor));
      const f: Folha = { img, pos: { x: 0, y: 0 }, z: 0, fase: this.sorteio.entre(0, 6.3) };
      this.recolocarFolha(f, area, false);
      this.folhas.push(f);
    }
    for (const f of this.folhas) {
      f.fase += dtS * 3;
      const k = cfg.vento * (0.7 + 0.3 * Math.sin(f.fase * 0.7));
      f.pos.x += (ventoMundo.x * k + Math.cos(f.fase) * 0.15) * dtS;
      f.pos.y += (ventoMundo.y * k + Math.sin(f.fase * 1.3) * 0.15) * dtS;
      f.z = 3 + 3 * Math.abs(Math.sin(f.fase * 0.9));
      const tela = paraTela({ ...f.pos, z: f.z }, iso);
      if (!area.contains(tela.x, tela.y)) {
        // Saiu pela borda: volta do lado de onde o vento vem. Ficou longe (a câmera saltou, no
        // começo ou num teletransporte): reaparece em qualquer ponto da vista.
        const longe =
          tela.x < area.x - area.width ||
          tela.x > area.right + area.width ||
          tela.y < area.y - area.height ||
          tela.y > area.bottom + area.height;
        this.recolocarFolha(f, area, !longe);
        continue;
      }
      f.img
        .setPosition(tela.x, tela.y)
        .setRotation(f.fase * 1.7)
        .setDepth(f.pos.x + f.pos.y + 0.3);
    }
  }

  /** Põe a folha num ponto da área (do lado de onde o vento vem, se `daBorda`). */
  private recolocarFolha(f: Folha, area: Phaser.Geom.Rectangle, daBorda: boolean): void {
    const { iso } = this.cenario;
    const v = this.ventoNaTela(vento(this.cena.time.now / 1000, 1));
    let sx = this.sorteio.entre(area.x, area.right);
    let sy = this.sorteio.entre(area.y, area.bottom);
    // Renasce na borda de onde o vento vem (a do lado em que ele sopra mais), para atravessar a vista.
    if (daBorda) {
      if (Math.abs(v.x) >= Math.abs(v.y)) sx = v.x > 0 ? area.x + 4 : area.right - 4;
      else sy = v.y > 0 ? area.y + 4 : area.bottom - 4;
    }
    const a = sx / iso.meioTileX;
    const b = sy / iso.meioTileY;
    f.pos = { x: (a + b) / 2, y: (b - a) / 2 };
  }

  // ------------------------------------------------------------------ morcegos

  private atualizarMorcegos(agora: number, vista: Phaser.Geom.Rectangle): void {
    const cfg = visual.vida.morcegos;
    if (!this.bando && agora >= this.proximoBando) {
      const n = Math.max(
        1,
        Math.round(
          this.sorteio.entre(cfg.bando[0], cfg.bando[1]) * this.cenario.qualidade.particulas,
        ),
      );
      const daEsquerda = this.sorteio.proximo() < 0.5;
      const y0 = vista.y + vista.height * this.sorteio.entre(0.12, 0.35);
      const y1 = vista.y + vista.height * this.sorteio.entre(0.05, 0.3);
      for (let k = 0; k < n; k++) {
        const dx = k * 26 + this.sorteio.entre(-8, 8);
        const dy = this.sorteio.entre(-22, 22);
        const de = {
          x: (daEsquerda ? vista.x - 40 : vista.right + 40) - (daEsquerda ? dx : -dx),
          y: y0 + dy,
        };
        const para = {
          x: (daEsquerda ? vista.right + 60 : vista.x - 60) - (daEsquerda ? dx : -dx),
          y: y1 + dy,
        };
        const img = this.cena.add
          .image(de.x, de.y, TEX_MORCEGO[0]!)
          .setTint(corNumerica(visual.paleta.sombra.cor))
          .setAlpha(0.85)
          .setDepth(PROFUNDIDADE_MORCEGOS);
        this.morcegos.push({ img, de, para, fase: this.sorteio.entre(0, 6.3) });
      }
      this.bando = { desde: agora, ate: agora + cfg.duracaoS * 1000 };
    }
    if (!this.bando) return;
    const t = (agora - this.bando.desde) / (this.bando.ate - this.bando.desde);
    if (t >= 1) {
      for (const m of this.morcegos) m.img.destroy();
      this.morcegos = [];
      this.bando = null;
      this.proximoBando = agora + this.sorteio.entre(cfg.aCadaS[0], cfg.aCadaS[1]) * 1000;
      return;
    }
    for (const m of this.morcegos) {
      const v = vooDoMorcego(t, m.de, m.para, m.fase, agora / 1000);
      m.img.setPosition(v.pos.x, v.pos.y).setTexture(TEX_MORCEGO[v.asaAberta ? 0 : 1]!);
    }
  }

  // ------------------------------------------------------------------ crianças fantasiadas

  private atualizarCriancas(
    agora: number,
    dtS: number,
    area: Phaser.Geom.Rectangle,
    ctx: ContextoDaVida,
  ): void {
    const cfg = visual.vida.criancas;
    const rota = ctx.rota;
    if (
      rota &&
      rota.length >= 2 &&
      !ctx.emLuta &&
      this.criancas.length < cfg.maximo &&
      agora >= this.proximaCrianca
    ) {
      this.proximaCrianca = agora + cfg.aCadaS * 1000;
      this.novaCrianca(rota, area, ctx.jogador);
    }
    for (let k = this.criancas.length - 1; k >= 0; k--) {
      const c = this.criancas[k]!;
      const ameaca = this.ameacaMaisPerto(c.pos, ctx);
      if (!c.fugindo && (ctx.emLuta || (ameaca && ameaca.d <= cfg.raioLuta))) {
        const de = ameaca?.p ?? ctx.jogador;
        const d = Math.hypot(c.pos.x - de.x, c.pos.y - de.y) || 1;
        c.fugindo = { desde: agora, dir: { x: (c.pos.x - de.x) / d, y: (c.pos.y - de.y) / d } };
      }
      let alfa = 1;
      let dir: V2;
      if (c.fugindo) {
        const t = (agora - c.fugindo.desde) / (cfg.fugaS * 1000);
        if (t >= 1 || !rota) {
          c.figura.destruir();
          this.criancas.splice(k, 1);
          continue;
        }
        dir = c.fugindo.dir;
        c.pos = {
          x: c.pos.x + dir.x * cfg.fugaVelocidade * dtS,
          y: c.pos.y + dir.y * cfg.fugaVelocidade * dtS,
        };
        alfa = 1 - t;
      } else {
        c.distancia += c.sentido * cfg.velocidade * dtS;
        const p = aoLongoDaLinha(rota!, c.distancia);
        c.pos = { x: p.pos.x - p.dir.y * c.lado, y: p.pos.y + p.dir.x * c.lado };
        dir = c.sentido === 1 ? p.dir : { x: -p.dir.x, y: -p.dir.y };
        // Volta pelo outro lado quando o jogador fica longe.
        if (Math.hypot(c.pos.x - ctx.jogador.x, c.pos.y - ctx.jogador.y) > LONGE_TILES) {
          c.figura.destruir();
          this.criancas.splice(k, 1);
          continue;
        }
      }
      c.fase += dtS * (c.fugindo ? 16 : 9);
      const r = 0.25;
      c.figura.posicionar(
        c.pos,
        rotacaoDaDirecao(dir, 0),
        this.cenario.luminosidade({
          x0: c.pos.x - r,
          y0: c.pos.y - r,
          x1: c.pos.x + r,
          y1: c.pos.y + r,
        }),
        { z: Math.abs(Math.sin(c.fase)) * 2, alfa },
      );
    }
  }

  /** Uma criança num ponto da rota à vista, longe do jogador, andando para um dos lados. */
  private novaCrianca(rota: readonly V2[], area: Phaser.Geom.Rectangle, jogador: V2): void {
    const cfg = visual.vida.criancas;
    let total = 0;
    for (let i = 0; i + 1 < rota.length; i++)
      total += Math.hypot(rota[i + 1]!.x - rota[i]!.x, rota[i + 1]!.y - rota[i]!.y);
    // Perto de onde o jogador está na rota (à frente ou atrás): numa rua longa, um ponto qualquer
    // dela quase nunca caía à vista.
    const aqui = distanciaNaLinha(rota, jogador);
    for (let tentativa = 0; tentativa < 12; tentativa++) {
      const frente = this.sorteio.proximo() < 0.5 ? -1 : 1;
      const distancia = Math.max(
        0,
        Math.min(total, aqui + frente * this.sorteio.entre(PERTO_DEMAIS, LONGE_DEMAIS)),
      );
      const { pos } = aoLongoDaLinha(rota, distancia);
      const tela = paraTela({ ...pos, z: 0 }, this.cenario.iso);
      const longe = Math.hypot(pos.x - jogador.x, pos.y - jogador.y);
      if (!area.contains(tela.x, tela.y) || longe < PERTO_DEMAIS || longe > LONGE_DEMAIS) continue;
      // Na calçada, de um dos lados da rua.
      const lado = (this.sorteio.proximo() < 0.5 ? -1 : 1) * this.sorteio.entre(2.6, 3.6);
      const p = aoLongoDaLinha(rota, distancia);
      const desviado = { x: p.pos.x - p.dir.y * lado, y: p.pos.y + p.dir.x * lado };
      const matiz = cfg.matizes[Math.floor(this.sorteio.proximo() * cfg.matizes.length)]!;
      this.criancas.push({
        figura: this.cenario.criarFigura('crianca_perdida', matiz),
        distancia,
        sentido: this.sorteio.proximo() < 0.5 ? 1 : -1,
        lado,
        pos: desviado,
        fase: this.sorteio.entre(0, 6.3),
        fugindo: null,
      });
      return;
    }
  }

  private ameacaMaisPerto(p: V2, ctx: ContextoDaVida): { p: V2; d: number } | null {
    let melhor: { p: V2; d: number } | null = null;
    for (const e of ctx.inimigos) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (!melhor || d < melhor.d) melhor = { p: e, d };
    }
    return melhor;
  }

  // ------------------------------------------------------------------ gatos nos muros

  private atualizarGatos(agora: number, dtS: number, ctx: ContextoDaVida): void {
    const cfg = visual.vida.gatos;
    if (this.gatos.length < cfg.maximo) this.novoGato(agora, ctx.jogador);
    for (let k = this.gatos.length - 1; k >= 0; k--) {
      const g = this.gatos[k]!;
      const dj = Math.hypot(g.muro.x - ctx.jogador.x, g.muro.y - ctx.jogador.y);
      let z = 0;
      let alfa = 1;
      if (g.estado === 'sentado') {
        z = g.alturaPx;
        g.dir = { x: ctx.jogador.x - g.muro.x, y: ctx.jogador.y - g.muro.y };
        if (dj <= cfg.raioPular) {
          // Pula para o lado de longe do jogador.
          const d = dj || 1;
          const fora = { x: (g.muro.x - ctx.jogador.x) / d, y: (g.muro.y - ctx.jogador.y) / d };
          g.estado = 'pulando';
          g.desde = agora;
          g.destino = { x: g.muro.x + fora.x * 1.6, y: g.muro.y + fora.y * 1.6 };
          g.dir = fora;
        } else if (dj > LONGE_TILES) {
          g.figura.destruir();
          this.gatos.splice(k, 1);
          continue;
        }
      } else if (g.estado === 'pulando') {
        const t = (agora - g.desde) / (cfg.saltoS * 1000);
        const s = saltoDoGato(t, g.muro, g.destino, g.alturaPx, 10);
        g.pos = s.pos;
        z = s.z;
        if (t >= 1) {
          g.estado = 'fugindo';
          g.desde = agora;
        }
      } else {
        const t = (agora - g.desde) / (cfg.fugaS * 1000);
        if (t >= 1) {
          g.figura.destruir();
          this.gatos.splice(k, 1);
          continue;
        }
        g.pos = {
          x: g.pos.x + g.dir.x * cfg.fugaVelocidade * dtS,
          y: g.pos.y + g.dir.y * cfg.fugaVelocidade * dtS,
        };
        alfa = 1 - t;
      }
      const r = 0.25;
      g.figura.posicionar(
        g.pos,
        rotacaoDaDirecao(g.dir, 0),
        this.cenario.luminosidade({
          x0: g.pos.x - r,
          y0: g.pos.y - r,
          x1: g.pos.x + r,
          y1: g.pos.y + r,
        }),
        { z, alfa },
      );
    }
  }

  /** Um gato sentado num muro à vista, a uma distância boa do jogador. */
  private novoGato(agora: number, jogador: V2): void {
    const cfg = visual.vida.gatos;
    const candidatos = this.cenario
      .objetosAVista(MUROS)
      .filter((m) => !this.murosUsados.has(m.indice))
      .map((m) => ({ ...m, centro: centroDe(m.o) }))
      .filter((m) => {
        const d = Math.hypot(m.centro.x - jogador.x, m.centro.y - jogador.y);
        return d >= cfg.raioPular + 3 && d <= 14;
      });
    if (candidatos.length === 0) return;
    const m = candidatos[Math.floor(this.sorteio.proximo() * candidatos.length)]!;
    this.murosUsados.add(m.indice);
    this.gatos.push({
      figura: this.cenario.criarFigura('gato_preto'),
      muro: m.centro,
      alturaPx: cfg.alturaPx[m.o.modelo] ?? 16,
      estado: 'sentado',
      desde: agora,
      pos: { ...m.centro },
      destino: { ...m.centro },
      dir: { x: 1, y: 0 },
    });
  }

  // ------------------------------------------------------------------ janelas da cidade

  /** De tempos em tempos, uma casa da cidade de fundo à vista acende ou apaga as janelas. */
  private janelas(agora: number): void {
    if (agora < this.proximaJanela) return;
    this.proximaJanela = agora + visual.vida.janelas.aCadaS * 1000;
    const casas = this.cenario
      .objetosAVista(CASAS, true)
      .map((c) => ({
        ...c,
        novo: { ...c.o, apagada: !('apagada' in c.o && c.o.apagada) } as ObjetoRua,
      }))
      // Só troca para um desenho que já está pronto (assar uma casa custaria um quadro).
      .filter((c) => this.cenario.jaAssado(c.novo));
    if (casas.length === 0) return;
    const c = casas[Math.floor(this.sorteio.proximo() * casas.length)]!;
    this.cenario.trocarObjeto(c.indice, c.novo);
    this.janelasTrocadas++;
  }
}

/** Centro da pegada de um objeto no mundo (o muro, para o gato sentar no meio dele). */
function centroDe(o: ObjetoRua): V2 {
  const { largura, profundidade } = modelos[o.modelo].pegada;
  const p = posicionador(largura, profundidade, o.x, o.y, o.rot).pegada;
  return { x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2 };
}
