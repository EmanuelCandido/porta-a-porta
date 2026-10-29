import * as Phaser from 'phaser';
import {
  assarBlocoDeChao,
  assarCamada,
  assarModelo,
  limitesDe,
  prepararChao,
  type CamadaDePiso,
  type ChaoPreparado,
  type Limites,
} from '../../render/assar';
import {
  chaveDeTextura,
  modeloDe,
  MODELOS_QUE_ESCONDEM,
  type FiguranteNaPose,
} from '../../render/catalogo';
import {
  ehPoseParada,
  esqueletoDaMalha,
  POSE_PARADA,
  posesDoCorpo,
  temMalha,
  type PoseDaMalha,
} from '../../render/malhas';
import {
  ordenarPartes,
  poligonosDasPartes,
  sombrasDasPartes,
  sombrasDeLuzPontual,
  type PaletaVolumes,
} from '../../render/geometria';
import { criarIso, paraTela, type Iso, type Vec2, type Vec3 } from '../../render/iso';
import {
  alcanceDaLuz,
  alturaDaLuz,
  distanciaNaTela,
  IndiceDeLuzes,
  intensidadeDoFeixe,
  luzesNoMundo,
  pocaDaLuz,
  poligonoDeLuz,
  quedaDaLuz,
  tintNaLuz,
  type LuzNoMundo,
} from '../../render/luz';
import { instanciar, type Instancia } from '../../render/modelos';
import { resolucaoDasTexturas } from '../../render/resolucao';
import type { Pegada } from '../../render/primitivas';
import type { Parte } from '../../render/geometria';
import { luz, visual } from '../../sim/content';
import { posicaoNoFeixe, type Feixe } from '../../sim/luz';
import {
  MODELOS_DE_CASA,
  type Figurante,
  type ObjetoRua,
  type Rua,
} from '../../sim/content/esquemas';
import type { Retangulo, Rotacao, V2 } from '../../sim/geometria';
import { prenderNoMundo } from '../camera';
import { perfilDeQualidade } from '../desempenho/qualidade';
import { AssadorDePoses } from '../desempenho/assador';
import { cacheDeModelos } from '../desempenho/cacheDeModelos';
import { OrcamentoDeQuadro } from '../../render/orcamento';
import { IndiceDeAreas } from '../../render/indiceDeAreas';

// Camadas do chão, abaixo de todos os objetos. A profundidade dos objetos é x + y, que fica
// negativa na cidade em volta (coordenadas < 0), então o chão mora bem mais fundo.
// As poças de luz e o halo roxo ficam acima da escuridão: somam luz ao chão no escuro. As sombras
// que as luzes fazem dos personagens também: tiram luz da poça em que eles estão.
export const PROFUNDIDADE = {
  sombras: -100_000,
  sombrasMoveis: -99_990,
  escuridao: -99_970,
  pocas: -99_965,
  sombrasDaLuz: -99_962,
  halosCorrompidos: -99_960,
  marcadores: -99_950,
  /** O ar iluminado pelos postes (cones de luz): por cima de tudo do mundo, somando luz. */
  ar: 900_000,
};
/** Escala das texturas assadas: a densidade do aparelho no zoom máximo, até o teto do JSON. */
const RESOLUCAO = resolucaoDasTexturas(
  window.devicePixelRatio,
  visual.camera.zoomMax,
  visual.volumes.resolucaoTexturaMax,
);
/** O brilho de um objeto vem logo depois dele, antes de qualquer coisa que fique na frente. */
const DEPOIS_DO_OBJETO = 1e-4;
/** Folga em volta de uma rua sem `mundo` (montada à mão), em tiles. */
const FOLGA_DO_MAPA_TILES = 8;
/** Lado dos blocos em que o chão é assado, em px. */
const BLOCO_DO_CHAO = 1024;
/** Blocos do chão a mais em volta da vista (assados antes de aparecer) e até onde ficam guardados. */
const BLOCOS_DE_FOLGA = 1;
const BLOCOS_GUARDADOS = 2;
/** Folga da escuridão em volta da tela, em px, para o recorte não aparecer na borda. */
const FOLGA_ESCURIDAO_PX = 96;
/** A escuridão é refeita quando a câmera anda isso (px); a folga precisa ser maior que o passo. */
const PASSO_DA_ESCURIDAO_PX = 32;
/** Folga do recorte da câmera, em px: objetos altos começam fora da vista e entram nela. */
const FOLGA_DO_RECORTE_PX = 160;
/** A câmera precisa andar isso (px) para o recorte ser refeito. */
const PASSO_DO_RECORTE_PX = 48;
/** Lado (px) da textura da sombra de personagem (a elipse tem o dobro de comprimento). */
const LADO_DA_SOMBRA_DE_FIGURA = 32;
/** As quatro rotações assadas de quem anda, na ordem em que a figura guarda. */
const ROTACOES = [0, 90, 180, 270] as const;
/** Distância (tiles) da luz até a pegada abaixo da qual o objeto é a fonte dela (não faz sombra). */
const DENTRO_DA_FONTE = 0.02;
/** Defasagem entre o piscar de um Poste Corrompido e o do próximo. */
const DEFASAGEM_PISCA = 0.37;
/** Transparência de uma casa quando alguém importante está atrás dela. */
const ALFA_OCLUSAO = 0.35;

export function corNumerica(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

export function noChao(pts: Vec2[], iso: Iso): Vec2[] {
  return pts.map((p) => paraTela({ x: p.x, y: p.y, z: 0 }, iso));
}

interface ObjetoNaCena {
  o: ObjetoRua | Figurante;
  base: Phaser.GameObjects.Image;
  brilho: Phaser.GameObjects.Image | null;
  pegada: Pegada;
  /** As partes no mundo (tiles), para projetar a sombra que cada luz faz dele. */
  partes: Parte[];
  /** Quanta luz chega nele (0 = escuro, 1 = em cheio): o tint mistura o escuro com o branco. */
  luz: number;
  profundidade: number;
  /** Transparência atual (casas ficam transparentes com alguém atrás). */
  alfa: number;
  /** Objeto da cidade em volta: não conta para a simulação. */
  decorativo: boolean;
  /** Escondido de vez (a grade do portão aberto): o recorte da câmera não o mostra de novo. */
  oculto: boolean;
  /** Tint aplicado agora (só muda quando a luz muda); null = sem tint. */
  tingido: number | null;
}

/** Textura assada para a luz: chave, canto relativo ao centro e tamanho, em px de tela. */
interface TexturaDeLuz {
  chave: string;
  x0: number;
  y0: number;
  largura: number;
  altura: number;
}

interface Corrompido {
  brilho: Phaser.GameObjects.Image | null;
  halo: Phaser.GameObjects.Graphics;
  fase: number;
}

interface Assado {
  chave: string;
  /** Canto do desenho relativo ao canto mínimo da pegada, em px de tela. */
  origem: Vec2;
  temBrilho: boolean;
  sombra: { chave: string; origem: Vec2 };
}

export interface OpcoesCenario {
  figurantes: boolean;
  noite: boolean;
  /** Luzes vindas da simulação (rua gerada); sem elas, as do desenho (rua montada à mão). */
  luzes?: LuzNoMundo[];
}

/**
 * O cenário de uma rua: o chão (zonas de piso e sombras, em blocos), escuridão e poças de luz, os objetos
 * assados em textura, a cidade em volta, o piscar dos Postes Corrompidos e a troca entre noite
 * (como no jogo) e sem escuridão (como a referência). A escuridão tem o tamanho da tela e é refeita
 * com um carimbo por luz visível, então o mundo pode crescer sem a textura crescer junto.
 */
export class CenarioDaRua {
  readonly qualidade = perfilDeQualidade();
  private readonly trabalho = new OrcamentoDeQuadro();
  private readonly assador = new AssadorDePoses();
  private readonly indiceObjetos = new IndiceDeAreas<ObjetoNaCena>(
    visual.desempenho.celulaObjetosTiles,
  );
  private readonly texturasLocais = new Set<string>();
  private readonly areasDasSombras = new Map<string, Retangulo>();
  private readonly assadosUsados = new Set<string>();
  private chaoPendente = false;
  private encerrado = false;
  private preparandoAgora = false;
  private larguraLuz = 0;
  private alturaLuz = 0;
  readonly iso: Iso = criarIso(visual.tile);
  /** Mundo desenhado, em tiles (a rua e a cidade em volta). */
  readonly mundo: Retangulo;
  /** O mesmo mundo em px de tela. */
  readonly limites: Limites;
  /** Luzes da rua jogável (vêm da simulação). */
  luzes: LuzNoMundo[];
  /** Luzes da cidade em volta: só desenho. */
  private readonly luzesCenario: LuzNoMundo[];
  /** Índices das luzes, para saber rápido o que está iluminado. */
  private indiceLuzes: IndiceDeLuzes;
  private readonly indiceCenario: IndiceDeLuzes;
  private noiteAtiva: boolean;
  private readonly objetos: ObjetoNaCena[] = [];
  /** Boca das chaminés no mundo (tiles e z em px), para a fumaça da vida no cenário. */
  readonly chamines: Vec3[] = [];
  /** Os objetos altos que podem esconder alguém (da rua e da cidade em volta). */
  private readonly oclusores: ObjetoNaCena[] = [];
  private readonly corrompidos: Corrompido[] = [];
  private escuridao?: Phaser.GameObjects.RenderTexture;
  /** Cones de luz dos postes, por cima dos objetos (mesma área e posição da escuridão). */
  private ar?: Phaser.GameObjects.RenderTexture;
  private claraoAte = 0;
  private halosDinamicos?: Phaser.GameObjects.Graphics;
  /** Última área desenhada da escuridão; muda com a câmera ou com as luzes. */
  private vistaDaEscuridao = '';
  /** Onde a câmera estava no último recorte (px de tela). */
  private ultimoRecorte: {
    x: number;
    y: number;
    zoom: number;
    largura: number;
    altura: number;
  } | null = null;
  /**
   * O chão pronto para assar (de dia com as sombras do sol; de noite sem elas, porque quem faz
   * sombra são as luzes) e os blocos já assados (por coluna e linha).
   */
  private chaoDeDia: ChaoPreparado | null = null;
  private prepararDia: (() => ChaoPreparado) | null = null;
  private chaoDeNoite: ChaoPreparado | null = null;
  /** O chão dos blocos assados agora é o da noite? */
  private chaoNoturno: boolean | null = null;
  /** Carimbos de luz já recortados pelas sombras dos objetos, por luz (refeitos se um objeto muda). */
  private readonly luzesComSombra = new Map<string, TexturaDeLuz>();
  /** Sombras novas que ainda dá para fazer neste quadro (o resto fica para os próximos). */
  private orcamentoDeSombras = 0;
  /** Alguma luz ficou sem a sombra neste quadro: a escuridão é refeita no próximo. */
  private sombrasPendentes = false;
  /** Poses de quem já apareceu, assadas antes de serem pedidas quando sobra orçamento. */
  private readonly posesNaFila: { o: FiguranteNaPose; parada: Assado }[] = [];
  private readonly posesEnfileiradas = new Set<string>();
  private readonly blocosDoChao = new Map<string, Phaser.GameObjects.Image | null>();

  constructor(
    private readonly cena: Phaser.Scene,
    readonly rua: Rua,
    opcoes: OpcoesCenario,
  ) {
    this.trabalho.iniciar(visual.desempenho.trabalhoNaPreparacaoMs);
    cena.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destruir());
    this.noiteAtiva = opcoes.noite;
    const instanciarTodos = (lista: (ObjetoRua | Figurante)[]) =>
      lista.map((o) => ({
        o,
        inst: instanciar(modeloDe(o, { iso: this.iso, visual }), o.x, o.y, o.rot),
      }));
    const itens = instanciarTodos(
      opcoes.figurantes ? [...rua.objetos, ...rua.figurantes] : rua.objetos,
    );
    const itensCenario = instanciarTodos(rua.cenario ?? []);
    this.luzes =
      opcoes.luzes ??
      luzesNoMundo(
        itens.flatMap((i) => i.inst.luzes),
        luz,
      );
    this.luzesCenario = luzesNoMundo(
      itensCenario.flatMap((i) => i.inst.luzes),
      luz,
    ).filter((l) => l.recortaEscuridao);
    const { queda, feixe } = visual.luzNaTela;
    this.indiceLuzes = new IndiceDeLuzes(this.luzes, queda, feixe);
    this.indiceCenario = new IndiceDeLuzes(this.luzesCenario, queda, feixe);
    const f = FOLGA_DO_MAPA_TILES;
    this.mundo = rua.mundo ?? {
      x0: -f,
      y0: -f,
      x1: rua.largura + f,
      y1: rua.profundidade + f,
    };
    this.limites = this.limitesDe(this.mundo);
    this.criarChao([...itens, ...itensCenario]);
    this.criarLuzesNoChao();
    for (const { o, inst } of itens) this.objetos.push(this.criarObjeto(o, inst, false));
    for (const { o, inst } of itensCenario) this.objetos.push(this.criarObjeto(o, inst, true));
    for (const { inst } of [...itens, ...itensCenario]) this.chamines.push(...inst.chamines);
    for (const obj of this.objetos)
      if (MODELOS_QUE_ESCONDEM.has(obj.o.modelo)) this.oclusores.push(obj);
    for (const obj of this.objetos) this.indiceObjetos.definir(obj, obj.pegada);
    this.aplicarNoite();
  }

  get preparada(): boolean {
    return (
      !this.chaoPendente &&
      !this.sombrasPendentes &&
      !this.assador.ocupado &&
      this.posesNaFila.length === 0
    );
  }

  get preparacao() {
    return {
      poses: this.posesNaFila.length + Number(this.assador.ocupado),
      sombras: this.sombrasPendentes,
      chao: this.chaoPendente,
      segundoPlano: this.assador.emSegundoPlano,
    };
  }

  private destruir(): void {
    if (this.encerrado) return;
    this.encerrado = true;
    this.assador.destruir();
    this.posesNaFila.length = 0;
    this.posesEnfileiradas.clear();
    for (const chave of this.texturasLocais)
      if (this.cena.textures.exists(chave)) this.cena.textures.remove(chave);
    this.texturasLocais.clear();
    this.blocosDoChao.clear();
    this.luzesComSombra.clear();
    this.areasDasSombras.clear();
    this.assadosUsados.clear();
    cacheDeModelos(this.cena.game).soltar(this.cena);
  }

  get noite(): boolean {
    return this.noiteAtiva;
  }

  /** Rua com cidade em volta: a câmera fica presa dentro do mundo, sem limites retangulares. */
  get temMundo(): boolean {
    return this.rua.mundo !== undefined;
  }

  alternarNoite(): boolean {
    this.noiteAtiva = !this.noiteAtiva;
    this.aplicarNoite();
    return this.noiteAtiva;
  }

  /** A pegada está dentro do raio de alguma luz (a regra, sem a queda suave da tela)? */
  iluminado(p: Pegada): boolean {
    return this.indiceLuzes.ilumina(p) || this.indiceCenario.ilumina(p);
  }

  /** Quanta luz chega na pegada, com a queda suave da tela (0 = escuro, 1 = em cheio). */
  luminosidade(p: Pegada): number {
    return Math.max(this.indiceLuzes.luminosidade(p), this.indiceCenario.luminosidade(p));
  }

  /** Troca as luzes (um poste apagou, a lanterna pulsou): poças, escuridão e tons mudam. */
  definirLuzes(luzes: LuzNoMundo[]): void {
    this.luzes = luzes;
    this.indiceLuzes = new IndiceDeLuzes(luzes, visual.luzNaTela.queda, visual.luzNaTela.feixe);
    this.redesenharPocas();
    for (const obj of this.objetos) obj.luz = this.luminosidade(obj.pegada);
    this.aplicarNoite();
  }

  /**
   * Só tela (o preço de um trato aparecendo na hora): a casa mais perto de `p` apaga as janelas,
   * com as luzes delas. Devolve o ponto do mundo no meio da casa, ou null se não houver casa.
   */
  apagarCasaPerto(p: V2, raio: number): V2 | null {
    let melhor: ObjetoNaCena | null = null;
    let menor = raio;
    for (const obj of this.objetos) {
      const o = obj.o;
      if (obj.decorativo || !(MODELOS_DE_CASA as readonly string[]).includes(o.modelo)) continue;
      if ('apagada' in o && o.apagada) continue;
      const { x0, y0, x1, y1 } = obj.pegada;
      const d = Math.hypot((x0 + x1) / 2 - p.x, (y0 + y1) / 2 - p.y);
      if (d < menor) {
        menor = d;
        melhor = obj;
      }
    }
    if (!melhor) return null;
    const apagada = { ...(melhor.o as ObjetoRua), apagada: true };
    const assado = this.assar(apagada);
    melhor.o = apagada;
    melhor.base.setTexture(`${assado.chave}:base`);
    melhor.brilho?.setVisible(false);
    const { x0, y0, x1, y1 } = melhor.pegada;
    const folga = 1;
    this.definirLuzes(
      this.luzes.filter(
        (l) =>
          l.tipo !== 'janela' ||
          l.x < x0 - folga ||
          l.x > x1 + folga ||
          l.y < y0 - folga ||
          l.y > y1 + folga,
      ),
    );
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  }

  /** Só tela: apaga as `quantas` luzes de poste mais perto de `p` (a até `raio` tiles). */
  apagarPostesPerto(p: V2, quantas: number, raio: number): number {
    const postes = this.luzes
      .filter((l) => l.tipo === 'poste' && Math.hypot(l.x - p.x, l.y - p.y) <= raio)
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))
      .slice(0, quantas);
    if (postes.length === 0) return 0;
    this.definirLuzes(this.luzes.filter((l) => !postes.includes(l)));
    // A lâmpada do poste também apaga (o brilho dele fica no objeto).
    for (const obj of this.objetos) {
      if (obj.o.modelo !== 'poste' || !obj.brilho) continue;
      const { x0, y0, x1, y1 } = obj.pegada;
      if (postes.some((l) => l.x >= x0 - 1 && l.x <= x1 + 1 && l.y >= y0 - 1 && l.y <= y1 + 1))
        obj.brilho.setVisible(false);
    }
    return postes.length;
  }

  /** O objeto quebrável levou um golpe: treme um pouco para os lados. */
  tremerObjeto(indice: number): void {
    const obj = this.objetos[indice];
    if (!obj || obj.oculto) return;
    const { tremorPx, tremorMs } = visual.combateNaTela.quebraveis;
    const alvos = obj.brilho ? [obj.base, obj.brilho] : [obj.base];
    this.cena.tweens.killTweensOf(alvos);
    const x0 = obj.base.getData('x0') as number | undefined;
    const x = x0 ?? obj.base.x;
    obj.base.setData('x0', x);
    for (const a of alvos) a.x = x;
    this.cena.tweens.add({
      targets: alvos,
      x: x + tremorPx,
      duration: tremorMs / 2,
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        for (const a of alvos) a.x = x;
      },
    });
  }

  /** O objeto quebrou: some de vez (o recorte da câmera não o mostra de novo). */
  ocultarObjeto(indice: number): void {
    const obj = this.objetos[indice];
    if (!obj) return;
    obj.oculto = true;
    obj.base.setVisible(false);
    obj.brilho?.setVisible(false);
    this.esquecerSombras(obj.pegada);
  }

  /** O objeto voltou para a rua (a Casa Desperta deitou de novo no lote). */
  mostrarObjeto(indice: number): void {
    const obj = this.objetos[indice];
    if (!obj) return;
    obj.oculto = false;
    obj.base.setVisible(true);
    obj.brilho?.setVisible(true);
    this.esquecerSombras(obj.pegada);
  }

  /** Mostra de novo os objetos de um grupo (a aldrava da casa rearmada no modo dev). */
  mostrarGrupo(grupo: string): void {
    for (const obj of this.objetos) {
      if (obj.o.grupo !== grupo) continue;
      obj.oculto = false;
      obj.base.setVisible(true);
      obj.brilho?.setVisible(true);
    }
    this.esquecerSombras();
  }

  /** Esconde os objetos de um grupo (a grade do portão quando ele abre). */
  ocultarGrupo(grupo: string): void {
    for (const obj of this.objetos) {
      if (obj.o.grupo !== grupo) continue;
      obj.oculto = true;
      obj.base.setVisible(false);
      obj.brilho?.setVisible(false);
    }
  }

  /** Pisca os Postes Corrompidos sem sorteio e refaz a escuridão na área da câmera. */
  atualizar(tempo: number, preparando = false): void {
    this.preparandoAgora = preparando;
    const cfg = visual.combateNaTela.claraoPoste;
    this.trabalho.iniciar(
      preparando ? visual.desempenho.trabalhoNaPreparacaoMs : visual.desempenho.trabalhoPorQuadroMs,
    );
    const restante = Math.max(0, this.claraoAte - this.cena.time.now) / (cfg.duracaoS * 1000);
    this.escuridao?.setAlpha(visual.luzNaTela.escuridao.opacidade * (1 - cfg.forca * restante));
    this.recortar();
    for (const c of this.corrompidos) {
      const alfa = this.piscar(tempo, c.fase);
      c.brilho?.setAlpha(alfa);
      c.halo.setAlpha(alfa);
    }
    this.redesenharEscuridao();
    this.processarPose();
  }

  /**
   * Os objetos à vista agora (o recorte da câmera já os mostrou), com o índice para `trocarObjeto`:
   * a vida no cenário escolhe aqui as casas de fundo que acendem e apagam e os muros dos gatos.
   */
  objetosAVista(
    modelos: ReadonlySet<string>,
    soDecorativos = false,
  ): { indice: number; o: ObjetoRua }[] {
    const saida: { indice: number; o: ObjetoRua }[] = [];
    this.objetos.forEach((obj, indice) => {
      if (!obj.base.visible || obj.oculto || !modelos.has(obj.o.modelo)) return;
      if (soDecorativos && !obj.decorativo) return;
      saida.push({ indice, o: obj.o as ObjetoRua });
    });
    return saida;
  }

  /** Este objeto (com este desenho) já foi assado? Trocar para ele não custa um quadro. */
  jaAssado(o: ObjetoRua): boolean {
    return this.cena.registry.has(`${chaveDeTextura(o)}:assado`);
  }

  /** A luz roxa apaga e a escuridão cede por um segundo, sem mudar a regra da luz. */
  clarearAposPoste(): void {
    this.claraoAte = this.cena.time.now + visual.combateNaTela.claraoPoste.duracaoS * 1000;
  }

  get opacidadeEscuridao(): number {
    return this.escuridao?.alpha ?? 0;
  }

  /**
   * Recorte da câmera: só ficam visíveis os objetos cuja imagem cruza a vista (com folga). A cidade
   * em volta tem milhares de imagens; desenhar só as da tela mantém os 60 quadros por segundo.
   */
  private recortar(): void {
    const cam = this.cena.cameras.main;
    const v = cam.worldView;
    const u = this.ultimoRecorte;
    if (
      u &&
      u.zoom === cam.zoom &&
      u.largura === v.width &&
      u.altura === v.height &&
      !this.chaoPendente &&
      Math.abs(u.x - v.x) < PASSO_DO_RECORTE_PX &&
      Math.abs(u.y - v.y) < PASSO_DO_RECORTE_PX
    )
      return;
    this.ultimoRecorte = { x: v.x, y: v.y, zoom: cam.zoom, largura: v.width, altura: v.height };
    this.atualizarChao(v);
    const f = FOLGA_DO_RECORTE_PX + PASSO_DO_RECORTE_PX;
    const x0 = v.x - f;
    const y0 = v.y - f;
    const x1 = v.x + v.width + f;
    const y1 = v.y + v.height + f;
    for (const obj of this.objetos) {
      if (obj.oculto) continue;
      const b = obj.base;
      const visivel =
        b.x < x1 && b.y < y1 && b.x + b.width * b.scaleX > x0 && b.y + b.height * b.scaleY > y0;
      if (b.visible !== visivel) {
        b.setVisible(visivel);
        obj.brilho?.setVisible(visivel);
      }
    }
  }

  private piscar(tempo: number, fase: number): number {
    const { periodoPiscaMs, alfaMinimo } = visual.luzNaTela.posteCorrompido;
    const t = tempo / periodoPiscaMs + fase;
    const aceso = Math.sin(t * Math.PI * 2) > -0.6 && Math.sin(t * Math.PI * 5.4 + fase) > -0.85;
    return aceso ? 1 : alfaMinimo;
  }

  /** Halos roxos dos Postes Corrompidos que ainda estão de pé (os que são inimigos). */
  desenharHalosCorrompidos(postes: { pos: V2; indice: number }[], tempo: number): void {
    const g = (this.halosDinamicos ??= this.cena.add
      .graphics()
      .setDepth(PROFUNDIDADE.halosCorrompidos));
    g.clear();
    if (!this.noiteAtiva) return;
    const { ladosPoligono, posteCorrompido } = visual.luzNaTela;
    for (const p of postes) {
      const alfa = this.piscar(tempo, p.indice * DEFASAGEM_PISCA);
      const pts = noChao(
        poligonoDeLuz(p.pos.x, p.pos.y, luz.posteCorrompido.raio, ladosPoligono),
        this.iso,
      );
      g.fillStyle(
        corNumerica(visual.acentos.magia),
        posteCorrompido.opacidadeHalo * alfa,
      ).fillPoints(
        pts.map((q) => new Phaser.Math.Vector2(q.x, q.y)),
        true,
      );
    }
  }

  /**
   * Casas, árvores, prédios e o pórtico ficam transparentes quando alguém importante (o jogador,
   * inimigos) está atrás deles na tela, para a ação nunca sumir atrás do cenário. Só os visíveis
   * contam (o recorte da câmera já esconde o resto).
   */
  atualizarOclusao(pontos: { tela: Vec2; profundidade: number }[], dtS: number): void {
    for (const obj of this.oclusores) {
      const b = obj.base;
      if (!b.visible && obj.alfa === 1) continue;
      const x0 = b.x;
      const y0 = b.y;
      const x1 = x0 + b.width * b.scaleX;
      const y1 = y0 + b.height * b.scaleY;
      const atras = pontos.some(
        (p) =>
          p.profundidade < obj.profundidade &&
          p.tela.x > x0 + 4 &&
          p.tela.x < x1 - 4 &&
          p.tela.y > y0 + 4 &&
          p.tela.y < y1,
      );
      const alvo = atras ? ALFA_OCLUSAO : 1;
      const k = 1 - Math.exp(-10 * dtS);
      obj.alfa += (alvo - obj.alfa) * k;
      b.setAlpha(obj.alfa);
      obj.brilho?.setAlpha(obj.alfa);
    }
  }

  /**
   * Um modelo que anda, com quatro rotações reaproveitadas. A fantasia prepara as poses essenciais;
   * inimigos e figurantes pedem poses ao Worker conforme precisam, usando um desenho pronto até lá.
   */
  prepararModelo(modelo: Figurante['modelo']): void {
    for (const rot of ROTACOES) this.assar({ modelo, x: 0, y: 0, rot });
  }

  criarFigura(
    modelo: Figurante['modelo'],
    matiz = 0,
    prepararPoses: Rotacao | null = null,
  ): FiguraMovel {
    const assados = ROTACOES.map((rot) =>
      this.assar({ modelo, x: 0, y: 0, rot, ...(matiz ? { matiz } : {}) }),
    );
    const animado = esqueletoDaMalha(visual.malhas, modelo).length > 0;
    // As malhas viram aos poucos (guinadas entre as 4 rotações); as poses e as guinadas são
    // assadas conforme aparecem, dentro do orçamento de cada quadro (a sombra é a da parada).
    const gira = temMalha(modelo);
    const naVista =
      animado || gira
        ? (rot: Rotacao, guinada: number, pose: PoseDaMalha) =>
            this.assarPose(
              {
                modelo,
                x: 0,
                y: 0,
                rot,
                ...(animado ? { pose } : {}),
                ...(guinada ? { guinada } : {}),
                ...(matiz ? { matiz } : {}),
              },
              assados[ROTACOES.indexOf(rot)]!,
            )
        : null;
    if (animado && prepararPoses !== null) {
      for (const pose of posesDoCorpo(visual.malhas.degrausDoPasso)) {
        if (Math.abs(pose.passo) !== 1 || pose.golpe) continue;
        const rot = prepararPoses;
        const o: FiguranteNaPose = { modelo, x: 0, y: 0, rot, pose, ...(matiz ? { matiz } : {}) };
        const chave = chaveDeTextura(o);
        if (!this.cena.registry.has(`${chave}:assado`))
          this.enfileirarPose(o, assados[ROTACOES.indexOf(rot)]!);
      }
    }
    return new FiguraMovel(
      naVista,
      gira ? this.qualidade.direcoesMalha : 4,
      this.cena,
      this.iso,
      assados,
      () => this.noiteAtiva,
      (pos, alturaPx) => this.sombrasDaFigura(pos, alturaPx),
      this.texturaDeSombraDeFigura(),
    );
  }

  /**
   * As sombras de um personagem de `alturaPx` em `pos`, uma por luz que chega nele (as mais
   * fortes): para longe de cada luz, mais compridas quanto mais longe e mais baixa ela está.
   */
  private sombrasDaFigura(pos: V2, alturaPx: number): SombraDeLuz[] {
    if (!this.noiteAtiva || this.qualidade.sombrasPorFigura === 0) return [];
    const cfg = visual.luzNaTela;
    const s = cfg.sombras;
    const alturas = {
      postePx: cfg.lampada.alturaPx,
      janelaPx: s.alturaJanelaPx,
      pulsoPx: s.alturaPulsoPx,
      andarPx: visual.alturaAndarPx,
    };
    return [
      ...this.indiceLuzes.luzesNoPonto(pos.x, pos.y, s.minimo),
      ...this.indiceCenario.luzesNoPonto(pos.x, pos.y, s.minimo),
    ]
      .sort((a, b) => b.forca - a.forca)
      .flatMap(({ luz: l, forca }) => {
        const dx = pos.x - l.x;
        const dy = pos.y - l.y;
        const d = Math.hypot(dx, dy);
        // A luz que está em cima dele (o pulso da própria lanterna) não tem para onde jogar sombra.
        if (d < s.larguraFigura / 2) return [];
        const H = alturaDaLuz(l, alturas);
        const comprimento =
          alturaPx < H
            ? Math.min(s.comprimentoMaxFigura, (d * alturaPx) / (H - alturaPx))
            : s.comprimentoMaxFigura;
        return [{ dx: dx / d, dy: dy / d, comprimento, forca }];
      })
      .slice(0, this.qualidade.sombrasPorFigura);
  }

  /**
   * Aura no chão de quem tem brilho próprio (só de noite): elipse clara em volta dos pés, por cima
   * da escuridão. Devolve a imagem para a vista mover junto.
   */
  criarAura(raio: number): Phaser.GameObjects.Image {
    const b = this.texturaDeBrilho(raio);
    return this.cena.add
      .image(0, 0, b.chave)
      .setScale(1, 0.5)
      .setTint(corNumerica(visual.paleta.luz))
      .setDepth(PROFUNDIDADE.halosCorrompidos)
      .setVisible(false);
  }

  /** Sombra de personagem: elipse escura no pé, sumindo até a ponta (origem no pé). */
  private texturaDeSombraDeFigura(): string {
    const chave = 'sombraDeFigura';
    if (this.cena.textures.exists(chave)) return chave;
    const canvas = document.createElement('canvas');
    canvas.width = LADO_DA_SOMBRA_DE_FIGURA * 2;
    canvas.height = LADO_DA_SOMBRA_DE_FIGURA;
    const ctx = canvas.getContext('2d')!;
    const l = LADO_DA_SOMBRA_DE_FIGURA;
    ctx.translate(l, l / 2);
    ctx.scale(1, 0.5);
    const g = ctx.createRadialGradient(-l * 0.75, 0, 0, -l * 0.75, 0, l * 1.75);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.75)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, l, l, 0, 0, Math.PI * 2);
    ctx.fill();
    this.cena.textures.addCanvas(chave, canvas);
    return chave;
  }

  /** Retângulo de tela do mundo; numa rua montada à mão, é o limite da câmera. */
  limitesDaCamera(): Limites {
    const f = visual.camera.folgaDoMapaTiles;
    return this.temMundo
      ? this.limites
      : this.limitesDe({ x0: -f, y0: -f, x1: this.rua.largura + f, y1: this.rua.profundidade + f });
  }

  /**
   * Centraliza a câmera no ponto de tela pedido. Com cidade em volta, o ponto é preso para a vista
   * inteira cair dentro do mundo (a câmera nunca mostra o vazio, nem nos cantos do losango); numa
   * rua montada à mão, quem limita são os `setBounds` da cena.
   */
  enquadrar(camera: Phaser.Cameras.Scene2D.Camera, centro: Vec2): void {
    const c = this.temMundo
      ? prenderNoMundo(
          centro,
          camera.width / 2 / camera.zoom,
          camera.height / 2 / camera.zoom,
          this.mundo,
          this.iso,
        )
      : centro;
    camera.centerOn(c.x, c.y);
  }

  private limitesDe(r: Retangulo): Limites {
    const cantos = noChao(
      [
        { x: r.x0, y: r.y0 },
        { x: r.x1, y: r.y0 },
        { x: r.x0, y: r.y1 },
        { x: r.x1, y: r.y1 },
      ],
      this.iso,
    );
    return {
      x0: Math.floor(Math.min(...cantos.map((c) => c.x))),
      x1: Math.ceil(Math.max(...cantos.map((c) => c.x))),
      y0: Math.floor(Math.min(...cantos.map((c) => c.y))),
      y1: Math.ceil(Math.max(...cantos.map((c) => c.y))),
    };
  }

  private adicionarCanvas(chave: string, canvas: HTMLCanvasElement): string {
    const { textures } = this.cena;
    if (textures.exists(chave)) textures.remove(chave);
    textures.addCanvas(chave, canvas);
    return chave;
  }

  private sombrasDe(inst: Instancia): Vec2[][] {
    const { direcao, tilesPorPx } = visual.sombraProjetada;
    return sombrasDasPartes(inst.partes, { x: direcao[0], y: direcao[1] }, tilesPorPx).map((s) =>
      noChao(s, this.iso),
    );
  }

  /** Chão em blocos: zonas de piso da rua (pista, calçada, praça...) e as sombras de tudo. */
  private criarChao(itens: { inst: Instancia }[]): void {
    const cores = visual.paleta.piso;
    const piso: CamadaDePiso[] = (this.rua.piso ?? []).map((z) => ({
      cor: cores[z.tipo],
      pts: noChao(
        [
          { x: z.x0, y: z.y0 },
          { x: z.x1, y: z.y0 },
          { x: z.x1, y: z.y1 },
          { x: z.x0, y: z.y1 },
        ],
        this.iso,
      ),
    }));
    // O mapa é grande: os blocos são assados só quando a câmera chega perto (`atualizarChao`).
    this.prepararDia = () =>
      prepararChao(
        piso,
        itens.flatMap(({ inst }) => this.sombrasDe(inst)),
        visual.paleta.sombra,
      );
    this.chaoDeNoite = prepararChao(piso, [], visual.paleta.sombra);
    this.descartarChao();
  }

  /** Joga fora os blocos assados do chão (trocou entre dia e noite). */
  private descartarChao(): void {
    for (const img of this.blocosDoChao.values()) {
      if (!img) continue;
      const textura = img.texture.key;
      img.destroy();
      if (this.cena.textures.exists(textura)) this.cena.textures.remove(textura);
      this.texturasLocais.delete(textura);
    }
    this.blocosDoChao.clear();
  }

  /** Assa os blocos do chão em volta da vista e descarta os que ficaram longe. */
  private atualizarChao(v: Phaser.Geom.Rectangle): void {
    this.chaoPendente = false;
    if (this.chaoNoturno !== this.noiteAtiva) {
      this.descartarChao();
      this.chaoNoturno = this.noiteAtiva;
    }
    if (!this.noiteAtiva && !this.chaoDeDia && this.prepararDia) {
      this.chaoDeDia = this.prepararDia();
      this.prepararDia = null;
    }
    const chao = this.noiteAtiva ? this.chaoDeNoite : this.chaoDeDia;
    if (!chao) return;
    const B = BLOCO_DO_CHAO;
    const l = this.limites;
    const i0 = Math.floor((v.x - l.x0) / B) - BLOCOS_DE_FOLGA;
    const i1 = Math.floor((v.x + v.width - l.x0) / B) + BLOCOS_DE_FOLGA;
    const j0 = Math.floor((v.y - l.y0) / B) - BLOCOS_DE_FOLGA;
    const j1 = Math.floor((v.y + v.height - l.y0) / B) + BLOCOS_DE_FOLGA;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const chave = `${i},${j}`;
        if (this.blocosDoChao.has(chave)) continue;
        const x = l.x0 + i * B;
        const y = l.y0 + j * B;
        if (x > l.x1 || y > l.y1 || x + B < l.x0 || y + B < l.y0) {
          this.blocosDoChao.set(chave, null);
          continue;
        }
        if (!this.trabalho.reservar()) {
          this.chaoPendente = true;
          continue;
        }
        const canvas = assarBlocoDeChao({ x0: x, y0: y, x1: x + B, y1: y + B }, chao);
        if (!canvas) {
          this.blocosDoChao.set(chave, null);
          continue;
        }
        const textura = this.adicionarCanvas(`chao:${this.rua.id}:${chave}`, canvas);
        this.texturasLocais.add(textura);
        this.blocosDoChao.set(
          chave,
          this.cena.add.image(x, y, textura).setOrigin(0).setDepth(PROFUNDIDADE.sombras),
        );
      }
    }
    for (const [chave, img] of this.blocosDoChao) {
      const [i, j] = chave.split(',').map(Number) as [number, number];
      if (
        i >= i0 - BLOCOS_GUARDADOS &&
        i <= i1 + BLOCOS_GUARDADOS &&
        j >= j0 - BLOCOS_GUARDADOS &&
        j <= j1 + BLOCOS_GUARDADOS
      )
        continue;
      if (img) {
        const textura = img.texture.key;
        img.destroy();
        if (this.cena.textures.exists(textura)) this.cena.textures.remove(textura);
        this.texturasLocais.delete(textura);
      }
      this.blocosDoChao.delete(chave);
    }
  }

  /** Troca o desenho de um objeto da rua (o poste religado acende). */
  trocarObjeto(indice: number, novo: ObjetoRua): void {
    const obj = this.objetos[indice];
    if (!obj) return;
    const assado = this.assar(novo);
    obj.o = novo;
    obj.partes = instanciar(
      modeloDe(novo, { iso: this.iso, visual }),
      novo.x,
      novo.y,
      novo.rot,
    ).partes;
    this.esquecerSombras(obj.pegada);
    obj.base.setTexture(`${assado.chave}:base`);
    if (assado.temBrilho) {
      if (obj.brilho) obj.brilho.setTexture(`${assado.chave}:brilho`);
      else
        obj.brilho = this.cena.add
          .image(obj.base.x, obj.base.y, `${assado.chave}:brilho`)
          .setOrigin(0)
          .setScale(1 / RESOLUCAO)
          .setDepth(obj.profundidade + DEPOIS_DO_OBJETO)
          .setVisible(obj.base.visible);
    } else obj.brilho?.setVisible(false);
  }

  private criarLuzesNoChao(): void {
    const { ladosPoligono, posteCorrompido } = visual.luzNaTela;
    const { iso } = this;
    // A escuridão cobre só a tela (com folga para o zoom mínimo) e anda com a câmera.
    const largura = 1;
    const altura = 1;
    this.escuridao = this.cena.add
      .renderTexture(0, 0, largura, altura)
      .setOrigin(0)
      .setAlpha(visual.luzNaTela.escuridao.opacidade)
      .setDepth(PROFUNDIDADE.escuridao);
    this.ar = this.cena.add
      .renderTexture(0, 0, largura, altura)
      .setOrigin(0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(PROFUNDIDADE.ar);
    this.ajustarTamanhoLuz();
    this.redesenharPocas();

    this.luzes
      .filter((l) => l.tipo === 'posteCorrompido')
      .forEach((l, i) => {
        const halo = this.cena.add
          .graphics()
          .fillStyle(corNumerica(visual.acentos.magia), posteCorrompido.opacidadeHalo)
          .fillPoints(
            noChao(poligonoDeLuz(l.x, l.y, l.raio, ladosPoligono), iso).map(
              (p) => new Phaser.Math.Vector2(p.x, p.y),
            ),
            true,
          )
          .setDepth(PROFUNDIDADE.halosCorrompidos);
        this.corrompidos.push({ brilho: null, halo, fase: i * DEFASAGEM_PISCA });
      });
  }

  /** As luzes mudaram: a escuridão e as poças (com os brilhos das lâmpadas) são refeitas. */
  private redesenharPocas(): void {
    this.vistaDaEscuridao = '';
    this.ultimoRecorte = null;
  }

  /**
   * Textura no chão (a elipse 2:1 de um círculo de `raio` tiles), com o alfa dado pela distância ao
   * centro em raios, até onde a luz chega na tela (`alem` raios depois da regra).
   */
  private texturaNoChao(prefixo: string, raio: number, alfa: (d: number) => number): TexturaDeLuz {
    const chave = `${prefixo}:${raio.toFixed(2)}`;
    const alcance = raio * (1 + visual.luzNaTela.queda.alem);
    const meiaLargura = Math.ceil(alcance * Math.SQRT2 * this.iso.meioTileX) + 1;
    const meiaAltura = Math.ceil(alcance * Math.SQRT2 * this.iso.meioTileY) + 1;
    const largura = meiaLargura * 2;
    const altura = meiaAltura * 2;
    if (!this.cena.textures.exists(chave)) {
      const canvas = document.createElement('canvas');
      canvas.width = largura;
      canvas.height = altura;
      const ctx = canvas.getContext('2d')!;
      const img = ctx.createImageData(largura, altura);
      for (let py = 0; py < altura; py++) {
        for (let px = 0; px < largura; px++) {
          const d = distanciaNaTela(px + 0.5 - meiaLargura, py + 0.5 - meiaAltura, raio, this.iso);
          const k = (py * largura + px) * 4;
          img.data[k] = 255;
          img.data[k + 1] = 255;
          img.data[k + 2] = 255;
          img.data[k + 3] = Math.round(255 * alfa(d));
        }
      }
      ctx.putImageData(img, 0, 0);
      this.cena.textures.addCanvas(chave, canvas);
    }
    return { chave, x0: -meiaLargura, y0: -meiaAltura, largura, altura };
  }

  /** Carimbo que apaga a escuridão: cheio no centro, com a queda suave até sumir. */
  private texturaDeLuz(raio: number): TexturaDeLuz {
    const queda = visual.luzNaTela.queda;
    return this.texturaNoChao('luz', raio, (d) => quedaDaLuz(d, queda));
  }

  /** Poça somada ao chão: forte no pé da luz e sumindo até a borda. */
  private texturaDePoca(raio: number): TexturaDeLuz {
    const queda = visual.luzNaTela.queda;
    return this.texturaNoChao('poca', raio, (d) => pocaDaLuz(d, queda));
  }

  /**
   * Textura no chão de um feixe (janela, abóbora da porta), com o pé da abertura na origem: o alfa
   * de cada pixel vem da intensidade do feixe no ponto do chão embaixo dele. `poca` desenha a cor
   * somada, mais forte perto da abertura; sem ela, o carimbo que apaga a escuridão.
   */
  private texturaDoFeixe(f: Feixe, poca: boolean): TexturaDeLuz {
    const cf = visual.luzNaTela.feixe;
    const n = (v: number) => v.toFixed(2);
    const chave = [
      poca ? 'feixePoca' : 'feixe',
      n(f.nx),
      n(f.ny),
      n(f.largura),
      f.andar,
      n(f.inicio),
      n(f.comprimento),
      n(f.abertura),
    ].join(':');
    const { meioTileX: mx, meioTileY: my } = this.iso;
    // Caixa do feixe no chão (do pouco antes do começo até o fim com a queda), levada à tela.
    const a0 = f.inicio - cf.suaveInicio;
    const a1 = (f.inicio + f.comprimento) * (1 + cf.queda.alem);
    const cantos: Vec2[] = [{ x: 0, y: 0 }];
    for (const a of [a0, a1]) {
      const meia = (f.largura / 2 + Math.max(0, a) * f.abertura) * (1 + cf.queda.alem);
      for (const s of [-1, 1])
        cantos.push({ x: f.nx * a - f.ny * meia * s, y: f.ny * a + f.nx * meia * s });
    }
    const tela = cantos.map((p) => ({ x: (p.x - p.y) * mx, y: (p.x + p.y) * my }));
    const tx0 = Math.floor(Math.min(...tela.map((p) => p.x))) - 1;
    const ty0 = Math.floor(Math.min(...tela.map((p) => p.y))) - 1;
    const largura = Math.ceil(Math.max(...tela.map((p) => p.x))) + 1 - tx0;
    const altura = Math.ceil(Math.max(...tela.map((p) => p.y))) + 1 - ty0;
    if (!this.cena.textures.exists(chave)) {
      const canvas = document.createElement('canvas');
      canvas.width = largura;
      canvas.height = altura;
      const ctx = canvas.getContext('2d')!;
      const img = ctx.createImageData(largura, altura);
      for (let py = 0; py < altura; py++) {
        for (let px = 0; px < largura; px++) {
          const sx = (tx0 + px + 0.5) / mx;
          const sy = (ty0 + py + 0.5) / my;
          const dx = (sx + sy) / 2;
          const dy = (sy - sx) / 2;
          let alfa = intensidadeDoFeixe(f, dx, dy, cf);
          // A cor somada fica mais forte junto da abertura e se espalha mais fraca no fim.
          if (poca && alfa > 0) alfa *= 1 - Math.max(0, Math.min(1, posicaoNoFeixe(f, dx, dy).ao));
          const k = (py * largura + px) * 4;
          img.data[k] = 255;
          img.data[k + 1] = 255;
          img.data[k + 2] = 255;
          img.data[k + 3] = Math.round(255 * alfa);
        }
      }
      ctx.putImageData(img, 0, 0);
      this.cena.textures.addCanvas(chave, canvas);
    }
    return { chave, x0: tx0, y0: ty0, largura, altura };
  }

  /** Um objeto mudou: os carimbos de luz recortados pelas sombras são refeitos quando aparecerem. */
  private esquecerSombras(area?: Pegada): void {
    for (const [chave, t] of this.luzesComSombra) {
      const a = this.areasDasSombras.get(chave);
      if (area && a && (area.x0 > a.x1 || area.x1 < a.x0 || area.y0 > a.y1 || area.y1 < a.y0))
        continue;
      if (this.texturasLocais.delete(t.chave) && this.cena.textures.exists(t.chave))
        this.cena.textures.remove(t.chave);
      this.luzesComSombra.delete(chave);
      this.areasDasSombras.delete(chave);
    }
    this.vistaDaEscuridao = '';
  }

  /**
   * O carimbo `t` da luz `l` (o que apaga a escuridão ou a poça) com a sombra de cada objeto perto
   * dela recortada: a sombra é onde a luz não chega, projetada a partir da altura da luz, para longe
   * dela. Um objeto entre duas luzes ganha uma sombra de cada uma. O objeto que acende a luz (o
   * poste, a casa da janela) não faz sombra dela. Feito uma vez por luz e guardado.
   */
  private comSombras(t: TexturaDeLuz, l: LuzNoMundo): TexturaDeLuz {
    if (l.tipo !== 'poste' && l.tipo !== 'janela') return t;
    if (!visual.luzNaTela.sombras.dosObjetos) return t;
    const chave = `${t.chave}@${l.x.toFixed(3)},${l.y.toFixed(3)}`;
    const pronta = this.luzesComSombra.get(chave);
    if (pronta) return pronta;
    // Muitas luzes entram na vista de uma vez (a rua abrindo): umas por quadro, sem travar.
    if (this.orcamentoDeSombras <= 0 || !this.trabalho.reservar()) {
      this.sombrasPendentes = true;
      return t;
    }
    this.orcamentoDeSombras--;
    const cfg = visual.luzNaTela;
    const alcance = alcanceDaLuz(l, cfg.queda, cfg.feixe);
    const z = alturaDaLuz(l, {
      postePx: cfg.lampada.alturaPx,
      janelaPx: cfg.sombras.alturaJanelaPx,
      pulsoPx: cfg.sombras.alturaPulsoPx,
      andarPx: visual.alturaAndarPx,
    });
    const area = { x0: l.x - alcance, y0: l.y - alcance, x1: l.x + alcance, y1: l.y + alcance };
    this.areasDasSombras.set(chave, area);
    const perto = this.indiceObjetos.buscar(area).filter((o) => {
      const p = o.pegada;
      if (o.oculto) return false;
      if (p.x1 < l.x - alcance || p.x0 > l.x + alcance) return false;
      if (p.y1 < l.y - alcance || p.y0 > l.y + alcance) return false;
      // A fonte da luz: o ponto dela fica dentro (poste) ou na parede (janela) da pegada.
      const dx = Math.max(p.x0 - l.x, 0, l.x - p.x1);
      const dy = Math.max(p.y0 - l.y, 0, l.y - p.y1);
      return Math.hypot(dx, dy) > DENTRO_DA_FONTE;
    });
    const sombras = perto.flatMap((o) =>
      sombrasDeLuzPontual(o.partes, { x: l.x, y: l.y, z }, alcance),
    );
    if (sombras.length === 0) {
      this.luzesComSombra.set(chave, t);
      return t;
    }
    const fonte = this.cena.textures.get(t.chave).getSourceImage() as HTMLCanvasElement;
    const canvas = document.createElement('canvas');
    canvas.width = t.largura;
    canvas.height = t.altura;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(fonte, 0, 0);
    // A luz no centro do carimbo: um ponto do chão (tiles) vira px do carimbo.
    const c = paraTela({ x: l.x, y: l.y, z: 0 }, this.iso);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = cfg.sombras.forca;
    if (cfg.sombras.penumbraPx > 0) ctx.filter = `blur(${cfg.sombras.penumbraPx}px)`;
    ctx.fillStyle = '#000000';
    // Um caminho só: as sombras que se cruzam não apagam a luz duas vezes.
    ctx.beginPath();
    for (const sombra of sombras) {
      sombra.forEach((q, i) => {
        const p = paraTela({ x: q.x, y: q.y, z: 0 }, this.iso);
        const x = p.x - c.x - t.x0;
        const y = p.y - c.y - t.y0;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
    ctx.fill('nonzero');
    const nova = { ...t, chave };
    if (this.cena.textures.exists(chave)) this.cena.textures.remove(chave);
    this.cena.textures.addCanvas(chave, canvas);
    this.texturasLocais.add(chave);
    this.luzesComSombra.set(chave, nova);
    return nova;
  }

  /**
   * Cone de luz de um poste: um trapézio da lâmpada (estreito, `alturaPx` acima do chão) até o
   * chão (largo), forte em cima e sumindo embaixo e nas laterais. O ponto do chão fica no meio
   * da base (x0, y0 levam o canto da textura até lá).
   */
  private texturaDoCone(alturaPx: number): TexturaDeLuz {
    const { larguraTopo, larguraBase } = visual.luzNaTela.cone;
    const topo = larguraTopo * this.iso.meioTileX;
    const base = larguraBase * this.iso.meioTileX;
    const largura = Math.ceil(base * 2) + 2;
    const altura = Math.ceil(alturaPx) + 2;
    const chave = `cone:${largura}:${altura}:${topo.toFixed(1)}`;
    if (!this.cena.textures.exists(chave)) {
      const canvas = document.createElement('canvas');
      canvas.width = largura;
      canvas.height = altura;
      const ctx = canvas.getContext('2d')!;
      const meio = largura / 2;
      // Forma: trapézio; cor: degradê de cima (forte) para baixo (fraco).
      const vertical = ctx.createLinearGradient(0, 0, 0, altura);
      vertical.addColorStop(0, 'rgba(255,255,255,1)');
      vertical.addColorStop(0.55, 'rgba(255,255,255,0.45)');
      vertical.addColorStop(1, 'rgba(255,255,255,0.05)');
      ctx.fillStyle = vertical;
      ctx.beginPath();
      ctx.moveTo(meio - topo, 0);
      ctx.lineTo(meio + topo, 0);
      ctx.lineTo(meio + base, altura);
      ctx.lineTo(meio - base, altura);
      ctx.closePath();
      ctx.fill();
      // As laterais somem: o miolo do cone é mais claro que a borda.
      const lados = ctx.createLinearGradient(0, 0, largura, 0);
      lados.addColorStop(0, 'rgba(0,0,0,1)');
      lados.addColorStop(0.5, 'rgba(0,0,0,0)');
      lados.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = lados;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(0, 0, largura, altura);
      this.cena.textures.addCanvas(chave, canvas);
    }
    return { chave, x0: -largura / 2, y0: -altura, largura, altura };
  }

  /** Brilho redondo no ar (não é chão, então não achata), forte no centro. */
  private texturaDeBrilho(raio: number): TexturaDeLuz {
    const chave = `brilho:${raio.toFixed(2)}`;
    const r = Math.ceil(raio * this.iso.meioTileX) + 1;
    if (!this.cena.textures.exists(chave)) {
      const canvas = document.createElement('canvas');
      canvas.width = r * 2;
      canvas.height = r * 2;
      const ctx = canvas.getContext('2d')!;
      const g = ctx.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, r * 2, r * 2);
      this.cena.textures.addCanvas(chave, canvas);
    }
    return { chave, x0: -r, y0: -r, largura: r * 2, altura: r * 2 };
  }

  private ajustarTamanhoLuz(): void {
    const camera = this.cena.cameras.main;
    const zoom = Math.min(camera.zoom, visual.camera.zoomMin);
    const largura = Math.ceil(camera.width / zoom) + 2 * FOLGA_ESCURIDAO_PX;
    const altura = Math.ceil(camera.height / zoom) + 2 * FOLGA_ESCURIDAO_PX;
    if (largura === this.larguraLuz && altura === this.alturaLuz) return;
    this.larguraLuz = largura;
    this.alturaLuz = altura;
    const k = this.qualidade.escalaLuz;
    for (const rt of [this.escuridao, this.ar])
      rt?.resize(Math.ceil(largura * k), Math.ceil(altura * k)).setScale(1 / k);
    this.vistaDaEscuridao = '';
  }

  /** Escuridão na área da câmera: preenche e apaga um carimbo suave por luz que aparece nela. */
  private redesenharEscuridao(): void {
    const rt = this.escuridao;
    if (!rt || !this.noiteAtiva) return;
    this.ajustarTamanhoLuz();
    const k = this.qualidade.escalaLuz;
    const v = this.cena.cameras.main.worldView;
    // Em degraus: só refaz quando a câmera anda um passo (a folga cobre o que falta).
    const x0 =
      Math.floor((v.x - FOLGA_ESCURIDAO_PX) / PASSO_DA_ESCURIDAO_PX) * PASSO_DA_ESCURIDAO_PX;
    const y0 =
      Math.floor((v.y - FOLGA_ESCURIDAO_PX) / PASSO_DA_ESCURIDAO_PX) * PASSO_DA_ESCURIDAO_PX;
    const chave = [x0, y0].join(',');
    if (chave === this.vistaDaEscuridao) return;
    this.vistaDaEscuridao = chave;
    this.orcamentoDeSombras = visual.luzNaTela.sombras.porQuadro;
    this.sombrasPendentes = false;
    rt.setPosition(x0, y0);
    rt.clear();
    const ar = this.ar;
    ar?.setPosition(x0, y0).clear();
    rt.fill(corNumerica(visual.luzNaTela.escuridao.cor), 1);
    const x1 = x0 + this.larguraLuz;
    const y1 = y0 + this.alturaLuz;
    const recortar = (l: LuzNoMundo) => {
      const base = l.feixe ? this.texturaDoFeixe(l.feixe, false) : this.texturaDeLuz(l.raio);
      const c = paraTela({ x: l.x, y: l.y, z: 0 }, this.iso);
      const tx = c.x + base.x0;
      const ty = c.y + base.y0;
      // Só as luzes que tocam a área da escuridão (a sombra tem o tamanho do carimbo).
      if (tx > x1 || ty > y1 || tx + base.largura < x0 || ty + base.altura < y0) return;
      // O `erase` do Phaser põe o MEIO da textura no ponto (o `stamp` usa a origem pedida): com o
      // canto no ponto, o recorte saía meio carimbo para cima e para a esquerda da lâmpada.
      rt.stamp(
        this.comSombras(base, l).chave,
        undefined,
        (tx - x0 + base.largura / 2) * k,
        (ty - y0 + base.altura / 2) * k,
        { scale: k, blendMode: Phaser.BlendModes.ERASE },
      );
    };
    for (const l of this.luzes) if (l.recortaEscuridao) recortar(l);
    for (const l of this.luzesCenario) recortar(l);
    // Poças e brilhos das lâmpadas na mesma camada, depois dos recortes: a cor da luz (fria no
    // poste, morna na janela) por cima da cena, sem uma segunda camada do tamanho da tela.
    for (const l of [...this.luzes, ...this.luzesCenario]) {
      if (!l.recortaEscuridao) continue;
      const tipo = l.tipo === 'poste' || l.tipo === 'janela' ? l.tipo : 'pulso';
      const cfg = visual.luzNaTela.pocas[tipo];
      const base = l.feixe ? this.texturaDoFeixe(l.feixe, true) : this.texturaDePoca(l.raio);
      const c = paraTela({ x: l.x, y: l.y, z: 0 }, this.iso);
      const tx = c.x + base.x0;
      const ty = c.y + base.y0;
      if (tx > x1 || ty > y1 || tx + base.largura < x0 || ty + base.altura < y0) continue;
      rt.stamp(this.comSombras(base, l).chave, undefined, (tx - x0) * k, (ty - y0) * k, {
        scale: k,
        originX: 0,
        originY: 0,
        alpha: cfg.alfa,
        tint: corNumerica(cfg.cor),
      });
      if (tipo !== 'poste') continue;
      // O cone de luz da lâmpada até o chão: o ar da noite iluminado (como na referência).
      const cone = visual.luzNaTela.cone;
      const tc = this.texturaDoCone(visual.luzNaTela.lampada.alturaPx);
      ar?.stamp(tc.chave, undefined, (c.x + tc.x0 - x0) * k, (c.y + tc.y0 - y0) * k, {
        scale: k,
        originX: 0,
        originY: 0,
        alpha: cone.alfa,
        tint: corNumerica(cone.cor),
      });
      // O brilho no ar em volta da lâmpada (fica por baixo do poste, que cobre o miolo dele).
      const lampada = visual.luzNaTela.lampada;
      const b = this.texturaDeBrilho(lampada.raio);
      const topo = paraTela({ x: l.x, y: l.y, z: lampada.alturaPx }, this.iso);
      rt.stamp(b.chave, undefined, (topo.x + b.x0 - x0) * k, (topo.y + b.y0 - y0) * k, {
        scale: k,
        originX: 0,
        originY: 0,
        alpha: lampada.alfa,
        tint: corNumerica(visual.paleta.luz),
      });
    }
    rt.render();
    ar?.render();
    if (this.sombrasPendentes) this.vistaDaEscuridao = '';
  }

  /** A pose pronta, ou um pedido na fila; enquanto aguarda, a figura usa uma pose disponível. */
  private assarPose(o: FiguranteNaPose, parada: Assado): Assado | null {
    const registrado = this.cena.registry.get(`${chaveDeTextura(o)}:assado`) as Assado | undefined;
    if (registrado && this.cena.textures.exists(`${registrado.chave}:base`)) {
      this.usarAssado(registrado);
      return registrado;
    }
    this.enfileirarPose(o, parada);
    return null;
  }

  private enfileirarPose(o: FiguranteNaPose, parada: Assado): void {
    const chave = chaveDeTextura(o);
    if (this.posesEnfileiradas.has(chave)) return;
    this.posesEnfileiradas.add(chave);
    this.posesNaFila.push({ o, parada });
  }

  private processarPose(): void {
    if (this.assador.ocupado || this.posesNaFila.length === 0 || !this.trabalho.reservar()) return;
    const { o, parada } = this.posesNaFila.shift()!;
    const chave = chaveDeTextura(o);
    const registrado = this.cena.registry.get(`${chave}:assado`) as Assado | undefined;
    if (registrado && this.cena.textures.exists(`${chave}:base`)) {
      this.usarAssado(registrado);
      this.posesEnfileiradas.delete(chave);
      return;
    }
    const inst = instanciar(modeloDe(o, { iso: this.iso, visual }), 0, 0, o.rot);
    const polys = poligonosDasPartes(
      ordenarPartes(inst.partes, this.iso),
      this.iso,
      visual.paleta,
      visual.volumes.limiarTopo,
    );
    this.assador.assar(polys, RESOLUCAO, (a) => {
      if (this.encerrado) return;
      this.adicionarCanvas(`${chave}:base`, a.base);
      if (a.emissivo) this.adicionarCanvas(`${chave}:brilho`, a.emissivo);
      const resultado: Assado = {
        chave,
        origem: { x: a.x, y: a.y },
        temBrilho: !!a.emissivo,
        sombra: parada.sombra,
      };
      this.cena.registry.set(`${chave}:assado`, resultado);
      this.usarAssado(resultado);
      this.posesEnfileiradas.delete(chave);
      // Durante o preparo, o próximo trabalho pode começar entre quadros lentos de renderização.
      // Na gameplay a fila volta ao orçamento de cada quadro, com a pose pronta como reserva.
      if (this.preparandoAgora)
        window.setTimeout(() => {
          if (this.encerrado || !this.preparandoAgora) return;
          this.trabalho.iniciar(visual.desempenho.trabalhoNaPreparacaoMs);
          this.processarPose();
        }, 0);
    });
  }

  private usarAssado(a: Assado): void {
    if (this.assadosUsados.has(a.chave)) return;
    this.assadosUsados.add(a.chave);
    cacheDeModelos(this.cena.game).usar(a.chave, this.cena, [
      `${a.chave}:base`,
      ...(a.temBrilho ? [`${a.chave}:brilho`] : []),
      a.sombra.chave,
    ]);
  }

  /** Assa o modelo uma vez por chave (modelo, variante, pose e rotação) e reaproveita a textura. */
  private assar(o: ObjetoRua | FiguranteNaPose, sombraDe?: Assado): Assado {
    const chave = chaveDeTextura(o);
    const registrado = this.cena.registry.get(`${chave}:assado`) as Assado | undefined;
    if (registrado && this.cena.textures.exists(`${chave}:base`)) {
      this.usarAssado(registrado);
      return registrado;
    }

    const resolucao = RESOLUCAO;
    const paleta: PaletaVolumes = visual.paleta;
    const naOrigem = instanciar(modeloDe(o, { iso: this.iso, visual }), 0, 0, o.rot);
    const polys = poligonosDasPartes(
      ordenarPartes(naOrigem.partes, this.iso),
      this.iso,
      paleta,
      visual.volumes.limiarTopo,
    );
    const assado = assarModelo(polys, resolucao);
    this.adicionarCanvas(`${chave}:base`, assado.base);
    if (assado.emissivo) this.adicionarCanvas(`${chave}:brilho`, assado.emissivo);

    const resultado: Assado = {
      chave,
      origem: { x: assado.x, y: assado.y },
      temBrilho: assado.emissivo !== null,
      // A pose do corpo usa a sombra do sol da figura parada (o braço que mexe quase não muda nada).
      sombra: sombraDe?.sombra ?? this.assarSombra(chave, naOrigem),
    };
    this.cena.registry.set(`${chave}:assado`, resultado);
    this.usarAssado(resultado);
    return resultado;
  }

  private assarSombra(chave: string, naOrigem: Instancia): Assado['sombra'] {
    const sombras = this.sombrasDe(naOrigem);
    const limitesSombra = limitesDe(sombras);
    this.adicionarCanvas(
      `${chave}:sombra`,
      assarCamada(sombras, limitesSombra, visual.paleta.sombra.cor),
    );
    return { chave: `${chave}:sombra`, origem: { x: limitesSombra.x0, y: limitesSombra.y0 } };
  }

  private criarObjeto(
    o: ObjetoRua | Figurante,
    inst: Instancia,
    decorativo: boolean,
  ): ObjetoNaCena {
    const assado = this.assar(o);
    const resolucao = RESOLUCAO;
    const deslocamento = paraTela({ x: o.x, y: o.y, z: 0 }, this.iso);
    const x = deslocamento.x + assado.origem.x;
    const y = deslocamento.y + assado.origem.y;
    const { pegada } = inst;
    const profundidade = (pegada.x0 + pegada.x1) / 2 + (pegada.y0 + pegada.y1) / 2;

    const base = this.cena.add
      .image(x, y, `${assado.chave}:base`)
      .setOrigin(0)
      .setScale(1 / resolucao)
      .setDepth(profundidade);
    const brilho = assado.temBrilho
      ? this.cena.add
          .image(x, y, `${assado.chave}:brilho`)
          .setOrigin(0)
          .setScale(1 / resolucao)
          .setDepth(profundidade + DEPOIS_DO_OBJETO)
      : null;

    if (o.modelo === 'poste' && o.estado === 'corrompido') {
      const livre = this.corrompidos.find((c) => c.brilho === null);
      if (livre) livre.brilho = brilho;
    }
    return {
      o,
      base,
      brilho,
      pegada,
      partes: inst.partes,
      luz: this.luminosidade(pegada),
      profundidade,
      alfa: 1,
      decorativo,
      oculto: false,
      tingido: null,
    };
  }

  /** Noite = como no jogo (escuridão com luzes recortadas); sem ela = como a imagem de referência. */
  private aplicarNoite(): void {
    this.escuridao?.setVisible(this.noiteAtiva);
    this.ar?.setVisible(this.noiteAtiva);
    this.halosDinamicos?.setVisible(this.noiteAtiva);
    this.vistaDaEscuridao = '';
    this.ultimoRecorte = null;
    for (const obj of this.objetos) {
      const tint =
        this.noiteAtiva && obj.luz < 1 ? tintNaLuz(obj.luz, visual.luzNaTela.tintNoEscuro) : null;
      if (obj.tingido === tint) continue;
      obj.tingido = tint;
      if (tint === null) obj.base.clearTint();
      else obj.base.setTint(tint);
    }
    this.redesenharEscuridao();
  }
}

/** Pose de um quadro: o corpo sobe (pulo, flutuar), achata (golpe) e pode ficar transparente. */
export interface Pose {
  /** Px para cima. */
  z?: number;
  /** Escala vertical, presa nos pés (1 = normal). */
  sy?: number;
  /** Escala horizontal. */
  sx?: number;
  alfa?: number;
  /** Inclinação do corpo em radianos, em volta dos pés (para onde anda). */
  inclinacao?: number;
  /** Pose do corpo (braços e pernas) de quem tem esqueleto. */
  corpo?: PoseDaMalha;
  /** Guinada (graus) entre as 4 rotações, nas figuras que têm `direcoes` > 4. */
  guinada?: number;
}

/** Uma sombra que uma luz faz de um personagem: direção no chão (para longe dela) e tamanho. */
export interface SombraDeLuz {
  dx: number;
  dy: number;
  /** Tiles do pé até a ponta. */
  comprimento: number;
  /** Quanta luz chega dele por essa luz (a sombra de uma luz fraca é fraca). */
  forca: number;
}

/**
 * Sprite de um modelo que anda: base, brilho e sombra, trocando de textura ao virar. De dia, a
 * sombra do sol; de noite, uma sombra por luz que chega nele.
 */
export class FiguraMovel {
  private readonly base: Phaser.GameObjects.Image;
  private readonly brilho: Phaser.GameObjects.Image;
  private readonly sombra: Phaser.GameObjects.Image;
  private readonly sombrasDaLuz: Phaser.GameObjects.Image[] = [];
  /** Instante (ms do relógio da cena) até quando a figura pisca em branco. */
  private piscaAte = 0;
  private readonly escala = 1 / RESOLUCAO;
  private ultimaTextura = '';

  constructor(
    private naVista: ((rot: Rotacao, guinada: number, pose: PoseDaMalha) => Assado | null) | null,
    /** Quantos desenhos por volta esta figura tem (4: só as rotações; as malhas têm mais). */
    public direcoes: number,
    private readonly cena: Phaser.Scene,
    private readonly iso: Iso,
    private assados: Assado[],
    private readonly noite: () => boolean,
    private readonly sombrasEm: (pos: V2, alturaPx: number) => SombraDeLuz[],
    private readonly texturaDaSombra: string,
  ) {
    const a = assados[0]!;
    // Origem nos pés (meio da base do desenho): escala e inclinação giram em volta deles.
    this.base = cena.add.image(0, 0, `${a.chave}:base`).setOrigin(0.5, 1).setScale(this.escala);
    this.brilho = cena.add
      .image(0, 0, `${a.chave}:${a.temBrilho ? 'brilho' : 'base'}`)
      .setOrigin(0.5, 1)
      .setScale(this.escala)
      .setVisible(a.temBrilho);
    this.sombra = cena.add
      .image(0, 0, a.sombra.chave)
      .setOrigin(0)
      .setAlpha(visual.paleta.sombra.opacidade)
      .setDepth(PROFUNDIDADE.sombrasMoveis);
  }

  /** Troca o desenho (o Poste derrubado vira um poste caído). */
  trocarModelo(outra: FiguraMovel): void {
    this.assados = outra.assados;
    this.naVista = outra.naVista;
    this.direcoes = outra.direcoes;
    outra.destruir();
  }

  /**
   * `centro` é o centro da pegada 1 × 1 do modelo, em tiles; `luz` é quanta luz chega nele (0 a 1),
   * que no escuro mistura o tint do escuro com o branco.
   */
  posicionar(centro: V2, rot: Rotacao, luz: number, pose: Pose = {}): void {
    const parada = this.assados[ROTACOES.indexOf(rot)]!;
    // A pose do corpo e a guinada, se já foram assadas; enquanto não, a mais perto que já existe:
    // a guinada parada, a pose sem guinada ou a parada da rotação.
    const guinada = this.direcoes > 4 ? (pose.guinada ?? 0) : 0;
    const corpo = pose.corpo && !ehPoseParada(pose.corpo) ? pose.corpo : null;
    const v = this.naVista;
    const a =
      (v && (guinada || corpo) && v(rot, guinada, corpo ?? POSE_PARADA)) ||
      (v && guinada && corpo && v(rot, guinada, POSE_PARADA)) ||
      (v && corpo && v(rot, 0, corpo)) ||
      parada;
    const canto = paraTela({ x: centro.x - 0.5, y: centro.y - 0.5, z: 0 }, this.iso);
    const profundidade = centro.x + centro.y;
    const sy = pose.sy ?? 1;
    const sx = pose.sx ?? 1;
    const alfa = pose.alfa ?? 1;
    if (this.ultimaTextura !== a.chave) {
      this.ultimaTextura = a.chave;
      this.base.setTexture(`${a.chave}:base`);
      if (a.temBrilho) this.brilho.setTexture(`${a.chave}:brilho`);
      this.sombra.setTexture(a.sombra.chave);
    }
    // A imagem fica presa nos pés: cresce para cima a partir da base do desenho.
    const altura = this.base.height * this.escala;
    const largura = this.base.width * this.escala;
    const x = canto.x + a.origem.x + largura / 2;
    const y = canto.y + a.origem.y + altura - (pose.z ?? 0);
    const giro = pose.inclinacao ?? 0;
    this.base
      .setPosition(x, y)
      .setScale(this.escala * sx, this.escala * sy)
      .setRotation(giro)
      .setAlpha(alfa)
      .setDepth(profundidade);
    if (a.temBrilho) {
      this.brilho
        .setPosition(x, y)
        .setScale(this.escala * sx, this.escala * sy)
        .setRotation(giro)
        .setAlpha(alfa)
        .setDepth(profundidade + DEPOIS_DO_OBJETO);
    }
    this.brilho.setVisible(a.temBrilho && this.base.visible);
    this.sombra
      .setPosition(canto.x + a.sombra.origem.x, canto.y + a.sombra.origem.y)
      .setAlpha(visual.paleta.sombra.opacidade * alfa);
    this.posicionarSombrasDaLuz(centro, altura, alfa);
    if (this.cena.time.now < this.piscaAte) {
      this.base.setTint(corNumerica(visual.paleta.luz)).setTintMode(Phaser.TintModes.FILL);
    } else {
      this.base.setTintMode(Phaser.TintModes.MULTIPLY);
      if (this.noite() && luz < 1) this.base.setTint(tintNaLuz(luz, visual.luzNaTela.tintNoEscuro));
      else this.base.clearTint();
    }
  }

  /** De noite, a sombra do sol some e cada luz que chega nele joga a sua, para longe dela. */
  private posicionarSombrasDaLuz(centro: V2, alturaPx: number, alfa: number): void {
    const noite = this.noite();
    const sombras = noite ? this.sombrasEm(centro, alturaPx) : [];
    this.sombra.setVisible(!noite && this.base.visible);
    const { meioTileX: mx, meioTileY: my } = this.iso;
    const pe = paraTela({ x: centro.x, y: centro.y, z: 0 }, this.iso);
    const cfg = visual.luzNaTela;
    const lado = LADO_DA_SOMBRA_DE_FIGURA;
    sombras.forEach((s, i) => {
      let img = this.sombrasDaLuz[i];
      if (!img) {
        img = this.cena.add
          .image(0, 0, this.texturaDaSombra)
          .setOrigin(0, 0.5)
          .setDepth(PROFUNDIDADE.sombrasDaLuz);
        this.sombrasDaLuz.push(img);
      }
      // A direção no chão vira um ângulo na tela; a largura vai de lado, também no chão.
      const tx = (s.dx - s.dy) * mx;
      const ty = (s.dx + s.dy) * my;
      const lx = (-s.dy - s.dx) * mx;
      const ly = (-s.dy + s.dx) * my;
      const largura = cfg.sombras.larguraFigura * Math.hypot(lx, ly);
      // O pé fica um pouco para dentro da elipse (o miolo dela fica embaixo do personagem).
      const recuo = largura / 2;
      img
        .setPosition(
          pe.x - (tx / Math.hypot(tx, ty)) * recuo,
          pe.y - (ty / Math.hypot(tx, ty)) * recuo,
        )
        .setRotation(Math.atan2(ty, tx))
        .setScale((s.comprimento * Math.hypot(tx, ty) + recuo) / (lado * 2), largura / lado)
        .setAlpha(s.forca * cfg.sombras.forca * cfg.escuridao.opacidade * alfa)
        .setVisible(this.base.visible);
    });
    for (let i = sombras.length; i < this.sombrasDaLuz.length; i++)
      this.sombrasDaLuz[i]!.setVisible(false);
  }

  /** Ponto da tela no topo da cabeça (para barras e números). */
  get topo(): { x: number; y: number } {
    return { x: this.base.x, y: this.base.y - this.base.height * this.base.scaleY };
  }

  /** Pisca em branco ao levar dano (regra de legibilidade). */
  piscar(): void {
    this.piscaAte = this.cena.time.now + visual.combateNaTela.piscarMs;
  }

  setVisible(visivel: boolean): void {
    this.base.setVisible(visivel);
    this.sombra.setVisible(visivel && !this.noite());
    if (!visivel) {
      this.brilho.setVisible(false);
      for (const s of this.sombrasDaLuz) s.setVisible(false);
    }
  }

  destruir(): void {
    this.base.destroy();
    this.brilho.destroy();
    this.sombra.destroy();
    for (const s of this.sombrasDaLuz) s.destroy();
  }
}
