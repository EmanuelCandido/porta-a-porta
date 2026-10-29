import * as Phaser from 'phaser';
import { brilharPainel, entrarCena } from './animacao';
import { dicas, itens, precos, tratos as cfgTratos } from '../../sim/content';
import type { Run } from '../../sim/run';
import { usandoControle } from '../dispositivo';
import { carregarArtes, imagemDaArte, type TipoArte } from './artes';
import { BotaoDeMenu, ListaDeBotoes } from './botoes';
import { cartao, COR, corTexto, estiloTexto, etiqueta, painel } from './estilo';
import { iconeDoce } from './icones';
import { mixer, somDeCliqueNaCena } from '../audio/mixer';
import { telaDe } from '../tela';

export interface DadosPorta {
  run: Run;
  /**
   * Bater numa casa (trato), sentar no banco (loja e cura) ou abrir um baú amaldiçoado (o trato
   * forte que se aceita ou recusa na hora, `run.estado.ofertaDoBau`).
   */
  tipo: 'casa' | 'banco' | 'bau' | 'carrinho';
  casa?: number;
  /** A cena da rua volta a rodar. */
  aoFechar: () => void;
  /** Mostra no bairro os preços que foram realmente pagos (um presente pode não ter preço). */
  aoAceitar?: (precos: string[]) => void;
}

/** Tamanho do painel (cabe na tela mais estreita, 960 × 720). */
const LARGURA = 860;
const ALTURA = 520;
/** Cartões da loja (grade de duas colunas) e o espaço entre eles. */
const ALTURA_CARTAO = 96;
const ESPACO_CARTAO = 10;
/** No banco, do topo do painel até a grade (cabeçalho e frase) e da grade ao pé do painel. */
const TOPO_DA_GRADE = 112;
const PE_DA_GRADE = 104;
/** Folga mínima entre o painel e a borda da tela. */
const FOLGA_DA_TELA = 20;
/** Margem por dentro do painel. */
const M = 30;
/** Coluna da direita (arte e preço do trato; descanso e itens no banco). */
const COLUNA = 270;

/** Nome bonito de cada marca, para a carta do trato. */
const NOME_DA_MARCA: Record<string, string> = {
  luz: 'Luz',
  sombra: 'Sombra',
  doce: 'Doce',
  eco: 'Eco',
  abobora: 'Abóbora',
  pacto: 'Pacto',
};

/**
 * A janela que abre ao bater numa porta acesa (a carta do trato, com poder, marcas, preço e o
 * pechinchar), ao sentar no banco (a loja de itens e consumíveis, e a cura), no Carrinho de Pipoca
 * e no baú amaldiçoado. A cena da rua fica parada por baixo. Toda regra fica na run; aqui só
 * mostramos e repassamos o clique. Tudo tem botão (mouse e controle) e atalho de teclado.
 */
export class CenaPorta extends Phaser.Scene {
  private d!: DadosPorta;
  private conteudo!: Phaser.GameObjects.Container;
  private mensagem = '';
  private lista: ListaDeBotoes | null = null;
  /** Altura do painel da vez: a do banco cresce para a grade de produtos caber inteira. */
  private alt = ALTURA;

  constructor() {
    super('CenaPorta');
  }

  init(d: DadosPorta): void {
    this.d = d;
    this.mensagem = '';
  }

  preload(): void {
    carregarArtes(this);
  }

  create(): void {
    somDeCliqueNaCena(this);
    const { largura, altura } = telaDe(this);
    this.add.rectangle(0, 0, largura, altura, 0x02050c, 0.62).setOrigin(0).setInteractive();
    this.conteudo = this.add.container(0, 0);
    entrarCena(this);
    const k = this.input.keyboard!;
    k.on('keydown-LEFT', () => this.lista?.mover(-1));
    k.on('keydown-RIGHT', () => this.lista?.mover(1));
    if (this.d.tipo === 'bau') {
      k.on('keydown-ENTER', () => this.aceitarDoBau());
      k.on('keydown-ESC', () => this.recusarDoBau());
      this.desenhar();
      return;
    }
    k.on('keydown-ESC', () => this.fechar());
    k.on('keydown-F', () => this.fechar());
    if (this.d.tipo === 'casa') {
      k.on('keydown-ENTER', () => this.aceitar());
      k.on('keydown-P', () => this.pechinchar());
    } else if (this.d.tipo === 'carrinho') {
      k.on('keydown', (ev: KeyboardEvent) => {
        const n = Number(ev.key);
        if (Number.isInteger(n) && n >= 1) this.comprarNoCarrinho(n - 1);
      });
    } else {
      k.on('keydown-S', () => this.sentar());
      k.on('keydown', (ev: KeyboardEvent) => {
        const n = Number(ev.key);
        if (Number.isInteger(n) && n >= 1) this.comprar(n - 1);
      });
    }
    this.desenhar();
  }

  private fechar(): void {
    this.scene.stop();
    this.d.aoFechar();
  }

  // ------------------------------------------------------------------ ações

  private aceitar(): void {
    const { run, casa } = this.d;
    if (casa === undefined) return;
    const antes = new Set(run.estado.precos);
    if (run.aceitar(casa)) {
      mixer.tocar('trato');
      this.d.aoAceitar?.(run.estado.precos.filter((p) => !antes.has(p)).map((p) => p.id));
      this.fechar();
      return;
    }
    this.mensagem = 'Só dá para aceitar um trato por porta.';
    this.desenhar();
  }

  /** Baú amaldiçoado: aceitar paga o preço; recusar deixa o trato para trás. Os dois fecham. */
  private aceitarDoBau(): void {
    const { run } = this.d;
    const antes = new Set(run.estado.precos);
    if (run.aceitarOfertaDoBau()) {
      mixer.tocar('trato');
      this.d.aoAceitar?.(run.estado.precos.filter((p) => !antes.has(p)).map((p) => p.id));
    }
    this.fechar();
  }

  private recusarDoBau(): void {
    this.d.run.recusarOfertaDoBau();
    this.fechar();
  }

  private pechinchar(): void {
    const { run, casa } = this.d;
    if (casa === undefined) return;
    const o = run.oferta(casa);
    if (run.pechinchar(casa)) this.mensagem = 'O morador pensou melhor e mudou o preço.';
    else if (o?.pechinchou) this.mensagem = 'Já pechinchou nesta casa.';
    else this.mensagem = `Pechinchar custa ${run.custoDaPechincha(casa ?? -1)} doces.`;
    this.desenhar();
  }

  private produtos(): string[] {
    const p = this.d.run.estado.porta;
    const consumiveis = Object.entries(itens.itens)
      .filter(([, d]) => d.tipo === 'consumivel' && d.inicial)
      .map(([id]) => id);
    return [...(p?.loja ?? []), ...consumiveis];
  }

  private comprar(i: number): void {
    const id = this.produtos()[i];
    if (!id) return;
    const { run } = this.d;
    const motivo = run.motivoParaNaoComprar(id);
    if (motivo) this.mensagem = motivo;
    else if (run.comprar(id)) {
      mixer.tocar('compra');
      this.mensagem = `Comprou ${itens.itens[id]!.nome}.`;
    }
    this.desenhar();
  }

  private comprarNoCarrinho(i: number): void {
    const { run } = this.d;
    const id = run.estado.lojaDoCarrinho?.itens[i];
    if (!id) return;
    const motivo = run.motivoParaNaoComprarNoCarrinho(id);
    if (motivo) this.mensagem = motivo;
    else if (run.comprarNoCarrinho(id)) {
      mixer.tocar('compra');
      this.mensagem = `Comprou ${itens.itens[id]!.nome}.`;
    }
    this.desenhar();
  }

  private sentar(): void {
    this.mensagem = this.d.run.sentarNoBanco()
      ? 'Um descanso no banco: a Coragem voltou um pouco.'
      : 'Já descansou neste banco.';
    this.desenhar();
  }

  // ------------------------------------------------------------------ peças do desenho

  private texto(
    x: number,
    y: number,
    s: string,
    tam: number,
    cor = COR.texto,
    largura?: number,
    negrito = false,
  ): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, s, estiloTexto(tam, cor, negrito)).setResolution(2);
    if (largura) t.setWordWrapWidth(largura);
    this.conteudo.add(t);
    return t;
  }

  private graficos(): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    this.conteudo.add(g);
    return g;
  }

  /** Arte do Codex dentro da janela (some com o resto a cada redesenho); false se não há. */
  private arte(tipo: TipoArte, id: string, cx: number, cy: number, lado: number): boolean {
    const img = imagemDaArte(this, tipo, id, cx, cy, lado);
    if (img) this.conteudo.add(img);
    return !!img;
  }

  private botao(
    x: number,
    y: number,
    w: number,
    rotulo: string,
    acao: () => void,
    opcoes: { principal?: boolean; desligado?: boolean } = {},
  ): BotaoDeMenu {
    const b = new BotaoDeMenu(this, x, y, w, 40, rotulo, acao, { ...opcoes, tamanhoTexto: 15 });
    this.conteudo.add(b.objetos);
    return b;
  }

  /** Doces e Coragem no rodapé, à direita. */
  private bolsa(xDir: number, y: number): void {
    const { run } = this.d;
    const g = this.graficos();
    const doces = `${run.bolso.doces}`;
    const coragem = `${Math.ceil(run.ficha.combate.coragem)}/${Math.round(run.ficha.combate.attr.coragemMax)}`;
    const td = this.texto(0, y + 5, doces, 16, corTexto(COR.doce), undefined, true);
    const tc = this.texto(0, y + 5, coragem, 16, corTexto(COR.jogador), undefined, true);
    const wd = td.width + 44;
    const wc = tc.width + 92;
    const xc = xDir - wc;
    const xd = xc - 12 - wd;
    etiqueta(g, xd, y, wd, 32, COR.doce, 0.12);
    iconeDoce(g, xd + 18, y + 16, 16);
    td.setX(xd + 34);
    etiqueta(g, xc, y, wc, 32, COR.jogador, 0.12);
    this.texto(xc + 12, y + 8, 'CORAGEM', 11, corTexto(COR.jogador), undefined, true);
    tc.setX(xc + 80);
  }

  /** O que cada tecla (ou botão do controle) faz nesta janela, no pé do painel. */
  private atalhos(xDir: number, y: number, teclado: string): void {
    this.texto(
      xDir,
      y,
      usandoControle() ? 'Direcional: escolher  ·  A: confirmar  ·  B: voltar' : teclado,
      12,
      COR.textoApagado,
    ).setOrigin(1, 0);
  }

  /** Cabeçalho: rótulo pequeno em cima, título grande embaixo. */
  private cabecalho(
    x: number,
    y: number,
    rotulo: string,
    titulo: string,
    cor = COR.jogador,
  ): number {
    this.texto(x, y, rotulo.toUpperCase(), 12, COR.textoApagado, LARGURA - 2 * M - COLUNA, true);
    const t = this.texto(x, y + 18, titulo, 30, corTexto(cor), LARGURA - 2 * M - COLUNA - 20, true);
    return y + 18 + t.height;
  }

  // ------------------------------------------------------------------ telas

  private desenhar(): void {
    this.conteudo.removeAll(true);
    this.lista = null;
    const { largura, altura } = telaDe(this);
    const x0 = Math.round((largura - LARGURA) / 2);
    this.alt = this.alturaDoPainel(altura);
    const y0 = Math.round((altura - this.alt) / 2);
    const destaque =
      this.d.tipo === 'bau' ? COR.perigo : this.d.tipo === 'casa' ? COR.magia : COR.jogador;
    painel(this.graficos(), x0, y0, LARGURA, this.alt, destaque);
    this.conteudo.add(brilharPainel(this, x0 + 12, y0, LARGURA - 24));
    const botoes =
      this.d.tipo === 'casa'
        ? this.desenharCasa(x0, y0)
        : this.d.tipo === 'bau'
          ? this.desenharBau(x0, y0)
          : this.d.tipo === 'carrinho'
            ? this.desenharCarrinho(x0, y0)
            : this.desenharBanco(x0, y0);
    // Linha do rodapé: a mensagem do que acabou de acontecer (ou a dica da primeira porta).
    const g = this.graficos();
    g.lineStyle(1, COR.borda, 0.9).lineBetween(
      x0 + M,
      y0 + this.alt - 96,
      x0 + LARGURA - M,
      y0 + this.alt - 96,
    );
    const { run } = this.d;
    const marcas = this.d.tipo === 'casa' && run.estado.porta?.primeira ? dicas.marcas : '';
    this.texto(
      x0 + M,
      y0 + this.alt - 88,
      this.mensagem || marcas,
      13,
      corTexto(COR.fantasma),
      LARGURA - 2 * M - 320,
    );
    this.bolsa(x0 + LARGURA - M, y0 + this.alt - 90);
    if (botoes.length > 0) {
      this.lista = new ListaDeBotoes(botoes);
      const principal = botoes.findIndex((b) => b.principal);
      this.lista.focar(principal >= 0 ? principal : 0);
    }
  }

  private alturaDoPainel(alturaDaTela: number): number {
    if (this.d.tipo !== 'banco') return ALTURA;
    const linhas = Math.ceil(this.produtos().length / 2);
    const grade = linhas * ALTURA_CARTAO + Math.max(0, linhas - 1) * ESPACO_CARTAO;
    return Math.min(
      alturaDaTela - 2 * FOLGA_DA_TELA,
      Math.max(ALTURA, TOPO_DA_GRADE + grade + PE_DA_GRADE),
    );
  }

  /** A carta do trato na porta acesa. */
  private desenharCasa(x0: number, y0: number): BotaoDeMenu[] {
    const { run, casa } = this.d;
    const o = casa !== undefined ? run.oferta(casa) : undefined;
    if (!o) {
      this.cabecalho(x0 + M, y0 + M, 'Porta a porta', 'Ninguém atende.');
      return [this.botao(x0 + M, y0 + this.alt - 52, 160, 'Voltar', () => this.fechar())];
    }
    const def = run.defTrato(o.trato);
    const p = run.estado.porta!;
    // Moradores que lembram: quem teve o trato aceito na run anterior cumprimenta.
    const lembra = run.lembra(o.trato);
    const rotulo = o.vermelha
      ? 'A Janela Vermelha oferece um trato lendário'
      : p.comeco
        ? `${def.morador} oferece um trato sem preço`
        : `${def.morador} oferece um trato`;
    this.cartaDoTrato(x0, y0, o.trato, o.precos, rotulo, lembra ? `"${lembra}"` : null);

    // Situação desta porta, logo acima do rodapé.
    const gratis = p.aceitos >= cfgTratos.tratosPorFase && run.estado.tratosGratis > 0;
    const aviso = o.aceito
      ? null
      : gratis
        ? { t: 'Presente do Gato Preto: este trato sai sem preço.', c: COR.doce }
        : p.aceitos >= p.limite
          ? { t: 'Você já aceitou um trato nesta fase.', c: COR.apagado }
          : p.comeco
            ? { t: 'Maestria 3: escolha um trato sem preço, ou siga sem nenhum.', c: COR.doce }
            : p.aceitos === 0
              ? {
                  t: `Recusar todos os tratos: +${cfgTratos.medalha.docesRecusa} doces e uma Medalha de Bom Vizinho.`,
                  c: COR.apagado,
                }
              : null;
    if (aviso)
      this.texto(
        x0 + M,
        y0 + this.alt - 124,
        aviso.t,
        13,
        corTexto(aviso.c),
        LARGURA - 2 * M - COLUNA - 20,
      );

    const podeAceitar = !o.aceito && p.aceitos < p.limite;
    const rerolls = run.estado.rerolls;
    const podePechinchar =
      !o.aceito &&
      !o.pechinchou &&
      o.precos.length > 0 &&
      (rerolls > 0 || run.bolso.doces >= run.custoDaPechincha(o.casa));
    const yb = y0 + this.alt - 52;
    const botoes = [
      this.botao(x0 + M, yb, 170, o.aceito ? 'Aceito' : 'Aceitar o trato', () => this.aceitar(), {
        principal: podeAceitar,
        desligado: !podeAceitar,
      }),
    ];
    if (o.precos.length > 0)
      botoes.push(
        this.botao(
          x0 + M + 182,
          yb,
          210,
          rerolls > 0
            ? `Pechinchar (grátis ×${rerolls})`
            : `Pechinchar (${run.custoDaPechincha(o.casa)} doces)`,
          () => this.pechinchar(),
          { desligado: !podePechinchar },
        ),
      );
    botoes.push(
      this.botao(x0 + M + (o.precos.length > 0 ? 404 : 182), yb, 110, 'Voltar', () =>
        this.fechar(),
      ),
    );
    this.atalhos(x0 + LARGURA - M, yb + 12, 'Enter: aceitar  ·  P: pechinchar  ·  Esc: voltar');
    return botoes;
  }

  /**
   * O trato: quem oferece, o nome, o poder, as marcas (e o Conjunto que ele fecha) à esquerda; a
   * arte e os preços à direita.
   */
  private cartaDoTrato(
    x0: number,
    y0: number,
    trato: string,
    precosDoTrato: readonly string[],
    rotulo: string,
    fala: string | null,
  ): void {
    const { run } = this.d;
    const def = run.defTrato(trato);
    const x = x0 + M;
    const larg = LARGURA - 2 * M - COLUNA - 24;
    let y = this.cabecalho(x, y0 + M, rotulo, def.nome);
    if (fala) {
      const t = this.texto(x, y + 4, fala, 14, COR.textoApagado, larg);
      t.setFontStyle('italic');
      y += t.height + 6;
    }
    const poder = this.texto(x, y + 12, def.poder, 17, COR.texto, larg);
    y += 12 + poder.height + 16;

    // Marcas e Conjuntos: uma linha por marca, com o progresso e o que ele dá.
    this.texto(x, y, 'MARCAS', 11, COR.textoApagado, undefined, true);
    y += 20;
    const antes = run.conjuntos();
    const depois = run.conjuntosCom(trato);
    const g = this.graficos();
    for (const m of def.marcas) {
      const a = antes.find((c) => c.marca === m)!;
      const b = depois.find((c) => c.marca === m)!;
      const conj = cfgTratos.conjuntos[m];
      const completa = b.nivel > a.nivel;
      const alvo = b.nivel >= 2 ? 4 : 2;
      const cor = completa ? COR.doce : COR.magia;
      const progresso = completa ? `${b.tratos}/${b.nivel}` : `${b.tratos}/${alvo}`;
      const texto = completa
        ? `Completa: ${b.nivel >= 4 ? `${conj.quatro.nome}: ${conj.quatro.texto}` : conj.dois.texto}`
        : `Com ${alvo}: ${alvo >= 4 ? conj.quatro.nome : conj.dois.texto}`;
      etiqueta(g, x, y, 128, 26, cor, 0.16);
      const recuo = this.arte('marca', m, x + 14, y + 13, 18) ? 26 : 8;
      this.texto(
        x + recuo,
        y + 5,
        `${NOME_DA_MARCA[m]} ${progresso}`,
        13,
        corTexto(cor),
        undefined,
        true,
      );
      const t = this.texto(
        x + 138,
        y + 5,
        texto,
        13,
        completa ? corTexto(COR.doce) : COR.texto,
        larg - 138,
      );
      y += Math.max(32, t.height + 12);
    }
    if (def.marcas.length === 0) this.texto(x, y, 'Sem marca.', 13, COR.textoApagado);

    // Coluna da direita: a arte do trato numa moldura e os preços embaixo.
    const xc = x0 + LARGURA - M - COLUNA;
    const yc = y0 + M;
    const ga = this.graficos();
    cartao(ga, xc, yc, COLUNA, 150);
    if (!this.arte('trato', trato, xc + COLUNA / 2, yc + 75, 130))
      this.texto(xc + COLUNA / 2 - 40, yc + 66, def.nome, 14, COR.textoApagado);
    let yp = yc + 162;
    if (precosDoTrato.length === 0) {
      etiqueta(ga, xc, yp, COLUNA, 54, COR.fantasma, 0.12);
      this.texto(xc + 14, yp + 8, 'SEM PREÇO', 12, corTexto(COR.fantasma), undefined, true);
      this.texto(xc + 14, yp + 26, 'O bairro não muda por este trato.', 12, COR.texto, COLUNA - 28);
      return;
    }
    for (const id of precosDoTrato) {
      const pr = precos.precos[id]!;
      const h = precosDoTrato.length > 1 ? 104 : 140;
      etiqueta(ga, xc, yp, COLUNA, h, COR.perigo, 0.12);
      const recuo = this.arte('preco', id, xc + 30, yp + 30, 40) ? 58 : 14;
      this.texto(xc + recuo, yp + 10, 'PREÇO', 11, corTexto(COR.perigo), undefined, true);
      this.texto(xc + recuo, yp + 26, pr.nome, 15, COR.texto, COLUNA - recuo - 10, true);
      this.texto(xc + 14, yp + 56, `${pr.bairro}. ${pr.combate}.`, 12, COR.texto, COLUNA - 28);
      yp += h + 10;
    }
  }

  /** Baú amaldiçoado: um trato forte com 1 preço, para aceitar ou recusar agora. */
  private desenharBau(x0: number, y0: number): BotaoDeMenu[] {
    const o = this.d.run.estado.ofertaDoBau;
    const yb = y0 + this.alt - 52;
    if (!o) {
      this.cabecalho(x0 + M, y0 + M, 'Baú amaldiçoado', 'O baú está vazio.', COR.perigo);
      return [this.botao(x0 + M, yb, 160, 'Voltar', () => this.fechar())];
    }
    this.cartaDoTrato(x0, y0, o.trato, o.precos, 'Um baú amaldiçoado oferece um trato', null);
    this.texto(
      x0 + M,
      y0 + this.alt - 124,
      'Decida agora: o baú não espera.',
      13,
      corTexto(COR.perigo),
    );
    this.atalhos(x0 + LARGURA - M, yb + 12, 'Enter: aceitar  ·  Esc: recusar');
    return [
      this.botao(x0 + M, yb, 170, 'Aceitar o trato', () => this.aceitarDoBau(), {
        principal: true,
      }),
      this.botao(x0 + M + 182, yb, 130, 'Recusar', () => this.recusarDoBau()),
    ];
  }

  /**
   * Uma grade de produtos (o banco e o carrinho): cada um num cartão com a arte, o nome, o que faz
   * e o preço; os que não dá para comprar ficam apagados com o motivo. Devolve os botões.
   */
  private gradeDeProdutos(
    x: number,
    y: number,
    largura: number,
    ids: readonly string[],
    preco: (id: string) => number,
    motivo: (id: string) => string | null,
    comprar: (i: number) => void,
  ): BotaoDeMenu[] {
    const colunas = 2;
    const gap = ESPACO_CARTAO;
    const w = (largura - gap * (colunas - 1)) / colunas;
    const h = ALTURA_CARTAO;
    const botoes: BotaoDeMenu[] = [];
    ids.forEach((id, i) => {
      const d = itens.itens[id]!;
      const cx = x + (i % colunas) * (w + gap);
      const cy = y + Math.floor(i / colunas) * (h + gap);
      const porque = motivo(id);
      const g = this.graficos();
      cartao(g, cx, cy, w, h, porque ? 'apagado' : 'normal');
      if (!this.arte('item', id, cx + 32, cy + 36, 46)) iconeDoce(g, cx + 32, cy + 36, 22);
      const cor = porque ? COR.textoApagado : COR.texto;
      const larg = w - 74;
      this.texto(cx + 62, cy + 8, d.nome, 14, cor, larg, true);
      const desc = d.tipo === 'consumivel' ? `Consumível. ${d.descricao}` : d.descricao;
      this.texto(cx + 62, cy + 28, desc, 12, cor, larg);
      // Embaixo: o atalho de teclado à esquerda, o motivo (se houver) e o preço à direita.
      if (!usandoControle())
        this.texto(cx + 26, cy + h - 22, `${i + 1}`, 12, COR.textoApagado, undefined, true);
      if (porque)
        this.texto(cx + 62, cy + h - 22, porque, 12, corTexto(COR.perigo), larg - 76, true);
      const valor = `${preco(id)}`;
      etiqueta(g, cx + w - 74, cy + h - 30, 64, 24, porque ? COR.apagado : COR.doce, 0.14);
      iconeDoce(g, cx + w - 60, cy + h - 18, 12);
      this.texto(
        cx + w - 48,
        cy + h - 27,
        valor,
        13,
        porque ? COR.textoApagado : corTexto(COR.doce),
        undefined,
        true,
      );
      // O cartão inteiro é o botão (invisível por cima), para o mouse e o controle.
      const b = new BotaoDeMenu(this, cx, cy, w, h, '', () => comprar(i), { desligado: !!porque });
      b.fundo.setVisible(false);
      this.conteudo.add(b.objetos);
      botoes.push(b);
    });
    return botoes;
  }

  /** Carrinho de Pipoca: itens comuns com desconto, só enquanto ele está na rua. */
  private desenharCarrinho(x0: number, y0: number): BotaoDeMenu[] {
    const { run } = this.d;
    const loja = run.estado.lojaDoCarrinho;
    const y = this.cabecalho(x0 + M, y0 + M, 'Encontro raro', 'Carrinho de Pipoca');
    const g = this.graficos();
    const desconto = `-${Math.round((loja?.desconto ?? 0) * 100)}%`;
    etiqueta(g, x0 + LARGURA - M - 92, y0 + M + 18, 92, 34, COR.jogador, 0.25);
    this.texto(
      x0 + LARGURA - M - 72,
      y0 + M + 24,
      desconto,
      18,
      corTexto(COR.jogador),
      undefined,
      true,
    );
    this.texto(x0 + M, y + 4, 'Tudo com desconto. Ele vai embora logo!', 14, corTexto(COR.doce));
    const botoes = this.gradeDeProdutos(
      x0 + M,
      y + 34,
      LARGURA - 2 * M,
      loja?.itens ?? [],
      (id) => run.precoNoCarrinho(id),
      (id) => run.motivoParaNaoComprarNoCarrinho(id),
      (i) => this.comprarNoCarrinho(i),
    );
    const yb = y0 + this.alt - 52;
    botoes.push(this.botao(x0 + M, yb, 150, 'Voltar', () => this.fechar()));
    this.atalhos(x0 + LARGURA - M, yb + 12, '1, 2, 3: comprar  ·  Esc: voltar');
    return botoes;
  }

  /** O banco da praça: a loja (itens e consumíveis), o descanso e os itens que você já tem. */
  private desenharBanco(x0: number, y0: number): BotaoDeMenu[] {
    const { run } = this.d;
    const p = run.estado.porta!;
    const y = this.cabecalho(x0 + M, y0 + M, 'Porta a porta', 'O banco da praça');
    this.texto(
      x0 + M,
      y + 4,
      'Itens e consumíveis. Os tratos não ocupam espaço.',
      13,
      COR.textoApagado,
    );
    const botoes = this.gradeDeProdutos(
      x0 + M,
      y + 22,
      LARGURA - 2 * M - COLUNA - 20,
      this.produtos(),
      (id) => run.precoNoBanco(id),
      (id) => run.motivoParaNaoComprar(id),
      (i) => this.comprar(i),
    );

    // Coluna da direita: o descanso e os itens.
    const xc = x0 + LARGURA - M - COLUNA;
    const yc = y0 + M;
    const g = this.graficos();
    cartao(g, xc, yc, COLUNA, 132);
    this.texto(xc + 16, yc + 12, 'DESCANSAR', 11, COR.textoApagado, undefined, true);
    this.texto(
      xc + 16,
      yc + 30,
      `Sentar cura ${Math.round(itens.curaDoBanco * 100)}% da Coragem (uma vez por banco).`,
      13,
      COR.texto,
      COLUNA - 32,
    );
    botoes.push(
      this.botao(
        xc + 16,
        yc + 78,
        COLUNA - 32,
        p.curouNoBanco ? 'Já descansou' : 'Sentar no banco',
        () => this.sentar(),
        { desligado: p.curouNoBanco },
      ),
    );
    const yi = yc + 146;
    cartao(g, xc, yi, COLUNA, 116);
    this.texto(
      xc + 16,
      yi + 12,
      `SEUS ITENS  ${run.estado.itens.length}/${itens.maxItens}`,
      11,
      COR.textoApagado,
      undefined,
      true,
    );
    const lado = 44;
    const gap = (COLUNA - 32 - lado * itens.maxItens) / Math.max(1, itens.maxItens - 1);
    for (let k = 0; k < itens.maxItens; k++) {
      const sx = xc + 16 + k * (lado + gap);
      const sy = yi + 40;
      g.fillStyle(COR.placa, 1).fillRect(sx, sy, lado, lado);
      g.lineStyle(1, COR.borda, 1).strokeRect(sx, sy, lado, lado);
      const id = run.estado.itens[k];
      if (id) this.arte('item', id, sx + lado / 2, sy + lado / 2, lado - 6);
    }
    const yb = y0 + this.alt - 52;
    botoes.push(this.botao(x0 + M, yb, 150, 'Voltar', () => this.fechar()));
    this.atalhos(x0 + LARGURA - M, yb + 12, 'Números: comprar  ·  S: sentar  ·  Esc: voltar');
    return botoes;
  }
}
