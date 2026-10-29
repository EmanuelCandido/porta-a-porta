import { describe, expect, it } from 'vitest';
import { OrcamentoDeQuadro } from '../../../src/render/orcamento';
import { IndiceDeAreas } from '../../../src/render/indiceDeAreas';
import { resumoDosQuadros } from '../../../src/render/medidas';

describe('orçamento do trabalho de tela', () => {
  it('progride uma tarefa e para quando o tempo acaba, mesmo com poucas tarefas', () => {
    let agora = 0;
    const orcamento = new OrcamentoDeQuadro(() => agora);
    orcamento.iniciar(2);
    expect(orcamento.reservar()).toBe(true);
    agora = 8;
    expect(orcamento.reservar()).toBe(false);
    orcamento.iniciar(2);
    expect(orcamento.reservar()).toBe(true);
    agora = 9;
    expect(orcamento.reservar()).toBe(true);
    agora = 10;
    expect(orcamento.reservar()).toBe(false);
  });
});

describe('índice dos objetos que podem fazer sombra', () => {
  it('retorna cada objeto uma vez, inclusive em células negativas e na borda', () => {
    const indice = new IndiceDeAreas<string>(8);
    indice.definir('casa', { x0: -10, y0: -2, x1: 9, y1: 9 });
    indice.definir('longe', { x0: 40, y0: 40, x1: 44, y1: 44 });
    expect(indice.buscar({ x0: -8, y0: -8, x1: 8, y1: 8 })).toEqual(['casa']);
    expect(indice.buscar({ x0: 9, y0: 9, x1: 10, y1: 10 })).toEqual(['casa']);
  });

  it('trocar a área remove a ocupação antiga', () => {
    const indice = new IndiceDeAreas<string>(8);
    const inicio = { x0: 0, y0: 0, x1: 3, y1: 3 };
    const fim = { x0: 40, y0: 40, x1: 44, y1: 44 };
    indice.definir('casa', inicio);
    indice.definir('casa', fim);
    expect(indice.buscar(inicio)).toEqual([]);
    expect(indice.buscar(fim)).toEqual(['casa']);
  });
});

it('o relatório mantém o engasgo no pior quadro e separa os percentis da média', () => {
  const r = resumoDosQuadros([...Array<number>(99).fill(16), 1000]);
  expect(r?.p95Ms).toBe(16);
  expect(r?.p99Ms).toBe(16);
  expect(r?.piorMs).toBe(1000);
  expect(r?.acima100ms).toBe(1);
  expect(resumoDosQuadros([NaN, 0, -1])).toBeNull();
});
