import * as Phaser from 'phaser';
import { visual } from '../../sim/content';
import { NIVEIS, escolherQualidade, nivelDeQualidade } from '../desempenho/qualidade';
import { brilharPainel, entrarCena } from './animacao';
import { BotaoDeMenu, ListaDeBotoes } from './botoes';
import { COR, estiloTexto, painel } from './estilo';
import { telaDe } from '../tela';
import { somDeCliqueNaCena } from '../audio/mixer';

// O mesmo desenho da pausa: título em caixa alta, botões empilhados à esquerda e a explicação à
// direita.
const LARGURA = 680;
const ALTURA = 320;
const LARGURA_BOTAO = 220;
const ALTURA_BOTAO = 40;
const ESPACO_BOTAO = 10;
const MARGEM = 28;

/** Opções acessíveis no título e na pausa. A run atual mantém seu perfil até trocar de rua. */
export class CenaDesempenho extends Phaser.Scene {
  private origem = 'CenaTitulo';

  constructor() {
    super('CenaDesempenho');
  }
  init(d: { origem: string }): void {
    this.origem = d.origem;
  }

  create(): void {
    somDeCliqueNaCena(this);
    const { largura, altura } = telaDe(this);
    const x0 = (largura - LARGURA) / 2;
    const y0 = (altura - ALTURA) / 2;
    const textos = visual.desempenho.textos;
    this.add.rectangle(0, 0, largura, altura, 0x000000, 0.6).setOrigin(0).setInteractive();
    const g = this.add.graphics();
    painel(g, x0, y0, LARGURA, ALTURA);
    g.fillStyle(COR.jogador, 1).fillRect(x0, y0, LARGURA, 3);
    brilharPainel(this, x0 + 12, y0, LARGURA - 24);
    entrarCena(this);
    this.add
      .text(x0 + MARGEM, y0 + 22, textos.titulo.toUpperCase(), estiloTexto(24, COR.texto, true))
      .setResolution(2)
      .setLetterSpacing(3);
    this.add
      .text(x0 + LARGURA - MARGEM, y0 + 30, textos.navegacao, estiloTexto(12, COR.textoApagado))
      .setOrigin(1, 0)
      .setResolution(2);

    // A coluna da direita: a qualidade escolhida, o que ela muda e a regra geral.
    const xd = x0 + MARGEM + LARGURA_BOTAO + MARGEM;
    const wd = x0 + LARGURA - MARGEM - xd;
    const nome = this.add.text(xd, y0 + 80, '', estiloTexto(17, COR.texto, true)).setResolution(2);
    const descricao = this.add
      .text(xd, y0 + 108, '', { ...estiloTexto(15, COR.texto), wordWrap: { width: wd } })
      .setResolution(2);
    this.add
      .text(xd, y0 + 176, textos.explicacao, {
        ...estiloTexto(13, COR.textoApagado),
        wordWrap: { width: wd },
      })
      .setResolution(2);
    // Na pausa, a qualidade nova só vale na próxima rua.
    this.add
      .text(xd, y0 + 236, this.origem === 'CenaTitulo' ? '' : textos.proximaRua, {
        ...estiloTexto(13, COR.textoApagado),
        wordWrap: { width: wd },
      })
      .setResolution(2);

    const botoesQualidade: BotaoDeMenu[] = [];
    const atualizar = () => {
      const atual = nivelDeQualidade();
      NIVEIS.forEach((n, i) => {
        botoesQualidade[i]!.texto =
          `${atual === n ? '✓ ' : ''}${visual.desempenho.qualidades[n].nome}`;
      });
      nome.setText(`${textos.qualidade}: ${visual.desempenho.qualidades[atual].nome}`);
      descricao.setText(visual.desempenho.qualidades[atual].descricao);
    };
    const bx = x0 + MARGEM;
    let by = y0 + 80;
    NIVEIS.forEach((n) => {
      botoesQualidade.push(
        new BotaoDeMenu(this, bx, by, LARGURA_BOTAO, ALTURA_BOTAO, '', () => {
          escolherQualidade(n);
          atualizar();
        }),
      );
      by += ALTURA_BOTAO + ESPACO_BOTAO;
    });
    atualizar();
    const fechar = () => {
      this.scene.resume(this.origem);
      this.scene.stop();
    };
    by += ESPACO_BOTAO;
    const voltar = new BotaoDeMenu(
      this,
      bx,
      by,
      LARGURA_BOTAO,
      ALTURA_BOTAO,
      textos.voltar,
      fechar,
    );
    new ListaDeBotoes([...botoesQualidade, voltar]).ligarTeclado(this);
    this.input.keyboard?.on('keydown-ESC', fechar);
    if (window.__portaAPorta) {
      window.__portaAPorta.opcoesDesempenho = true;
      this.events.once('shutdown', () => {
        if (window.__portaAPorta) window.__portaAPorta.opcoesDesempenho = false;
      });
    }
  }
}
