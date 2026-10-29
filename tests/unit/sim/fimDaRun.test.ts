import { describe, expect, it } from 'vitest';
import { causarDano } from '../../../src/sim/combate';
import { configRun, conteudo, tabelaDeEvolucoes, combate } from '../../../src/sim/content';
import { escolherEvolucao } from '../../../src/sim/evolucoes';
import { definirPosto } from '../../../src/sim/habilidades';
import { passo } from '../../../src/sim/mundo';
import { Run, type ConteudoRun } from '../../../src/sim/run';

const C = conteudo as ConteudoRun;

describe('tela do fim da run', () => {
  it('na derrota, diz onde foi e quantos Postes faltaram, com a build e os números', () => {
    const run = new Run(C, 11);
    run.estado.tratos.push('eco');
    run.estado.precos.push({ id: 'poste_apagado', trato: 'eco' });
    definirPosto(run.ficha.lancador, 'Q', 3);
    escolherEvolucao(run.ficha, 'Q', 'ricochete', tabelaDeEvolucoes, combate.niveis);
    const r = run.novaRua();
    r.regras.estado.docesNaRua = 120;
    r.regras.estado.derrotados = 9;
    const faltou = r.regras.oQueFaltou();
    expect(faltou).toBe('Faltou derrubar 2 Postes Corrompidos');
    run.perdeu(r.regras.estado, { onde: `${run.nomeDoBairro} · ${r.gerada.rua.nome}`, faltou });
    const res = run.resumo();
    expect(res.venceu).toBe(false);
    expect(res.campeao).toBe('Bruxinha');
    expect(res.onde).toContain(configRun.nomesDosBairros[0]!);
    expect(res.faltou).toBe(faltou);
    expect(res.evolucoes).toEqual([
      { tecla: 'Q', habilidade: 'Vassoura Disparada', id: 'ricochete', nome: 'Ricochete' },
    ]);
    expect(res.tratos.map((t) => t.nome)).toEqual([C.tratos.tratos['eco']!.nome]);
    expect(res.precos).toEqual([C.precos.precos['poste_apagado']!.nome]);
    expect(res.derrotados).toBe(9);
    expect(res.docesGanhos).toBe(120);
    // 10% dos doces ganhos (nenhum chefe vencido).
    expect(res.docesGuardados).toBe(12);
  });

  it('com um Poste de pé, a frase fica no singular; sem Postes, mede o caminho', () => {
    const run = new Run(C, 12);
    const r = run.novaRua();
    const [p1, p2] = r.regras.estado.postes;
    causarDano(r.mundo, p1!, {
      origem: r.jogador.id,
      bruto: 1e7,
      tipo: 'habilidade',
      verdadeiro: true,
    });
    expect(r.regras.oQueFaltou()).toBe('Faltou derrubar 1 Poste Corrompido');
    causarDano(r.mundo, p2!, {
      origem: r.jogador.id,
      bruto: 1e7,
      tipo: 'habilidade',
      verdadeiro: true,
    });
    passo(r.mundo);
    expect(r.regras.oQueFaltou()).toMatch(/^O portão estava aberto, a \d+% do caminho$/);
  });

  it('contra o chefe, diz quanto de Coragem sobrou a ele; chefes rendem 50 Doces Guardados', () => {
    const run = new Run(C, 13);
    run.estado.ruaNoBairro = C.run.ruasPorBairro;
    run.estado.fase = 'chefe';
    const arena = run.novaArena();
    passo(arena.mundo);
    const chefe = arena.regras.estado.chefe!;
    chefe.combate!.coragem = chefe.combate!.attr.coragemMax * 0.12;
    expect(arena.regras.oQueFaltou()).toMatch(/ficou com 12% de Coragem$/);
    run.estado.chefesVencidos = 1;
    run.estado.docesGanhos = 300;
    run.perdeu(undefined, { onde: 'Praça', faltou: arena.regras.oQueFaltou() });
    expect(run.resumo().docesGuardados).toBe(30 + C.run.album.porChefe);
  });

  it('na vitória, o resumo vem sem "faltou"', () => {
    const run = new Run(C, 14);
    run.estado.bairro = run.totalDeBairros - 1;
    run.estado.ruaNoBairro = C.run.ruasPorBairro;
    run.estado.fase = 'chefe';
    run.venceuChefe();
    expect(run.estado.fase).toBe('vitoria');
    const res = run.resumo();
    expect(res.venceu).toBe(true);
    expect(res.faltou).toBeNull();
    expect(res.chefesVencidos).toBe(1);
  });
});
