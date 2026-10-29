/** Orçamento de trabalho síncrono: uma tarefa sempre progride; as seguintes só cabem no prazo. */
export class OrcamentoDeQuadro {
  private inicio = 0;
  private usados = 0;
  private limite = 0;

  constructor(private readonly agora: () => number = () => performance.now()) {}

  iniciar(limiteMs: number): void {
    this.inicio = this.agora();
    this.limite = limiteMs;
    this.usados = 0;
  }

  reservar(): boolean {
    if (this.usados > 0 && this.agora() - this.inicio >= this.limite) return false;
    this.usados++;
    return true;
  }
}
