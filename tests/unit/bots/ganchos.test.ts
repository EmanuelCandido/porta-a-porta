import { describe, expect, it } from 'vitest';
import type { ResultadoDaRun } from '../../../src/bots/jogarRun';
import {
  buildDaRun,
  metricasDoPerfil,
  rankingDeBuilds,
  relatorio,
  valorDaMeta,
} from '../../../src/bots/relatorio';
import { bots } from '../../../src/sim/content';

// G10, parte 2: as metas dos ganchos que faltavam (GAMEPLAY.md, "Metas de teste dos ganchos").

function run(venceu: boolean, extra: Partial<ResultadoDaRun> = {}): ResultadoDaRun {
  return {
    perfil: 'experiente',
    campeao: 'bruxinha',
    semente: 1,
    venceu,
    bairrosVencidos: venceu ? 3 : 0,
    tempoS: 900,
    mapas: [],
    tratos: ['a', 'b', 'c'],
    evolucoes: [],
    conjuntosDe4: [],
    conjuntos: [],
    nivel: 10,
    faltou: null,
    ...extra,
  };
}

const meta = (id: string) => bots.metas.find((m) => m.id === id)!;
const com4 = (marca: string) => ({
  conjuntosDe4: [marca],
  conjuntos: [{ marca, nivel: 4 }],
});

describe('metas dos ganchos no relatório dos bots', () => {
  const runs = [
    run(true, com4('abobora')),
    run(false, com4('abobora')),
    run(true, com4('pacto')),
    run(true, { tratos: [] }),
    run(false),
  ];
  const m = metricasDoPerfil('experiente', runs);
  const porPerfil = { experiente: m };

  it('conta as runs com Conjunto de 4 e a taxa de vitória de cada Conjunto', () => {
    expect(valorDaMeta(meta('conjuntoDe4'), porPerfil)).toBeCloseTo(3 / 5);
    expect(m.porConjuntoDe4).toEqual({
      abobora: { runs: 2, vitorias: 1 },
      pacto: { runs: 1, vitorias: 1 },
    });
    expect(valorDaMeta(meta('conjuntoQueMenosVence'), porPerfil)).toBe(0.5);
    expect(valorDaMeta(meta('conjuntoQueMaisVence'), porPerfil)).toBe(1);
    // 3 vitórias: o Conjunto mais presente está em 1 delas.
    expect(valorDaMeta(meta('conjuntoNasVitorias'), porPerfil)).toBeCloseTo(1 / 3);
  });

  it('as vitórias do Bom Vizinho são as que aceitaram até o limite de tratos da meta', () => {
    expect(meta('bomVizinho').maxTratos).toBe(1);
    expect(m.vitoriasPorTratos).toEqual({ 0: 1, 3: 2 });
    expect(valorDaMeta(meta('bomVizinho'), porPerfil)).toBeCloseTo(1 / 3);
    expect(valorDaMeta(meta('bomVizinho'), { experiente: metricasDoPerfil('x', []) })).toBeNull();
  });

  it('a build é o campeão com os Conjuntos ativos, e o ranking pede um mínimo de runs', () => {
    expect(
      buildDaRun({
        campeao: 'fantasma',
        conjuntos: [
          { marca: 'pacto', nivel: 2 },
          { marca: 'abobora', nivel: 4 },
        ],
      }),
    ).toBe('fantasma + abobora 4 + pacto 2');
    const lista = [
      ...Array.from({ length: 3 }, () => run(true, { campeao: 'esqueleto' })),
      ...Array.from({ length: 3 }, (_, i) => run(i === 0)),
      run(true, { campeao: 'vampirinho' }),
    ];
    const ranking = rankingDeBuilds({ experiente: lista }, 3);
    expect(ranking.map((b) => b.build)).toEqual(['esqueleto', 'bruxinha']);
    expect(ranking[1]).toMatchObject({ runs: 3, vitorias: 1 });
  });

  it('o Markdown traz as metas novas, os Conjuntos de 4 e as builds', () => {
    const md = relatorio({ experiente: runs }, { ...bots, minRunsPorBuild: 1 }, '15/10/2026');
    expect(md).toContain('## Conjuntos de 4');
    expect(md).toContain('| abobora | Experiente | 2 | 50% | 33% |');
    expect(md).toContain('## Builds que mais e que menos vencem');
    expect(md).toContain('| bruxinha + abobora 4 | 2 | 50% |');
    expect(md).toContain('Vitórias da rota do Bom Vizinho');
  });
});
