import { describe, expect, it } from 'vitest';
import {
  album,
  campeoes,
  conteudo,
  entreRuns,
  evolucoes,
  habilidades,
  inimigos,
  luaCheia,
  noite,
  precos,
  tratos,
} from '../../../src/sim/content';
import { idsDoDiario } from '../../../src/sim/diario';
import {
  dicasAtivas,
  ehPrimeiraRun,
  escreverProgresso,
  lerProgresso,
  opcoesDaRun,
  progressoNovo,
  verDica,
  type ConteudoDoProgresso,
} from '../../../src/sim/progresso';
import { Run, type ConteudoRun, type OpcoesDaRun } from '../../../src/sim/run';

const C = conteudo as ConteudoRun;
const DIARIO = { tratos, precos, inimigos, noite, evolucoes, campeoes, habilidades, entreRuns };
const CP: ConteudoDoProgresso = {
  album,
  luaCheia,
  entreRuns,
  campeoes,
  tratos,
  diario: idsDoDiario(DIARIO),
};

/** Abre a próxima fase Porta a Porta (recompensa neutra no portão). */
function proximaPorta(run: Run) {
  run.novaRua();
  run.estado.rotaAtual!.recompensa = 'doces_em_dobro';
  run.venceuRua();
  run.novaPorta();
  return run.estado.porta!;
}

const peso = (id: string) => C.precos.pesos[C.precos.precos[id]!.peso];

describe('primeira run (GAMEPLAY.md)', () => {
  it('a primeira porta mostra só 2 tratos, cada um com o preço mais leve dele, e marca a explicação', () => {
    for (const semente of [3, 5, 8, 13]) {
      const run = new Run(C, semente, 'bruxinha', { primeiraRun: true } as OpcoesDaRun);
      const p = proximaPorta(run);
      expect(p.ofertas).toHaveLength(C.run.primeiraRun.tratos);
      expect(p.primeira).toBe(true);
      for (const o of p.ofertas) {
        expect(o.vermelha ?? false).toBe(false);
        const leve = Math.min(...C.tratos.tratos[o.trato]!.precos.map(peso));
        expect(o.precos.map(peso)).toEqual([leve]);
      }
      run.aceitar(p.ofertas[0]!.casa);
      const p2 = proximaPorta(run);
      // A segunda porta já é a normal (um preço aceito pode apagar casas, então só a marca).
      expect(p2.primeira).toBeUndefined();
    }
  }, 30_000);

  it('sem a opção, a primeira porta é a de sempre', () => {
    const p = proximaPorta(new Run(C, 5));
    expect(p.primeira).toBeUndefined();
    expect(p.ofertas.length).toBeGreaterThan(C.run.primeiraRun.tratos);
  });

  it('o save novo pede a primeira run; depois de uma run ou de desligar as dicas, não', () => {
    const p = progressoNovo(album);
    expect(ehPrimeiraRun(p)).toBe(true);
    expect(opcoesDaRun(p, CP, 'run', 'bruxinha').primeiraRun).toBe(true);
    expect(opcoesDaRun(p, CP, 'noite', 'bruxinha').primeiraRun).toBeUndefined();
    expect(ehPrimeiraRun({ ...p, runs: 1 })).toBe(false);
    expect(ehPrimeiraRun({ ...p, dicas: false })).toBe(false);
  });

  it('as dicas de uma linha aparecem uma vez e somem de vez depois da primeira vitória', () => {
    const p = progressoNovo(album);
    expect(verDica(p, 'susto')).toBe(true);
    expect(verDica(p, 'susto')).toBe(false);
    const vencedor = { ...progressoNovo(album), vitorias: 1 };
    expect(dicasAtivas(vencedor)).toBe(false);
    expect(verDica(vencedor, 'evolucao')).toBe(false);
  });

  it('um save de antes das dicas continua valendo, com as dicas ligadas', () => {
    const antigo = JSON.parse(escreverProgresso({ ...progressoNovo(album), runs: 4 }));
    delete antigo.dicas;
    delete antigo.dicasVistas;
    const lido = lerProgresso(JSON.stringify(antigo), album);
    expect(lido.runs).toBe(4);
    expect(lido.dicas).toBe(true);
    expect(lido.dicasVistas).toEqual([]);
  });
});
