import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { resumirSurpresas, simularSurpresas } from '../../src/bots/frequencia';
import { bots, conteudo } from '../../src/sim/content';
import type { ConteudoRun } from '../../src/sim/run';
import { PASTA } from './comum';

// Tarefa G8: a regra de frequência das surpresas validada em runs simuladas sem luta
// (`bots.json`, `surpresas.runs`; `BOTS_SURPRESAS=N` muda quantas).
it('a regra de frequência das surpresas vale nas runs simuladas', () => {
  const n = Number(process.env['BOTS_SURPRESAS'] ?? bots.surpresas.runs);
  const c = conteudo as ConteudoRun;
  const runs = Array.from({ length: n }, (_, i) => simularSurpresas(c, i + 1));
  mkdirSync(PASTA, { recursive: true });
  writeFileSync(`${PASTA}/surpresas.json`, JSON.stringify(runs));
  const r = resumirSurpresas(runs, c.run.baus.rarosPorBairro);
  expect(r.maximoPorRua).toBeLessThanOrEqual(1);
  expect(r.bairrosComRaro).toBe(1);
  expect(r.carrinhos).toEqual({ min: 1, max: 1 });
  expect(r.semEncontro).toBeLessThanOrEqual(bots.surpresas.semEncontroMax);
});
