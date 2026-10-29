import { describe, expect, it } from 'vitest';
import { causarDano } from '../../../src/sim/combate';
import { conteudo, exploracao, gerador } from '../../../src/sim/content';
import { colisaoDoObjeto } from '../../../src/sim/casaDesperta';
import type { Minijogo } from '../../../src/sim/minijogos';
import { enfileirar, passo, removerEntidade } from '../../../src/sim/mundo';
import { eventosDo } from '../../../src/sim/partida';
import { Run, type ConteudoRun, type RuaDaRun } from '../../../src/sim/run';

const C = conteudo as ConteudoRun;
const D = exploracao.desconfiada;

function imortal(r: RuaDaRun): void {
  r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
}

/** A rua (bairro e rua dados) com a casa desconfiada `i` e o jogador na porta, sem inimigos. */
function naPorta(semente = 3, bairro = 0, rua = 1): { run: Run; r: RuaDaRun; i: number } {
  const run = new Run(C, semente);
  run.estado.bairro = bairro;
  run.estado.ruaNoBairro = rua;
  const r = run.novaRua();
  imortal(r);
  const ex = r.regras.exploracao!;
  const d = ex.estado.desconfiadas[0]!;
  for (const e of [...r.mundo.entidades]) if (e.tipo === 'inimigo') removerEntidade(r.mundo, e.id);
  r.jogador.pos = { x: d.x, y: d.y };
  r.jogador.posAnterior = { x: d.x, y: d.y };
  return { run, r, i: 0 };
}

function bater(r: RuaDaRun): void {
  enfileirar(r.mundo, { tipo: 'usar', id: r.jogador.id, acao: 'interagir', x: 0, y: 0 });
  passo(r.mundo);
}

/** Joga o minijogo com a resposta certa (perfeito) ou sem fazer nada (erro); a rua fica parada. */
function jogar(m: Minijogo, acertar: boolean): void {
  for (let k = 0; k < 60 * 20 && !m.terminou; k++) {
    const e = acertar ? m.respostaCerta() : null;
    if (e) m.entrar(e);
    m.passo();
  }
}

describe('Casa Desconfiada', () => {
  it('toda rua tem as casas do bairro: térreas, apagadas, longe umas das outras', () => {
    const cfg = gerador.exploracao.desconfiadas;
    for (const bairro of [0, 1, 2]) {
      for (let s = 1; s <= 6; s++) {
        const run = new Run(C, s);
        run.estado.bairro = bairro;
        const r = run.novaRua();
        const ds = r.gerada.exploracao.desconfiadas ?? [];
        const [min, max] = cfg.porBairro[bairro]!;
        expect(ds.length).toBeGreaterThanOrEqual(Math.min(1, min));
        expect(ds.length).toBeLessThanOrEqual(max);
        for (const d of ds) {
          const o = r.gerada.rua.objetos[d.objeto]!;
          expect(cfg.modelos).toContain(o.modelo);
          expect((o as { apagada?: boolean }).apagada).toBe(true);
          expect(r.gerada.exploracao.campainhas.some((c) => c.x === d.x && c.y === d.y)).toBe(
            false,
          );
        }
        for (let a = 0; a < ds.length; a++)
          for (let b = a + 1; b < ds.length; b++)
            expect(Math.hypot(ds[a]!.x - ds[b]!.x, ds[a]!.y - ds[b]!.y)).toBeGreaterThanOrEqual(
              cfg.distanciaEntre,
            );
      }
    }
  }, 60_000);

  it('a mesma semente dá as mesmas casas e os mesmos minijogos', () => {
    const a = naPorta(9).r.regras.exploracao!.estado.desconfiadas;
    const b = naPorta(9).r.regras.exploracao!.estado.desconfiadas;
    expect(a.map((d) => [d.objeto, d.minijogo, d.semente])).toEqual(
      b.map((d) => [d.objeto, d.minijogo, d.semente]),
    );
  });

  it('com inimigo perto a porta não abre; com a rua calma, F abre o minijogo', () => {
    const { r } = naPorta();
    const ex = r.regras.exploracao!;
    const p = r.jogador.pos;
    r.regras.criarInimigo(r.mundo, 'pestinha_lencol', { x: p.x + 1, y: p.y });
    bater(r);
    expect(ex.minijogo).toBeNull();
    expect(eventosDo(r.mundo.eventos, 'aviso').map((a) => a.texto)).toContain(D.textos.recusa);
    for (const e of [...r.mundo.entidades])
      if (e.tipo === 'inimigo') removerEntidade(r.mundo, e.id);
    r.mundo.eventos = [];
    bater(r);
    expect(ex.minijogo).not.toBeNull();
    expect(eventosDo(r.mundo.eventos, 'desafioIniciado')).toHaveLength(1);
    // A porta não abre de novo.
    expect(ex.pertoDe(r.jogador.pos)?.acao).not.toBe('desconfiada');
  });

  it('acerto perfeito dá os doces do bairro (com o Susto) e o Frenesi não dobra', () => {
    for (const frenesi of [false, true]) {
      const { r } = naPorta(3, 1);
      if (frenesi) r.regras.bolso.susto.frenesi = 5;
      bater(r);
      jogar(r.regras.exploracao!.minijogo!, true);
      r.mundo.eventos = [];
      passo(r.mundo);
      const res = eventosDo(r.mundo.eventos, 'desafioResultado')[0]!;
      expect(res.resultado).toBe('perfeito');
      expect(res.doces).toBe(Math.round(D.premios.perfeito * D.multPorBairro[1]!));
      const doces = r.mundo.eventos.find((e) => e.tipo === 'doces');
      // Sem trato de doces nem Susto: o valor do prêmio, igual com ou sem Frenesi.
      expect(doces && 'valor' in doces ? doces.valor : 0).toBe(res.doces);
    }
  });

  it('o primeiro erro da run é perdoado; o segundo acorda a casa, que dá doces ao cair', () => {
    const { run, r } = naPorta(4, 0, 1);
    bater(r);
    jogar(r.regras.exploracao!.minijogo!, false);
    r.mundo.eventos = [];
    passo(r.mundo);
    expect(eventosDo(r.mundo.eventos, 'desafioResultado')[0]!.perdoado).toBe(true);
    expect(r.mundo.entidades.some((e) => e.especie === D.especie)).toBe(false);
    expect(run.estado.desconfiadaPerdoada).toBe(true);

    // Outra rua da mesma run: agora a casa acorda.
    const r2 = run.novaRua();
    imortal(r2);
    const d = r2.regras.exploracao!.estado.desconfiadas[0]!;
    for (const e of [...r2.mundo.entidades])
      if (e.tipo === 'inimigo') removerEntidade(r2.mundo, e.id);
    r2.jogador.pos = { x: d.x, y: d.y };
    bater(r2);
    jogar(r2.regras.exploracao!.minijogo!, false);
    r2.mundo.eventos = [];
    passo(r2.mundo);
    const casa = r2.mundo.entidades.find((e) => e.especie === D.especie)!;
    expect(casa).toBeDefined();
    expect(casa.marcas?.desconfiada).toBe(0);
    expect(eventosDo(r2.mundo.eventos, 'objetoVirou').map((v) => v.objeto)).toEqual([d.objeto]);
    // O lote ficou sem a colisão da casa.
    const o = r2.gerada.rua.objetos[d.objeto]!;
    const c0 = colisaoDoObjeto(o, C.modelos)[0]!;
    expect(r2.mundo.obstaculos.some((x) => x.x0 === c0.x0 && x.y0 === c0.y0)).toBe(false);
    // Derrotada: os doces da casa inteira.
    const inicio = r2.mundo.eventos.length;
    causarDano(r2.mundo, casa, {
      origem: r2.jogador.id,
      bruto: 1e6,
      tipo: 'habilidade',
      verdadeiro: true,
    });
    r2.regras.sistema.depoisDoTick!(r2.mundo, r2.mundo.eventos.slice(inicio));
    const doces = eventosDo(r2.mundo.eventos.slice(inicio), 'doces');
    expect(doces.some((x) => x.valor === D.premios.derrotada)).toBe(true);
    expect(eventosDo(r2.mundo.eventos, 'aviso').map((a) => a.texto)).toContain(D.textos.derrotada);
  });
});
