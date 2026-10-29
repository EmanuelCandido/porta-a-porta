import type * as Phaser from 'phaser';
import type { Piso, TipoDePiso } from '../../sim/content/esquemas';
import type { Retangulo, V2 } from '../../sim/geometria';
import { COR, placa } from './estilo';

export type TipoNoMapa =
  | 'jogador'
  | 'inimigo'
  | 'elite'
  | 'chefe'
  | 'poste'
  | 'posteCaido'
  | 'bau'
  | 'isca'
  | 'campainha'
  | 'segredo'
  | 'posteApagado'
  | 'mirante';

/** A névoa do mapa (vinda da simulação): 1 = célula já revelada. */
export interface NevoaDoMapa {
  colunas: number;
  linhas: number;
  celula: number;
  vista: Uint8Array;
  versao: number;
}

/** O que o mapa precisa saber da rua (a parte fixa muda só quando a `chave` muda). */
export interface DadosMapa {
  chave: string;
  area: Retangulo;
  piso: Piso[];
  /** Casas e outros obstáculos grandes. */
  blocos: Retangulo[];
  quintais: Retangulo[];
  entidades: { x: number; y: number; tipo: TipoNoMapa }[];
  saida: { x0: number; x1: number; y: number; aberta: boolean } | null;
  /** Onde o jogador está (o radar anda com ele). */
  centro: V2;
  nevoa: NevoaDoMapa | null;
}

/** Tons do chão no mapa: os mesmos papéis do chão do jogo, mais contrastados para ler pequeno. */
const TOM_DO_PISO: Partial<Record<TipoDePiso, string>> = {
  calcada: '#6e7079',
  praca: '#777985',
  asfalto: '#2a2b31',
  terra: '#4d4c53',
};
const FUNDO = '#202126';
const QUINTAL = '#4a4f47';
const BLOCO = '#9496a1';
const NEVOA = '#0d0e12';
/** Px por tile no desenho fixo do mapa e na névoa (a névoa é mais grossa e vai ampliada). */
const K_MAPA = 4;
const K_NEVOA = 2;
/** A névoa só sobe para a placa de vídeo a cada tantos ms (ela muda aos poucos). */
const INTERVALO_NEVOA_MS = 250;

/** O desenho da rua compartilhado pelo radar e pelo mapa grande (um por rua). */
interface DesenhoDoMapa {
  chave: string;
  area: Retangulo;
  /** Texturas do mapa fixo e da névoa. */
  fixo: string;
  nevoa: string;
  canvasNevoa: HTMLCanvasElement;
  /** Cópia das células já apagadas da névoa. */
  apagadas: Uint8Array | null;
  versaoNevoa: number;
  ultimaSubida: number;
}

const desenhos = new Map<string, DesenhoDoMapa>();

/** Ponto do mundo no desenho do mapa (projeção isométrica com `k` px por tile). */
function noDesenho(a: Retangulo, k: number, x: number, y: number): [number, number] {
  const P = a.y1 - a.y0;
  return [(x - a.x0 - (y - a.y0) + P) * k, (x - a.x0 + (y - a.y0)) * (k / 2)];
}

function tamanhoDoDesenho(a: Retangulo, k: number): [number, number] {
  const s = a.x1 - a.x0 + (a.y1 - a.y0);
  return [Math.ceil(s * k), Math.ceil((s * k) / 2)];
}

function losango(ctx: CanvasRenderingContext2D, a: Retangulo, k: number, r: Retangulo): void {
  const pts = [
    noDesenho(a, k, r.x0, r.y0),
    noDesenho(a, k, r.x1, r.y0),
    noDesenho(a, k, r.x1, r.y1),
    noDesenho(a, k, r.x0, r.y1),
  ];
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (const [px, py] of pts.slice(1)) ctx.lineTo(px, py);
  ctx.closePath();
  ctx.fill();
}

function desenhoDaRua(cena: Phaser.Scene, d: DadosMapa): DesenhoDoMapa {
  const pronto = desenhos.get(d.chave);
  if (pronto && cena.textures.exists(pronto.fixo)) return pronto;
  const a = d.area;
  // O mapa fixo: fundo, chão das vias e salas, quintais e casas.
  const [w, h] = tamanhoDoDesenho(a, K_MAPA);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = FUNDO;
  losango(ctx, a, K_MAPA, a);
  for (const z of d.piso) {
    const tom = TOM_DO_PISO[z.tipo];
    if (!tom) continue;
    const r = {
      x0: Math.max(a.x0, z.x0),
      y0: Math.max(a.y0, z.y0),
      x1: Math.min(a.x1, z.x1),
      y1: Math.min(a.y1, z.y1),
    };
    if (r.x1 <= r.x0 || r.y1 <= r.y0) continue;
    ctx.fillStyle = tom;
    losango(ctx, a, K_MAPA, r);
  }
  ctx.fillStyle = QUINTAL;
  for (const q of d.quintais) losango(ctx, a, K_MAPA, q);
  ctx.fillStyle = BLOCO;
  for (const b of d.blocos) losango(ctx, a, K_MAPA, b);
  const fixo = `minimapa:fixo:${d.chave}`;
  if (cena.textures.exists(fixo)) cena.textures.remove(fixo);
  cena.textures.addCanvas(fixo, canvas);
  // A névoa: tudo coberto; as células reveladas vão sendo apagadas.
  const [wn, hn] = tamanhoDoDesenho(a, K_NEVOA);
  const canvasNevoa = document.createElement('canvas');
  canvasNevoa.width = wn;
  canvasNevoa.height = hn;
  const cn = canvasNevoa.getContext('2d')!;
  cn.fillStyle = NEVOA;
  cn.fillRect(0, 0, wn, hn);
  const nevoa = `minimapa:nevoa:${d.chave}`;
  if (cena.textures.exists(nevoa)) cena.textures.remove(nevoa);
  cena.textures.addCanvas(nevoa, canvasNevoa);
  for (const [k, anterior] of desenhos)
    if (k !== d.chave) {
      if (cena.textures.exists(anterior.fixo)) cena.textures.remove(anterior.fixo);
      if (cena.textures.exists(anterior.nevoa)) cena.textures.remove(anterior.nevoa);
      desenhos.delete(k);
    }
  const novo: DesenhoDoMapa = {
    chave: d.chave,
    area: a,
    fixo,
    nevoa,
    canvasNevoa,
    apagadas: null,
    versaoNevoa: -1,
    ultimaSubida: -Infinity,
  };
  desenhos.set(d.chave, novo);
  return novo;
}

/** Apaga da névoa as células reveladas desde a última vez (e sobe a textura, sem pressa). */
function atualizarNevoa(
  cena: Phaser.Scene,
  m: DesenhoDoMapa,
  n: NevoaDoMapa | null,
  agora: number,
): void {
  if (m.versaoNevoa === (n?.versao ?? 0) && m.apagadas) return;
  if (m.apagadas && agora - m.ultimaSubida < INTERVALO_NEVOA_MS) return;
  const ctx = m.canvasNevoa.getContext('2d')!;
  if (!n) {
    ctx.clearRect(0, 0, m.canvasNevoa.width, m.canvasNevoa.height);
  } else {
    m.apagadas ??= new Uint8Array(n.vista.length);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#ffffff';
    const folga = 0.15;
    for (let i = 0; i < n.vista.length; i++) {
      if (!n.vista[i] || m.apagadas[i]) continue;
      m.apagadas[i] = 1;
      const col = i % n.colunas;
      const l = Math.floor(i / n.colunas);
      losango(ctx, m.area, K_NEVOA, {
        x0: col * n.celula - folga,
        y0: l * n.celula - folga,
        x1: (col + 1) * n.celula + folga,
        y1: (l + 1) * n.celula + folga,
      });
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  m.versaoNevoa = n?.versao ?? 0;
  m.ultimaSubida = agora;
  (cena.textures.get(m.nevoa) as Phaser.Textures.CanvasTexture).refresh();
}

/**
 * Mapa da rua na orientação da câmera (losango isométrico), para o jogador reconhecer o lugar sem
 * girar a cabeça. No modo `radar` (o do canto), mostra só a vizinhança e anda com o jogador; no
 * modo `completo` (Tab), a rota inteira. A névoa cobre o que o jogador ainda não viu.
 */
export class Minimapa {
  private readonly fundo: Phaser.GameObjects.Graphics;
  private readonly fixo: Phaser.GameObjects.Image;
  private readonly nevoa: Phaser.GameObjects.Image;
  private readonly vivo: Phaser.GameObjects.Graphics;
  private desenho: DesenhoDoMapa | null = null;

  constructor(
    private readonly cena: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    private readonly w: number,
    private readonly h: number,
    private readonly folga = 10,
    alfaPlaca?: number,
    private readonly modo: 'radar' | 'completo' = 'radar',
  ) {
    this.fundo = cena.add.graphics();
    placa(this.fundo, x, y, w, h, alfaPlaca !== undefined ? { alfa: alfaPlaca } : {});
    this.fixo = cena.add.image(x, y, '__DEFAULT').setOrigin(0).setVisible(false);
    this.nevoa = cena.add.image(x, y, '__DEFAULT').setOrigin(0).setVisible(false);
    this.vivo = cena.add.graphics();
  }

  setVisible(v: boolean): void {
    this.fundo.setVisible(v);
    this.fixo.setVisible(v && !!this.desenho);
    this.nevoa.setVisible(v && !!this.desenho);
    this.vivo.setVisible(v);
  }

  setDepth(d: number): void {
    this.fundo.setDepth(d);
    this.fixo.setDepth(d + 0.05);
    this.nevoa.setDepth(d + 0.08);
    this.vivo.setDepth(d + 0.2);
  }

  atualizar(d: DadosMapa, tempo: number): void {
    const m = desenhoDaRua(this.cena, d);
    if (this.desenho !== m) {
      this.desenho = m;
      this.fixo.setTexture(m.fixo).setVisible(this.fundo.visible);
      this.nevoa.setTexture(m.nevoa).setVisible(this.fundo.visible);
    }
    atualizarNevoa(this.cena, m, d.nevoa, tempo);
    const a = d.area;
    const [wM, hM] = tamanhoDoDesenho(a, K_MAPA);
    const W = this.w - 2 * this.folga;
    const H = this.h - 2 * this.folga;
    // Escala e posição: o radar recorta em volta do jogador; o completo mostra tudo.
    let s = 1;
    let X: number;
    let Y: number;
    if (this.modo === 'radar') {
      const [cx, cy] = noDesenho(a, K_MAPA, d.centro.x, d.centro.y);
      const x0 = Math.round(Math.max(0, Math.min(wM - W, cx - W / 2)));
      const y0 = Math.round(Math.max(0, Math.min(hM - H, cy - H / 2)));
      X = this.x + this.folga - x0;
      Y = this.y + this.folga - y0;
      this.fixo.setScale(1).setPosition(X, Y).setCrop(x0, y0, W, H);
      const r = K_MAPA / K_NEVOA;
      this.nevoa
        .setScale(r)
        .setPosition(X, Y)
        .setCrop(x0 / r, y0 / r, W / r, H / r);
    } else {
      s = Math.min(W / wM, H / hM);
      X = this.x + (this.w - wM * s) / 2;
      Y = this.y + (this.h - hM * s) / 2;
      this.fixo.setScale(s).setPosition(X, Y).setCrop();
      this.nevoa
        .setScale((s * K_MAPA) / K_NEVOA)
        .setPosition(X, Y)
        .setCrop();
    }
    const tela = (px: number, py: number): [number, number] => {
      const [mx, my] = noDesenho(a, K_MAPA, px, py);
      return [X + mx * s, Y + my * s];
    };
    const dentroDaPlaca = (px: number, py: number) =>
      px >= this.x + 3 &&
      px <= this.x + this.w - 3 &&
      py >= this.y + 3 &&
      py <= this.y + this.h - 3;

    const g = this.vivo.clear();
    if (d.saida) {
      const [x0, y0] = tela(d.saida.x0, d.saida.y);
      const [x1, y1] = tela(d.saida.x1, d.saida.y);
      if (dentroDaPlaca(x0, y0) && dentroDaPlaca(x1, y1)) {
        g.lineStyle(3, d.saida.aberta ? COR.fantasma : COR.luz, d.saida.aberta ? 1 : 0.7);
        g.beginPath().moveTo(x0, y0).lineTo(x1, y1).strokePath();
      }
    }
    const escala = this.modo === 'radar' ? 1 : Math.max(0.8, s * 1.6);
    const pulso = 0.5 + 0.5 * Math.sin(tempo / 180);
    for (const e of d.entidades) {
      const [px, py] = tela(e.x, e.y);
      if (!dentroDaPlaca(px, py)) continue;
      switch (e.tipo) {
        case 'poste':
        case 'posteCaido': {
          const r = 4 * escala;
          g.fillStyle(e.tipo === 'poste' ? COR.magia : COR.apagado, 1)
            .beginPath()
            .moveTo(px, py - r)
            .lineTo(px + r * 0.7, py)
            .lineTo(px, py + r)
            .lineTo(px - r * 0.7, py)
            .closePath()
            .fillPath();
          break;
        }
        case 'inimigo':
          g.fillStyle(COR.perigo, 1).fillCircle(px, py, 1.8 * escala);
          break;
        case 'elite':
          g.fillStyle(COR.perigo, 1).fillCircle(px, py, 3 * escala);
          g.lineStyle(1, COR.luz, 0.9).strokeCircle(px, py, 3 * escala);
          break;
        case 'chefe':
          g.fillStyle(COR.perigo, 1).fillCircle(px, py, 4.5 * escala);
          g.lineStyle(2, COR.perigo, 0.4 + 0.5 * pulso).strokeCircle(
            px,
            py,
            (6 + 2 * pulso) * escala,
          );
          break;
        case 'bau':
          g.fillStyle(COR.doce, 1).fillRect(
            px - 2 * escala,
            py - 2 * escala,
            4 * escala,
            4 * escala,
          );
          break;
        case 'isca':
          g.lineStyle(1, COR.doce, 1).strokeCircle(px, py, 3 * escala);
          break;
        case 'campainha':
          // Porta com campainha: um quadradinho branco aceso.
          g.fillStyle(COR.luz, 0.9).fillRect(
            px - 1.5 * escala,
            py - 1.5 * escala,
            3 * escala,
            3 * escala,
          );
          break;
        case 'segredo':
          g.fillStyle(COR.doce, 0.6 + 0.4 * pulso).fillCircle(px, py, 2.6 * escala);
          g.lineStyle(1, COR.doce, 1).strokeCircle(px, py, (4 + pulso) * escala);
          break;
        case 'posteApagado':
          g.lineStyle(1.5, COR.luz, 0.8).strokeCircle(px, py, 2.4 * escala);
          break;
        case 'mirante':
          g.lineStyle(1.5, COR.luz, 1).strokeTriangle(
            px,
            py - 5 * escala,
            px + 4 * escala,
            py + 3 * escala,
            px - 4 * escala,
            py + 3 * escala,
          );
          break;
        case 'jogador':
          break;
      }
    }
    // O jogador por cima de tudo, com o anel pulsando.
    for (const e of d.entidades) {
      if (e.tipo !== 'jogador') continue;
      const [px, py] = tela(e.x, e.y);
      g.lineStyle(1.5, COR.jogador, 0.35 + 0.4 * pulso).strokeCircle(
        px,
        py,
        (5 + 2 * pulso) * escala,
      );
      g.fillStyle(COR.jogador, 1).fillCircle(px, py, 3 * escala);
      g.lineStyle(1, 0x000000, 0.8).strokeCircle(px, py, 3 * escala);
    }
  }
}
