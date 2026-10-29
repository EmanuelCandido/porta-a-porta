import { rotuloDaTecla } from '../entrada';
import { mixer } from '../audio/mixer';
import { brilharPainel, chegar, entrarCena } from './animacao';
import { usandoControle } from '../dispositivo';
import * as Phaser from 'phaser';
import { visual } from '../../sim/content';
import { carregarArtes, imagemDaArte } from './artes';
import { COR, estiloTexto, painel, placa } from './estilo';
import { registrarFontePixel, TextoPixel } from './fontePixel';
import { iconeEvolucao, iconeHabilidade } from './icones';
import { somDeCliqueNaCena } from '../audio/mixer';
import { telaDe } from '../tela';

export interface OpcaoNaTela {
  id: string;
  nome: string;
  descricao: string;
}

export interface DadosEvolucao {
  tecla: string;
  /** A habilidade que chegou ao posto da evolução. */
  habilidade: { id: string; nome: string; forma: string };
  opcoes: OpcaoNaTela[];
  /** O R escolhe um Despertar, não uma evolução. */
  despertar: boolean;
  /** Dica de uma linha na primeira evolução da primeira run (GAMEPLAY.md). */
  dica?: string;
  /** A escolha (a cena fecha logo depois e a rua volta a rodar). */
  escolher: (id: string) => void;
}

const LARGURA_CARTA = 330;
const ALTURA_CARTA = 250;
const ESPACO = 36;

/**
 * A pausa da evolução (docs/GAMEPLAY.md): quando Q, W ou E chegam ao posto 3 (ou o R, com os
 * Despertares), o jogo para e o jogador escolhe 1 entre 2 cartas, com 1, 2 ou o clique. A regra
 * fica em `src/sim/evolucoes.ts`; aqui só mostramos as cartas e repassamos a escolha.
 */
export class CenaEvolucao extends Phaser.Scene {
  private d!: DadosEvolucao;
  private g!: Phaser.GameObjects.Graphics;
  private sobre: number | null = null;
  private escolhida = false;

  constructor() {
    super('CenaEvolucao');
  }

  init(d: DadosEvolucao): void {
    this.d = d;
    this.sobre = null;
    this.escolhida = false;
  }

  preload(): void {
    carregarArtes(this);
  }

  create(): void {
    somDeCliqueNaCena(this);
    registrarFontePixel(this);
    const { largura, altura } = telaDe(this);
    this.add.rectangle(0, 0, largura, altura, 0x000000, 0.62).setOrigin(0).setInteractive();
    this.g = this.add.graphics().setDepth(10);
    entrarCena(this);
    const { d } = this;
    const total = d.opcoes.length * LARGURA_CARTA + (d.opcoes.length - 1) * ESPACO;
    const x0 = (largura - total) / 2;
    const y0 = altura / 2 - ALTURA_CARTA / 2 + 24;

    const titulo = d.despertar ? 'Despertar' : 'Evolução';
    this.add
      .text(
        largura / 2,
        y0 - 104,
        `${d.habilidade.nome} chegou ao posto 3`,
        estiloTexto(26, COR.texto, true),
      )
      .setOrigin(0.5)
      .setResolution(2);
    this.add
      .text(
        largura / 2,
        y0 - 68,
        `Escolha ${d.despertar ? 'um' : 'uma'} ${titulo.toLowerCase()}: vale até o fim da run.`,
        estiloTexto(15, COR.textoApagado),
      )
      .setOrigin(0.5)
      .setResolution(2);
    if (d.dica)
      this.add
        .text(largura / 2, y0 + ALTURA_CARTA + 60, d.dica, estiloTexto(15, visual.acentos.doce))
        .setOrigin(0.5)
        .setResolution(2);
    // A habilidade, entre o título e as cartas.
    const gTopo = this.add.graphics();
    placa(gTopo, largura / 2 - 26, y0 - 50, 52, 52, { cor: COR.placaClara, alfa: 1, chanfro: 4 });
    if (!imagemDaArte(this, 'habilidade', d.habilidade.id, largura / 2, y0 - 24, 48))
      iconeHabilidade(
        gTopo,
        d.habilidade.id,
        d.habilidade.forma,
        largura / 2,
        y0 - 22,
        38,
        COR.luz,
      );
    new TextoPixel(this, largura / 2 - 22, y0 - 46, 1, COR.luz).texto(rotuloDaTecla(d.tecla));

    d.opcoes.forEach((o, i) => {
      const x = x0 + i * (LARGURA_CARTA + ESPACO);
      const y = y0 + 16;
      const antes = this.children.list.length;
      const fundo = this.add.graphics();
      painel(fundo, x, y, LARGURA_CARTA, ALTURA_CARTA, COR.magia);
      brilharPainel(this, x + 12, y, LARGURA_CARTA - 24, COR.magia);
      fundo.fillStyle(COR.placaClara, 1).fillCircle(x + LARGURA_CARTA / 2, y + 62, 46);
      if (!imagemDaArte(this, 'evolucao', o.id, x + LARGURA_CARTA / 2, y + 60, 88))
        iconeEvolucao(fundo, o.id, x + LARGURA_CARTA / 2, y + 62, 58, COR.luz);
      this.add
        .text(
          x + LARGURA_CARTA / 2,
          y + 122,
          o.nome.replace(/^Despertar: /, ''),
          estiloTexto(19, COR.texto, true),
        )
        .setOrigin(0.5, 0)
        .setResolution(2);
      this.add
        .text(x + 26, y + 156, o.descricao, {
          ...estiloTexto(14),
          wordWrap: { width: LARGURA_CARTA - 52 },
          align: 'center',
          fixedWidth: LARGURA_CARTA - 52,
        })
        .setResolution(2);
      // A tecla da carta.
      placa(fundo, x + 12, y + 12, 26, 26, { cor: COR.doce, alfa: 1, chanfro: 3 });
      new TextoPixel(this, x + 25, y + 18, 2, COR.placa)
        .texto(String(i + 1))
        .objeto.setOrigin(0.5, 0);
      const zona = this.add
        .zone(x, y, LARGURA_CARTA, ALTURA_CARTA)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      // A carta chega subindo, uma depois da outra (a zona do clique fica parada).
      const novos = this.children.list.slice(antes).filter((o) => o !== zona);
      chegar(this, novos, { dx: 0, dy: -36, atraso: 120 + i * 140 });
      zona.on('pointerover', () => {
        if (this.sobre !== i) mixer.tocar('foco');
        this.sobre = i;
      });
      zona.on('pointerout', () => {
        if (this.sobre === i) this.sobre = null;
      });
      zona.on('pointerdown', () => this.escolher(i));
    });
    this.add
      .text(
        largura / 2,
        y0 + ALTURA_CARTA + 48,
        usandoControle() ? 'Direcional e A para escolher' : '1 ou 2 para escolher',
        estiloTexto(13, COR.textoApagado),
      )
      .setOrigin(0.5)
      .setResolution(2);

    const k = this.input.keyboard!;
    k.on('keydown', (ev: KeyboardEvent) => {
      const n = Number(ev.key);
      if (Number.isInteger(n) && n >= 1 && n <= d.opcoes.length) this.escolher(n - 1);
    });
  }

  override update(tempo: number): void {
    const g = this.g.clear();
    if (this.sobre === null) return;
    const { largura, altura } = telaDe(this);
    const total = this.d.opcoes.length * LARGURA_CARTA + (this.d.opcoes.length - 1) * ESPACO;
    const x = (largura - total) / 2 + this.sobre * (LARGURA_CARTA + ESPACO);
    const y = altura / 2 - ALTURA_CARTA / 2 + 24 + 16;
    g.fillStyle(COR.magia, 0.1).fillRect(x, y, LARGURA_CARTA, ALTURA_CARTA);
    g.lineStyle(2, COR.magia, 0.7 + 0.3 * Math.sin(tempo / 140)).strokeRect(
      x - 3,
      y - 3,
      LARGURA_CARTA + 6,
      ALTURA_CARTA + 6,
    );
  }

  private escolher(i: number): void {
    const o = this.d.opcoes[i];
    if (!o || this.escolhida) return;
    this.escolhida = true;
    this.scene.stop();
    this.d.escolher(o.id);
  }
}
