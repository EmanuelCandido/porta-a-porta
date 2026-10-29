import type { Poligono } from './geometria';
import type { Vec2 } from './iso';
import { rasterizar, reduzir, type TrianguloRaster } from './rasterizar';

// Única parte de src/render que toca no DOM: pinta polígonos em canvas para virarem texturas.

export interface Limites {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type TelaDeDesenho = HTMLCanvasElement | OffscreenCanvas;
type ContextoDeDesenho = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface Assado<T extends TelaDeDesenho = HTMLCanvasElement> {
  base: T;
  /** Só as partes que brilham, já recortadas pelo que fica na frente delas. */
  emissivo: T | null;
  /** Canto superior esquerdo do canvas, em px de tela (antes da resolução). */
  x: number;
  y: number;
}

/** Folga em volta do desenho, em px, para o traço anti-emenda não ser cortado. */
const MARGEM = 2;
/** Traço da mesma cor em volta de cada face, para esconder a emenda entre faces vizinhas. */
const TRACO_ANTI_EMENDA = 1;
/** As malhas são rasterizadas com tantas amostras por lado de pixel (borda sem serrilhado). */
const SUPERAMOSTRA = 3;

export function limitesDe(polys: Vec2[][]): Limites {
  const l = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const poly of polys) {
    for (const p of poly) {
      l.x0 = Math.min(l.x0, p.x);
      l.y0 = Math.min(l.y0, p.y);
      l.x1 = Math.max(l.x1, p.x);
      l.y1 = Math.max(l.y1, p.y);
    }
  }
  return l;
}

function novoCanvas(l: Limites, resolucao: number): [HTMLCanvasElement, CanvasRenderingContext2D];
function novoCanvas(
  l: Limites,
  resolucao: number,
  criar: () => TelaDeDesenho,
): [TelaDeDesenho, ContextoDeDesenho];
function novoCanvas(
  l: Limites,
  resolucao: number,
  criar: () => TelaDeDesenho = () => document.createElement('canvas'),
): [TelaDeDesenho, ContextoDeDesenho] {
  const canvas = criar();
  canvas.width = Math.max(1, Math.ceil((l.x1 - l.x0) * resolucao));
  canvas.height = Math.max(1, Math.ceil((l.y1 - l.y0) * resolucao));
  const ctx = canvas.getContext('2d') as ContextoDeDesenho | null;
  if (!ctx) throw new Error('canvas 2D indisponível');
  ctx.lineJoin = 'round';
  ctx.lineWidth = TRACO_ANTI_EMENDA;
  return [canvas, ctx];
}

function tracar(ctx: ContextoDeDesenho, pts: Vec2[], l: Limites, resolucao: number): void {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = (p.x - l.x0) * resolucao;
    const y = (p.y - l.y0) * resolucao;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function pintar(ctx: ContextoDeDesenho, cor: string, alfa: number): void {
  ctx.globalAlpha = alfa;
  ctx.fillStyle = cor;
  ctx.fill();
  if (alfa === 1) {
    ctx.strokeStyle = cor;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Assa um modelo: a textura base e, se houver, a camada que brilha por cima da escuridão. */
export function assarModelo(polys: Poligono[], resolucao: number): Assado;
export function assarModelo(
  polys: Poligono[],
  resolucao: number,
  criar: () => OffscreenCanvas,
): Assado<OffscreenCanvas>;
export function assarModelo(
  polys: Poligono[],
  resolucao: number,
  criar: () => TelaDeDesenho = () => document.createElement('canvas'),
): Assado<TelaDeDesenho> {
  const b = limitesDe(polys.map((p) => p.pts));
  const l = {
    x0: Math.floor(b.x0) - MARGEM,
    y0: Math.floor(b.y0) - MARGEM,
    x1: Math.ceil(b.x1) + MARGEM,
    y1: Math.ceil(b.y1) + MARGEM,
  };

  const vetor = polys.filter((p) => !p.prof);
  const malha = polys.filter((p) => p.prof);
  const [base, ctx] = novoCanvas(l, resolucao, criar);
  for (const p of vetor) {
    tracar(ctx, p.pts, l, resolucao);
    pintar(ctx, p.cor, p.alfa);
  }

  let emissivo: TelaDeDesenho | null = null;
  if (vetor.some((p) => p.emissivo)) {
    const [canvas, ce] = novoCanvas(l, resolucao, criar);
    for (const p of vetor) {
      tracar(ce, p.pts, l, resolucao);
      // O que não brilha apaga o brilho de trás: assim a ordem do pintor vale para as duas camadas.
      ce.globalCompositeOperation = p.emissivo ? 'source-over' : 'destination-out';
      pintar(ce, p.emissivo ? p.cor : '#000000', 1);
    }
    ce.globalCompositeOperation = 'source-over';
    emissivo = canvas;
  }

  if (malha.length > 0) {
    // Malhas: z-buffer em resolução maior, reduzida para a do modelo (bordas suaves).
    const k = resolucao * SUPERAMOSTRA;
    const tris: TrianguloRaster[] = malha.map((p) => ({
      pts: p.pts.map((q) => ({
        x: (q.x - l.x0) * k,
        y: (q.y - l.y0) * k,
      })) as TrianguloRaster['pts'],
      prof: p.prof as TrianguloRaster['prof'],
      cor: p.cor,
      emissivo: p.emissivo,
    }));
    const r = rasterizar(tris, base.width * SUPERAMOSTRA, base.height * SUPERAMOSTRA);
    const colar = (destino: ContextoDeDesenho, rgba: Uint8ClampedArray) => {
      const red = reduzir(rgba, r.largura, r.altura, SUPERAMOSTRA);
      const [tmp, ct] = novoCanvas(l, resolucao, criar);
      const img = ct.createImageData(red.largura, red.altura);
      img.data.set(red.rgba);
      ct.putImageData(img, 0, 0);
      destino.drawImage(tmp, 0, 0);
    };
    colar(ctx, r.base);
    if (r.emissivo) {
      if (!emissivo) emissivo = novoCanvas(l, resolucao, criar)[0];
      colar(emissivo.getContext('2d') as ContextoDeDesenho, r.emissivo);
    }
  }

  return { base, emissivo, x: l.x0, y: l.y0 };
}

/** Une polígonos numa camada de cor sólida (a transparência vai no objeto que a mostra). */
export function assarCamada(polys: Vec2[][], l: Limites, cor: string): HTMLCanvasElement {
  const [canvas, ctx] = novoCanvas(l, 1);
  ctx.fillStyle = cor;
  for (const p of polys) {
    tracar(ctx, p, l, 1);
    ctx.fill();
  }
  return canvas;
}

/** Um pedaço do chão assado: canvas e o canto dele em px de tela. */
export interface BlocoDeChao {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
}

export interface CamadaDePiso {
  pts: Vec2[];
  cor: string;
}

function intersecta(a: Limites, b: Limites): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** O chão preparado para assar em blocos: cada zona e cada sombra com o retângulo dela. */
export interface ChaoPreparado {
  pisos: { item: CamadaDePiso; lim: Limites }[];
  sombras: { pts: Vec2[]; lim: Limites }[];
  sombra: { cor: string; opacidade: number };
}

export function prepararChao(
  piso: CamadaDePiso[],
  sombras: Vec2[][],
  sombra: { cor: string; opacidade: number },
): ChaoPreparado {
  return {
    pisos: piso.map((item) => ({ item, lim: limitesDe([item.pts]) })),
    sombras: sombras.map((pts) => ({ pts, lim: limitesDe([pts]) })),
    sombra,
  };
}

/**
 * Assa um bloco quadrado do chão (`area`, em px de tela): as zonas de piso que tocam nele (opacas,
 * na ordem dada) e, por cima, a união das sombras com uma transparência só. Devolve null se o bloco
 * fica vazio (o fundo da câmera já é o chão).
 */
export function assarBlocoDeChao(area: Limites, chao: ChaoPreparado): HTMLCanvasElement | null {
  const aqui = chao.pisos.filter((p) => intersecta(p.lim, area));
  const sombrasAqui = chao.sombras.filter((s) => intersecta(s.lim, area));
  if (aqui.length === 0 && sombrasAqui.length === 0) return null;
  const [canvas, ctx] = novoCanvas(area, 1);
  for (const { item } of aqui) {
    tracar(ctx, item.pts, area, 1);
    ctx.fillStyle = item.cor;
    ctx.strokeStyle = item.cor;
    ctx.fill();
    ctx.stroke();
  }
  if (sombrasAqui.length > 0) {
    const [rc, rctx] = novoCanvas(area, 1);
    rctx.fillStyle = chao.sombra.cor;
    for (const { pts } of sombrasAqui) {
      tracar(rctx, pts, area, 1);
      rctx.fill();
    }
    ctx.globalAlpha = chao.sombra.opacidade;
    ctx.drawImage(rc, 0, 0);
    ctx.globalAlpha = 1;
  }
  return canvas;
}

/**
 * O chão em blocos quadrados de `bloco` px: as zonas de piso (opacas, na ordem dada) e, por cima,
 * a união das sombras com uma transparência só (sombras que se cruzam não escurecem em dobro).
 * Blocos sem nada desenhado não viram canvas: o fundo da câmera já é o chão.
 */
export function assarChaoEmBlocos(
  l: Limites,
  piso: CamadaDePiso[],
  sombras: Vec2[][],
  sombra: { cor: string; opacidade: number },
  bloco: number,
): BlocoDeChao[] {
  const comLimites = <T extends { pts: Vec2[] }>(lista: T[]) =>
    lista.map((item) => ({ item, lim: limitesDe([item.pts]) }));
  const pisos = comLimites(piso);
  const sombrasLim = comLimites(sombras.map((pts) => ({ pts })));
  const blocos: BlocoDeChao[] = [];
  let rascunho: [HTMLCanvasElement, CanvasRenderingContext2D] | null = null;
  for (let y = Math.floor(l.y0); y < l.y1; y += bloco) {
    for (let x = Math.floor(l.x0); x < l.x1; x += bloco) {
      const area = { x0: x, y0: y, x1: x + bloco, y1: y + bloco };
      const aqui = pisos.filter((p) => intersecta(p.lim, area));
      const sombrasAqui = sombrasLim.filter((s) => intersecta(s.lim, area));
      if (aqui.length === 0 && sombrasAqui.length === 0) continue;
      const [canvas, ctx] = novoCanvas(area, 1);
      for (const { item } of aqui) {
        tracar(ctx, item.pts, area, 1);
        ctx.fillStyle = item.cor;
        ctx.strokeStyle = item.cor;
        ctx.fill();
        ctx.stroke();
      }
      if (sombrasAqui.length > 0) {
        rascunho ??= novoCanvas(area, 1);
        const [rc, rctx] = rascunho;
        rctx.clearRect(0, 0, rc.width, rc.height);
        rctx.fillStyle = sombra.cor;
        for (const { item } of sombrasAqui) {
          tracar(rctx, item.pts, area, 1);
          rctx.fill();
        }
        ctx.globalAlpha = sombra.opacidade;
        ctx.drawImage(rc, 0, 0);
        ctx.globalAlpha = 1;
      }
      blocos.push({ canvas, x, y });
    }
  }
  return blocos;
}
