/**
 * Escala em que os modelos são assados em textura: tantos pixels de textura por px de tela quantos
 * o aparelho mostra no zoom máximo da câmera (devicePixelRatio × zoom), nunca abaixo de 1:1 nem
 * acima do teto. Numa tela comum (DPR 1, zoom até 1,2) assa em 1,2× em vez de 2×: um terço dos
 * pixels, sem perder nitidez no maior zoom.
 */
export function resolucaoDasTexturas(dpr: number, zoomMax: number, teto: number): number {
  const aparelho = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return Math.min(teto, Math.max(1, aparelho * zoomMax));
}
