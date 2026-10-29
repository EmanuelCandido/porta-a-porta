import { describe, expect, it } from 'vitest';
import { proximoNaDirecao } from '../../src/game/navegacaoPorFoco';

// Uma grade de 2 × 2 botões e um botão largo embaixo, como as telas de menu.
const b = (nome: string, x: number, y: number, w = 100, h = 40) => ({ nome, x, y, w, h });
const BOTOES = [
  b('a', 0, 0),
  b('b', 200, 0),
  b('c', 0, 100),
  b('d', 200, 100),
  b('e', 0, 200, 300),
];
const de = (nome: string) => {
  const x = BOTOES.find((k) => k.nome === nome)!;
  return { x: x.x + x.w / 2, y: x.y + x.h / 2 };
};

describe('navegação por foco (controle nos menus)', () => {
  it('anda para o botão mais perto naquela direção', () => {
    expect(proximoNaDirecao(de('a'), { x: 1, y: 0 }, BOTOES)?.nome).toBe('b');
    expect(proximoNaDirecao(de('a'), { x: 0, y: 1 }, BOTOES)?.nome).toBe('c');
    expect(proximoNaDirecao(de('d'), { x: -1, y: 0 }, BOTOES)?.nome).toBe('c');
    expect(proximoNaDirecao(de('c'), { x: 0, y: 1 }, BOTOES)?.nome).toBe('e');
  });

  it('prefere o que está em frente ao que está de lado', () => {
    // De "b" para baixo: "d" está logo abaixo; "c" está mais de lado.
    expect(proximoNaDirecao(de('b'), { x: 0, y: 1 }, BOTOES)?.nome).toBe('d');
  });

  it('sem nada naquela direção, fica onde está', () => {
    expect(proximoNaDirecao(de('a'), { x: 0, y: -1 }, BOTOES)).toBeNull();
    expect(proximoNaDirecao(de('b'), { x: 1, y: 0 }, BOTOES)).toBeNull();
  });
});
