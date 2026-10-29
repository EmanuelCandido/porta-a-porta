import type { Retangulo } from '../sim/geometria';

/** Índice espacial de obstáculos visuais. Consultar uma luz não percorre a cidade inteira. */
export class IndiceDeAreas<T> {
  private readonly celulas = new Map<string, Set<T>>();
  private readonly areas = new Map<T, Retangulo>();

  constructor(private readonly lado: number) {}

  private chaves(a: Retangulo): string[] {
    const chaves: string[] = [];
    for (let y = Math.floor(a.y0 / this.lado); y <= Math.floor(a.y1 / this.lado); y++)
      for (let x = Math.floor(a.x0 / this.lado); x <= Math.floor(a.x1 / this.lado); x++)
        chaves.push(`${x},${y}`);
    return chaves;
  }

  definir(objeto: T, area: Retangulo): void {
    const anterior = this.areas.get(objeto);
    if (anterior)
      for (const chave of this.chaves(anterior)) {
        const celula = this.celulas.get(chave)!;
        celula.delete(objeto);
        if (!celula.size) this.celulas.delete(chave);
      }
    this.areas.set(objeto, { ...area });
    for (const chave of this.chaves(area)) {
      let celula = this.celulas.get(chave);
      if (!celula) this.celulas.set(chave, (celula = new Set()));
      celula.add(objeto);
    }
  }

  buscar(area: Retangulo): T[] {
    const encontrados = new Set<T>();
    for (const chave of this.chaves(area))
      for (const objeto of this.celulas.get(chave) ?? []) {
        const a = this.areas.get(objeto)!;
        if (a.x0 <= area.x1 && a.x1 >= area.x0 && a.y0 <= area.y1 && a.y1 >= area.y0)
          encontrados.add(objeto);
      }
    return [...encontrados];
  }
}
