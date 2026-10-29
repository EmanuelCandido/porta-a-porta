import { mkdirSync, writeFileSync } from 'node:fs';
import { jogarRun } from '../../src/bots/jogarRun';
import { bots, conteudo, tabelaDeEvolucoes } from '../../src/sim/content';
import type { ConteudoRun } from '../../src/sim/run';

export const PASTA = 'test-results/bots';
/** As mesmas sementes para todos os perfis: cada perfil joga as mesmas ruas. */
const SEMENTE_INICIAL = 1000;

/**
 * Joga as runs de um campeão com cada perfil de `content/bots.json` (ou só os de
 * `BOTS_PERFIS=medio,experiente`) e guarda cada perfil num arquivo para o relatório. Um arquivo de
 * teste por campeão: os quatro jogam em paralelo.
 */
export function rodarCampeao(campeao: string): void {
  const n = Number(process.env['BOTS_RUNS'] ?? bots.runsPorPerfil);
  const c = { conteudo: conteudo as ConteudoRun, bots, evolucoes: tabelaDeEvolucoes };
  const filtro = process.env['BOTS_PERFIS']?.split(',');
  const perfis = Object.keys(bots.perfis).filter((p) => !filtro || filtro.includes(p));
  mkdirSync(PASTA, { recursive: true });
  for (const perfil of perfis) {
    const runs = Array.from({ length: n }, (_, i) => {
      const r = jogarRun(SEMENTE_INICIAL + i, perfil, c, { campeao });
      console.log(
        `${perfil} ${campeao} ${i + 1}/${n}: ${r.venceu ? 'venceu' : `parou em ${r.mapas.length} mapas`}`,
      );
      return r;
    });
    writeFileSync(`${PASTA}/${perfil}-${campeao}.json`, JSON.stringify(runs));
  }
}
