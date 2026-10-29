import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import type { ResultadoDaRun } from '../../src/bots/jogarRun';
import { resumirSurpresas, type SurpresasDaRun } from '../../src/bots/frequencia';
import { relatorio } from '../../src/bots/relatorio';
import { bots, configRun as cfgRun } from '../../src/sim/content';
import { PASTA } from './comum';

/**
 * Começa do zero, a não ser com `BOTS_MANTER=1`: aí guarda o que já foi jogado e o relatório junta
 * tudo (para refazer um campeão só, por exemplo `BOTS_MANTER=1 npx vitest run --config
 * vitest.bots.config.ts tests/bots/fantasma.bots.ts`; com `BOTS_PERFIS=medio`, só um perfil).
 */
export function setup(): void {
  if (process.env['BOTS_MANTER'] === '1') return;
  rmSync(PASTA, { recursive: true, force: true });
}

/** Depois de todos os campeões: junta os arquivos de cada perfil e escreve docs/BALANCO.md. */
export function teardown(): void {
  if (!existsSync(PASTA)) return;
  const arquivos = readdirSync(PASTA);
  const runs: Record<string, ResultadoDaRun[]> = {};
  for (const perfil of Object.keys(bots.perfis)) {
    // Na ordem dos campeões de bots.json (cada arquivo é `perfil-campeão.json`).
    const deste = bots.campeoes
      .map((campeao) => `${perfil}-${campeao}.json`)
      .filter((a) => arquivos.includes(a))
      .flatMap((a) => JSON.parse(readFileSync(`${PASTA}/${a}`, 'utf8')) as ResultadoDaRun[]);
    if (deste.length > 0) runs[perfil] = deste;
  }
  if (Object.keys(runs).length === 0) return;
  // A regra de frequência das surpresas (tests/bots/surpresas.bots.ts), quando foi rodada.
  const surpresas = arquivos.includes('surpresas.json')
    ? resumirSurpresas(
        JSON.parse(readFileSync(`${PASTA}/surpresas.json`, 'utf8')) as SurpresasDaRun[],
        cfgRun.baus.rarosPorBairro,
      )
    : undefined;
  const quando = new Date().toISOString().slice(0, 10).split('-').reverse().join('/');
  writeFileSync('docs/BALANCO.md', relatorio(runs, bots, quando, surpresas));
}
