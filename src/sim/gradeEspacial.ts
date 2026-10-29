import type { Retangulo } from './geometria';

/** Grade espacial (hash): acha rápido o que está perto de um retângulo de consulta. */
export class GradeEspacial<T> {
  private readonly celulas = new Map<number, T[]>();

  constructor(private readonly tamanhoCelula: number) {}

  private chave(cx: number, cy: number): number {
    // Desloca para as coordenadas negativas também caberem numa chave numérica única.
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  private cobrir(r: Retangulo, visitar: (chave: number) => void): void {
    const cx0 = Math.floor(r.x0 / this.tamanhoCelula);
    const cy0 = Math.floor(r.y0 / this.tamanhoCelula);
    const cx1 = Math.floor(r.x1 / this.tamanhoCelula);
    const cy1 = Math.floor(r.y1 / this.tamanhoCelula);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) visitar(this.chave(cx, cy));
    }
  }

  inserir(area: Retangulo, valor: T): void {
    this.cobrir(area, (k) => {
      const lista = this.celulas.get(k);
      if (lista) lista.push(valor);
      else this.celulas.set(k, [valor]);
    });
  }

  /** Valores cujas áreas podem tocar a consulta, sem repetição, na ordem em que entraram. */
  consultar(area: Retangulo): T[] {
    const vistos = new Set<T>();
    this.cobrir(area, (k) => {
      for (const v of this.celulas.get(k) ?? []) vistos.add(v);
    });
    return [...vistos];
  }

  limpar(): void {
    this.celulas.clear();
  }
}
