import { describe, expect, it } from 'vitest';
import {
  curvaDoAtingido,
  curvaDoGolpe,
  diferencaDeAngulo,
  girarAte,
  grausDaDirecao,
  ladoNaTela,
  vistaDoAngulo,
} from '../../../src/render/movimento';

describe('virar o corpo', () => {
  it('o ângulo da direção e a diferença pelo lado mais curto', () => {
    expect(grausDaDirecao({ x: 1, y: 0 })).toBe(0);
    expect(grausDaDirecao({ x: 0, y: 1 })).toBe(90);
    expect(grausDaDirecao({ x: 0, y: -1 })).toBe(270);
    expect(diferencaDeAngulo(350, 10)).toBe(20);
    expect(diferencaDeAngulo(10, 350)).toBe(-20);
  });

  it('gira no máximo o passo dado, pelo lado mais curto, e para no alvo', () => {
    expect(girarAte(0, 90, 30)).toBe(30);
    expect(girarAte(10, 340, 15)).toBe(355);
    expect(girarAte(80, 90, 30)).toBe(90);
  });

  it('16 direções: a rotação mais perto e a guinada que falta; 4 direções: só a rotação', () => {
    expect(vistaDoAngulo(0, 16)).toEqual({ rot: 0, guinada: 0 });
    expect(vistaDoAngulo(20, 16)).toEqual({ rot: 0, guinada: 22.5 });
    expect(vistaDoAngulo(70, 16)).toEqual({ rot: 90, guinada: -22.5 });
    expect(vistaDoAngulo(350, 16)).toEqual({ rot: 0, guinada: 0 });
    expect(vistaDoAngulo(337.5, 16)).toEqual({ rot: 0, guinada: -22.5 });
    for (let g = 0; g < 360; g += 7) {
      const v = vistaDoAngulo(g, 16);
      expect(Math.abs(v.guinada)).toBeLessThanOrEqual(45);
      expect(Math.abs(diferencaDeAngulo(g, v.rot + v.guinada))).toBeLessThanOrEqual(11.25 + 1e-9);
      expect(vistaDoAngulo(g, 4).guinada).toBe(0);
    }
  });

  it('o lado na tela: +x vai para a direita, +y para a esquerda', () => {
    expect(ladoNaTela({ x: 1, y: -1 })).toBeCloseTo(1, 9);
    expect(ladoNaTela({ x: -1, y: 1 })).toBeCloseTo(-1, 9);
    expect(ladoNaTela({ x: 1, y: 1 })).toBeCloseTo(0, 9);
  });
});

describe('curvas do golpe e de quem leva golpe', () => {
  it('o golpe estica, passa um pouco do ponto na volta e termina na pose de base', () => {
    const k = 0.16;
    // Contínua: a volta começa do pico da esticada.
    expect(curvaDoGolpe(0.3, k, 0.3).sy).toBeCloseTo(1 + k, 9);
    expect(curvaDoGolpe(0.29, k, 0.3).sy).toBeGreaterThan(1 + k * 0.99);
    const volta = Array.from({ length: 70 }, (_, i) => curvaDoGolpe(0.3 + i * 0.01, k, 0.3).sy);
    expect(Math.min(...volta)).toBeLessThan(1);
    expect(curvaDoGolpe(0.999, k, 0.3).sy).toBeCloseTo(1, 4);
    expect(curvaDoGolpe(1, k, 0.3)).toEqual({ sy: 1, sx: 1, inclina: 0 });
  });

  it('quem leva golpe achata e inclina para trás, e volta ao normal', () => {
    const meio = curvaDoAtingido(0.3, 0.1);
    expect(meio.sy).toBeLessThan(1);
    expect(meio.inclina).toBeLessThan(0);
    expect(curvaDoAtingido(1, 0.1)).toEqual({ sy: 1, sx: 1, inclina: 0 });
  });
});
