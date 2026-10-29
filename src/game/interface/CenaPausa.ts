import * as Phaser from 'phaser';
import { brilharPainel, entrarCena } from './animacao';
import {
  controles,
  dicas,
  habilidades,
  susto as cfgSusto,
  campeoes,
  visual,
} from '../../sim/content';
import { TECLAS } from '../../sim/content/esquemas';
import { mixer, somDeCliqueNaCena } from '../audio/mixer';
import { rotuloDaTecla } from '../entrada';
import { telaDe } from '../tela';
import { BotaoDeMenu, ListaDeBotoes } from './botoes';
import { COR, estiloTexto, painel } from './estilo';

// Menu de pausa (PLANO_MUNDO_VIVO.md, frente 7): a rua para; à esquerda os botões (continuar, as
// telas de consulta, som, tela cheia e sair) e à direita a consulta escolhida. Mouse e teclado.

export interface DadosPausa {
  campeaoId: string;
  tratos: { nome: string; poder: string; marcas: string[] }[];
  precos: { nome: string; efeito: string; doTrato: string }[];
  susto: { valor: number; faixa: string; frenesi: number } | null;
  aoContinuar: () => void;
  aoSair: () => void;
  /** A consulta aberta mudou (a rua publica para os testes). */
  aoMostrar?: (consulta: string) => void;
}

type Consulta = 'tratos' | 'susto' | 'controles';

const LARGURA = 860;
const ALTURA = 500;
const LARGURA_BOTAO = 240;
const ALTURA_BOTAO = 40;
const ESPACO_BOTAO = 10;

export class CenaPausa extends Phaser.Scene {
  private d!: DadosPausa;
  private consulta: Consulta = 'tratos';
  private conteudo!: Phaser.GameObjects.Container;
  private lista!: ListaDeBotoes;
  private som!: BotaoDeMenu;
  private sair!: BotaoDeMenu;
  private confirmarSaida = false;

  constructor() {
    super('CenaPausa');
  }

  init(d: DadosPausa): void {
    this.d = d;
    this.consulta = 'tratos';
    this.confirmarSaida = false;
  }

  create(): void {
    somDeCliqueNaCena(this);
    const { largura, altura } = telaDe(this);
    this.add.rectangle(0, 0, largura, altura, 0x000000, 0.6).setOrigin(0).setInteractive();
    const x0 = (largura - LARGURA) / 2;
    const y0 = (altura - ALTURA) / 2;
    const g = this.add.graphics();
    painel(g, x0, y0, LARGURA, ALTURA);
    g.fillStyle(COR.jogador, 1).fillRect(x0, y0, LARGURA, 3);
    brilharPainel(this, x0 + 12, y0, LARGURA - 24);
    entrarCena(this);
    this.add
      .text(x0 + 28, y0 + 22, 'PAUSA', estiloTexto(24, COR.texto, true))
      .setResolution(2)
      .setLetterSpacing(3);
    this.add
      .text(x0 + LARGURA - 28, y0 + 30, 'Esc · continuar   ↑ ↓ · escolher   Enter · confirmar', {
        ...estiloTexto(12, COR.textoApagado),
      })
      .setOrigin(1, 0)
      .setResolution(2);

    const bx = x0 + 28;
    let by = y0 + 80;
    const novo = (texto: string, acao: () => void, principal = false) => {
      const b = new BotaoDeMenu(this, bx, by, LARGURA_BOTAO, ALTURA_BOTAO, texto, acao, {
        principal,
      });
      by += ALTURA_BOTAO + ESPACO_BOTAO;
      return b;
    };
    const botoes = [
      novo('Continuar', () => this.continuar(), true),
      novo('Tratos e preços', () => this.mostrar('tratos')),
      novo('Susto e Frenesi', () => this.mostrar('susto')),
      novo('Controles', () => this.mostrar('controles')),
      novo(visual.desempenho.textos.titulo, () => {
        this.scene.launch('CenaDesempenho', { origem: 'CenaPausa' });
        this.scene.pause();
      }),
    ];
    this.som = novo(this.textoDoSom(), () => {
      mixer.alternar();
      this.som.texto = this.textoDoSom();
    });
    botoes.push(
      this.som,
      novo('Tela cheia', () => this.scale.toggleFullscreen()),
    );
    this.sair = novo('Sair para o título', () => this.pedirSaida());
    botoes.push(this.sair);
    this.lista = new ListaDeBotoes(botoes);
    this.lista.ligarTeclado(this);
    const k = this.input.keyboard!;
    k.on('keydown-ESC', () => this.continuar());
    k.on('keydown-P', () => this.continuar());

    this.conteudo = this.add.container(0, 0);
    this.desenharConsulta();
    this.d.aoMostrar?.(this.consulta);
  }

  private textoDoSom(): string {
    return `Som: ${mixer.ligado ? 'ligado' : 'desligado'} (M)`;
  }

  private continuar(): void {
    this.scene.stop();
    this.d.aoContinuar();
  }

  /** Sair perde a run: o primeiro clique pede confirmação. */
  private pedirSaida(): void {
    if (!this.confirmarSaida) {
      this.confirmarSaida = true;
      this.sair.texto = 'Confirmar: a run se perde';
      return;
    }
    this.scene.stop();
    this.d.aoSair();
  }

  private mostrar(c: Consulta): void {
    this.consulta = c;
    this.d.aoMostrar?.(c);
    this.desenharConsulta();
  }

  private desenharConsulta(): void {
    this.conteudo.removeAll(true);
    const { largura, altura } = telaDe(this);
    const x = (largura - LARGURA) / 2 + 28 + LARGURA_BOTAO + 32;
    const y0 = (altura - ALTURA) / 2 + 80;
    const w = LARGURA - (x - (largura - LARGURA) / 2) - 28;
    const titulo = (t: string) =>
      this.conteudo.add(this.add.text(x, y0, t, estiloTexto(17, COR.texto, true)).setResolution(2));
    const linhas = (ys: number, itens: [string, string][], larguraChave = 190, folga = 8) => {
      let y = ys;
      for (const [a, b] of itens) {
        const ta = this.add
          .text(x, y, a, estiloTexto(13, corTexto(COR.doce), true))
          .setResolution(2)
          .setWordWrapWidth(larguraChave - 10);
        const tb = this.add
          .text(x + larguraChave, y, b, estiloTexto(13))
          .setResolution(2)
          .setWordWrapWidth(w - larguraChave);
        this.conteudo.add([ta, tb]);
        y += Math.max(ta.height, tb.height) + folga;
      }
      return y;
    };
    if (this.consulta === 'tratos') {
      titulo('Tratos e preços da run');
      const tratos = this.d.tratos.map((t): [string, string] => [
        t.nome,
        `${t.poder}${t.marcas.length ? `  ·  ${t.marcas.join(', ')}` : ''}`,
      ]);
      let y = y0 + 34;
      if (tratos.length === 0)
        this.conteudo.add(
          this.add
            .text(
              x,
              y,
              'Nenhum trato ainda: bata nas portas acesas no Porta a Porta.',
              estiloTexto(13, COR.textoApagado),
            )
            .setResolution(2),
        );
      else y = linhas(y, tratos);
      y += 14;
      this.conteudo.add(
        this.add.text(x, y, 'Preços pagos', estiloTexto(15, COR.texto, true)).setResolution(2),
      );
      const precos = this.d.precos.map((p): [string, string] => [
        p.nome,
        `${p.efeito}  (por ${p.doTrato})`,
      ]);
      if (precos.length === 0)
        this.conteudo.add(
          this.add
            .text(x, y + 26, 'Nenhum preço pago.', estiloTexto(13, COR.textoApagado))
            .setResolution(2),
        );
      else linhas(y + 26, precos);
      return;
    }
    if (this.consulta === 'susto') {
      titulo('Susto e Frenesi');
      const s = this.d.susto;
      const agora = s
        ? s.frenesi > 0
          ? `Agora: Frenesi! (${Math.ceil(s.frenesi)} s)`
          : `Agora: ${Math.round(s.valor)} de ${cfgSusto.maximo} · ${s.faixa}`
        : '';
      let y = y0 + 34;
      if (agora) {
        this.conteudo.add(
          this.add.text(x, y, agora, estiloTexto(14, corTexto(COR.magia), true)).setResolution(2),
        );
        y += 30;
      }
      for (const t of dicas.pausa.susto) {
        const tx = this.add.text(x, y, t, estiloTexto(13)).setResolution(2).setWordWrapWidth(w);
        this.conteudo.add(tx);
        y += tx.height + 8;
      }
      // As faixas e o Frenesi saem do susto.json (seguem o que for ajustado no F1).
      const faixas = cfgSusto.faixas.map((f): [string, string] => [
        `${f.nome} (${f.desde}+)`,
        `doces ×${f.doces}${f.velocidade > 0 ? ` · +${Math.round(f.velocidade * 100)}% de velocidade` : ''}`,
      ]);
      const fr = cfgSusto.frenesi;
      faixas.push([
        `Frenesi (${cfgSusto.maximo})`,
        `${fr.duracao} s: recargas ${Math.round(fr.velocidadeRecarga * 100)}% mais rápidas, habilidades sem custo, doces ×${fr.doces}`,
      ]);
      linhas(y + 8, faixas, 150);
      return;
    }
    titulo('Controles');
    const c = campeoes[this.d.campeaoId];
    const hab = TECLAS.map((t): [string, string] => {
      const id = c?.habilidades[t];
      const nome = habilidades.find((h) => h.id === id)?.nome ?? t;
      return [rotuloDaTecla(t) === 'B DIR' ? 'Botão direito' : rotuloDaTecla(t), nome];
    });
    // Teclado, mouse e controle: as linhas mais juntas para caber tudo no painel.
    linhas(
      y0 + 34,
      [
        ...dicas.pausa.controles.slice(0, 2),
        ...hab,
        [nomeDaTecla(controles.rolar), 'rolar (passa pelos inimigos)'],
        [nomeDaTecla(controles.lanterna), 'lanterna'],
        [
          `${controles.interagir} / ${controles.travessura}`,
          'interagir · na campainha, doce ou travessura',
        ],
        ...dicas.pausa.controles.slice(2),
      ],
      190,
      3,
    );
  }
}

function nomeDaTecla(t: string): string {
  return t === 'SPACE' ? 'Espaço' : t === 'SHIFT' ? 'Shift' : t;
}

/** Número de cor do estilo para a string que o texto do Phaser pede. */
function corTexto(cor: number): string {
  return `#${cor.toString(16).padStart(6, '0')}`;
}
