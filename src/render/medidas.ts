/** Estatística de intervalos reais de quadros; o primeiro intervalo precisa ter origem conhecida. */
export function resumoDosQuadros(valores: readonly number[]) {
  const a = valores.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!a.length) return null;
  const mediaMs = a.reduce((s, n) => s + n, 0) / a.length;
  return {
    quadros: a.length,
    fpsMedio: 1000 / mediaMs,
    mediaMs,
    p95Ms: a[Math.ceil(a.length * 0.95) - 1]!,
    p99Ms: a[Math.ceil(a.length * 0.99) - 1]!,
    piorMs: a[a.length - 1]!,
    acima50ms: a.filter((n) => n > 50).length,
    acima100ms: a.filter((n) => n > 100).length,
  };
}
