import type * as Phaser from 'phaser';
import { doChao, paraTela, type Iso, type Vec2 } from '../render/iso';
import { visual } from '../sim/content';
import type { Retangulo } from '../sim/geometria';

export function limitar(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Zoom inicial (ou `?zoom=` na URL) e zoom pela roda do mouse, sempre entre 0,8× e 1,2×. */
export function configurarZoomDaRoda(cena: Phaser.Scene, params: URLSearchParams): void {
  const { zoomMin, zoomMax, zoomInicial, passoZoomRoda } = visual.camera;
  const camera = cena.cameras.main;
  camera.setZoom(limitar(Number(params.get('zoom') ?? zoomInicial), zoomMin, zoomMax));
  cena.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
    camera.setZoom(limitar(camera.zoom - Math.sign(dy) * passoZoomRoda, zoomMin, zoomMax));
  });
}

/**
 * Aproxima `atual` de `alvo` de forma independente da taxa de quadros: depois de 1/rigidez
 * segundos falta cerca de 37% do caminho.
 */
export function aproximar(atual: number, alvo: number, rigidezPorS: number, dtS: number): number {
  return atual + (alvo - atual) * (1 - Math.exp(-rigidezPorS * dtS));
}

function presoEntre(v: number, min: number, max: number): number {
  return min > max ? (min + max) / 2 : Math.min(max, Math.max(min, v));
}

/**
 * Prende o centro da câmera (px de tela) para que a vista inteira caia dentro do mundo (retângulo
 * em tiles). Os cantos da vista, levados ao chão, ficam a no máximo `k` tiles do centro em x e em
 * y, então basta encolher o mundo `k` tiles de cada lado. Assim a câmera nunca mostra o vazio, nem
 * nos cantos do losango.
 */
export function prenderNoMundo(
  centro: Vec2,
  meiaLarguraPx: number,
  meiaAlturaPx: number,
  mundo: Retangulo,
  iso: Iso,
): Vec2 {
  const k = (meiaLarguraPx / iso.meioTileX + meiaAlturaPx / iso.meioTileY) / 2;
  const c = doChao(centro, iso);
  return paraTela(
    {
      x: presoEntre(c.x, mundo.x0 + k, mundo.x1 - k),
      y: presoEntre(c.y, mundo.y0 + k, mundo.y1 - k),
      z: 0,
    },
    iso,
  );
}
