import { describe, expect, it } from 'vitest';
import { aproximar } from '../../src/game/camera';
import { criarIso, direcaoDaTela, paraTela } from '../../src/render/iso';
import { rotacaoDaDirecao } from '../../src/sim/geometria';

const iso = criarIso({ largura: 64, altura: 32 });

describe('direção da tela para o mundo', () => {
  it.each([
    ['W (cima)', { x: 0, y: -1 }],
    ['D (direita)', { x: 1, y: 0 }],
    ['S (baixo)', { x: 0, y: 1 }],
    ['A (esquerda)', { x: -1, y: 0 }],
    ['W + D', { x: Math.SQRT1_2, y: -Math.SQRT1_2 }],
  ])('%s anda para onde aponta na tela', (_nome, tela) => {
    const mundo = direcaoDaTela(tela, iso);
    expect(Math.hypot(mundo.x, mundo.y)).toBeCloseTo(1, 9);
    const naTela = paraTela({ ...mundo, z: 0 }, iso);
    const n = Math.hypot(naTela.x, naTela.y);
    expect(naTela.x / n).toBeCloseTo(tela.x, 9);
    expect(naTela.y / n).toBeCloseTo(tela.y, 9);
  });

  it('o analógico pela metade anda pela metade', () => {
    const mundo = direcaoDaTela({ x: 0.5, y: 0 }, iso);
    expect(Math.hypot(mundo.x, mundo.y)).toBeCloseTo(0.5, 9);
  });

  it('sem entrada não anda', () => {
    expect(direcaoDaTela({ x: 0, y: 0 }, iso)).toEqual({ x: 0, y: 0 });
  });
});

describe('para onde o modelo olha', () => {
  it('vira para o eixo dominante e mantém a rotação parado', () => {
    expect(rotacaoDaDirecao({ x: 1, y: 0.2 }, 270)).toBe(0);
    expect(rotacaoDaDirecao({ x: 0.1, y: 1 }, 0)).toBe(90);
    expect(rotacaoDaDirecao({ x: -1, y: 0 }, 0)).toBe(180);
    expect(rotacaoDaDirecao({ x: 0, y: -1 }, 0)).toBe(270);
    expect(rotacaoDaDirecao({ x: 0, y: 0 }, 90)).toBe(90);
  });
});

describe('suavização da câmera', () => {
  it('não depende da taxa de quadros', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = aproximar(a, 100, 6, 1 / 60);
    let b = 0;
    for (let i = 0; i < 30; i++) b = aproximar(b, 100, 6, 1 / 30);
    expect(a).toBeCloseTo(b, 9);
  });

  it('chega perto do alvo sem passar dele', () => {
    let v = 0;
    for (let i = 0; i < 600; i++) {
      v = aproximar(v, 10, 6, 1 / 60);
      expect(v).toBeLessThanOrEqual(10);
    }
    expect(v).toBeCloseTo(10, 6);
  });
});
