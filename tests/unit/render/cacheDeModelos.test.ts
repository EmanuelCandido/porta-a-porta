import { expect, it } from 'vitest';
import type * as Phaser from 'phaser';
import { CacheDeModelos } from '../../../src/game/desempenho/cacheDeModelos';
import { visual } from '../../../src/sim/content';

it('o limite libera um desenho antigo sem apagar a sombra compartilhada com a cena ativa', () => {
  const texturas = new Set(['a', 'b', 'sombra']);
  const registrosRemovidos: string[] = [];
  const lado = Math.ceil(Math.sqrt((visual.desempenho.cacheModelosMB * 1048576) / 8));
  const jogo = {
    textures: {
      get: () => ({ source: [{ width: lado, height: lado }] }),
      exists: (chave: string) => texturas.has(chave),
      remove: (chave: string) => texturas.delete(chave),
    },
    registry: { remove: (chave: string) => registrosRemovidos.push(chave) },
  } as unknown as Phaser.Game;
  const primeira = {} as Phaser.Scene;
  const segunda = {} as Phaser.Scene;
  const cache = new CacheDeModelos(jogo);
  cache.usar('primeiro', primeira, ['a', 'sombra']);
  cache.usar('segundo', segunda, ['b', 'sombra']);
  cache.soltar(primeira);
  expect(registrosRemovidos).toEqual(['primeiro:assado']);
  expect(texturas.has('a')).toBe(false);
  expect(texturas.has('b')).toBe(true);
  expect(texturas.has('sombra')).toBe(true);
});
