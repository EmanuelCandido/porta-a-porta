import { describe, expect, it } from 'vitest';
import { GradeEspacial } from '../../../src/sim/gradeEspacial';
import { sobrepoem, type Retangulo } from '../../../src/sim/geometria';
import { PassoFixo } from '../../../src/sim/passoFixo';
import { Rng } from '../../../src/sim/rng';

describe('gerador com semente', () => {
  it('a mesma semente dá a mesma sequência', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.proximo()).toBe(b.proximo());
  });

  it('sementes diferentes dão sequências diferentes', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const iguais = Array.from({ length: 20 }, () => a.proximo() === b.proximo()).filter(Boolean);
    expect(iguais.length).toBeLessThan(2);
  });

  it('fica em [0, 1) e espalha bem', () => {
    const rng = new Rng(7);
    const n = 10_000;
    let soma = 0;
    for (let i = 0; i < n; i++) {
      const v = rng.proximo();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      soma += v;
    }
    expect(soma / n).toBeCloseTo(0.5, 1);
  });

  it('inteiro inclui as duas pontas e nada fora delas', () => {
    const rng = new Rng(3);
    const vistos = new Set<number>();
    for (let i = 0; i < 1000; i++) vistos.add(rng.inteiro(4, 6));
    expect([...vistos].sort()).toEqual([4, 5, 6]);
  });
});

describe('passo fixo', () => {
  it('converte tempo real em ticks e guarda a sobra', () => {
    const p = new PassoFixo(60, 5);
    expect(p.avancar(1000 / 60)).toBe(1);
    expect(p.avancar(8)).toBe(0);
    expect(p.alfa).toBeCloseTo(8 / (1000 / 60), 9);
    expect(p.avancar(9)).toBe(1);
  });

  it('um segundo vira 60 ticks somando quadros de 60 Hz', () => {
    const p = new PassoFixo(60, 5);
    let ticks = 0;
    for (let i = 0; i < 60; i++) ticks += p.avancar(1000 / 60);
    expect(ticks).toBe(60);
  });

  it('não tenta alcançar um engasgo grande', () => {
    const p = new PassoFixo(60, 5);
    expect(p.avancar(2000)).toBe(5);
    expect(p.alfa).toBe(0);
  });
});

describe('grade espacial', () => {
  it('acha o mesmo que a busca por força bruta', () => {
    const rng = new Rng(11);
    const grade = new GradeEspacial<Retangulo>(2);
    const todos: Retangulo[] = [];
    for (let i = 0; i < 200; i++) {
      const x = rng.entre(-5, 30);
      const y = rng.entre(-5, 30);
      const r = { x0: x, y0: y, x1: x + rng.entre(0.1, 3), y1: y + rng.entre(0.1, 3) };
      todos.push(r);
      grade.inserir(r, r);
    }
    for (let i = 0; i < 50; i++) {
      const x = rng.entre(-5, 30);
      const y = rng.entre(-5, 30);
      const consulta = { x0: x, y0: y, x1: x + 2, y1: y + 2 };
      const achados = new Set(grade.consultar(consulta).filter((r) => sobrepoem(r, consulta)));
      expect(achados).toEqual(new Set(todos.filter((r) => sobrepoem(r, consulta))));
    }
  });
});
