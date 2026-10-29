import { describe, expect, it } from 'vitest';
import {
  aoLongoDaLinha,
  distanciaNaLinha,
  fiapoDeFumaca,
  saltoDoGato,
  SorteioDaTela,
  vento,
  vooDoMorcego,
} from '../../../src/render/vida';

describe('vida no cenário (contas puras da tela)', () => {
  it('o sorteio da tela é determinístico e fica entre 0 e 1', () => {
    const a = new SorteioDaTela(5);
    const b = new SorteioDaTela(5);
    for (let i = 0; i < 100; i++) {
      const x = a.proximo();
      expect(x).toBe(b.proximo());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('o vento sopra sempre para o mesmo lado (+x no mundo), com rajadas', () => {
    const forcas = new Set<number>();
    for (let t = 0; t < 200; t += 3) {
      const v = vento(t, 1);
      expect(v.x).toBeGreaterThan(0);
      expect(Math.hypot(v.x, v.y)).toBeLessThanOrEqual(1.0001);
      forcas.add(Math.round(Math.hypot(v.x, v.y) * 10));
    }
    expect(forcas.size).toBeGreaterThan(2);
  });

  it('a fumaça sobe, cresce, é levada pelo vento e some no fim', () => {
    const ini = fiapoDeFumaca(0, 40);
    const meio = fiapoDeFumaca(0.5, 40);
    const fim = fiapoDeFumaca(1, 40);
    expect(ini.subida).toBe(0);
    expect(meio.subida).toBeGreaterThan(0);
    expect(fim.subida).toBeCloseTo(40, 9);
    expect(meio.escala).toBeGreaterThan(ini.escala);
    expect(fim.arrasto).toBeGreaterThan(meio.arrasto);
    expect(ini.alfa).toBe(0);
    expect(meio.alfa).toBeGreaterThan(0);
    expect(fim.alfa).toBe(0);
  });

  it('o gato sai do alto do muro, faz um arco e chega no chão', () => {
    const de = { x: 0, y: 0 };
    const para = { x: 2, y: 0 };
    expect(saltoDoGato(0, de, para, 18, 10)).toEqual({ pos: { x: 0, y: 0 }, z: 18 });
    const meio = saltoDoGato(0.5, de, para, 18, 10);
    expect(meio.z).toBeGreaterThan(9);
    expect(saltoDoGato(1, de, para, 18, 10)).toEqual({ pos: { x: 2, y: 0 }, z: 0 });
  });

  it('o morcego vai de uma ponta à outra, ondulando e batendo asa', () => {
    const de = { x: 0, y: 100 };
    const para = { x: 1000, y: 50 };
    expect(vooDoMorcego(0, de, para, 0, 0).pos.x).toBe(0);
    expect(vooDoMorcego(1, de, para, 0, 0).pos.x).toBe(1000);
    const asas = new Set(
      [0, 0.05, 0.1, 0.15, 0.2].map((t) => vooDoMorcego(0.5, de, para, 0, t).asaAberta),
    );
    expect(asas.size).toBe(2);
  });

  it('andar ao longo da rota vai até o fim e volta pelo mesmo caminho', () => {
    const linha = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
    ];
    expect(aoLongoDaLinha(linha, 4).pos).toEqual({ x: 4, y: 0 });
    expect(aoLongoDaLinha(linha, 12).pos).toEqual({ x: 10, y: 2 });
    expect(aoLongoDaLinha(linha, 12).dir).toEqual({ x: 0, y: 1 });
    // Total 15: com 18 andou até o fim e voltou 3.
    const volta = aoLongoDaLinha(linha, 18);
    expect(volta.pos).toEqual({ x: 10, y: 2 });
    expect(volta.dir).toEqual({ x: -0, y: -1 });
  });

  it('a distância na rota é a da projeção do ponto mais perto', () => {
    const linha = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
    ];
    expect(distanciaNaLinha(linha, { x: 4, y: 3 })).toBeCloseTo(4);
    expect(distanciaNaLinha(linha, { x: 13, y: 2 })).toBeCloseTo(12);
    // Antes do começo e depois do fim: as pontas.
    expect(distanciaNaLinha(linha, { x: -5, y: 0 })).toBeCloseTo(0);
    expect(distanciaNaLinha(linha, { x: 10, y: 9 })).toBeCloseTo(15);
  });
});
