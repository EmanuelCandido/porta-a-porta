import { describe, expect, it } from 'vitest';
import { conteudo } from '../../../src/sim/content';
import { Run, type ConteudoRun } from '../../../src/sim/run';

const C = conteudo as ConteudoRun;

describe('Noite curta (game jam)', () => {
  it('a run acaba no chefe do primeiro bairro', () => {
    const curta = new Run(C, 5, 'bruxinha', { bairros: C.run.noiteCurta.bairros });
    expect(curta.totalDeBairros).toBe(1);
    curta.estado.fase = 'chefe';
    curta.venceuChefe();
    expect(curta.estado.fase).toBe('vitoria');
  });

  it('a run completa continua com os 3 bairros', () => {
    const completa = new Run(C, 5, 'bruxinha');
    expect(completa.totalDeBairros).toBe(C.run.nomesDosBairros.length);
    completa.estado.fase = 'chefe';
    completa.venceuChefe();
    expect(completa.estado.fase).toBe('rua');
    expect(completa.estado.bairro).toBe(1);
  });

  it('o número de bairros nunca passa dos que existem nem fica abaixo de 1', () => {
    expect(new Run(C, 5, 'bruxinha', { bairros: 99 }).totalDeBairros).toBe(3);
    expect(new Run(C, 5, 'bruxinha', { bairros: 0 }).totalDeBairros).toBe(1);
  });
});
