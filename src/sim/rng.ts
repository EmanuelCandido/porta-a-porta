/**
 * Gerador com semente (mulberry32): a mesma semente dá sempre a mesma sequência, o que deixa as
 * lutas reproduzíveis e permite a semente da noite. É a única fonte de aleatoriedade do jogo.
 */
export class Rng {
  private estado: number;

  constructor(semente: number) {
    this.estado = semente >>> 0;
  }

  /** Número em [0, 1). */
  proximo(): number {
    this.estado = (this.estado + 0x6d2b79f5) >>> 0;
    let t = this.estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Inteiro em [min, max], com as duas pontas incluídas. */
  inteiro(min: number, max: number): number {
    return min + Math.floor(this.proximo() * (max - min + 1));
  }

  /** Número em [min, max). */
  entre(min: number, max: number): number {
    return min + this.proximo() * (max - min);
  }

  escolher<T>(lista: readonly T[]): T {
    if (lista.length === 0) throw new Error('não dá para escolher de uma lista vazia');
    return lista[this.inteiro(0, lista.length - 1)]!;
  }

  /** Estado atual, para salvar ou clonar o gerador. */
  get semente(): number {
    return this.estado;
  }
}
