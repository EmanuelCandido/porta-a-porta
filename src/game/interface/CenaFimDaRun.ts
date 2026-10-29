import { rotuloDaTecla } from '../entrada';
import { brilharPainel, contar, entrarCena } from './animacao';
import * as Phaser from 'phaser';
import { campeoes, visual } from '../../sim/content';
import type { Novidades } from '../../sim/progresso';
import type { RumoDoFim } from '../sessao';
import type { ResumoDaRun } from '../../sim/run';
import { carregarArtes, imagemDaArte } from './artes';
import { COR, estiloTexto, painel, placa } from './estilo';
import { registrarFontePixel, TextoPixel } from './fontePixel';
import { iconeDoce, iconeEvolucao, retrato } from './icones';
import { mixer, somDeCliqueNaCena } from '../audio/mixer';
import { telaDe } from '../tela';

export interface DadosFimDaRun {
  resumo: ResumoDaRun;
  /** O que o fim liberou no Álbum (null: a run não conta para o progresso). */
  novidades: Novidades | null;
  /** Barras do Álbum e da maestria e o objetivo do Diário. */
  rumo: RumoDoFim | null;
  /** Enter: outra run com o mesmo campeão. */
  novaRun: () => void;
  /** Esc: volta para a tela de título. */
  titulo: () => void;
  /** Os botões apareceram (testes). */
  aoMostrarBotoes?: () => void;
}

const LARGURA = 1000;
const ALTURA = 680;

/**
 * Tela do fim da run (GAMEPLAY.md, "Tela de derrota (ou de vitória)"): o quanto faltou, a build
 * (campeão, evoluções, tratos, Conjuntos, preços e itens), os números da noite e os Doces Guardados.
 * O botão de nova run aparece logo, com o mesmo campeão; Enter começa direto.
 */
export class CenaFimDaRun extends Phaser.Scene {
  private d!: DadosFimDaRun;
  private pronto = false;
  private botoes!: Phaser.GameObjects.Container;
  private saiu = false;

  constructor() {
    super('CenaFimDaRun');
  }

  init(d: DadosFimDaRun): void {
    this.d = d;
    this.pronto = false;
    this.saiu = false;
  }

  preload(): void {
    carregarArtes(this);
  }

  create(): void {
    mixer.trilha('titulo');
    somDeCliqueNaCena(this);
    registrarFontePixel(this);
    const { largura, altura } = telaDe(this);
    const r = this.d.resumo;
    this.add.rectangle(0, 0, largura, altura, 0x000000, 0.72).setOrigin(0).setInteractive();
    const x0 = (largura - LARGURA) / 2;
    const y0 = (altura - ALTURA) / 2 - 10;
    const g = this.add.graphics();
    painel(g, x0, y0, LARGURA, ALTURA);
    brilharPainel(this, x0 + 12, y0, LARGURA - 24);
    entrarCena(this);

    // Título e o quanto faltou.
    const corTitulo = r.venceu ? visual.acentos.doce : COR.texto;
    this.texto(
      largura / 2,
      y0 + 26,
      r.venceu ? 'A noite é sua!' : 'A Coragem acabou...',
      estiloTexto(30, corTitulo, true),
    ).setOrigin(0.5, 0);
    this.texto(largura / 2, y0 + 70, r.onde, estiloTexto(15, COR.textoApagado)).setOrigin(0.5, 0);
    const sub =
      r.moradora === 'venceu'
        ? 'A Moradora do 13 caiu: o reflexo se partiu!'
        : r.moradora === 'perdeu'
          ? 'A Moradora do 13 venceu o duelo, mas a noite já era sua'
          : r.faltou;
    if (sub) {
      this.texto(largura / 2, y0 + 94, sub, estiloTexto(17, COR.texto, true)).setOrigin(0.5, 0);
    }

    // Coluna da build.
    const bx = x0 + 34;
    let by = y0 + 140;
    g.fillStyle(COR.placaClara, 1).fillCircle(bx + 34, by + 34, 34);
    if (!imagemDaArte(this, 'retrato', r.campeaoId, bx + 34, by + 32, 66))
      retrato(g, r.campeaoId, bx + 34, by + 34, 56);
    this.texto(bx + 84, by + 8, r.campeao, estiloTexto(20, COR.texto, true));
    new TextoPixel(this, bx + 84, by + 40, 2, COR.doce).texto(`NV ${r.nivel}`);
    by += 86;

    this.titulo(bx, by, 'Evoluções');
    by += 24;
    if (r.evolucoes.length === 0) {
      this.texto(bx, by, 'Nenhuma ainda (posto 3 de Q, W ou E)', estiloTexto(13, COR.textoApagado));
      by += 24;
    }
    for (const ev of r.evolucoes) {
      g.fillStyle(COR.placa, 1).fillCircle(bx + 11, by + 10, 11);
      g.lineStyle(1.5, COR.magia, 1).strokeCircle(bx + 11, by + 10, 11);
      if (!imagemDaArte(this, 'evolucao', ev.id, bx + 11, by + 10, 24))
        iconeEvolucao(g, ev.id, bx + 11, by + 10, 16, COR.luz);
      this.texto(bx + 30, by + 1, `${rotuloDaTecla(ev.tecla)} · ${ev.nome}`, estiloTexto(14));
      by += 26;
    }
    by += 8;
    this.titulo(bx, by, 'Tratos e Conjuntos');
    by += 24;
    const tratos = r.tratos.map((t) => `${t.nome} (${t.marcas.join(', ')})`);
    this.lista(bx, by, tratos.length > 0 ? tratos : ['Nenhum trato aceito'], 2, 430);
    by += Math.max(1, Math.ceil(tratos.length / 2)) * 20 + 4;
    if (r.conjuntos.length > 0) {
      this.texto(
        bx,
        by,
        r.conjuntos.map((c) => `${c.nome} ${c.nivel === 4 ? '(4)' : '(2)'}`).join('  ·  '),
        estiloTexto(13, visual.acentos.magia, true),
      );
      by += 22;
    }
    by += 6;
    this.titulo(bx, by, 'Preços pagos');
    by += 24;
    this.lista(bx, by, r.precos.length > 0 ? r.precos : ['Nenhum'], 2, 430);

    // Coluna dos números.
    const nx = x0 + LARGURA / 2 + 60;
    let ny = y0 + 140;
    this.titulo(nx, ny, 'A noite em números');
    ny += 28;
    const numeros: [string, string][] = [
      ['Ruas vencidas', String(r.ruasVencidas)],
      ['Chefes vencidos', String(r.chefesVencidos)],
      ['Inimigos derrotados', String(r.derrotados)],
      ['Dano causado', String(r.danoCausado)],
      ['Doces ganhos', String(r.docesGanhos)],
      ['Medalhas de Bom Vizinho', String(r.medalhas)],
      ['Relógio', r.relogio],
    ];
    if (r.lua > 0) numeros.push(['Lua Cheia', String(r.lua)]);
    numeros.forEach(([rotulo, valor], i) => {
      this.texto(nx, ny, rotulo, estiloTexto(14, COR.textoApagado));
      const t = new TextoPixel(this, nx + 330, ny + 3, 2, COR.luz);
      t.objeto.setOrigin(1, 0);
      // Os números contam até o valor, um depois do outro (o relógio aparece direto).
      const n = Number(valor);
      if (Number.isFinite(n) && /^\d+$/.test(valor))
        contar(this, 0, n, (v) => t.texto(String(v)), 250 + i * 120);
      else t.texto(valor);
      ny += 26;
    });
    // As duas barras do que está perto (GAMEPLAY.md): o Álbum e a maestria do campeão.
    const rumo = this.d.rumo;
    if (rumo) {
      const by3 = y0 + ALTURA - 252;
      const m = rumo.maestria;
      this.barra(
        g,
        nx,
        by3,
        m.proximo === null
          ? `Maestria ${m.nivel}: completa`
          : `Maestria ${m.nivel} → ${m.nivel + 1}: ${m.pontos} de ${m.proximo}`,
        m.proximo === null ? 1 : (m.pontos - m.desde) / Math.max(1, m.proximo - m.desde),
        COR.jogador,
      );
      if (rumo.album)
        this.barra(
          g,
          nx,
          by3 + 40,
          rumo.album.tem >= rumo.album.preco
            ? `Álbum: ${rumo.album.nome} já dá para comprar!`
            : `Álbum: ${rumo.album.nome} (${rumo.album.tem} de ${rumo.album.preco})`,
          rumo.album.tem / rumo.album.preco,
          COR.doce,
        );
      if (rumo.objetivo)
        this.texto(
          largura / 2,
          y0 + ALTURA - 90,
          `Próxima run: ${rumo.objetivo}`,
          estiloTexto(14, visual.acentos.magia, true),
        ).setOrigin(0.5, 0);
    }
    if (r.itens.length > 0) {
      ny += 4;
      this.texto(nx, ny, `Itens: ${r.itens.join(', ')}`, {
        ...estiloTexto(13),
        wordWrap: { width: 340 },
        maxLines: 2,
      });
    }
    // Doces Guardados (vão para o Álbum de Fantasias).
    const gy = y0 + ALTURA - 150;
    placa(g, nx - 12, gy, 360, 58, { cor: COR.placaClara, alfa: 1, chanfro: 4 });
    iconeDoce(g, nx + 16, gy + 29, 26);
    this.texto(nx + 40, gy + 10, 'Doces Guardados', estiloTexto(14, COR.texto, true));
    this.texto(nx + 40, gy + 30, this.textoDasNovidades(), {
      ...estiloTexto(11, this.d.novidades ? visual.acentos.doce : COR.textoApagado),
      wordWrap: { width: 230 },
      maxLines: 2,
    });
    const guardados = new TextoPixel(this, nx + 334, gy + 16, 3, COR.doce);
    guardados.objeto.setOrigin(1, 0);
    contar(this, 0, r.docesGuardados, (v) => guardados.texto(`+${v}`), 250 + numeros.length * 120);

    // Botões (aparecem depois de um instante, para um Enter apressado não pular a tela).
    this.botoes = this.add.container(0, 0).setAlpha(0);
    const gb = this.add.graphics();
    const by2 = y0 + ALTURA - 70;
    const bw = 300;
    const xNova = largura / 2 - bw - 12;
    const xTitulo = largura / 2 + 12;
    placa(gb, xNova, by2, bw, 44, { cor: COR.jogador, alfa: 1, chanfro: 5 });
    placa(gb, xTitulo, by2, bw, 44, { cor: COR.placaClara, alfa: 1, chanfro: 5 });
    this.botoes.add(gb);
    this.botoes.add(
      this.texto(
        xNova + bw / 2,
        by2 + 12,
        `Enter · Nova run com ${r.campeao}`,
        estiloTexto(16, visual.paleta.faceDireita, true),
      )
        .setOrigin(0.5, 0)
        .setStroke('#000000', 0),
    );
    this.botoes.add(
      this.texto(xTitulo + bw / 2, by2 + 12, 'Esc · Tela de título', estiloTexto(16)).setOrigin(
        0.5,
        0,
      ),
    );
    const zNova = this.add
      .zone(xNova, by2, bw, 44)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    const zTitulo = this.add
      .zone(xTitulo, by2, bw, 44)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true });
    zNova.on('pointerdown', () => this.sair('nova'));
    zTitulo.on('pointerdown', () => this.sair('titulo'));
    // Passando o mouse, o botão ganha o contorno aceso.
    const realce = this.add.graphics();
    this.botoes.add(realce);
    for (const [z, x] of [
      [zNova, xNova],
      [zTitulo, xTitulo],
    ] as const) {
      z.on('pointerover', () => realce.clear().lineStyle(2, COR.luz, 1).strokeRect(x, by2, bw, 44));
      z.on('pointerout', () => realce.clear());
    }
    this.time.delayedCall(visual.interface.botaoDoFimMs, () => {
      this.pronto = true;
      this.tweens.add({ targets: this.botoes, alpha: 1, duration: 250 });
      this.d.aoMostrarBotoes?.();
    });
    const k = this.input.keyboard!;
    k.on('keydown-ENTER', () => this.sair('nova'));
    k.on('keydown-ESC', () => this.sair('titulo'));
  }

  /** Uma barra de progresso com o rótulo em cima. */
  private barra(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    rotulo: string,
    fracao: number,
    cor: number,
  ): void {
    this.texto(x, y, rotulo, { ...estiloTexto(12, COR.texto), maxLines: 1 });
    g.fillStyle(COR.placa, 1).fillRect(x, y + 20, 340, 8);
    g.fillStyle(cor, 1).fillRect(x, y + 20, 340 * Math.max(0, Math.min(1, fracao)), 8);
  }

  /** Fantasias e Lua Cheia liberadas, ou o lugar no placar da noite. */
  private textoDasNovidades(): string {
    const n = this.d.novidades;
    if (!n) return '10% dos doces e 50 por chefe, para o Álbum';
    const partes = n.campeoes.map((id) => `${campeoes[id]?.nome ?? id} liberado!`);
    if (n.lua !== null) partes.push(`Lua Cheia ${n.lua} liberada!`);
    if (n.lugarNaNoite !== null) partes.push(`${n.lugarNaNoite}º no placar da noite`);
    if (n.maestria !== null) partes.push(`Maestria ${n.maestria}!`);
    if (n.cor) partes.push(`Cor ${n.cor}`);
    for (const p of n.paginas) partes.push(`Página ${p} fechada`);
    if (n.desafio) partes.push('Desafio da semana vencido!');
    return partes.length > 0 ? partes.join(' · ') : 'Guardados no Álbum de Fantasias';
  }

  private texto(
    x: number,
    y: number,
    t: string,
    estilo: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.Text {
    return this.add.text(x, y, t, estilo).setResolution(2);
  }

  private titulo(x: number, y: number, t: string): void {
    this.texto(x, y, t.toUpperCase(), estiloTexto(12, COR.textoApagado, true));
  }

  /** Lista em colunas, uma linha de 20 px por item. */
  private lista(x: number, y: number, itens: string[], colunas: number, largura: number): void {
    const w = largura / colunas;
    itens.forEach((t, i) => {
      this.texto(x + (i % colunas) * w, y + Math.floor(i / colunas) * 20, `· ${t}`, {
        ...estiloTexto(13),
        wordWrap: { width: w - 8 },
        maxLines: 1,
      });
    });
  }

  private sair(para: 'nova' | 'titulo'): void {
    if (!this.pronto || this.saiu) return;
    this.saiu = true;
    this.scene.stop();
    if (para === 'nova') this.d.novaRun();
    else this.d.titulo();
  }
}
