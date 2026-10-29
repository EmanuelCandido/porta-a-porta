import type * as Phaser from 'phaser';
import { visual } from '../../sim/content';

interface Registro {
  texturas: string[];
  usuarios: Set<Phaser.Scene>;
}

/** LRU compartilhado: só remove desenhos sem nenhuma cena usando, inclusive a sombra das poses. */
export class CacheDeModelos {
  private readonly modelos = new Map<string, Registro>();
  private readonly referencias = new Map<string, { quantidade: number; bytes: number }>();
  private bytes = 0;

  constructor(private readonly jogo: Phaser.Game) {}

  usar(chave: string, cena: Phaser.Scene, texturas: string[]): void {
    let registro = this.modelos.get(chave);
    if (registro) this.modelos.delete(chave);
    else {
      registro = { texturas: [...new Set(texturas)], usuarios: new Set() };
      for (const t of registro.texturas) {
        const ref = this.referencias.get(t);
        if (ref) ref.quantidade++;
        else {
          const bytes = this.jogo.textures
            .get(t)
            .source.reduce((s, fonte) => s + fonte.width * fonte.height * 4, 0);
          this.referencias.set(t, { quantidade: 1, bytes });
          this.bytes += bytes;
        }
      }
    }
    registro.usuarios.add(cena);
    this.modelos.set(chave, registro);
  }

  soltar(cena: Phaser.Scene): void {
    for (const registro of this.modelos.values()) registro.usuarios.delete(cena);
    const max = visual.desempenho.cacheModelosMB * 1024 * 1024;
    for (const [chave, registro] of this.modelos) {
      if (this.bytes <= max) break;
      if (registro.usuarios.size) continue;
      this.modelos.delete(chave);
      this.jogo.registry.remove(`${chave}:assado`);
      for (const t of registro.texturas) {
        const ref = this.referencias.get(t)!;
        if (--ref.quantidade > 0) continue;
        this.referencias.delete(t);
        this.bytes -= ref.bytes;
        if (this.jogo.textures.exists(t)) this.jogo.textures.remove(t);
      }
    }
  }
}

const caches = new WeakMap<Phaser.Game, CacheDeModelos>();
export function cacheDeModelos(jogo: Phaser.Game): CacheDeModelos {
  let cache = caches.get(jogo);
  if (!cache) caches.set(jogo, (cache = new CacheDeModelos(jogo)));
  return cache;
}
