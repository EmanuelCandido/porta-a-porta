/**
 * Converte o tempo real dos quadros em ticks de passo fixo. Se o navegador engasgar, roda no máximo
 * `maxPorQuadro` ticks e descarta o atraso, em vez de entrar em espiral tentando alcançar.
 */
export class PassoFixo {
  private acumuladoMs = 0;
  readonly passoMs: number;

  constructor(
    ticksPorSegundo: number,
    private readonly maxPorQuadro: number,
  ) {
    this.passoMs = 1000 / ticksPorSegundo;
  }

  /** Quantos ticks rodar neste quadro. */
  avancar(deltaMs: number): number {
    this.acumuladoMs += deltaMs;
    const ticks = Math.floor(this.acumuladoMs / this.passoMs);
    if (ticks > this.maxPorQuadro) {
      this.acumuladoMs = 0;
      return this.maxPorQuadro;
    }
    this.acumuladoMs -= ticks * this.passoMs;
    return ticks;
  }

  /** Fração do próximo tick já decorrida, para a tela interpolar entre dois ticks. */
  get alfa(): number {
    return this.acumuladoMs / this.passoMs;
  }
}
