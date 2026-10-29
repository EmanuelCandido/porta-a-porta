/** Ponto do mundo: x e y em tiles (decimais), z (altura) em px de tela. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

/** Parâmetros da projeção isométrica 2:1 derivados do tamanho do tile. */
export interface Iso {
  meioTileX: number;
  meioTileY: number;
  /** Quantos px de altura equivalem a 1 tile de comprimento (para normais e esferas). */
  zPorTile: number;
}

export function criarIso(tile: { largura: number; altura: number }): Iso {
  const meioTileX = tile.largura / 2;
  const meioTileY = tile.altura / 2;
  // A aresta de um tile vira (meioTileX, meioTileY) na tela; a escala do plano é meioTileX·√2.
  // Na projeção dimétrica, sen(elevação) = altura/largura, e a vertical encolhe por cos(elevação).
  const escala = meioTileX * Math.SQRT2;
  const senElevacao = tile.altura / tile.largura;
  const zPorTile = escala * Math.sqrt(1 - senElevacao * senElevacao);
  return { meioTileX, meioTileY, zPorTile };
}

export function paraTela(p: Vec3, iso: Iso): Vec2 {
  return {
    x: (p.x - p.y) * iso.meioTileX,
    y: (p.x + p.y) * iso.meioTileY - p.z,
  };
}

/** Ponto do chão (z = 0) que aparece na posição de tela dada. */
export function doChao(tela: Vec2, iso: Iso): Vec2 {
  const a = tela.x / iso.meioTileX;
  const b = tela.y / iso.meioTileY;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/**
 * Direção no mundo que aparece na tela como `tela` (x para a direita, y para baixo): W sobe na
 * tela, D vai para a direita. O comprimento é o da entrada, limitado a 1 (o analógico dosa).
 */
export function direcaoDaTela(tela: Vec2, iso: Iso): Vec2 {
  const forca = Math.min(1, Math.hypot(tela.x, tela.y));
  if (forca === 0) return { x: 0, y: 0 };
  const a = tela.x / iso.meioTileX;
  const b = tela.y / iso.meioTileY;
  const m = { x: (a + b) / 2, y: (b - a) / 2 };
  const n = Math.hypot(m.x, m.y);
  return { x: (m.x / n) * forca, y: (m.y / n) * forca };
}

/** Direção (unitária, em unidades métricas) que aponta do mundo para a câmera. */
export function direcaoDaCamera(iso: Iso): Vec3 {
  // Núcleo da projeção: x − y = 0 e (x + y)·meioTileY − z = 0, com z convertido para tiles.
  return normalizar({ x: 1, y: 1, z: (2 * iso.meioTileY) / iso.zPorTile });
}

export function normalizar(v: Vec3): Vec3 {
  const n = Math.hypot(v.x, v.y, v.z);
  return n === 0 ? { x: 0, y: 0, z: 0 } : { x: v.x / n, y: v.y / n, z: v.z / n };
}

export function produtoEscalar(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
