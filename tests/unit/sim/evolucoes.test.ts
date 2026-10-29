import { describe, expect, it } from 'vitest';
import { combate, conteudo, evolucoes, tabelaDeEvolucoes } from '../../../src/sim/content';
import {
  escolherEvolucao,
  evolucaoPendente,
  nomeDaEvolucao,
  opcoesDeEvolucao,
} from '../../../src/sim/evolucoes';
import { definirPosto } from '../../../src/sim/habilidades';
import { enfileirar } from '../../../src/sim/mundo';
import { criarFicha, gastarPonto } from '../../../src/sim/partida';
import { boneco, cena, eventos, habilidadeDe, lancar, perdida, rodar, type Cena } from './ajuda';

const niveis = combate.niveis;
const base = (tecla: 'Q' | 'W' | 'E' | 'R') => habilidadeDe('bruxinha', tecla);

/** A Bruxinha no posto da evolução em todas as teclas, com a evolução pedida já escolhida. */
function evoluida(tecla: 'Q' | 'W' | 'E' | 'R', id: string | null): Cena {
  const c = cena([], { posto: niveis.postoDaEvolucao });
  if (id) {
    const ficha = { lancador: c.heroi.lancador!, despertares: true };
    expect(escolherEvolucao(ficha, tecla, id, tabelaDeEvolucoes, niveis)).toBe(true);
  }
  return c;
}

const estados = (c: Cena, id: number) =>
  c.mundo.entidades.find((e) => e.id === id)!.combate!.estados.map((s) => s.tipo);

describe('escolha de evolução', () => {
  it('Q, W e E da Bruxinha têm 2 evoluções cada, e o R tem 2 Despertares', () => {
    for (const t of ['Q', 'W', 'E', 'R'] as const) {
      const lista = evolucoes[base(t).id];
      expect(lista).toHaveLength(2);
      expect(tabelaDeEvolucoes.get(base(t).id)).toHaveLength(2);
    }
    expect(evolucoes['bruxinha_r']!.every((e) => e.nome.startsWith('Despertar'))).toBe(true);
  });

  it('a escolha aparece quando a habilidade chega ao posto 3, e só uma vez', () => {
    const ficha = criarFicha('bruxinha', conteudo);
    ficha.progresso.pontos = 10;
    gastarPonto(ficha, 'Q', combate);
    gastarPonto(ficha, 'Q', combate);
    expect(evolucaoPendente(ficha, tabelaDeEvolucoes, niveis)).toBeNull();
    gastarPonto(ficha, 'Q', combate);
    expect(evolucaoPendente(ficha, tabelaDeEvolucoes, niveis)).toBe('Q');
    const opcoes = opcoesDeEvolucao(ficha, 'Q', tabelaDeEvolucoes, niveis);
    expect(opcoes.map((o) => o.evo.id)).toEqual(['ricochete', 'vassoura_pesada']);

    expect(escolherEvolucao(ficha, 'Q', 'nao_existe', tabelaDeEvolucoes, niveis)).toBe(false);
    expect(escolherEvolucao(ficha, 'Q', 'ricochete', tabelaDeEvolucoes, niveis)).toBe(true);
    const s = ficha.lancador.slots['Q']!;
    expect(s.evolucao).toBe('ricochete');
    expect(s.def.id).toBe('bruxinha_q');
    expect(s.def.ricochete).toEqual({ alvos: 2, raio: 3, fracao: 0.6 });
    expect(nomeDaEvolucao(tabelaDeEvolucoes, s.evolucao)).toBe('Ricochete');
    expect(evolucaoPendente(ficha, tabelaDeEvolucoes, niveis)).toBeNull();
    // Não troca depois de escolhida.
    expect(escolherEvolucao(ficha, 'Q', 'vassoura_pesada', tabelaDeEvolucoes, niveis)).toBe(false);
  });

  it('os Despertares do R esperam o posto 3 e a liberação da maestria', () => {
    const c = cena([], { posto: 2 });
    const ficha = { lancador: c.heroi.lancador!, despertares: true };
    // Q, W e E no posto 2: nada pendente.
    expect(evolucaoPendente(ficha, tabelaDeEvolucoes, niveis)).toBeNull();
    definirPosto(ficha.lancador, 'R', 3);
    expect(evolucaoPendente(ficha, tabelaDeEvolucoes, niveis)).toBe('R');
    ficha.despertares = false;
    expect(evolucaoPendente(ficha, tabelaDeEvolucoes, niveis)).toBeNull();
  });
});

describe('evoluções da Bruxinha', () => {
  it('Ricochete: a vassoura salta para mais 2 inimigos a até 3 tiles, com 60% do dano', () => {
    const c = evoluida('Q', 'ricochete');
    const a = boneco(c, { x: 9, y: 15 });
    const b = boneco(c, { x: 10.5, y: 16.5 });
    const d = boneco(c, { x: 11, y: 14 });
    const longe = boneco(c, { x: 9, y: 20 });
    lancar(c, 'Q', { x: 12, y: 15 });
    rodar(c.mundo, 1.5);
    expect(perdida(a)).toBeGreaterThan(0);
    expect(perdida(b) / perdida(a)).toBeCloseTo(0.6, 2);
    expect(perdida(d) / perdida(a)).toBeCloseTo(0.6, 2);
    expect(perdida(longe)).toBe(0);
  });

  it('sem a evolução, a vassoura para no primeiro inimigo', () => {
    const c = evoluida('Q', null);
    const a = boneco(c, { x: 9, y: 15 });
    const b = boneco(c, { x: 10.5, y: 16.5 });
    lancar(c, 'Q', { x: 12, y: 15 });
    rodar(c.mundo, 1.5);
    expect(perdida(a)).toBeGreaterThan(0);
    expect(perdida(b)).toBe(0);
  });

  it('Vassoura Pesada: atravessa todos, empurra 1 tile e recarrega 2 s a mais', () => {
    const c = evoluida('Q', 'vassoura_pesada');
    // Longe do fim do voo (13), onde a vassoura estoura e empurraria de volta.
    const alvos = [6, 8, 10].map((x) => boneco(c, { x, y: 15 }));
    lancar(c, 'Q', { x: 14, y: 15 });
    rodar(c.mundo, 1.5);
    for (const [i, b] of alvos.entries()) {
      expect(perdida(b)).toBeGreaterThan(0);
      expect(b.pos.x).toBeCloseTo([6, 8, 10][i]! + 1, 1);
    }
    const posto = niveis.postoDaEvolucao;
    expect(c.heroi.lancador!.slots['Q']!.recargaTotal).toBeCloseTo(
      base('Q').recarga[posto - 1]! + 2,
      6,
    );
  });

  it('Poção Explosiva: ao sumir, explode com 150% do dano por segundo', () => {
    const danoDa = (id: string | null) => {
      const c = evoluida('W', id);
      const b = boneco(c, { x: 9, y: 15 });
      lancar(c, 'W', { x: 9, y: 15 });
      rodar(c.mundo, 4);
      return { perdida: perdida(b), finais: eventos(c.mundo, 'pulso').filter((p) => p.final) };
    };
    const sem = danoDa(null);
    const com = danoDa('pocao_explosiva');
    const f = base('W').forma;
    if (f.tipo !== 'area') throw new Error('a W da Bruxinha é uma área');
    // A poça machuca dps × duração; a explosão soma 1,5 × dps.
    const duracao = f.pulsos * f.intervalo;
    expect(com.perdida / sem.perdida).toBeCloseTo((duracao + 1.5) / duracao, 2);
    expect(sem.finais).toHaveLength(0);
    expect(com.finais).toHaveLength(1);
  });

  it('Poção Grudenta: enraíza por 1 s quem fica 1,5 s dentro', () => {
    const c = evoluida('W', 'pocao_grudenta');
    const b = boneco(c, { x: 9, y: 15 });
    lancar(c, 'W', { x: 9, y: 15 });
    rodar(c.mundo, 0.25 + 1.4);
    expect(estados(c, b.id)).not.toContain('enraizado');
    rodar(c.mundo, 0.2);
    expect(estados(c, b.id)).toContain('enraizado');
  });

  it('Rastro de Faíscas: o salto deixa uma linha que machuca por 2 s', () => {
    const danoDa = (id: string | null) => {
      const c = evoluida('E', id);
      // Fora do corpo do dash, mas em cima da linha que ele percorre.
      const b = boneco(c, { x: 7, y: 15.3 });
      lancar(c, 'E', { x: 12, y: 15 });
      rodar(c.mundo, 1);
      const meio = perdida(b);
      rodar(c.mundo, 2);
      return { meio, fim: perdida(b), rastros: c.hab.rastros.length };
    };
    const sem = danoDa(null);
    expect(sem.fim).toBe(0);
    const com = danoDa('rastro_de_faiscas');
    expect(com.meio).toBeGreaterThan(0);
    expect(com.fim).toBeGreaterThan(com.meio);
    expect(com.rastros).toBe(0);
  });

  it('Pouso Leve: 30% de velocidade por 2 s e a próxima Q sem custo', () => {
    const c = evoluida('E', 'pouso_leve');
    const j = c.heroi;
    rodar(c.mundo, 0.1);
    const v0 = j.combate!.attr.velocidade;
    lancar(c, 'E', { x: 12, y: 15 });
    rodar(c.mundo, 0.5);
    expect(j.combate!.attr.velocidade).toBeCloseTo(v0 * 1.3, 6);
    expect(j.lancador!.slots['Q']!.gratis).toBe(true);
    const energia = j.combate!.energia;
    lancar(c, 'Q', { x: 20, y: 15 });
    rodar(c.mundo, base('Q').lancamento + 0.05);
    expect(j.lancador!.lancadas).toBe(2);
    // Só a regeneração: a Q não custou nada.
    expect(j.combate!.energia).toBeGreaterThanOrEqual(energia);
    expect(j.lancador!.slots['Q']!.gratis).toBe(false);
    rodar(c.mundo, 2);
    expect(j.combate!.attr.velocidade).toBeCloseTo(v0, 6);
    // A segunda Q volta a custar.
    j.lancador!.slots['Q']!.recarga = 0;
    const antes = j.combate!.energia;
    lancar(c, 'Q', { x: 20, y: 15 });
    rodar(c.mundo, base('Q').lancamento + 0.05);
    expect(j.combate!.energia).toBeLessThan(antes - base('Q').custo / 2);
  });

  it('Despertar Tempestade: 5 ondas, e a área segue o cursor', () => {
    const c = evoluida('R', 'tempestade');
    lancar(c, 'R', { x: 9, y: 15 });
    rodar(c.mundo, base('R').lancamento + 0.1);
    const area = c.hab.areas[0]!;
    expect(area.segue).toBe(true);
    enfileirar(c.mundo, { tipo: 'mirar', id: c.heroi.id, x: 9, y: 19 });
    rodar(c.mundo, 3);
    const ondas = eventos(c.mundo, 'pulso').filter((p) => p.tecla === 'R');
    expect(ondas).toHaveLength(5);
    expect(ondas[4]!.centro.y).toBeGreaterThan(ondas[0]!.centro.y + 1);
  });

  it('Despertar Abóbora Gigante: uma queda com 400% do dano e atordoamento de 1,5 s', () => {
    const danoDa = (id: string | null) => {
      const c = evoluida('R', id);
      const b = boneco(c, { x: 9, y: 15 });
      b.combate!.base.coragemMax = 1e6;
      b.combate!.attr.coragemMax = 1e6;
      b.combate!.coragem = 1e6;
      lancar(c, 'R', { x: 9, y: 15 });
      rodar(c.mundo, base('R').lancamento + 0.05);
      const atordoado = estados(c, b.id).includes('atordoado');
      rodar(c.mundo, 2);
      const ondas = eventos(c.mundo, 'pulso').filter((p) => p.tecla === 'R').length;
      return { perdida: perdida(b), atordoado, ondas };
    };
    const sem = danoDa(null);
    const com = danoDa('abobora_gigante');
    expect(sem.ondas).toBe(3);
    expect(com.ondas).toBe(1);
    expect(com.perdida / sem.perdida).toBeCloseTo(4 / 3, 2);
    expect(sem.atordoado).toBe(false);
    expect(com.atordoado).toBe(true);
  });
});
