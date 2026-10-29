import { rotuloDaTecla } from '../entrada';
import { usandoControle, versaoDoDispositivo } from '../dispositivo';
import * as Phaser from 'phaser';
import { visual } from '../../sim/content';
import { pular } from './animacao';
import { arte, carregarArtes, imagemDaArte, type TipoArte } from './artes';
import { barra, COR, estiloTexto, FONTE_TEXTO, placa, TextoFixo } from './estilo';
import { registrarFontePixel, TextoPixel } from './fontePixel';
import {
  iconeDoce,
  iconeEvolucao,
  iconeHabilidade,
  iconeItem,
  iconeLanterna,
  iconeOnda,
  iconePassiva,
  iconePedido,
  iconePortao,
  iconePoste,
  iconeRelogio,
  iconeSituacao,
  retrato,
} from './icones';
import { Minimapa, type DadosMapa } from './Minimapa';
import type { PainelHUD, SlotPainel } from './painel';
import { somDeCliqueNaCena } from '../audio/mixer';
import { telaDe } from '../tela';

export interface DadosInterface {
  preparando?: () => boolean;
  /** Fotografia do estado do jogador e da rua neste quadro. */
  painel: () => PainelHUD | null;
  /** Gastar um ponto de nível numa habilidade (o + sobre o botão). */
  subirPosto: (tecla: string) => void;
  /** O mapa da rua (minimapa e o mapa grande do Tab). */
  mapa?: () => DadosMapa | null;
  /** Abre o menu de pausa (o botão de menu no canto). */
  pausar?: () => void;
}

interface Slot {
  tecla: string;
  x: number;
  y: number;
  letra: TextoPixel;
  custo: TextoPixel;
  segundos: TextoPixel;
  mais: Phaser.GameObjects.Zone;
}

const TECLAS = ['Q', 'W', 'E', 'R'] as const;
/** Quanto o rastro de Coragem perdida demora para alcançar o valor de verdade (1/s). */
const RIGIDEZ_RASTRO = 2.5;
const DURACAO_ENTRADA_TITULO_MS = 260;

/**
 * Interface de combate (docs/DESIGN.md, seção 7), numa cena própria para não sofrer o zoom da
 * câmera. Placas chanfradas no estilo do cenário; números em fonte pixel; ícones desenhados por
 * código. Nada aqui decide regra: tudo vem de `painel()` e `mapa()`. Texto só é refeito quando
 * muda, e as partes fixas são desenhadas uma vez.
 */
/** O cartão do controle aparece uma vez por sessão, quando ele é usado pela primeira vez. */
let cartaoDoControleVisto = false;
const MOSTRAR_CARTAO_MS = 9000;
const SUMIR_CARTAO_MS = 800;
const PROFUNDIDADE_CARTAO = 900;
const corDoce = () => `#${COR.doce.toString(16).padStart(6, '0')}`;

export class CenaInterface extends Phaser.Scene {
  private coberturaPreparacao?: Phaser.GameObjects.Container;
  private ultimoDesenho = -Infinity;
  private deltaAcumulado = 0;
  private relogioGrafico!: Phaser.GameObjects.Graphics;
  private horaDoIcone = '';
  private dados!: DadosInterface;
  private placas!: Phaser.GameObjects.Graphics;
  private g!: Phaser.GameObjects.Graphics;
  private gIcones!: Phaser.GameObjects.Graphics;
  private assinaturaIcones = '';
  /** Imagens das artes do Codex, refeitas junto com os ícones. */
  private artes: Phaser.GameObjects.Image[] = [];
  /** Ícones das linhas do rastreador (artes do Codex), um por linha, reaproveitados a cada quadro. */
  private iconesRastreador: Phaser.GameObjects.Image[] = [];
  private slots: Slot[] = [];
  /** Última troca de dispositivo vista (teclado ou controle) e o cartão do controle na tela. */
  private versaoDispositivo = -1;
  private cartaoControle?: Phaser.GameObjects.Container;
  private cartaoAte = 0;
  private sobre: number | null = null;
  private t!: Record<string, TextoFixo>;
  private p!: Record<string, TextoPixel>;
  private minimapa?: Minimapa;
  private mapaGrande?: Minimapa;
  private legendaMapa?: TextoFixo;
  private legendaSimbolos?: Phaser.GameObjects.Container;
  private teclaMapa?: Phaser.Input.Keyboard.Key;
  private vinheta!: Phaser.GameObjects.Image;
  private rastroCoragem = 1;
  private coragemAntes = -1;
  private flashDano = 0;
  private tituloDesde = 0;
  private tituloAtual = '';
  private rastroChefe = 1;
  /** Placa do rastreador (cresce com as linhas; só é refeita quando o tamanho muda). */
  private placaRastreador!: Phaser.GameObjects.Graphics;
  private tamanhoRastreador = '';
  /** O painel de objetivos aberto (clique nele); fechado, mostra só o objetivo da vez. */
  private rastreadorAberto = false;
  /** O mapa grande aberto pelo clique no minimapa (Tab também abre, enquanto segura). */
  private mapaAberto = false;
  /** Zona do mapa grande: só aceita clique com ele aberto (senão rouba o ataque do mouse). */
  private zonaMapaGrande?: Phaser.GameObjects.Zone;
  /** Fila de avisos no canto (os mais novos embaixo). */
  private textosAvisos: TextoFixo[] = [];
  private visivelAntes: boolean | null = null;
  // HUD dinâmico: rastros, clarões e contagens que dão resposta a cada coisa que acontece.
  private rastroEnergia = 1;
  private flashCura = 0;
  private xpVisivel = 0;
  private nivelAntes = -1;
  private nivelDesde = -1e9;
  private textoNivel!: TextoFixo;
  private docesVisiveis: number | null = null;
  private docesAntes: number | null = null;
  /** "+N" que sobem da bolsa quando chegam doces. */
  private flutuantes: { texto: TextoFixo; desde: number; ativo: boolean }[] = [];
  /** Por botão: estava em recarga, quando ficou pronto e quando foi usado. */
  private estadoSlots: { emRecarga: boolean; recarga: number; pronto: number; usado: number }[] =
    [];
  private postesAntes = -1;
  private rastreadorDesde = -1e9;
  private chefeNome = '';
  private chefeDesde = -1e9;
  private faseAntes = '';
  private faseDesde = -1e9;
  private avisosDesde = new Map<string, number>();
  private ruaAtual = '';
  private ruaDesde = 0;

  constructor() {
    super('CenaInterface');
  }

  init(dados: DadosInterface): void {
    this.dados = dados;
    this.slots = [];
    this.sobre = null;
    this.assinaturaIcones = '';
    this.artes = [];
    this.iconesRastreador = [];
    this.rastroCoragem = 1;
    this.coragemAntes = -1;
    this.flashDano = 0;
    this.tituloAtual = '';
    this.rastroChefe = 1;
    this.tamanhoRastreador = '';
    this.visivelAntes = null;
    this.rastroEnergia = 1;
    this.flashCura = 0;
    this.xpVisivel = 0;
    this.nivelAntes = -1;
    this.nivelDesde = -1e9;
    this.docesVisiveis = null;
    this.docesAntes = null;
    this.flutuantes = [];
    this.estadoSlots = [];
    this.postesAntes = -1;
    this.rastreadorDesde = -1e9;
    this.chefeNome = '';
    this.faseAntes = '';
    this.avisosDesde = new Map();
    this.ruaAtual = '';
  }

  // ------------------------------------------------------------------ geometria fixa

  private get L() {
    const ui = visual.interface;
    const { largura, altura } = telaDe(this);
    const m = ui.margemPx;
    const t = ui.botao.tamanhoPx;
    const esp = ui.botao.espacoPx;
    const larguraHab = 14 + 44 + 14 + 4 * t + 3 * esp + 14;
    const alturaBaixo = 106;
    const yBaixo = altura - m - alturaBaixo;
    return {
      largura,
      altura,
      m,
      t,
      esp,
      yBaixo,
      alturaBaixo,
      retrato: { x: m, y: yBaixo, w: 340, h: alturaBaixo },
      hab: { x: (largura - larguraHab) / 2, y: yBaixo, w: larguraHab, h: alturaBaixo },
      itens: { x: largura - m - 218, y: yBaixo, w: 218, h: alturaBaixo },
      mapa: { x: largura - m - 260, y: m, w: 260, h: 150 },
      bolsa: { x: largura - m - 260, y: m + 158, w: 260, h: 34 },
      rastreador: { x: m, y: m, w: 312 },
    };
  }

  preload(): void {
    carregarArtes(this);
  }

  /**
   * Põe a arte do Codex acima das placas dos ícones e abaixo das recargas e dos textos. Devolve
   * false se não há arte: aí quem chamou desenha por código.
   */
  private comArte(tipo: TipoArte, id: string, cx: number, cy: number, lado: number): boolean {
    const img = imagemDaArte(this, tipo, id, cx, cy, lado);
    if (!img) return false;
    // Logo abaixo da camada dinâmica (recargas, letras e números vêm depois dela).
    this.children.moveBelow(img, this.g);
    this.artes.push(img);
    return true;
  }

  create(): void {
    this.ultimoDesenho = -Infinity;
    this.deltaAcumulado = 0;
    this.coberturaPreparacao = undefined;
    somDeCliqueNaCena(this);
    registrarFontePixel(this);
    const L = this.L;
    this.placaRastreador = this.add.graphics();
    this.placas = this.add.graphics();
    this.gIcones = this.add.graphics();
    this.relogioGrafico = this.add.graphics();
    this.horaDoIcone = '';
    this.g = this.add.graphics();
    placa(this.placas, L.retrato.x, L.retrato.y, L.retrato.w, L.retrato.h);
    placa(this.placas, L.hab.x, L.hab.y, L.hab.w, L.hab.h);
    placa(this.placas, L.itens.x, L.itens.y, L.itens.w, L.itens.h);
    placa(this.placas, L.bolsa.x, L.bolsa.y, L.bolsa.w, L.bolsa.h);

    // Botões das habilidades (teclas de controles.json).
    const x0 = L.hab.x + 14 + 44 + 14;
    const yS = L.hab.y + 22;
    TECLAS.forEach((tecla, i) => {
      const x = x0 + i * (L.t + L.esp);
      const zona = this.add.zone(x, yS, L.t, L.t).setOrigin(0).setInteractive();
      zona.on('pointerover', () => (this.sobre = i));
      zona.on('pointerout', () => (this.sobre = null));
      const mais = this.add
        .zone(x + L.t / 2 - 13, yS - 18, 26, 16)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      mais.on('pointerdown', () => this.dados.subirPosto(tecla));
      this.slots.push({
        tecla,
        x,
        y: yS,
        letra: new TextoPixel(this, x + 4, yS + 4, 1, COR.luz).texto(rotuloDaTecla(tecla)),
        custo: new TextoPixel(this, x + L.t - 3, yS + L.t - 11, 1, COR.magia),
        segundos: new TextoPixel(this, x + L.t / 2, yS + L.t / 2, 3, COR.luz),
        mais,
      });
    });
    for (const s of this.slots) {
      s.custo.objeto.setOrigin(1, 0);
      s.segundos.objeto.setOrigin(0.5);
    }

    const { retrato: R, itens: I, bolsa: B, rastreador: T } = L;
    this.p = {
      nome: new TextoPixel(this, R.x + 108, R.y + 12, 2, COR.luz),
      nivel: new TextoPixel(this, R.x + 56, R.y + R.h - 16, 1, COR.doce),
      coragem: new TextoPixel(this, R.x + 108 + 220 - 5, R.y + 39, 1, COR.luz),
      energia: new TextoPixel(this, R.x + 108 + 220 - 5, R.y + 61, 1, COR.luz),
      pontos: new TextoPixel(this, R.x + 108, R.y - 16, 1, COR.doce),
      susto: new TextoPixel(this, L.hab.x + L.hab.w - 14, L.hab.y - 13, 1, COR.luz),
      doces: new TextoPixel(this, B.x + 34, B.y + 9, 2, COR.doce),
      relogio: new TextoPixel(this, B.x + B.w - 12, B.y + 9, 2, COR.luz),
      cons1: new TextoPixel(this, I.x + 12 + 89, I.y + 70, 2, COR.doce),
      cons2: new TextoPixel(this, I.x + 12 + 97 + 89, I.y + 70, 2, COR.doce),
      postes: new TextoPixel(this, T.x + T.w - 12, 0, 2, COR.magia),
      tecla1: new TextoPixel(this, I.x + 12 + 5, I.y + 56 + 5, 1, COR.luz).texto('1'),
      tecla2: new TextoPixel(this, I.x + 12 + 97 + 5, I.y + 56 + 5, 1, COR.luz).texto('2'),
      reguaEntrada: new TextoPixel(this, 0, 0, 1, COR.luz),
      reguaSaida: new TextoPixel(this, 0, 0, 1, COR.luz),
    };
    this.p['nivel']!.objeto.setOrigin(0.5, 0);
    for (const k of ['coragem', 'energia', 'susto', 'relogio', 'postes', 'cons1', 'cons2'])
      this.p[k]!.objeto.setOrigin(1, 0);
    this.p['reguaSaida']!.objeto.setOrigin(1, 0);
    this.p['reguaEntrada']!.texto('ENTRADA');
    this.p['reguaSaida']!.texto('SAIDA');

    const { largura } = L;
    this.t = {
      rua: new TextoFixo(this, T.x + 14, T.y + 10, estiloTexto(14, COR.texto, true)),
      linha0: new TextoFixo(this, T.x + 40, 0, estiloTexto(12)),
      linha1: new TextoFixo(this, T.x + 40, 0, estiloTexto(12)),
      linha2: new TextoFixo(this, T.x + 40, 0, estiloTexto(12)),
      linha3: new TextoFixo(this, T.x + 40, 0, estiloTexto(12)),
      linha4: new TextoFixo(this, T.x + 40, 0, estiloTexto(12)),
      lugar: new TextoFixo(this, T.x + 14, T.y + 28, estiloTexto(11, COR.textoApagado)),
      tratos: new TextoFixo(this, T.x + 14, 0, estiloTexto(11, COR.textoApagado)),
      condicao: new TextoFixo(this, B.x + B.w, B.y + B.h + 6, estiloTexto(11)),
      estados: new TextoFixo(this, R.x + 4, R.y - 20, estiloTexto(11)),
      passiva: new TextoFixo(
        this,
        L.hab.x + 14 + 22,
        L.hab.y + L.hab.h - 18,
        estiloTexto(10, COR.textoApagado),
      ),
      chefe: new TextoFixo(this, largura / 2, L.m + 8, estiloTexto(15, COR.texto, true)),
      fase: new TextoFixo(this, largura / 2 + 250, L.m + 10, estiloTexto(11, COR.textoApagado)),
      titulo: new TextoFixo(this, largura / 2, 168, estiloTexto(28, COR.texto, true)),
      dica: new TextoFixo(this, largura / 2, 248, estiloTexto(14)),
      dicaBotao: new TextoFixo(this, largura / 2, L.hab.y - 60, estiloTexto(12)),
      itemSobre: new TextoFixo(this, I.x + I.w, I.y - 22, estiloTexto(11)),
    };
    this.t['condicao']!.objeto.setOrigin(1, 0);
    this.t['passiva']!.objeto.setOrigin(0.5, 0);
    for (const k of ['chefe', 'titulo', 'dica']) this.t[k]!.objeto.setOrigin(0.5, 0.5);
    this.t['fase']!.objeto.setOrigin(1, 0);
    this.t['itemSobre']!.objeto.setOrigin(1, 0);
    this.t['dica']!.objeto.setWordWrapWidth(720).setAlign('center');
    this.t['dicaBotao']!.objeto.setOrigin(0.5, 1).setWordWrapWidth(420).setAlign('center');
    for (const k of ['linha0', 'linha1', 'linha2', 'linha3', 'linha4'])
      this.t[k]!.objeto.setWordWrapWidth(T.w - 70);
    this.t['tratos']!.objeto.setWordWrapWidth(T.w - 28);
    this.t['titulo']!.objeto.setLetterSpacing(2).setFontFamily(FONTE_TEXTO);

    if (this.dados.mapa) {
      const M = L.mapa;
      this.minimapa = new Minimapa(this, M.x, M.y, M.w, M.h, 8);
      const wG = 780;
      const hG = 440;
      const xG = (largura - wG) / 2;
      const yG = (L.altura - hG) / 2 - 20;
      this.mapaGrande = new Minimapa(this, xG, yG, wG, hG, 46, 1, 'completo');
      this.mapaGrande.setDepth(50);
      this.mapaGrande.setVisible(false);
      this.legendaMapa = new TextoFixo(
        this,
        largura / 2,
        yG + 10,
        estiloTexto(13, COR.texto, true),
      ).texto('MAPA DA ROTA');
      this.legendaMapa.objeto.setOrigin(0.5, 0).setDepth(51).setVisible(false);
      this.legendaSimbolos = this.criarLegenda(xG, yG + hG - 40, wG);
      this.teclaMapa = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
      // Clique no minimapa abre o mapa grande; outro clique (em qualquer lugar dele) fecha.
      this.add
        .zone(M.x, M.y, M.w, M.h)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.mapaAberto = !this.mapaAberto;
        });
      this.zonaMapaGrande = this.add
        .zone(xG, yG, wG, hG)
        .setOrigin(0)
        .setDepth(52)
        .setInteractive()
        .on('pointerdown', () => {
          this.mapaAberto = false;
        });
      this.zonaMapaGrande.input!.enabled = false;
    }
    // Avisos de eventos: uma fila pequena embaixo do minimapa, alinhada à direita.
    this.textosAvisos = Array.from({ length: AVISOS_NA_FILA }, () => {
      const t = new TextoFixo(this, B.x + B.w, 0, estiloTexto(12));
      t.objeto
        .setOrigin(1, 0)
        .setWordWrapWidth(B.w - 16)
        .setAlign('right');
      return t;
    });
    // O que a tecla de interação faz aqui: uma linha discreta logo acima da barra de habilidades.
    this.t['interacao'] = new TextoFixo(
      this,
      largura / 2,
      L.hab.y - 30,
      estiloTexto(13, COR.texto),
    );
    this.t['interacao'].objeto.setOrigin(0.5, 0.5);
    // Clique no painel de objetivos abre e fecha os detalhes (Tab também mostra, junto do mapa).
    this.add
      .zone(T.x, T.y, T.w, 64)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.rastreadorAberto = !this.rastreadorAberto;
      });
    this.criarBotaoTelaCheia(L.mapa.x - TAMANHO_BOTAO_TELA_CHEIA - 8, L.m);
    if (this.dados.pausar)
      this.criarBotaoMenu(
        L.mapa.x - TAMANHO_BOTAO_TELA_CHEIA - 8,
        L.m + TAMANHO_BOTAO_TELA_CHEIA + 6,
      );
    this.vinheta = this.add
      .image(0, 0, this.texturaVinheta())
      .setOrigin(0)
      .setDepth(-10)
      .setAlpha(0);
    // Subiu de nível: o aviso que salta do medalhão.
    this.textoNivel = new TextoFixo(
      this,
      L.retrato.x + 56,
      L.retrato.y - 30,
      estiloTexto(18, corDoce(), true),
    );
    this.textoNivel.objeto.setOrigin(0.5).setDepth(20);
    this.flutuantes = Array.from({ length: FLUTUANTES }, () => {
      const t = new TextoFixo(this, 0, 0, estiloTexto(15, corDoce(), true));
      t.objeto.setOrigin(0, 0.5).setDepth(20);
      return { texto: t, desde: -1e9, ativo: false };
    });
    // O HUD entra clareando, junto com a rua.
    const cam = this.cameras.main;
    cam.setAlpha(0);
    this.tweens.add({ targets: cam, alpha: 1, duration: ENTRADA_HUD_MS, ease: 'Sine.easeOut' });
  }

  /** Botão pequeno de tela cheia (quatro cantos), no alto ao lado do minimapa. */
  private criarBotaoTelaCheia(x: number, y: number): void {
    const s = TAMANHO_BOTAO_TELA_CHEIA;
    const g = this.add.graphics();
    const desenhar = (sobre: boolean) => {
      g.clear();
      placa(g, x, y, s, s, { alfa: sobre ? 0.98 : 0.7 });
      const k = 7;
      const a = 8;
      g.lineStyle(2, sobre ? COR.jogador : COR.luz, 1);
      for (const [cx, cy, dx, dy] of [
        [x + a, y + a, 1, 1],
        [x + s - a, y + a, -1, 1],
        [x + a, y + s - a, 1, -1],
        [x + s - a, y + s - a, -1, -1],
      ] as const)
        g.beginPath()
          .moveTo(cx, cy + dy * k)
          .lineTo(cx, cy)
          .lineTo(cx + dx * k, cy)
          .strokePath();
    };
    desenhar(false);
    this.add
      .zone(x, y, s, s)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => desenhar(true))
      .on('pointerout', () => desenhar(false))
      .on('pointerdown', () => this.scale.toggleFullscreen());
  }

  /** Botão de menu (três traços), embaixo do de tela cheia: abre a pausa. */
  private criarBotaoMenu(x: number, y: number): void {
    const s = TAMANHO_BOTAO_TELA_CHEIA;
    const g = this.add.graphics();
    const desenhar = (sobre: boolean) => {
      g.clear();
      placa(g, x, y, s, s, { alfa: sobre ? 0.98 : 0.7 });
      g.fillStyle(sobre ? COR.jogador : COR.luz, 1);
      for (const k of [-1, 0, 1]) g.fillRect(x + 9, y + s / 2 + k * 6 - 1, s - 18, 2);
    };
    desenhar(false);
    this.add
      .zone(x, y, s, s)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => desenhar(true))
      .on('pointerout', () => desenhar(false))
      .on('pointerdown', () => this.dados.pausar?.());
  }

  /** Legenda do mapa grande: símbolo e nome de cada coisa, numa fileira embaixo. */
  private criarLegenda(x: number, y: number, w: number): Phaser.GameObjects.Container {
    const itens: [string, (g: Phaser.GameObjects.Graphics, cx: number, cy: number) => void][] = [
      ['você', (g, cx, cy) => g.fillStyle(COR.jogador, 1).fillCircle(cx, cy, 5)],
      ['Poste Corrompido', (g, cx, cy) => iconePoste(g, cx, cy, 14, false)],
      ['inimigo', (g, cx, cy) => g.fillStyle(COR.perigo, 1).fillCircle(cx, cy, 3)],
      [
        'elite',
        (g, cx, cy) => {
          g.fillStyle(COR.perigo, 1).fillCircle(cx, cy, 5);
          g.lineStyle(1, COR.luz, 1).strokeCircle(cx, cy, 5);
        },
      ],
      ['baú', (g, cx, cy) => g.fillStyle(COR.doce, 1).fillRect(cx - 4, cy - 4, 8, 8)],
      [
        'Abóbora Dourada',
        (g, cx, cy) => {
          g.fillStyle(COR.doce, 1).fillCircle(cx, cy, 3);
          g.lineStyle(1, COR.doce, 1).strokeCircle(cx, cy, 5);
        },
      ],
      ['campainha', (g, cx, cy) => g.fillStyle(COR.luz, 0.9).fillRect(cx - 2, cy - 2, 4, 4)],
      ['poste apagado', (g, cx, cy) => g.lineStyle(1.5, COR.luz, 0.8).strokeCircle(cx, cy, 3)],
      [
        'mirante',
        (g, cx, cy) =>
          g.lineStyle(1.5, COR.luz, 1).strokeTriangle(cx, cy - 5, cx + 4, cy + 3, cx - 4, cy + 3),
      ],
      ['portão', (g, cx, cy) => g.fillStyle(COR.luz, 1).fillRect(cx - 7, cy - 1, 14, 3)],
    ];
    const container = this.add.container(0, 0).setDepth(51).setVisible(false);
    // Duas fileiras, para os nomes não se encostarem.
    const porLinha = Math.ceil(itens.length / 2);
    const passo = w / porLinha;
    itens.forEach(([nome, desenho], i) => {
      const cx = x + passo * (i % porLinha) + 22;
      const cy = y + Math.floor(i / porLinha) * 18;
      const g = this.add.graphics();
      desenho(g, cx, cy + 8);
      const t = this.add.text(cx + 10, cy, nome, estiloTexto(11)).setResolution(2);
      container.add([g, t]);
    });
    return container;
  }

  /** Vinheta das bordas da tela (dano, pouca Coragem, Frenesi), tingida na hora. */
  private texturaVinheta(): string {
    const { largura, altura } = telaDe(this);
    const chave = `vinheta:${largura}x${altura}`;
    if (this.textures.exists(chave)) return chave;
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(
      largura / 2,
      altura / 2,
      altura * 0.42,
      largura / 2,
      altura / 2,
      largura * 0.62,
    );
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, largura, altura);
    this.textures.addCanvas(chave, canvas);
    return chave;
  }

  // ------------------------------------------------------------------ quadro a quadro

  /** Rótulos das teclas (teclado ou controle) e o cartão do controle, quando o dispositivo muda. */
  private atualizarDispositivo(tempo: number): void {
    if (this.versaoDispositivo !== versaoDoDispositivo()) {
      this.versaoDispositivo = versaoDoDispositivo();
      for (const s of this.slots) s.letra.texto(rotuloDaTecla(s.tecla));
      const controle = usandoControle();
      this.p['tecla1']?.texto(controle ? '<' : '1');
      this.p['tecla2']?.texto(controle ? '>' : '2');
      // O controle apareceu pela primeira vez: o mapa dos botões por alguns segundos.
      if (controle && !cartaoDoControleVisto) {
        cartaoDoControleVisto = true;
        this.mostrarCartaoDoControle(tempo);
      }
    }
    const c = this.cartaoControle;
    if (c) {
      const falta = this.cartaoAte - tempo;
      c.setAlpha(Math.max(0, Math.min(1, falta / SUMIR_CARTAO_MS)));
      if (falta <= 0) {
        c.destroy();
        this.cartaoControle = undefined;
      }
    }
  }

  /** Cartão com o que cada botão do controle faz (e como subir os poderes). */
  private mostrarCartaoDoControle(tempo: number): void {
    const { largura } = telaDe(this);
    const linhas: [string, string][] = [
      ['Analógico esq.', 'andar'],
      ['Analógico dir.', 'mirar (sem ele, mira para onde você anda)'],
      ['RT', 'atacar (segure para golpes seguidos)'],
      ['X · Y · B · LT', 'poderes: segure para mirar, solte para lançar'],
      ['LB + poder', 'subir o posto do poder (quando tiver ponto de nível)'],
      ['A', 'rolar · L3: lanterna'],
      ['RB', 'interagir (na campainha, doce) · ↑: travessura'],
      ['← →', 'consumíveis · Back: mapa · Start: pausa'],
    ];
    const w = 470;
    const h = 64 + linhas.length * 26;
    const x = largura - w - 24;
    // Abaixo da bolsa (doces e relógio), sem cobrir nada do HUD.
    const y = 236;
    const c = this.add.container(0, 0).setDepth(PROFUNDIDADE_CARTAO);
    const g = this.add.graphics();
    placa(g, x, y, w, h, { alfa: 0.94 });
    g.fillStyle(COR.jogador, 1).fillRect(x, y, w, 3);
    c.add(g);
    c.add(
      this.add
        .text(x + 18, y + 14, 'CONTROLE CONECTADO', estiloTexto(16, COR.texto, true))
        .setResolution(2),
    );
    linhas.forEach(([botao, texto], i) => {
      const ly = y + 50 + i * 26;
      const chip = this.add.graphics();
      const cw = 118;
      chip.fillStyle(COR.placaClara, 1).fillRoundedRect(x + 16, ly - 2, cw, 22, 6);
      chip.lineStyle(1, COR.jogador, 0.8).strokeRoundedRect(x + 16, ly - 2, cw, 22, 6);
      c.add(chip);
      c.add(
        this.add
          .text(x + 16 + cw / 2, ly + 9, botao, estiloTexto(13, corDoce(), true))
          .setOrigin(0.5)
          .setResolution(2),
      );
      c.add(
        this.add.text(x + 16 + cw + 12, ly + 1, texto, estiloTexto(13, COR.texto)).setResolution(2),
      );
    });
    this.cartaoControle = c;
    this.cartaoAte = tempo + MOSTRAR_CARTAO_MS;
  }

  override update(tempo: number, delta: number): void {
    if (this.dados.preparando?.()) {
      if (!this.coberturaPreparacao) {
        const { largura, altura } = telaDe(this);
        const textos = visual.desempenho.textos;
        this.coberturaPreparacao = this.add.container(0, 0).setDepth(1e9);
        this.coberturaPreparacao.add([
          this.add.rectangle(0, 0, largura, altura, COR.placa).setOrigin(0).setInteractive(),
          this.add
            .text(largura / 2, altura / 2 - 20, textos.preparando, estiloTexto(26, COR.texto, true))
            .setOrigin(0.5)
            .setResolution(2),
          this.add
            .text(
              largura / 2,
              altura / 2 + 22,
              textos.preparandoDetalhe,
              estiloTexto(16, COR.textoApagado),
            )
            .setOrigin(0.5)
            .setResolution(2),
        ]);
      }
      this.coberturaPreparacao.setVisible(true);
    } else this.coberturaPreparacao?.setVisible(false);
    this.deltaAcumulado += delta;
    if (tempo - this.ultimoDesenho < visual.desempenho.intervaloInterfaceMs) return;
    this.ultimoDesenho = tempo;
    const p = this.dados.painel();
    const dtS = this.deltaAcumulado / 1000;
    this.deltaAcumulado = 0;
    this.g.clear();
    const visivel = !!p;
    if (visivel !== this.visivelAntes) {
      this.visivelAntes = visivel;
      for (const obj of this.children.list) {
        if (obj === this.vinheta || obj === this.coberturaPreparacao) continue;
        (obj as unknown as { setVisible?: (v: boolean) => void }).setVisible?.(visivel);
      }
      this.mapaGrande?.setVisible(false);
      this.legendaMapa?.objeto.setVisible(false);
      this.legendaSimbolos?.setVisible(false);
    }
    if (!p) return;
    this.atualizarDispositivo(tempo);
    this.desenharIcones(p);
    this.desenharRetrato(p, dtS, tempo);
    this.desenharHabilidades(p, tempo);
    this.desenharItens(p);
    this.desenharBolsa(p, tempo, dtS);
    this.desenharRastreador(p, tempo);
    this.desenharTopo(p, dtS, tempo);
    this.desenharCentro(p, tempo);
    this.desenharAvisos(p, tempo);
    this.desenharVinheta(p, tempo, dtS);
    this.desenharMapa(tempo);
  }

  /** Ícones (desenho mais caro) só mudam quando muda o que eles mostram. */
  private desenharIcones(p: PainelHUD): void {
    const L = this.L;
    const hora = p.relogio?.slice(0, 5) ?? '';
    if (hora !== this.horaDoIcone) {
      this.horaDoIcone = hora;
      this.relogioGrafico.clear();
      if (hora)
        iconeRelogio(
          this.relogioGrafico,
          L.bolsa.x + L.bolsa.w - 102,
          L.bolsa.y + L.bolsa.h / 2,
          24,
          hora,
          COR.luz,
        );
    }
    const assinatura = [
      p.campeaoId,
      ...p.slots.map(
        (s) => `${s.id}:${s.posto > 0 ? 1 : 0}:${s.semEnergia ? 1 : 0}:${s.evolucao ?? ''}`,
      ),
      ...(p.itens ?? []).map((i) => i?.id ?? '-'),
      ...(p.consumiveis ?? []).map((c) => `${c.id}:${c.qtd > 0}`),
      !!p.relogio,
    ].join('|');
    if (assinatura === this.assinaturaIcones) return;
    this.assinaturaIcones = assinatura;
    const g = this.gIcones.clear();
    for (const a of this.artes) a.destroy();
    this.artes = [];
    const { retrato: R, itens: I, bolsa: B } = L;
    // Retrato no medalhão.
    g.fillStyle(COR.placaClara, 1).fillCircle(R.x + 56, R.y + 50, 36);
    if (!this.comArte('retrato', p.campeaoId, R.x + 56, R.y + 48, 70))
      retrato(g, p.campeaoId, R.x + 56, R.y + 50, 60);
    // Passiva.
    const cxP = L.hab.x + 14 + 22;
    const cyP = L.hab.y + 22 + L.t / 2;
    g.fillStyle(COR.placaClara, 1).fillCircle(cxP, cyP, 22);
    if (!this.comArte('passiva', p.campeaoId, cxP, cyP, 40))
      iconePassiva(g, p.campeaoId, cxP, cyP, 30, COR.luz);
    // Habilidades.
    p.slots.forEach((s, i) => {
      const slot = this.slots[i];
      if (!slot) return;
      placa(g, slot.x, slot.y, L.t, L.t, { cor: COR.placaClara, alfa: 1, chanfro: 4 });
      const ativo = s.posto > 0 && !s.semEnergia;
      const ladoArte = L.t * visual.interface.artes.escalaPoder;
      if (!this.comArte('habilidade', s.id, slot.x + L.t / 2, slot.y + L.t / 2, ladoArte))
        iconeHabilidade(
          g,
          s.id,
          s.forma,
          slot.x + L.t / 2,
          slot.y + L.t / 2 + 2,
          38,
          ativo ? COR.luz : COR.apagado,
        );
      g.fillStyle(0x000000, 0.7).fillRect(slot.x + 2, slot.y + 2, 11, 11);
      // Selo da evolução escolhida, no canto de cima à direita.
      if (s.evolucao) {
        const bx = slot.x + L.t - 9;
        const by = slot.y + 9;
        g.fillStyle(COR.placa, 1).fillCircle(bx, by, 9);
        g.lineStyle(1.5, COR.magia, 1).strokeCircle(bx, by, 9);
        if (!this.comArte('evolucao', s.evolucao, bx, by, 22))
          iconeEvolucao(g, s.evolucao, bx, by, 14, COR.luz);
      }
    });
    // Itens (5) e consumíveis (2).
    (p.itens ?? []).forEach((it, k) => {
      const x = I.x + 12 + k * 40;
      const y = I.y + 12;
      placa(g, x, y, 34, 34, { cor: COR.placaClara, alfa: it ? 1 : 0.5, chanfro: 3 });
      if (it && !this.comArte('item', it.id, x + 17, y + 17, 30))
        iconeItem(g, it.id, x + 17, y + 17, 26, COR.luz);
    });
    (p.consumiveis ?? []).forEach((c, k) => {
      const x = I.x + 12 + k * 97;
      const y = I.y + 56;
      placa(g, x, y, 91, 38, { cor: COR.placaClara, alfa: 1, chanfro: 3 });
      if (c.id && c.qtd > 0 && !this.comArte('item', c.id, x + 34, y + 19, 32))
        iconeItem(g, c.id, x + 34, y + 19, 28, COR.luz);
      g.fillStyle(0x000000, 0.7).fillRect(x + 3, y + 3, 11, 11);
    });
    iconeDoce(g, B.x + 18, B.y + B.h / 2, 22);
    // A Luz da lanterna, ao lado da barra dela.
    this.comArte('hud', 'luz', R.x + 115, R.y + 84, 20);
  }

  private desenharRetrato(p: PainelHUD, dtS: number, tempo: number): void {
    const { retrato: R } = this.L;
    const g = this.g;
    const cx = R.x + 56;
    const cy = R.y + 50;
    // Anel de XP em volta do medalhão: enche devagar; ao subir de nível, um clarão e o aviso.
    if (this.nivelAntes >= 0 && p.nivel > this.nivelAntes) {
      this.nivelDesde = tempo;
      this.xpVisivel = 0;
      this.textoNivel.texto(`NÍVEL ${p.nivel}!`);
    }
    this.nivelAntes = p.nivel;
    g.lineStyle(4, 0x000000, 0.6).strokeCircle(cx, cy, 41);
    if (p.xpProximo > 0) {
      const fr = Math.max(0, Math.min(1, p.xp / p.xpProximo));
      this.xpVisivel += (fr - this.xpVisivel) * Math.min(1, dtS * 4);
      if (this.xpVisivel > 1e-3)
        g.lineStyle(4, COR.doce, 1)
          .beginPath()
          .arc(cx, cy, 41, -Math.PI / 2, -Math.PI / 2 + this.xpVisivel * Math.PI * 2)
          .strokePath();
    }
    g.lineStyle(2, COR.filete, 0.35).strokeCircle(cx, cy, 37);
    const kn = (tempo - this.nivelDesde) / NIVEL_MS;
    if (kn >= 0 && kn < 1) {
      g.lineStyle(3, COR.doce, 1 - kn).strokeCircle(cx, cy, 41 + kn * 34);
      g.fillStyle(COR.doce, 0.25 * (1 - kn)).fillCircle(cx, cy, 41);
      this.textoNivel.objeto
        .setVisible(true)
        .setAlpha(Math.min(1, (1 - kn) * 3))
        .setY(R.y - 26 - kn * 22)
        .setScale(kn < 0.15 ? 0.6 + kn * 2.7 : 1);
    } else this.textoNivel.objeto.setVisible(false);
    // Pouca Coragem: o medalhão pulsa em vermelho.
    const frC = p.coragem / Math.max(p.coragemMax, 1);
    if (frC < 0.3 && p.coragem > 0)
      g.lineStyle(3, COR.perigo, 0.45 + 0.45 * Math.sin(tempo / 170)).strokeCircle(cx, cy, 46);
    placa(g, cx - 22, R.y + R.h - 20, 44, 16, { chanfro: 3, alfa: 0.95 });
    this.p['nivel']!.texto(`NV ${p.nivel}`);
    this.p['nome']!.texto(p.campeao);

    // Coragem com o rastro do que acabou de cair, Energia e Luz.
    const fr = p.coragem / Math.max(p.coragemMax, 1);
    if (this.coragemAntes >= 0 && p.coragem < this.coragemAntes - 0.5) {
      this.flashDano = 1;
      pular(this, this.p['coragem']!.objeto, 1.2);
    } else if (this.coragemAntes >= 0 && p.coragem > this.coragemAntes + 0.5) {
      this.flashCura = 1;
      pular(this, this.p['coragem']!.objeto, 1.15);
    }
    this.coragemAntes = p.coragem;
    this.flashCura = Math.max(0, this.flashCura - dtS * 2.5);
    this.rastroCoragem =
      this.rastroCoragem > fr
        ? this.rastroCoragem + (fr - this.rastroCoragem) * (1 - Math.exp(-RIGIDEZ_RASTRO * dtS))
        : fr;
    const xb = R.x + 108;
    barra(g, xb, R.y + 36, 220, 16, fr, COR.jogador, this.rastroCoragem);
    if (this.flashCura > 0)
      g.fillStyle(COR.fantasma, 0.55 * this.flashCura).fillRect(xb, R.y + 36, 220 * fr, 16);
    if (this.flashDano > 0)
      g.fillStyle(0xffffff, 0.35 * this.flashDano).fillRect(xb, R.y + 36, 220 * fr, 16);
    if (p.escudo > 0)
      g.fillStyle(COR.luz, 0.9).fillRect(
        xb,
        R.y + 36,
        220 * Math.min(1, p.escudo / p.coragemMax),
        4,
      );
    this.p['coragem']!.texto(`${Math.ceil(p.coragem)}/${Math.round(p.coragemMax)}`);
    // Energia com o rastro do que acabou de ser gasto, como a Coragem.
    const frE = p.energia / Math.max(p.energiaMax, 1);
    this.rastroEnergia =
      this.rastroEnergia > frE
        ? this.rastroEnergia + (frE - this.rastroEnergia) * (1 - Math.exp(-RIGIDEZ_RASTRO * dtS))
        : frE;
    barra(g, xb, R.y + 58, 220, 11, frE, COR.magia, this.rastroEnergia);
    this.p['energia']!.texto(`${Math.floor(p.energia)}/${Math.round(p.energiaMax)}`);
    if (!arte(this, 'hud', 'luz')) iconeLanterna(g, xb + 7, R.y + 84, 16, COR.luz);
    barra(g, xb + 20, R.y + 81, 140, 6, p.luz / Math.max(p.luzMax, 1), COR.luz);

    this.p['pontos']!.texto(
      p.pontos > 0
        ? `+${p.pontos} PONTO${p.pontos > 1 ? 'S' : ''}  ${usandoControle() ? 'LB +' : 'CTRL +'} ${TECLAS.map(rotuloDaTecla).join(' ')}`
        : '',
    );
    this.t['estados']!.objeto.setY(p.pontos > 0 ? R.y - 38 : R.y - 20);
    this.t['estados']!.texto(p.estados.map(nomeDoEstado).join('  ·  '));
  }

  private desenharHabilidades(p: PainelHUD, tempo: number): void {
    const L = this.L;
    const g = this.g;
    const t = L.t;
    // Susto na borda de cima da placa.
    if (p.susto) {
      const frenesi = p.susto.frenesi > 0;
      const cor =
        frenesi || p.susto.valor >= 50
          ? COR.magia
          : p.susto.valor >= 25
            ? COR.jogador
            : COR.apagado;
      const pulso = frenesi ? 0.6 + 0.4 * Math.sin(tempo / 90) : 1;
      g.fillStyle(0x000000, 0.6).fillRect(L.hab.x + 14, L.hab.y + 9, L.hab.w - 28, 6);
      g.fillStyle(cor, pulso).fillRect(
        L.hab.x + 14,
        L.hab.y + 9,
        (L.hab.w - 28) * (frenesi ? 1 : Math.min(1, p.susto.valor / 100)),
        6,
      );
      for (const corte of [0.25, 0.5])
        g.fillStyle(0x000000, 0.7).fillRect(
          L.hab.x + 14 + (L.hab.w - 28) * corte - 1,
          L.hab.y + 9,
          2,
          6,
        );
      this.p['susto']!.objeto.setTint(frenesi ? COR.magia : COR.luz);
      this.p['susto']!.texto(
        frenesi ? `FRENESI ${p.susto.frenesi.toFixed(1)}S` : `SUSTO · ${p.susto.faixa}`,
      );
    } else this.p['susto']!.texto('');

    // Passiva: o contador numa fileira de contas logo acima do Caldeirão.
    const cxP = L.hab.x + 14 + 22;
    this.t['passiva']!.texto(p.passiva.nome);
    const n = p.passiva.aCada ?? 0;
    if (n > 0) {
      const passo = n > 1 ? Math.min(9, 40 / (n - 1)) : 0;
      const x0 = cxP - (passo * (n - 1)) / 2;
      for (let i = 0; i < n; i++) {
        const aceso = i < (p.passiva.contagem ?? 0);
        const px = x0 + passo * i;
        g.fillStyle(aceso ? COR.magia : 0x000000, aceso ? 1 : 0.6).fillCircle(
          px,
          L.hab.y + 24,
          2.5,
        );
        if (!aceso) g.lineStyle(1, COR.apagado, 0.8).strokeCircle(px, L.hab.y + 24, 2.5);
      }
    }

    p.slots.forEach((s, i) => {
      const slot = this.slots[i];
      if (!slot) return;
      const { x, y } = slot;
      const emRecarga = s.recarga > 0 && s.cargas <= 0;
      // Ficou pronto (clarão e anel que abre) ou acabou de ser usado (contorno que apaga).
      const e = (this.estadoSlots[i] ??= {
        emRecarga,
        recarga: s.recarga,
        pronto: -1e9,
        usado: -1e9,
      });
      if (e.emRecarga && !emRecarga && s.posto > 0) e.pronto = tempo;
      if (s.recarga > e.recarga + 0.05) e.usado = tempo;
      e.emRecarga = emRecarga;
      e.recarga = s.recarga;
      if (s.posto <= 0) g.fillStyle(0x000000, 0.55).fillRect(x, y, t, t);
      else if (s.semEnergia) g.fillStyle(0x10163a, 0.45).fillRect(x, y, t, t);
      if (emRecarga) pizzaNoQuadrado(g, x, y, t, s.recarga / Math.max(s.recargaTotal, 1e-6));
      const kp = (tempo - e.pronto) / PRONTO_MS;
      if (kp >= 0 && kp < 1) {
        g.fillStyle(0xffffff, 0.45 * (1 - kp)).fillRect(x, y, t, t);
        const a = 2 + kp * 8;
        g.lineStyle(2, COR.luz, 1 - kp).strokeRect(x - a, y - a, t + 2 * a, t + 2 * a);
      }
      const ku = (tempo - e.usado) / USADO_MS;
      if (ku >= 0 && ku < 1) {
        g.fillStyle(0x000000, 0.3 * (1 - ku)).fillRect(x, y, t, t);
        g.lineStyle(3, COR.jogador, 1 - ku).strokeRect(x - 1, y - 1, t + 2, t + 2);
      }
      slot.segundos.texto(emRecarga ? String(Math.ceil(s.recarga)) : '');
      slot.custo.texto(s.posto > 0 && s.custo > 0 ? String(Math.round(s.custo)) : '');
      // Sem Energia, o custo fica vermelho (dá para ler de relance por que não sai).
      slot.custo.objeto.setTint(s.semEnergia ? COR.perigo : COR.magia);
      if (s.mirando || s.lancando) {
        g.lineStyle(2, COR.jogador, 1).strokeRect(x - 1, y - 1, t + 2, t + 2);
      }
      if (s.podeSubir) {
        // O "+" flutua: tem ponto para gastar aqui.
        const dy = Math.sin(tempo / 220 + i) * 2;
        placa(g, x + t / 2 - 13, y - 18 + dy, 26, 15, { cor: COR.doce, alfa: 1, chanfro: 3 });
        g.fillStyle(COR.placa, 1)
          .fillRect(x + t / 2 - 4, y - 11 + dy, 8, 2)
          .fillRect(x + t / 2 - 1, y - 14 + dy, 2, 8);
        g.lineStyle(2, COR.doce, 0.6 + 0.4 * Math.sin(tempo / 160)).strokeRect(
          x - 1,
          y - 1,
          t + 2,
          t + 2,
        );
      }
      slot.mais.setVisible(s.podeSubir);
      if (s.gratis && s.posto > 0) {
        g.lineStyle(2, COR.magia, 0.6 + 0.4 * Math.sin(tempo / 120)).strokeRect(
          x - 1,
          y - 1,
          t + 2,
          t + 2,
        );
      }
      // Postos: tracinhos embaixo do botão.
      const passo = 8;
      const larg = s.postoMax * passo - 2;
      for (let k = 0; k < s.postoMax; k++) {
        g.fillStyle(k < s.posto ? COR.jogador : 0x000000, k < s.posto ? 1 : 0.6).fillRect(
          x + (t - larg) / 2 + k * passo,
          y + t + 5,
          6,
          4,
        );
      }
      if (s.cargasMax > 1) {
        for (let k = 0; k < s.cargasMax; k++)
          g.fillStyle(k < s.cargas ? COR.luz : 0x000000, 0.95).fillCircle(
            x + t - 7 - k * 8,
            y + 7,
            3,
          );
      }
    });

    const s: SlotPainel | undefined = this.sobre !== null ? p.slots[this.sobre] : undefined;
    if (s) {
      const texto =
        `${rotuloDaTecla(s.tecla)} · ${s.nome}${s.evolucaoNome ? `  (${s.evolucaoNome})` : ''}\n${s.descricao}\n` +
        `Posto ${s.posto}/${s.postoMax}  ·  Energia ${Math.round(s.custo)}`;
      this.t['dicaBotao']!.texto(texto);
      const b = this.t['dicaBotao']!.objeto.getBounds();
      placa(g, b.x - 12, b.y - 8, b.width + 24, b.height + 16, { alfa: 0.94 });
    } else this.t['dicaBotao']!.texto('');
  }

  private desenharItens(p: PainelHUD): void {
    const { itens: I } = this.L;
    const cons = p.consumiveis ?? [];
    this.p['cons1']!.texto(cons[0] && cons[0].qtd > 0 ? `X${cons[0].qtd}` : '');
    this.p['cons2']!.texto(cons[1] && cons[1].qtd > 0 ? `X${cons[1].qtd}` : '');
    // Nome do item sob o mouse.
    const ptr = this.input.activePointer;
    let nome = '';
    (p.itens ?? []).forEach((it, k) => {
      const x = I.x + 12 + k * 40;
      if (it && ptr.x >= x && ptr.x <= x + 34 && ptr.y >= I.y + 12 && ptr.y <= I.y + 46)
        nome = it.nome;
    });
    cons.forEach((c, k) => {
      const x = I.x + 12 + k * 97;
      if (c.id && ptr.x >= x && ptr.x <= x + 91 && ptr.y >= I.y + 56 && ptr.y <= I.y + 94)
        nome = `${c.tecla}: ${c.nome}`;
    });
    this.t['itemSobre']!.texto(nome);
  }

  private desenharBolsa(p: PainelHUD, tempo: number, dtS: number): void {
    const { bolsa: B } = this.L;
    if (p.doces === null) this.docesVisiveis = null;
    else {
      // Chegaram doces: o número conta até o novo valor e um "+N" sobe da bolsa.
      if (this.docesAntes !== null && p.doces > this.docesAntes) {
        const livre = this.flutuantes.find((f) => !f.ativo) ?? this.flutuantes[0];
        if (livre) {
          livre.ativo = true;
          livre.desde = tempo;
          livre.texto.texto(`+${p.doces - this.docesAntes}`);
        }
        pular(this, this.p['doces']!.objeto, 1.25);
      }
      const v = this.docesVisiveis ?? p.doces;
      this.docesVisiveis =
        p.doces < v ? p.doces : v + Math.max(1, (p.doces - v) * Math.min(1, dtS * 8));
      if (this.docesVisiveis > p.doces) this.docesVisiveis = p.doces;
    }
    this.docesAntes = p.doces;
    for (const f of this.flutuantes) {
      if (!f.ativo) continue;
      const k = (tempo - f.desde) / FLUTUANTE_MS;
      if (k >= 1) {
        f.ativo = false;
        f.texto.objeto.setVisible(false);
        continue;
      }
      f.texto.objeto
        .setVisible(true)
        .setPosition(B.x + 66, B.y + B.h / 2 - k * 30)
        .setAlpha(k < 0.7 ? 1 : (1 - k) / 0.3);
    }
    this.p['doces']!.texto(
      this.docesVisiveis !== null ? String(Math.round(this.docesVisiveis)) : '',
    );
    this.p['relogio']!.texto(p.relogio ? p.relogio.slice(0, 5) : '');
    this.t['condicao']!.texto(p.condicao ?? '');
  }

  /** Rastreador de objetivo: rua, Postes, onda, pedido, portão e tratos. */
  private desenharRastreador(p: PainelHUD, tempo: number): void {
    const { rastreador: T } = this.L;
    const g = this.g;
    if ((p.rua ?? '') !== this.ruaAtual) {
      this.ruaAtual = p.rua ?? '';
      this.ruaDesde = tempo;
      this.postesAntes = -1;
    }
    this.t['rua']!.texto((p.rua ?? '').toUpperCase());
    this.t['lugar']!.texto(p.lugar ? `em ${p.lugar}` : '');
    const linhas: {
      icone: (y: number) => void;
      /** A arte do Codex no lugar do desenho (símbolo da coleção 04), quando existe. */
      arte?: string;
      texto: string;
      cor?: string;
    }[] = [];
    const postes = p.regua?.postes ?? [];
    if (postes.length > 0) {
      const caidos = postes.filter((x) => x.caido).length;
      linhas.push({
        icone: (y) => iconePoste(g, T.x + 22, y + 8, 16, caidos === postes.length),
        arte: caidos === postes.length ? 'poste_caido' : 'poste_corrompido',
        texto:
          caidos === postes.length
            ? 'Postes Corrompidos derrubados'
            : 'Derrube os Postes Corrompidos',
        cor: caidos === postes.length ? visual.acentos.fantasma : undefined,
      });
      this.p['postes']!.texto(`${caidos}/${postes.length}`);
      if (this.postesAntes >= 0 && caidos !== this.postesAntes) {
        this.rastreadorDesde = tempo;
        pular(this, this.p['postes']!.objeto, 1.4);
      }
      this.postesAntes = caidos;
    } else this.p['postes']!.texto('');
    if (p.ondas) {
      const o = p.ondas;
      linhas.push({
        icone: (y) => iconeOnda(g, T.x + 22, y + 8, 18, COR.perigo),
        arte: 'onda',
        // Modo pontos: os bueiros acordam com o jogador perto (não há relógio de onda).
        texto: o.pontos
          ? o.atual < o.total
            ? `Bueiros ${o.atual}/${o.total}  ·  acordam quando você chega perto`
            : `Bueiros ${o.atual}/${o.total}  ·  todos acordaram`
          : o.proximaEm !== null
            ? `Onda ${o.atual}/${o.total}  ·  próxima em ${Math.ceil(o.proximaEm)} s`
            : `Onda ${o.atual}/${o.total}  ·  todas chegaram`,
        // A onda está para chegar: a linha pisca em vermelho.
        cor:
          o.proximaEm !== null && o.proximaEm <= ONDA_PERTO_S && Math.sin(tempo / 120) > 0
            ? visual.acentos.perigo
            : undefined,
      });
    }
    if (p.pedido) {
      const sit = p.pedido.situacao;
      linhas.push({
        icone: (y) =>
          sit === 'andamento'
            ? iconePedido(g, T.x + 22, y + 8, 18, COR.luz)
            : iconeSituacao(g, T.x + 22, y + 8, 16, sit === 'cumprido'),
        arte: sit === 'andamento' ? 'pedido' : undefined,
        texto: `Pedido: ${p.pedido.texto}`,
        cor:
          sit === 'cumprido'
            ? visual.acentos.fantasma
            : sit === 'falhou'
              ? COR.textoApagado
              : undefined,
      });
    }
    if (p.regua) {
      const aberto = p.regua.portao.aberto;
      linhas.push({
        icone: (y) => iconePortao(g, T.x + 22, y + 8, 16, aberto, COR.luz),
        arte: aberto ? 'portao_aberto' : 'portao_fechado',
        texto: aberto ? 'Portão aberto: siga o caminho até ele' : 'Portão de saída fechado',
        cor: aberto ? visual.acentos.fantasma : undefined,
      });
    }
    if (p.exploracao) {
      const e = p.exploracao;
      linhas.push({
        icone: (y) => {
          g.fillStyle(COR.doce, 1).fillCircle(T.x + 22, y + 8, 4);
          g.lineStyle(1, COR.doce, 1).strokeCircle(T.x + 22, y + 8, 7);
        },
        texto: `Explorado ${Math.round(e.fracao * 100)}%  ·  Abóboras ${e.segredos}/${e.segredosTotal}  ·  Campainhas ${e.campainhas}/${e.campainhasTotal}`,
        cor: e.segredos === e.segredosTotal ? visual.acentos.doce : undefined,
      });
    }
    if (p.chefe) {
      linhas.push({
        icone: (y) => iconeSituacao(g, T.x + 22, y + 8, 14, false),
        texto: `Derrote ${p.chefe.nome}${p.chefe.fase ? ` (${p.chefe.fase})` : ''}`,
      });
    }
    // Fechado, o painel mostra só o objetivo da vez: o chefe, o portão aberto ou os Postes.
    const aberto = this.rastreadorAberto || !!this.teclaMapa?.isDown || this.mapaAberto;
    if (!aberto && linhas.length > 1) {
      const principal =
        linhas.find((l) => l.texto.startsWith('Derrote ')) ??
        linhas.find((l) => l.arte === 'portao_aberto') ??
        linhas.find((l) => l.arte === 'poste_corrompido' || l.arte === 'poste_caido') ??
        linhas[0]!;
      linhas.splice(0, linhas.length, principal);
    }
    if (!aberto)
      this.p['postes']!.texto(
        linhas[0]?.arte?.startsWith('poste') ? this.p['postes']!.objeto.text : '',
      );
    let y = T.y + (p.lugar ? 48 : 36);
    const nomes = ['linha0', 'linha1', 'linha2', 'linha3', 'linha4'];
    const posicoes: number[] = [];
    nomes.forEach((n, i) => {
      const l = linhas[i];
      const tx = this.t[n]!;
      if (!l) {
        tx.texto('');
        return;
      }
      tx.objeto.setY(y);
      tx.texto(l.texto, l.cor ?? COR.texto);
      posicoes.push(y);
      y += Math.max(22, tx.objeto.height + 6);
    });
    const tratos = (p.tratos ?? []).map(
      (t) =>
        `${t.marca} ${t.nomes.length}${t.proximo && t.proximo !== 'completo' ? ` (${t.proximo})` : t.proximo === 'completo' ? ' ✦' : ''}`,
    );
    this.t['tratos']!.objeto.setY(y + 2);
    this.t['tratos']!.texto(
      aberto
        ? tratos.length > 0
          ? `Tratos: ${tratos.join('  ·  ')}`
          : ''
        : p.rua && tempo - this.ruaDesde < DICA_RASTREADOR_MS
          ? 'Clique · detalhes  ·  Tab ou clique no mapa · mapa inteiro'
          : '',
    );
    const alto =
      (this.t['tratos']!.objeto.text ? this.t['tratos']!.objeto.height + 8 : 0) + y - T.y + 6;
    const tamanho = linhas.length > 0 || p.rua ? `${T.w},${Math.round(alto)}` : '';
    if (tamanho !== this.tamanhoRastreador) {
      this.tamanhoRastreador = tamanho;
      this.placaRastreador.clear();
      if (tamanho) placa(this.placaRastreador, T.x, T.y, T.w, alto);
    }
    nomes.forEach((_, i) => {
      const l = linhas[i];
      const y = posicoes[i] ?? 0;
      const k = l?.arte ? arte(this, 'hud', l.arte) : null;
      let img = this.iconesRastreador[i];
      if (k && !img) {
        img = this.add.image(0, 0, k);
        this.children.moveBelow(img, this.g);
        this.iconesRastreador[i] = img;
      }
      if (img) img.setVisible(!!k);
      if (k && img)
        img
          .setTexture(k)
          .setDisplaySize(22, 22)
          .setPosition(T.x + 22, y + 8);
      else l?.icone(y);
    });
    if (postes.length > 0) this.p['postes']!.objeto.setY((posicoes[0] ?? 0) + 1);
    const kr = (tempo - this.rastreadorDesde) / RASTREADOR_MS;
    if (kr >= 0 && kr < 1 && tamanho) {
      g.lineStyle(2, COR.jogador, 1 - kr).strokeRect(T.x - 2, T.y - 2, T.w + 4, alto + 4);
      g.fillStyle(COR.jogador, 0.12 * (1 - kr)).fillRect(T.x, T.y, T.w, alto);
    }
  }

  /** Régua da rua (sem chefe) ou a barra do chefe/elite, em cima ao centro. */
  private desenharTopo(p: PainelHUD, dtS: number, tempo: number): void {
    const g = this.g;
    const { largura } = this.L;
    let m = this.L.m;
    const chefe = p.chefe ?? (p.elites[0] ? { ...p.elites[0], fase: '' } : null);
    if (chefe) {
      if (chefe.nome !== this.chefeNome) {
        this.chefeNome = chefe.nome;
        this.chefeDesde = tempo;
        this.faseAntes = chefe.fase ?? '';
      }
      if ((chefe.fase ?? '') !== this.faseAntes) {
        this.faseAntes = chefe.fase ?? '';
        this.faseDesde = tempo;
      }
      const ke = Math.min(1, (tempo - this.chefeDesde) / CHEFE_ENTRA_MS);
      m -= 70 * (1 - ke) * (1 - ke);
      const w = 520;
      const x0 = (largura - w) / 2;
      placa(g, x0, m, w, 50);
      const kf = (tempo - this.faseDesde) / FASE_MS;
      if (kf >= 0 && kf < 1) {
        g.fillStyle(COR.perigo, 0.35 * (1 - kf)).fillRect(x0, m, w, 50);
        g.lineStyle(2, COR.perigo, 1 - kf).strokeRect(x0 - 3, m - 3, w + 6, 56);
      }
      this.rastroChefe =
        this.rastroChefe > chefe.fracao
          ? this.rastroChefe +
            (chefe.fracao - this.rastroChefe) * (1 - Math.exp(-RIGIDEZ_RASTRO * dtS))
          : chefe.fracao;
      barra(g, x0 + 16, m + 30, w - 32, 10, chefe.fracao, COR.perigo, this.rastroChefe);
      this.t['chefe']!.objeto.setPosition(largura / 2, m + 16);
      this.t['chefe']!.texto(chefe.nome);
      this.t['fase']!.objeto.setPosition(x0 + w - 16, m + 9);
      this.t['fase']!.texto(chefe.fase ?? '');
      this.p['reguaEntrada']!.texto('');
      this.p['reguaSaida']!.texto('');
      return;
    }
    this.rastroChefe = 1;
    this.chefeNome = '';
    this.t['chefe']!.texto('');
    this.t['fase']!.texto('');
    if (!p.regua) {
      this.p['reguaEntrada']!.texto('');
      this.p['reguaSaida']!.texto('');
      return;
    }
    const w = 380;
    const x0 = (largura - w) / 2;
    const y = m + 14;
    placa(g, x0 - 64, m, w + 128, 30, { alfa: 0.7 });
    g.fillStyle(0x000000, 0.6).fillRect(x0, y - 1, w, 4);
    g.fillStyle(COR.apagado, 1).fillRect(x0, y, w * Math.max(0, Math.min(1, p.regua.jogador)), 2);
    for (const poste of p.regua.postes) iconePoste(g, x0 + w * poste.pos, y + 1, 18, poste.caido);
    iconePortao(g, x0 + w, y + 1, 16, p.regua.portao.aberto, COR.luz);
    const xj = x0 + w * Math.max(0, Math.min(1, p.regua.jogador));
    g.fillStyle(COR.jogador, 1)
      .beginPath()
      .moveTo(xj, y - 2)
      .lineTo(xj - 6, y - 11)
      .lineTo(xj + 6, y - 11)
      .closePath()
      .fillPath();
    this.p['reguaEntrada']!.objeto.setPosition(x0 - 58, y - 3);
    this.p['reguaSaida']!.objeto.setPosition(x0 + w + 58, y - 3);
    this.p['reguaEntrada']!.texto('ENTRADA');
    this.p['reguaSaida']!.texto('SAIDA');
  }

  /** Título da rua (faixa com entrada animada) e a dica do momento. */
  private desenharCentro(p: PainelHUD, tempo: number): void {
    const g = this.g;
    const { largura } = this.L;
    const titulo = p.titulo ?? '';
    if (titulo !== this.tituloAtual) {
      this.tituloAtual = titulo;
      this.tituloDesde = tempo;
    }
    const tt = this.t['titulo']!;
    tt.texto(titulo);
    if (titulo) {
      const k = Math.min(1, (tempo - this.tituloDesde) / DURACAO_ENTRADA_TITULO_MS);
      const larg = (tt.objeto.width + 120) * (0.6 + 0.4 * k);
      g.fillStyle(COR.placa, 0.78 * k).fillRect(largura / 2 - larg / 2, 140, larg, 56);
      g.fillStyle(COR.jogador, k)
        .fillRect(largura / 2 - larg / 2, 140, larg, 2)
        .fillRect(largura / 2 - larg / 2, 194, larg, 2);
      for (const lado of [-1, 1]) {
        const x = largura / 2 + lado * (larg / 2 - 18);
        g.fillStyle(COR.jogador, k)
          .beginPath()
          .moveTo(x, 168 - 6)
          .lineTo(x + 6, 168)
          .lineTo(x, 168 + 6)
          .lineTo(x - 6, 168)
          .closePath()
          .fillPath();
      }
      tt.objeto.setAlpha(k).setScale(0.9 + 0.1 * k);
    }
    const dica = this.t['dica']!;
    dica.texto(p.dica ?? '');
    if (p.dica) {
      const b = dica.objeto.getBounds();
      placa(g, b.x - 18, b.y - 10, b.width + 36, b.height + 20, { alfa: 0.9 });
    }
  }

  /**
   * Avisos de eventos numa fila no canto (somem sozinhos, os últimos 400 ms apagando) e a linha
   * da interação acima da barra de habilidades.
   */
  private desenharAvisos(p: PainelHUD, tempo: number): void {
    const g = this.g;
    const { bolsa: B } = this.L;
    const avisos = p.avisos ?? [];
    let y = B.y + B.h + 30;
    // Cada aviso novo chega deslizando da direita.
    const vistos = new Set(avisos.map((a) => a.texto));
    for (const k of [...this.avisosDesde.keys()]) if (!vistos.has(k)) this.avisosDesde.delete(k);
    this.textosAvisos.forEach((t, i) => {
      const a = avisos[i];
      t.texto(a?.texto ?? '');
      if (!a) return;
      if (!this.avisosDesde.has(a.texto)) this.avisosDesde.set(a.texto, tempo);
      const ka = Math.min(1, (tempo - this.avisosDesde.get(a.texto)!) / AVISO_ENTRA_MS);
      const alfa = Math.min(1, a.restanteMs / APAGAR_AVISO_MS) * ka;
      t.objeto
        .setY(y)
        .setX(B.x + B.w + 40 * (1 - ka) * (1 - ka))
        .setAlpha(alfa);
      const b = t.objeto.getBounds();
      placa(g, b.x - 10, b.y - 5, b.width + 20, b.height + 10, { alfa: 0.82 * alfa });
      y += b.height + 14;
    });
    const it = this.t['interacao']!;
    it.texto(p.interacao ?? '');
    it.objeto.setY(this.L.hab.y - 30 + Math.sin(tempo / 300) * 2);
    if (p.interacao) {
      const b = it.objeto.getBounds();
      placa(g, b.x - 14, b.y - 6, b.width + 28, b.height + 12, { alfa: 0.86 });
    }
  }

  /** Bordas da tela: vermelho ao levar dano e pulsando com pouca Coragem; roxo no Frenesi. */
  private desenharVinheta(p: PainelHUD, tempo: number, dtS: number): void {
    this.flashDano = Math.max(0, this.flashDano - dtS * 3);
    const fr = p.coragem / Math.max(1, p.coragemMax);
    let alfa = 0;
    let cor = COR.perigo;
    if (this.flashDano > 0) alfa = 0.55 * this.flashDano;
    else if (fr < 0.3 && p.coragem > 0) alfa = 0.18 + 0.14 * Math.sin(tempo / 220);
    else if (p.susto && p.susto.frenesi > 0) {
      cor = COR.magia;
      alfa = 0.22 + 0.1 * Math.sin(tempo / 120);
    }
    this.vinheta.setTint(cor).setAlpha(alfa);
  }

  private desenharMapa(tempo: number): void {
    const d = this.dados.mapa?.();
    if (!d || !this.minimapa) {
      this.minimapa?.setVisible(false);
      return;
    }
    this.minimapa.setVisible(true);
    this.minimapa.atualizar(d, tempo);
    const grande = !!this.teclaMapa?.isDown || this.mapaAberto;
    if (this.zonaMapaGrande?.input) this.zonaMapaGrande.input.enabled = this.mapaAberto;
    this.mapaGrande?.setVisible(grande);
    this.legendaMapa?.objeto.setVisible(grande);
    this.legendaSimbolos?.setVisible(grande);
    if (grande) this.mapaGrande?.atualizar(d, tempo);
  }
}

/** Recarga em leque recortada no quadrado do botão (sentido horário, a partir do topo). */
function pizzaNoQuadrado(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  s: number,
  fracao: number,
): void {
  const f = Math.max(0, Math.min(1, fracao));
  if (f <= 0) return;
  const cx = x + s / 2;
  const cy = y + s / 2;
  const meio = s / 2;
  g.fillStyle(0x000000, 0.62).beginPath().moveTo(cx, cy);
  const passos = Math.max(2, Math.ceil(f * 48));
  // O leque cobre a parte que ainda falta recarregar: começa no topo e anda no sentido horário.
  const inicio = -Math.PI / 2 + (1 - f) * Math.PI * 2;
  for (let k = 0; k <= passos; k++) {
    const a = inicio + (k / passos) * f * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const t = meio / Math.max(Math.abs(dx), Math.abs(dy));
    g.lineTo(cx + dx * t, cy + dy * t);
  }
  g.closePath().fillPath();
}

function nomeDoEstado(e: string): string {
  const nomes: Record<string, string> = {
    lentidao: 'lento',
    atordoado: 'atordoado',
    enraizado: 'preso',
    medo: 'com medo',
    escudo: 'escudo',
    invisivel: 'invisível',
    imune: 'imune',
    provocado: 'provocado',
    marca: 'marcado',
    fragil: 'frágil',
    dot: 'sangrando',
  };
  return nomes[e] ?? e;
}

/** Quantos avisos cabem na fila do canto e quanto tempo o último leva apagando. */
const AVISOS_NA_FILA = 3;
const APAGAR_AVISO_MS = 400;
/** Lado do botão de tela cheia. */
const TAMANHO_BOTAO_TELA_CHEIA = 34;
/** Tempos do HUD dinâmico (ms): entrada, nível, botão pronto e usado, "+N" dos doces, clarão do
 * rastreador, barra do chefe descendo e troca de fase, aviso entrando e a dica do rastreador. */
const ENTRADA_HUD_MS = 500;
const NIVEL_MS = 1400;
const PRONTO_MS = 380;
const USADO_MS = 220;
const FLUTUANTE_MS = 950;
const FLUTUANTES = 4;
const RASTREADOR_MS = 900;
const CHEFE_ENTRA_MS = 500;
const FASE_MS = 900;
const AVISO_ENTRA_MS = 260;
const DICA_RASTREADOR_MS = 20_000;
/** A linha da onda pisca quando faltam estes segundos. */
const ONDA_PERTO_S = 3;
