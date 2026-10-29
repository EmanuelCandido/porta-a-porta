import * as Phaser from 'phaser';
import { marcarInicioDaRun } from '../desempenho/medidor';
import { nivelDeQualidade } from '../desempenho/qualidade';
import { usandoControle, versaoDoDispositivo } from '../dispositivo';
import { paraTela } from '../../render/iso';
import {
  album,
  campeoes,
  entreRuns,
  gerador,
  habilidades,
  luaCheia,
  luz,
  modelos,
  publicacao,
  visual,
} from '../../sim/content';
import { TECLAS } from '../../sim/content/esquemas';
import type { V2 } from '../../sim/geometria';
import { gerarRua } from '../../sim/gerador';
import {
  alternarPassiva,
  campeaoLiberado,
  desafioDaSemana,
  dicasAtivas,
  escolherCor,
  maestria,
  type ModoDaRun,
} from '../../sim/progresso';
import { publicarEstado, type EstadoTeste } from '../ganchoTeste';
import { brilharPainel, chegar, contar, fecharEmCirculo, particulas } from '../interface/animacao';
import { carregarArtes, imagemDaArte } from '../interface/artes';
import { BotaoDeMenu } from '../interface/botoes';
import { COR, estiloTexto, painel, placa } from '../interface/estilo';
import { registrarFontePixel, TextoPixel } from '../interface/fontePixel';
import {
  iconeCadeado,
  iconeDoce,
  iconeHabilidade,
  iconePassiva,
  retrato,
  silhueta,
} from '../interface/icones';
import { CenarioDaRua } from '../rua/CenarioDaRua';
import { hoje, progresso, salvar, semanaDeHoje } from '../save';
import { sessaoDoTitulo, SessaoDeTreino } from '../sessao';
import { mixer, somDeCliqueNaCena } from '../audio/mixer';
import { telaDe } from '../tela';
import { devDisponivel, PainelDev } from '../dev/PainelDev';

type Tela = 'titulo' | 'campeao';

interface Carta {
  id: string;
  nome: string;
  papel: string;
  /** Liberado agora (os outros mostram como liberar). */
  livre: boolean;
  desbloqueio: string;
}

/** Uma opção do menu do título: atalho de teclado, nome, a frase que explica e o que faz. */
interface ItemDoMenu {
  id: string;
  secao: 'JOGAR' | 'BAIRRO';
  tecla: string;
  nome: () => string;
  descricao: () => string;
  acao: () => void;
}

/** A linha desenhada de um item: o texto, o chip do atalho e a zona do mouse. */
interface LinhaDoMenu {
  item: ItemDoMenu;
  y: number;
  texto: Phaser.GameObjects.Text;
  chip: Phaser.GameObjects.Container;
  zona: Phaser.GameObjects.Zone;
  /** O deslize do foco em curso (parado quando o foco muda de novo). */
  deslize: Phaser.Tweens.Tween | null;
}

const LARGURA_CARTA = 228;
const ALTURA_CARTA = 262;
const ESPACO_CARTA = 20;
const Y_CARTAS = 92;
/** Coluna do menu do título (px da tela lógica). */
const X_MENU = 76;
const ALTURA_LINHA = 28;
/** Quanto o item com foco anda para a direita. */
const DESLIZE_FOCO = 12;
const COR_ITEM = '#B4BFD8';

/**
 * A tela de título (o jogo abre aqui quando a URL não pede um mapa): um passeio de câmera por uma
 * rua gerada, à noite, com o logo, o menu numa coluna à esquerda (cada opção com a sua frase) e os
 * cartões do progresso à direita. Enter vai para a escolha da fantasia (GDD: "Escolher campeão"),
 * e de lá para a run; os atalhos de letra continuam valendo.
 */
export class CenaTitulo extends Phaser.Scene {
  private cenario!: CenarioDaRua;
  private rota: V2[] = [];
  private percorrido = 0;
  private tela: Tela = 'titulo';
  /** A linha dos controles no pé do título (troca com o teclado ou o controle). */
  private dicaControles?: Phaser.GameObjects.Text;
  private versaoDicas = -1;
  /** Já saiu para outra cena (uma tecla repetida não começa duas vezes). */
  private saiu = false;
  private camadas!: Record<Tela, Phaser.GameObjects.Container>;
  private cartas: Carta[] = [];
  private escolhida = 0;
  private destaque!: Phaser.GameObjects.Graphics;
  private detalhe!: Phaser.GameObjects.Container;
  /** Linha da Lua Cheia e da cor, embaixo do detalhe. */
  private opcoes!: Phaser.GameObjects.Container;
  private cabecalho!: Phaser.GameObjects.Text;
  /** Nova run ou semente da noite (a escolha da fantasia serve às duas). */
  private modo: ModoDaRun = 'run';
  private estado!: EstadoTeste;
  /** O menu do título: os itens, as linhas na tela e qual tem o foco. */
  private linhas: LinhaDoMenu[] = [];
  private foco = 0;
  private realce!: Phaser.GameObjects.Graphics;
  private larguraRealce = 0;
  private descricao!: Phaser.GameObjects.Text;
  /** As cartas da fantasia (cada uma num container, para subir e crescer com o foco). */
  private conteinersCartas: Phaser.GameObjects.Container[] = [];
  private botoesEscolha: BotaoDeMenu[] = [];

  constructor() {
    super('CenaTitulo');
  }

  preload(): void {
    carregarArtes(this);
    this.load.image('titulo:logo', visual.interface.titulo.logo.arquivo);
  }

  create(): void {
    // Modo dev: o painel (F1) também abre no título, para ir direto a qualquer fase.
    if (devDisponivel()) PainelDev.obter();
    mixer.trilha('titulo');
    somDeCliqueNaCena(this);
    registrarFontePixel(this);
    this.tela = 'titulo';
    this.saiu = false;
    this.percorrido = 0;
    this.linhas = [];
    this.conteinersCartas = [];
    this.botoesEscolha = [];
    const cfg = visual.interface.titulo;
    const gerada = gerarRua(cfg.semente, gerador, modelos, luz, { bairro: 0 });
    this.rota = gerada.rota;
    this.cenario = new CenarioDaRua(this, gerada.rua, { figurantes: false, noite: true });
    const camera = this.cameras.main;
    camera.removeBounds();
    camera.setZoom(cfg.zoom);
    camera.fadeIn(visual.interface.animacao.abrirMs, 0, 0, 0);
    this.seguirRota(0);

    const prog = progresso();
    this.cartas = Object.entries(campeoes).map(([id, c]) => ({
      id,
      nome: c.nome,
      papel: c.papel,
      livre: campeaoLiberado(prog, campeoes, id),
      desbloqueio: c.desbloqueio,
    }));
    // O último campeão jogado já vem escolhido.
    const ultimo = this.cartas.findIndex((c) => c.livre && c.id === prog.ultimoCampeao);
    this.escolhida =
      ultimo >= 0
        ? ultimo
        : Math.max(
            0,
            this.cartas.findIndex((c) => c.livre),
          );
    this.modo = 'run';

    this.estado = {
      cena: 'CenaTitulo',
      pronta: true,
      tela: this.tela,
      escolhida: this.cartas[this.escolhida]?.id ?? null,
      cartas: this.cartas.map((c) => ({ id: c.id, livre: c.livre })),
      modoEscolha: this.modo,
      lua: prog.luaEscolhida,
      docesGuardados: prog.docesGuardados,
      cor: prog.corEscolhida[this.cartas[this.escolhida]?.id ?? ''] ?? null,
      passivaAlternativa: false,
      dicas: dicasAtivas(prog),
      menu: {},
      // Para os testes: o que a música está tocando agora.
      musica: () => mixer.estadoDaMusica,
    };
    this.camadas = { titulo: this.montarTitulo(), campeao: this.montarEscolha() };
    this.camadas.campeao.setVisible(false);
    this.mostrar('titulo', false);
    // Voltando do Desempenho, o item do menu mostra a qualidade nova.
    this.events.on('resume', () => this.atualizarItem('desempenho'));

    const k = this.input.keyboard!;
    k.on('keydown-O', () => {
      if (this.tela === 'titulo') this.abrirDesempenho();
    });
    // Enter: o item com foco (de começo, a Noite curta); na escolha, começar.
    k.on('keydown-ENTER', () => (this.tela === 'titulo' ? this.apertarFoco() : this.comecar()));
    k.on('keydown-SPACE', () => {
      if (this.tela === 'titulo') this.apertarFoco();
    });
    k.on('keydown-R', () => {
      if (this.tela === 'titulo') this.escolherFantasia('run');
    });
    k.on('keydown-N', () => {
      if (this.tela === 'titulo') this.escolherFantasia('noite');
    });
    k.on('keydown-A', () => {
      if (this.tela === 'titulo') this.irPara('CenaAlbum');
    });
    k.on('keydown-S', () => {
      if (this.tela === 'titulo') this.escolherFantasia('desafio');
    });
    k.on('keydown-D', () => {
      if (this.tela === 'titulo') this.irPara('CenaDiario');
    });
    k.on('keydown-P', () => this.mudarPassiva());
    k.on('keydown-H', () => {
      if (this.tela === 'titulo') this.alternarDicas();
    });
    k.on('keydown-F', () => {
      if (this.tela === 'titulo') this.alternarFolga();
    });
    k.on('keydown-T', () => {
      if (this.tela === 'titulo') this.treino();
    });
    k.on('keydown-UP', () =>
      this.tela === 'titulo' ? this.focar(this.foco - 1) : this.mudarLua(1),
    );
    k.on('keydown-DOWN', () =>
      this.tela === 'titulo' ? this.focar(this.foco + 1) : this.mudarLua(-1),
    );
    k.on('keydown-C', () => this.mudarCor());
    k.on('keydown-ESC', () => {
      if (this.tela === 'campeao') this.mostrar('titulo');
    });
    k.on('keydown-LEFT', () => this.andarCarta(-1));
    k.on('keydown-RIGHT', () => this.andarCarta(1));

    publicarEstado(this.estado);
  }

  override update(tempo: number, delta: number): void {
    if (this.dicaControles && this.versaoDicas !== versaoDoDispositivo()) {
      this.versaoDicas = versaoDoDispositivo();
      const controle = usandoControle();
      for (const l of this.linhas) {
        l.texto.setText(l.item.nome());
        l.chip.setVisible(!controle);
      }
      for (const b of this.botoesEscolha) b.texto = this.rotuloDaEscolha(b);
      this.dicaControles.setText(
        controle
          ? 'Direcional: escolher  ·  A: confirmar  ·  B: voltar        ' +
              'Na rua: analógico anda, RT ataca, X Y B LT poderes, LB + poder sobe o posto'
          : '↑ ↓: escolher  ·  Enter: confirmar  ·  letras: atalhos        ' +
              'Na rua: WASD anda, botão esquerdo ataca, botão direito Q E R habilidades',
      );
    }
    this.seguirRota(delta / 1000);
    this.cenario.atualizar(tempo);
    if (this.tela === 'titulo') this.animarTitulo(tempo, delta);
    if (this.tela === 'campeao') this.desenharDestaque(tempo);
  }

  // ------------------------------------------------------------------ fundo

  /** A câmera passeia pela rota da rua, ida e volta. */
  private seguirRota(dtS: number): void {
    const r = this.rota;
    if (r.length < 2) return;
    let total = 0;
    for (let i = 0; i + 1 < r.length; i++)
      total += Math.hypot(r[i + 1]!.x - r[i]!.x, r[i + 1]!.y - r[i]!.y);
    this.percorrido += dtS * visual.interface.titulo.velocidadeTilesPorS;
    const ida = this.percorrido % (2 * total);
    let d = ida <= total ? ida : 2 * total - ida;
    let p = r[0]!;
    for (let i = 0; i + 1 < r.length; i++) {
      const a = r[i]!;
      const b = r[i + 1]!;
      const comp = Math.hypot(b.x - a.x, b.y - a.y);
      if (d <= comp) {
        const t = comp > 0 ? d / comp : 0;
        p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        break;
      }
      d -= comp;
      p = b;
    }
    this.cenario.enquadrar(this.cameras.main, paraTela({ ...p, z: 0 }, this.cenario.iso));
  }

  /** Véu escuro da esquerda (onde fica o menu) para a direita, onde a cidade aparece inteira. */
  private texturaDoVeu(largura: number, altura: number): string {
    const chave = `titulo:veu:${largura}x${altura}`;
    if (this.textures.exists(chave)) return chave;
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d')!;
    const n = Number.parseInt(visual.paleta.fundo.slice(1), 16);
    const rgba = (a: number) => `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    const g = ctx.createLinearGradient(0, 0, largura, 0);
    g.addColorStop(0, rgba(0.96));
    g.addColorStop(0.3, rgba(0.88));
    g.addColorStop(0.55, rgba(0.25));
    g.addColorStop(1, rgba(0.15));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, largura, altura);
    // Pé e topo um pouco mais escuros (a faixa dos controles e o céu).
    const v = ctx.createLinearGradient(0, 0, 0, altura);
    v.addColorStop(0, 'rgba(0,0,0,0.35)');
    v.addColorStop(0.25, 'rgba(0,0,0,0)');
    v.addColorStop(0.85, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, largura, altura);
    this.textures.addCanvas(chave, canvas);
    return chave;
  }

  // ------------------------------------------------------------------ telas

  private fixo(c: Phaser.GameObjects.Container): Phaser.GameObjects.Container {
    return c.setScrollFactor(0).setDepth(1e7);
  }

  private texto(
    x: number,
    y: number,
    t: string,
    estilo: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.Text {
    return this.add.text(x, y, t, estilo).setResolution(2);
  }

  private textoDasDicas(): string {
    return `Dicas: ${progresso().dicas ? 'ligadas' : 'desligadas'}`;
  }

  private textoDaFolga(): string {
    return `Minijogos com folga: ${progresso().minijogosComFolga ? 'sim' : 'não'}`;
  }

  private alternarFolga(): void {
    const prog = progresso();
    prog.minijogosComFolga = !prog.minijogosComFolga;
    salvar();
    this.atualizarItem('folga');
    this.mostrarDescricao();
  }

  /** As opções de desempenho por cima do título (a cena volta ao fechar). */
  private abrirDesempenho(): void {
    if (this.saiu) return;
    this.scene.launch('CenaDesempenho', { origem: 'CenaTitulo' });
    this.scene.pause();
  }

  /** Reescreve o nome de um item do menu (e encosta o chip do atalho nele). */
  private atualizarItem(id: string): void {
    const l = this.linhas.find((x) => x.item.id === id);
    if (!l) return;
    l.texto.setText(l.item.nome());
    l.chip.setX(l.texto.x + l.texto.width + 14);
  }

  private alternarDicas(): void {
    const prog = progresso();
    if (prog.vitorias > 0) return;
    prog.dicas = !prog.dicas;
    salvar();
    const l = this.linhas.find((x) => x.item.id === 'dicas');
    l?.texto.setText(l.item.nome());
    this.estado.dicas = dicasAtivas(prog);
    this.mostrarDescricao();
  }

  /** Os itens do menu: jogar (os modos da run) e o bairro (coleções, treino, ajustes e dicas). */
  private itensDoMenu(): ItemDoMenu[] {
    const prog = progresso();
    const melhor = prog.noites[hoje()]?.[0];
    const semana = semanaDeHoje();
    const desafio = desafioDaSemana(semana, entreRuns);
    const vencido = prog.desafiosVencidos.includes(`S${semana}`);
    const itens: ItemDoMenu[] = [
      {
        id: 'curta',
        secao: 'JOGAR',
        tecla: 'Enter',
        nome: () => 'Noite curta',
        descricao: () => '1 bairro, cerca de 15 minutos. O jeito certo de começar a noite.',
        acao: () => this.escolherFantasia('curta'),
      },
      {
        id: 'run',
        secao: 'JOGAR',
        tecla: 'R',
        nome: () => 'Run completa',
        descricao: () => '3 bairros e 3 chefes. Valem o Álbum, a maestria e a Lua Cheia.',
        acao: () => this.escolherFantasia('run'),
      },
      {
        id: 'noite',
        secao: 'JOGAR',
        tecla: 'N',
        nome: () => 'Semente da noite',
        descricao: () =>
          melhor
            ? `A mesma noite para todos, uma por dia. Seu melhor hoje: ${melhor.chefesVencidos} chefe(s), ${melhor.ruasVencidas} ruas.`
            : 'A mesma noite para todos, uma por dia. Tudo liberado, sem bônus.',
        acao: () => this.escolherFantasia('noite'),
      },
      {
        id: 'desafio',
        secao: 'JOGAR',
        tecla: 'S',
        nome: () => 'Desafio da semana',
        descricao: () =>
          `${desafio.nome}: ${desafio.descricao}. ` +
          (vencido
            ? 'Vencido nesta semana.'
            : `Primeira vitória: +${entreRuns.desafios.doces} Doces Guardados.`),
        acao: () => this.escolherFantasia('desafio'),
      },
      {
        id: 'album',
        secao: 'BAIRRO',
        tecla: 'A',
        nome: () => 'Álbum de Fantasias',
        descricao: () =>
          'Fantasias, tratos, itens, bônus e cores, comprados com os Doces Guardados.',
        acao: () => this.irPara('CenaAlbum'),
      },
      {
        id: 'diario',
        secao: 'BAIRRO',
        tecla: 'D',
        nome: () => 'Diário do Bairro',
        descricao: () => 'Tudo o que você já viu nas ruas e a maestria de cada fantasia.',
        acao: () => this.irPara('CenaDiario'),
      },
      {
        id: 'treino',
        secao: 'BAIRRO',
        tecla: 'T',
        nome: () => 'Rua de treino',
        descricao: () => 'Uma rua sem relógio e sem pressa para testar as habilidades.',
        acao: () => this.treino(),
      },
    ];
    itens.push({
      id: 'folga',
      secao: 'BAIRRO',
      tecla: 'F',
      nome: () => this.textoDaFolga(),
      descricao: () =>
        'Casa Desconfiada: janelas e tempos 50% maiores nos minijogos. Não vale na semente da noite nem no desafio.',
      acao: () => this.alternarFolga(),
    });
    itens.push({
      id: 'desempenho',
      secao: 'BAIRRO',
      tecla: 'O',
      nome: () =>
        `${visual.desempenho.textos.titulo}: ${visual.desempenho.qualidades[nivelDeQualidade()].nome}`,
      descricao: () => visual.desempenho.textos.explicacao,
      acao: () => this.abrirDesempenho(),
    });
    // As dicas da primeira run: dá para desligar, e depois da primeira vitória não voltam.
    if (prog.vitorias === 0)
      itens.push({
        id: 'dicas',
        secao: 'BAIRRO',
        tecla: 'H',
        nome: () => this.textoDasDicas(),
        descricao: () => 'As dicas da primeira run. Depois da primeira vitória elas somem.',
        acao: () => this.alternarDicas(),
      });
    return itens;
  }

  private montarTitulo(): Phaser.GameObjects.Container {
    const { largura, altura } = telaDe(this);
    const c = this.fixo(this.add.container(0, 0));
    c.add(this.add.image(0, 0, this.texturaDoVeu(largura, altura)).setOrigin(0));
    particulas(this, largura, altura, 1e7 - 1);

    const cfg = visual.interface.titulo;
    const logo = this.add.image(cfg.logo.xPx, cfg.logo.yPx, 'titulo:logo').setOrigin(0);
    logo.setScale(cfg.logo.larguraPx / logo.width);
    c.add(logo);
    chegar(this, [logo], { atraso: 150, dy: -12 });
    const frase = this.texto(X_MENU, cfg.fraseYPx, publicacao.frase, {
      ...estiloTexto(17, '#C9D3EA'),
      fontStyle: 'italic',
    });
    c.add(frase);
    chegar(this, [frase], { atraso: 450 });

    const credito = this.texto(largura - 24, 20, publicacao.credito, estiloTexto(14, '#C9D3EA'));
    credito.setOrigin(1, 0).setStroke('#000000', 3);
    c.add(credito);

    // O menu em duas seções.
    this.realce = this.add.graphics();
    c.add(this.realce);
    const itens = this.itensDoMenu();
    let y = cfg.menuYPx;
    let secao = '';
    this.linhas = [];
    const controle = usandoControle();
    itens.forEach((item, i) => {
      if (item.secao !== secao) {
        secao = item.secao;
        y += secao === 'JOGAR' ? 0 : 10;
        const t = new TextoPixel(this, X_MENU, y, 1.5, COR.luz).texto(secao);
        t.objeto.setAlpha(0.55).setLetterSpacing(3);
        const traco = this.add.graphics();
        traco.fillStyle(COR.luz, 0.18).fillRect(X_MENU + t.objeto.width + 12, y + 5, 220, 1);
        c.add([t.objeto, traco]);
        chegar(this, [t.objeto, traco], { atraso: 650 + i * 50 });
        y += 20;
      }
      const texto = this.texto(X_MENU + 24, y, item.nome(), estiloTexto(21, COR_ITEM, true));
      texto.setStroke('#000000', 2);
      const chip = this.chipDeTecla(item.tecla, X_MENU + 24 + texto.width + 14, y + 4);
      chip.setVisible(!controle);
      const zona = this.add
        .zone(X_MENU, y - 3, 380, ALTURA_LINHA)
        .setOrigin(0)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      zona.setData('focoProprio', true);
      zona.on('pointerover', () => this.focar(i));
      zona.on('pointerdown', () => {
        this.focar(i);
        this.apertarFoco();
      });
      c.add([texto, chip, zona]);
      chegar(this, [texto, chip], {
        dx: 0,
        dy: 10,
        atraso: 700 + i * visual.interface.animacao.escalonamentoMs,
      });
      this.linhas.push({ item, y, texto, chip, zona, deslize: null });
      (this.estado.menu as Record<string, unknown>)[item.id] = {
        x: X_MENU,
        y: y - 3,
        w: 380,
        h: ALTURA_LINHA,
      };
      y += ALTURA_LINHA;
    });
    // A frase da opção com foco, embaixo do menu.
    this.descricao = this.texto(X_MENU + 24, y + 14, '', {
      ...estiloTexto(14, '#C9D3EA'),
      wordWrap: { width: 470 },
    });
    c.add(this.descricao);
    this.foco = 0;
    this.focar(0, false, true);

    c.add(this.cartoesDoProgresso(largura, altura));

    // Faixa dos controles no pé.
    const faixa = this.add.graphics();
    faixa.fillStyle(0x000000, 0.45).fillRect(0, altura - 34, largura, 34);
    faixa.fillStyle(COR.luz, 0.08).fillRect(0, altura - 34, largura, 1);
    c.add(faixa);
    this.dicaControles = this.texto(
      largura / 2,
      altura - 26,
      '',
      estiloTexto(13, COR.textoApagado),
    );
    this.dicaControles.setOrigin(0.5, 0);
    c.add(this.dicaControles);
    this.versaoDicas = -1;
    return c;
  }

  /** Chip com a tecla de atalho (só no teclado). */
  private chipDeTecla(tecla: string, x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const t = this.texto(0, 0, tecla, estiloTexto(11, '#C9D3EA', true)).setStroke('#000000', 0);
    const w = Math.max(20, t.width + 12);
    const g = this.add.graphics();
    g.fillStyle(COR.placaClara, 0.9).fillRoundedRect(0, 0, w, 19, 4);
    g.lineStyle(1, COR.borda, 1).strokeRoundedRect(0, 0, w, 19, 4);
    t.setPosition(w / 2, 9.5).setOrigin(0.5);
    c.add([g, t]);
    return c;
  }

  /** Cartões à direita: Doces Guardados (contando), o desafio da semana e a noite de hoje. */
  private cartoesDoProgresso(largura: number, altura: number): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const prog = progresso();
    const semana = semanaDeHoje();
    const desafio = desafioDaSemana(semana, entreRuns);
    const vencido = prog.desafiosVencidos.includes(`S${semana}`);
    const melhor = prog.noites[hoje()]?.[0];
    const w = 320;
    const x = largura - w - 28;
    const cartoes: { cor: number; titulo: string; linha: string; sub: string; doces?: number }[] = [
      {
        cor: COR.doce,
        titulo: 'DOCES GUARDADOS',
        linha: '',
        sub:
          prog.luaLiberada > 0
            ? `Lua Cheia liberada até ${prog.luaLiberada}`
            : 'Gaste no Álbum de Fantasias',
        doces: prog.docesGuardados,
      },
      {
        cor: COR.magia,
        titulo: 'DESAFIO DA SEMANA',
        linha: desafio.nome,
        sub: vencido
          ? 'Vencido nesta semana'
          : `Primeira vitória: +${entreRuns.desafios.doces} Doces Guardados`,
      },
      {
        cor: COR.luz,
        titulo: 'NOITE DE HOJE',
        linha: melhor
          ? `${melhor.chefesVencidos} chefe(s) · ${melhor.ruasVencidas} ruas`
          : 'Ainda sem placar',
        sub: 'A mesma noite para todos, uma por dia',
      },
    ];
    const h = 74;
    const y0 = altura - 34 - 18 - cartoes.length * (h + 10);
    cartoes.forEach((k, i) => {
      const y = y0 + i * (h + 10);
      const g = this.add.graphics();
      placa(g, x, y, w, h, { alfa: 0.9 });
      g.fillStyle(k.cor, 1).fillRect(x, y + 6, 3, h - 12);
      const itens: Phaser.GameObjects.GameObject[] = [g];
      const titulo = new TextoPixel(this, x + 18, y + 12, 1.5, k.cor).texto(k.titulo).objeto;
      titulo.setLetterSpacing(2);
      itens.push(titulo);
      if (k.doces !== undefined) {
        const ic = this.add.graphics();
        iconeDoce(ic, x + 30, y + 44, 22);
        const n = new TextoPixel(this, x + w - 18, y + 30, 3, COR.doce);
        n.objeto.setOrigin(1, 0);
        contar(this, 0, k.doces, (v) => n.texto(String(v)), 1100);
        itens.push(ic, n.objeto);
        itens.push(this.texto(x + 50, y + 50, k.sub, estiloTexto(12, COR.textoApagado)));
      } else {
        itens.push(this.texto(x + 18, y + 28, k.linha, estiloTexto(15, COR.texto, true)));
        itens.push(this.texto(x + 18, y + 50, k.sub, estiloTexto(12, COR.textoApagado)));
      }
      c.add(itens);
      chegar(this, itens, { dx: -40, atraso: 900 + i * 110 });
    });
    return c;
  }

  /** Foco no item `i` do menu: o realce corre até ele e a frase troca. */
  private focar(i: number, comSom = true, sempre = false): void {
    const n = this.linhas.length;
    if (n === 0) return;
    const novo = ((i % n) + n) % n;
    if (novo === this.foco && !sempre) return;
    if (comSom) mixer.tocar('foco');
    this.foco = novo;
    this.linhas.forEach((l, k) => {
      const ativo = k === novo;
      l.texto.setColor(ativo ? COR.texto : COR_ITEM);
      l.deslize?.stop();
      const base = X_MENU + 24 + (ativo ? DESLIZE_FOCO : 0);
      l.deslize = this.tweens.add({
        targets: [l.texto, l.chip],
        x: (alvo: unknown) => (alvo === l.chip ? base + l.texto.width + 14 : base),
        duration: visual.interface.animacao.focoMs,
        ease: 'Cubic.easeOut',
      });
    });
    this.larguraRealce = 0;
    this.estado.focoMenu = this.linhas[novo]!.item.id;
    this.mostrarDescricao();
  }

  private mostrarDescricao(): void {
    const l = this.linhas[this.foco];
    if (!l || !this.descricao) return;
    this.descricao.setText(l.item.descricao());
    this.tweens.killTweensOf(this.descricao);
    this.descricao.setAlpha(0).setX(X_MENU + 14);
    this.tweens.add({
      targets: this.descricao,
      alpha: 1,
      x: X_MENU + 24,
      duration: 220,
      ease: 'Cubic.easeOut',
    });
  }

  private apertarFoco(): void {
    const l = this.linhas[this.foco];
    if (!l || this.saiu) return;
    // Clarão no item escolhido.
    this.tweens.add({ targets: l.texto, scaleX: 1.06, scaleY: 1.06, yoyo: true, duration: 90 });
    l.item.acao();
  }

  /** Quadro a quadro no título: o realce do foco e a porta acesa. */
  private animarTitulo(tempo: number, delta: number): void {
    const l = this.linhas[this.foco];
    const g = this.realce.clear();
    if (l) {
      const alvo = 430;
      this.larguraRealce += (alvo - this.larguraRealce) * Math.min(1, delta / 90);
      const y = l.y - 3;
      // Faixa que some para a direita (feita em degraus de alfa).
      const passos = 12;
      for (let k = 0; k < passos; k++) {
        const a = 0.22 * (1 - k / passos);
        // Degraus em px inteiros, encostados sem sobrepor (a sobra de 1 px virava listra).
        const xa = X_MENU + Math.round((this.larguraRealce / passos) * k);
        const xb = X_MENU + Math.round((this.larguraRealce / passos) * (k + 1));
        g.fillStyle(COR.jogador, a).fillRect(xa, y, xb - xa, ALTURA_LINHA - 2);
      }
      g.fillStyle(COR.jogador, 1).fillRect(X_MENU, y, 3, ALTURA_LINHA - 2);
      // A portinha entreaberta ao lado do item: batente claro, a folha escura com dois painéis,
      // a maçaneta e a fresta de luz piscando como vela (e a luz que vaza no chão).
      const px = X_MENU + 12;
      const py = y + 4;
      const chama = 0.75 + 0.25 * Math.sin(tempo / 90) * Math.sin(tempo / 37);
      g.fillStyle(COR.jogador, 0.18 * chama).fillCircle(px + 6, py + 11, 12);
      g.fillStyle(COR.luz, 0.8).fillRect(px, py, 12, 21);
      g.fillStyle(COR.jogador, chama).fillRect(px + 1, py + 1, 10, 20);
      g.fillStyle(COR.sombra, 1).fillRect(px + 1, py + 1, 7, 20);
      g.fillStyle(COR.borda, 1)
        .fillRect(px + 2, py + 3, 5, 6)
        .fillRect(px + 2, py + 11, 5, 7);
      g.fillStyle(COR.doce, 1).fillRect(px + 6, py + 10, 1, 2);
      g.fillStyle(COR.jogador, 0.45 * chama).fillTriangle(
        px + 8,
        py + 21,
        px + 11,
        py + 21,
        px + 16,
        py + 25,
      );
    }
  }

  private xDaCarta(i: number): number {
    const total = this.cartas.length * LARGURA_CARTA + (this.cartas.length - 1) * ESPACO_CARTA;
    return (telaDe(this).largura - total) / 2 + i * (LARGURA_CARTA + ESPACO_CARTA);
  }

  /** Rótulo dos botões da escolha (atalho no teclado; no controle, só o nome). */
  private rotuloDaEscolha(b: BotaoDeMenu): string {
    const comecar = b === this.botoesEscolha[0];
    if (usandoControle()) return comecar ? 'A · Começar' : 'B · Voltar';
    return comecar ? 'Enter · Começar' : 'Esc · Voltar';
  }

  private montarEscolha(): Phaser.GameObjects.Container {
    const { largura, altura } = telaDe(this);
    const c = this.fixo(this.add.container(0, 0));
    const veu = this.add.graphics().fillStyle(COR.sombra, 0.72);
    veu.fillRect(0, 0, largura, altura);
    c.add(veu);
    this.cabecalho = this.texto(
      largura / 2,
      34,
      'Escolha a fantasia',
      estiloTexto(28, COR.texto, true),
    ).setOrigin(0.5, 0);
    c.add(this.cabecalho);
    this.destaque = this.add.graphics();
    c.add(this.destaque);
    this.cartas.forEach((carta, i) => {
      const cx = this.xDaCarta(i) + LARGURA_CARTA / 2;
      const cy = Y_CARTAS + ALTURA_CARTA / 2;
      const k = this.add.container(cx, cy);
      const x = -LARGURA_CARTA / 2;
      const y = -ALTURA_CARTA / 2;
      const g = this.add.graphics();
      placa(g, x, y, LARGURA_CARTA, ALTURA_CARTA, { alfa: 0.96 });
      g.fillStyle(COR.placaClara, 1).fillCircle(0, y + 78, 56);
      k.add(g);
      // Livre: o retrato; bloqueada: a fantasia com o cadeado (arte do Codex ou desenho).
      const arte = imagemDaArte(
        this,
        carta.livre ? 'retrato' : 'hud',
        carta.livre ? carta.id : 'bloqueado',
        0,
        y + 74,
        108,
      );
      if (carta.livre && !arte) retrato(g, carta.id, 0, y + 78, 92);
      else if (!carta.livre && !arte) {
        silhueta(g, 0, y + 78, 92);
        iconeCadeado(g, 0, y + 86, 30, COR.luz);
      }
      if (arte) {
        k.add(arte);
        arte.setData('base', arte.y);
        k.setData('arte', arte);
      }
      k.add(
        this.texto(
          0,
          y + 148,
          carta.nome,
          estiloTexto(20, carta.livre ? COR.texto : COR.textoApagado, true),
        ).setOrigin(0.5, 0),
      );
      k.add(
        this.texto(0, y + 176, carta.papel, estiloTexto(13, COR.textoApagado)).setOrigin(0.5, 0),
      );
      const rodape = carta.livre
        ? this.resumoDoCampeao(carta.id)
        : `${textoDoDesbloqueio(carta.desbloqueio)} ou compre no Álbum`;
      k.add(
        this.texto(0, y + 206, rodape, {
          ...estiloTexto(13, carta.livre ? COR.texto : visual.acentos.doce),
          align: 'center',
          wordWrap: { width: LARGURA_CARTA - 30 },
        }).setOrigin(0.5, 0),
      );
      c.add(k);
      this.conteinersCartas.push(k);
      const z = this.add
        .zone(this.xDaCarta(i), Y_CARTAS, LARGURA_CARTA, ALTURA_CARTA)
        .setOrigin(0)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: carta.livre });
      z.on('pointerdown', () => {
        if (!carta.livre) return;
        if (this.escolhida === i) this.comecar();
        else this.escolher(i);
      });
      c.add(z);
    });
    this.detalhe = this.add.container(0, 0);
    c.add(this.detalhe);
    const w = 260;
    const comecar = new BotaoDeMenu(
      this,
      largura / 2 - w - 10,
      altura - 70,
      w,
      46,
      '',
      () => this.comecar(),
      {
        principal: true,
        tamanhoTexto: 17,
      },
    );
    const voltar = new BotaoDeMenu(
      this,
      largura / 2 + 10,
      altura - 70,
      w,
      46,
      '',
      () => this.mostrar('titulo'),
      {
        tamanhoTexto: 17,
      },
    );
    this.botoesEscolha = [comecar, voltar];
    for (const b of this.botoesEscolha) {
      b.texto = this.rotuloDaEscolha(b);
      c.add(b.objetos);
    }
    this.opcoes = this.add.container(0, 0);
    c.add(this.opcoes);
    this.montarDetalhe(false);
    return c;
  }

  /** Lua Cheia (run normal, depois da primeira vitória) e a cor da fantasia escolhida. */
  private montarOpcoes(): void {
    this.opcoes.removeAll(true);
    const prog = progresso();
    const { largura } = telaDe(this);
    const y = 580;
    const carta = this.cartas[this.escolhida];
    const g = this.add.graphics();
    this.opcoes.add(g);
    if (this.modo === 'run' && prog.luaLiberada > 0) {
      placa(g, 60, y, 700, 52, { alfa: 0.92 });
      const n = Math.min(prog.luaEscolhida, prog.luaLiberada);
      const ultimas = luaCheia.niveis
        .slice(0, n)
        .map((x) => x.descricao)
        .slice(-2);
      const desc = n === 0 ? 'Sem Lua Cheia' : (n > 2 ? '… ' : '') + ultimas.join(' · ');
      this.opcoes.add(
        this.texto(
          76,
          y + 8,
          `↑ ↓  Lua Cheia ${n} de ${prog.luaLiberada}`,
          estiloTexto(15, COR.texto, true),
        ),
      );
      this.opcoes.add(this.texto(76, y + 29, desc, estiloTexto(12, COR.textoApagado)));
    } else if (this.modo === 'desafio') {
      const d = desafioDaSemana(semanaDeHoje(), entreRuns);
      placa(g, 60, y, 700, 52, { alfa: 0.92 });
      this.opcoes.add(
        this.texto(76, y + 8, `${d.nome}: ${d.descricao}`, estiloTexto(15, COR.texto, true)),
      );
      this.opcoes.add(
        this.texto(
          76,
          y + 29,
          'A mesma run para todos nesta semana: tudo liberado, sem bônus nem maestria',
          estiloTexto(12, COR.textoApagado),
        ),
      );
    } else if (this.modo === 'noite') {
      placa(g, 60, y, 700, 52, { alfa: 0.92 });
      this.opcoes.add(
        this.texto(76, y + 8, `Semente da noite de ${hoje()}`, estiloTexto(15, COR.texto, true)),
      );
      this.opcoes.add(
        this.texto(
          76,
          y + 29,
          'A mesma rua para todos: tudo liberado, sem bônus e sem Lua Cheia',
          estiloTexto(12, COR.textoApagado),
        ),
      );
    }
    const cores = carta
      ? (album.cores[carta.id] ?? []).filter((x) => prog.cores.includes(x.id))
      : [];
    if (carta && cores.length > 0) {
      placa(g, largura - 460, y, 400, 52, { alfa: 0.92 });
      const atual = cores.find((x) => x.id === prog.corEscolhida[carta.id]);
      this.opcoes.add(
        this.texto(
          largura - 444,
          y + 8,
          `C · Cor: ${atual?.nome ?? 'Original'}`,
          estiloTexto(15, COR.texto, true),
        ),
      );
      this.opcoes.add(
        this.texto(
          largura - 444,
          y + 29,
          `${cores.length} cor(es) do Álbum para ${carta.nome}`,
          estiloTexto(12, COR.textoApagado),
        ),
      );
    }
  }

  /** Run normal ou Noite curta: valem o Álbum, a maestria e a passiva alternativa. */
  private get comAlbum(): boolean {
    return this.modo === 'run' || this.modo === 'curta';
  }

  private escolherFantasia(modo: ModoDaRun): void {
    if (this.tela !== 'titulo') return;
    this.modo = modo;
    this.estado.modoEscolha = modo;
    this.cabecalho.setText(
      modo === 'noite'
        ? 'Semente da noite: escolha a fantasia'
        : modo === 'desafio'
          ? `Desafio da semana: ${desafioDaSemana(semanaDeHoje(), entreRuns).nome}`
          : modo === 'curta'
            ? 'Noite curta (1 bairro, cerca de 15 min): escolha a fantasia'
            : 'Escolha a fantasia',
    );
    this.montarOpcoes();
    this.mostrar('campeao');
  }

  private mudarLua(passo: number): void {
    const prog = progresso();
    if (this.tela !== 'campeao' || this.modo !== 'run' || prog.luaLiberada === 0) return;
    prog.luaEscolhida = Math.max(0, Math.min(prog.luaLiberada, prog.luaEscolhida + passo));
    salvar();
    this.estado.lua = prog.luaEscolhida;
    this.montarOpcoes();
  }

  /** Maestria 4: troca entre a passiva normal e a alternativa da fantasia escolhida. */
  private mudarPassiva(): void {
    const carta = this.cartas[this.escolhida];
    if (this.tela !== 'campeao' || !carta || !this.comAlbum) return;
    if (!alternarPassiva(progresso(), carta.id, entreRuns)) return;
    salvar();
    this.estado.passivaAlternativa = progresso().passivaAlternativa[carta.id] ?? false;
    this.montarDetalhe();
  }

  /** Passa para a próxima cor comprada da fantasia (e volta à original no fim). */
  private mudarCor(): void {
    const carta = this.cartas[this.escolhida];
    if (this.tela !== 'campeao' || !carta) return;
    const prog = progresso();
    const cores = (album.cores[carta.id] ?? []).filter((x) => prog.cores.includes(x.id));
    if (cores.length === 0) return;
    const i = cores.findIndex((x) => x.id === prog.corEscolhida[carta.id]);
    const proxima = i + 1 < cores.length ? cores[i + 1]!.id : null;
    escolherCor(prog, album, carta.id, proxima);
    salvar();
    this.estado.cor = proxima;
    this.montarOpcoes();
  }

  private resumoDoCampeao(id: string): string {
    const c = campeoes[id]!;
    const atributo = c.atributoPrincipal === 'feitico' ? 'Feitiço' : 'Força';
    return `Coragem ${c.coragem} · ${atributo}`;
  }

  /** Passiva e Q W E R da fantasia escolhida, embaixo das cartas (entra deslizando). */
  private montarDetalhe(animar = true): void {
    this.detalhe.removeAll(true);
    const carta = this.cartas[this.escolhida];
    const c = carta ? campeoes[carta.id] : undefined;
    if (!c) return;
    const { largura } = telaDe(this);
    const y = 372;
    const w = 1160;
    const x0 = (largura - w) / 2;
    const g = this.add.graphics();
    painel(g, x0, y, w, 196);
    this.detalhe.add(g);
    this.detalhe.add(brilharPainel(this, x0 + 12, y, w - 24));
    this.detalhe.add(this.texto(x0 + 24, y + 16, c.descricao, estiloTexto(15, COR.texto, true)));
    const porId = new Map(habilidades.map((h) => [h.id, h]));
    const colunas = 5;
    const larguraColuna = (w - 48) / colunas;
    // Maestria: nível da fantasia e, do 4 em diante, a passiva alternativa (P troca).
    const prog = progresso();
    const m = maestria(prog, carta!.id, entreRuns);
    const alt = this.comAlbum && m.nivel >= 4 && (prog.passivaAlternativa[carta!.id] ?? false);
    const titulo = m.nivel >= 5 ? ` · ${entreRuns.maestria.titulos[carta!.id] ?? ''}` : '';
    this.detalhe.add(
      this.texto(
        x0 + w - 24,
        y + 16,
        m.nivel >= 4 && this.comAlbum
          ? `Maestria ${m.nivel}${titulo}  ·  P: trocar a passiva`
          : `Maestria ${m.nivel}${titulo}`,
        estiloTexto(14, m.nivel >= 5 ? visual.acentos.doce : COR.textoApagado, true),
      ).setOrigin(1, 0),
    );
    const itens = [
      {
        icone: 'passiva',
        tecla: '',
        nome: alt ? c.passivaAlternativa.nome : c.nomePassiva,
        descricao: alt ? c.passivaAlternativa.descricao : c.descricaoPassiva,
      },
      ...TECLAS.map((t) => {
        const h = porId.get(c.habilidades[t])!;
        return { icone: h.id, forma: h.forma.tipo, tecla: t, nome: h.nome, descricao: h.descricao };
      }),
    ];
    itens.forEach((it, i) => {
      const x = x0 + 24 + i * larguraColuna;
      const yi = y + 52;
      const gi = this.add.graphics();
      placa(gi, x, yi, 52, 52, { cor: COR.placaClara, alfa: 1, chanfro: 4 });
      const coluna: Phaser.GameObjects.GameObject[] = [gi];
      // Arte do Codex (passiva e poderes) quando existe; senão, o desenho por código.
      const arte =
        it.icone === 'passiva'
          ? imagemDaArte(this, 'passiva', carta!.id, x + 26, yi + 26, 48)
          : imagemDaArte(this, 'habilidade', it.icone, x + 26, yi + 26, 48);
      if (arte) coluna.push(arte);
      else if (it.icone === 'passiva') iconePassiva(gi, carta!.id, x + 26, yi + 26, 36, COR.luz);
      else
        iconeHabilidade(
          gi,
          it.icone,
          'forma' in it ? (it.forma ?? '') : '',
          x + 26,
          yi + 28,
          38,
          COR.luz,
        );
      if (it.tecla)
        coluna.push(new TextoPixel(this, x + 4, yi + 4, 1, COR.luz).texto(it.tecla).objeto);
      coluna.push(
        this.texto(x + 62, yi + 4, it.nome, {
          ...estiloTexto(14, COR.texto, true),
          wordWrap: { width: larguraColuna - 70 },
        }),
      );
      coluna.push(
        this.texto(x, yi + 62, it.descricao, {
          ...estiloTexto(12, COR.textoApagado),
          wordWrap: { width: larguraColuna - 16 },
        }),
      );
      this.detalhe.add(coluna);
      if (animar) chegar(this, coluna, { dy: 10, dx: 0, atraso: 40 + i * 45 });
    });
  }

  /** Carta escolhida: sobe, cresce um pouco e tem a moldura acesa; as outras ficam atrás. */
  private desenharDestaque(tempo: number): void {
    const g = this.destaque.clear();
    this.conteinersCartas.forEach((k, i) => {
      const ativa = i === this.escolhida;
      const livre = this.cartas[i]?.livre;
      const alvoY = Y_CARTAS + ALTURA_CARTA / 2 + (ativa ? -10 : 0);
      const alvoS = ativa ? 1.04 : 1;
      k.y += (alvoY - k.y) * 0.2;
      k.scale += (alvoS - k.scale) * 0.2;
      k.setAlpha(ativa ? 1 : livre ? 0.78 : 0.6);
      // O retrato da carta escolhida respira.
      const arte = k.getData('arte') as Phaser.GameObjects.Image | undefined;
      if (arte) arte.y = (arte.getData('base') as number) + (ativa ? Math.sin(tempo / 380) * 3 : 0);
    });
    const k = this.conteinersCartas[this.escolhida];
    if (!k) return;
    const w = LARGURA_CARTA * k.scale;
    const h = ALTURA_CARTA * k.scale;
    const x = k.x - w / 2;
    const y = k.y - h / 2;
    const pulso = 0.6 + 0.4 * Math.sin(tempo / 160);
    g.fillStyle(COR.jogador, 0.12 * pulso).fillRect(x - 10, y - 10, w + 20, h + 20);
    g.lineStyle(3, COR.jogador, 0.75 + 0.25 * pulso).strokeRect(x - 4, y - 4, w + 8, h + 8);
    // Cantoneiras de fora, maiores.
    const l = 22;
    g.lineStyle(3, COR.luz, 0.9);
    for (const [cx, cy, sx, sy] of [
      [x - 10, y - 10, 1, 1],
      [x + w + 10, y - 10, -1, 1],
      [x - 10, y + h + 10, 1, -1],
      [x + w + 10, y + h + 10, -1, -1],
    ] as const) {
      g.lineBetween(cx, cy, cx + sx * l, cy);
      g.lineBetween(cx, cy, cx, cy + sy * l);
    }
  }

  private andarCarta(passo: number): void {
    if (this.tela !== 'campeao') return;
    for (let k = 1; k <= this.cartas.length; k++) {
      const i = (this.escolhida + passo * k + this.cartas.length * k) % this.cartas.length;
      if (this.cartas[i]?.livre) {
        this.escolher(i);
        return;
      }
    }
  }

  private escolher(i: number): void {
    if (i !== this.escolhida) mixer.tocar('foco');
    this.escolhida = i;
    const id = this.cartas[i]?.id ?? null;
    this.estado.escolhida = id;
    this.estado.cor = id ? (progresso().corEscolhida[id] ?? null) : null;
    this.montarDetalhe();
    this.montarOpcoes();
  }

  /** Troca de tela com movimento: o menu sai para a esquerda e a escolha entra (e o contrário). */
  private mostrar(tela: Tela, animar = true): void {
    const antes = this.tela;
    this.tela = tela;
    if (this.estado) this.estado.tela = tela;
    const entra = this.camadas[tela];
    const sai = this.camadas[tela === 'titulo' ? 'campeao' : 'titulo'];
    const ms = visual.interface.animacao.entradaMs;
    this.tweens.killTweensOf([entra, sai]);
    if (!animar || antes === tela) {
      sai.setVisible(false);
      entra.setVisible(true).setAlpha(1).setX(0);
      return;
    }
    this.tweens.add({
      targets: sai,
      alpha: 0,
      x: tela === 'campeao' ? -40 : 40,
      duration: ms * 0.6,
      ease: 'Cubic.easeIn',
      onComplete: () => sai.setVisible(false),
    });
    entra
      .setVisible(true)
      .setAlpha(0)
      .setX(tela === 'campeao' ? 40 : -40);
    this.tweens.add({ targets: entra, alpha: 1, x: 0, duration: ms, ease: 'Cubic.easeOut' });
    if (tela === 'campeao') {
      // As cartas sobem em fila.
      this.conteinersCartas.forEach((k, i) => {
        k.y = Y_CARTAS + ALTURA_CARTA / 2 + 40;
        k.setAlpha(0);
        this.tweens.add({
          targets: k,
          y: Y_CARTAS + ALTURA_CARTA / 2,
          alpha: 1,
          delay: 60 + i * 70,
          duration: ms,
          ease: 'Back.easeOut',
        });
      });
      this.montarDetalhe();
    }
  }

  // ------------------------------------------------------------------ começar

  private irPara(cena: 'CenaRua' | 'CenaAlbum' | 'CenaDiario'): void {
    if (this.saiu) return;
    this.saiu = true;
    if (cena === 'CenaRua') {
      this.registry.set('vemDoTitulo', true);
      fecharEmCirculo(this, () => this.scene.start(cena));
      return;
    }
    this.cameras.main.fadeOut(visual.interface.animacao.saidaMs, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(cena));
  }

  private comecar(): void {
    const carta = this.cartas[this.escolhida];
    if (!carta?.livre || this.saiu) return;
    marcarInicioDaRun();
    // A semente da run vem do relógio (a simulação só usa o gerador com semente a partir dela).
    const semente = Date.now() % visual.interface.titulo.modSemente;
    this.registry.set('sessao', sessaoDoTitulo(carta.id, this.modo, semente));
    this.irPara('CenaRua');
  }

  private treino(): void {
    this.registry.set('sessao', new SessaoDeTreino(new URLSearchParams()));
    this.irPara('CenaRua');
  }
}

/** Como liberar cada fantasia (GDD, tabela dos campeões). */
const DESBLOQUEIO: Record<string, string> = {
  inicial: 'Liberada',
  bairro1: 'Vença o bairro 1',
  bairro2: 'Vença o bairro 2',
  vitoria: 'Vença uma run',
};

function textoDoDesbloqueio(d: string): string {
  return DESBLOQUEIO[d] ?? d;
}
