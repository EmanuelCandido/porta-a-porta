import { describe, expect, it } from 'vitest';
import {
  resumirSurpresas,
  secaoDasSurpresas,
  simularSurpresas,
} from '../../../src/bots/frequencia';
import { bots, conteudo } from '../../../src/sim/content';
import type { ConteudoRun } from '../../../src/sim/run';

const C = conteudo as ConteudoRun;

describe('regra de frequência das surpresas (G8)', () => {
  it('cada run simulada passa pelas 9 ruas com no máximo um encontro em cada', () => {
    const runs = [1, 2].map((s) => simularSurpresas(C, s));
    for (const r of runs) {
      expect(r.encontros).toHaveLength(9);
      expect(r.porRua).toHaveLength(9);
      expect(Math.max(...r.porRua)).toBeLessThanOrEqual(1);
      expect(r.encontros.filter((t) => t === 'carrinho_de_pipoca')).toHaveLength(1);
      expect(r.rarosPorBairro.every((n) => n >= C.run.baus.rarosPorBairro)).toBe(true);
      expect(r.portas).toBe(6);
    }
    const resumo = resumirSurpresas(runs, C.run.baus.rarosPorBairro);
    expect(resumo.ruas).toBe(18);
    expect(resumo.bairrosComRaro).toBe(1);
    expect(resumo.carrinhos).toEqual({ min: 1, max: 1 });
    const secao = secaoDasSurpresas(resumo, bots.surpresas).join('\n');
    expect(secao).toContain('## Surpresas (regra de frequência)');
    expect(secao).toContain('| No máximo 1 encontro raro por rua | 1 | ✅ |');
  }, 60_000);
});
