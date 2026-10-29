import { describe, expect, it } from 'vitest';
import { conteudo, exploracao, gerador, luz as cfgLuz, modelos } from '../../../src/sim/content';
import { gerarRua, type FimDeBeco, type RuaGerada } from '../../../src/sim/gerador';
import type { Retangulo, V2 } from '../../../src/sim/geometria';
import { enfileirar, passo } from '../../../src/sim/mundo';
import { criarFicha, eventosDo } from '../../../src/sim/partida';
import type { Bolso } from '../../../src/sim/regrasDaRua';
import { montarRua, type RuaDeLuta } from '../../../src/sim/ruaDeLuta';
import { novoSusto } from '../../../src/sim/susto';
import { rodar } from './ajuda';

const cfg = exploracao.fins;
const gerar = (s: number) => gerarRua(s, gerador, modelos, cfgLuz, { bairro: s % 3 });

/** A primeira semente cuja rua tem o fim de beco pedido. */
function sementeCom(tipo: FimDeBeco): number {
  for (let s = 1; s < 200; s++) if (gerar(s).fins?.some((f) => f.tipo === tipo)) return s;
  throw new Error(`nenhuma rua com ${tipo}`);
}

function novaRua(semente: number, doces = 0): RuaDeLuta {
  const g = gerar(semente);
  const bolso: Bolso = { doces, consumiveis: [], susto: novoSusto() };
  const r = montarRua(g, criarFicha('bruxinha', conteudo), conteudo, semente, bolso, {
    bairro: semente % 3,
    semEncantos: true,
  });
  r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
  afastarInimigos(r);
  return r;
}

/** Tira os inimigos de perto (o canto do mapa fica fora do caminho). */
function afastarInimigos(r: RuaDeLuta): void {
  for (const e of r.mundo.entidades)
    if (e.tipo === 'inimigo' && e.especie !== 'poste_corrompido') {
      e.pos = { x: 0.5, y: 0.5 };
      e.posAnterior = { x: 0.5, y: 0.5 };
    }
}

function levar(r: RuaDeLuta, p: V2): void {
  r.jogador.pos = { ...p };
  r.jogador.posAnterior = { ...p };
}

function interagir(r: RuaDeLuta): void {
  enfileirar(r.mundo, { tipo: 'usar', id: r.jogador.id, acao: 'interagir', x: 0, y: 0 });
  passo(r.mundo);
}

const dentro = (p: V2, a: Retangulo) => p.x > a.x0 && p.x < a.x1 && p.y > a.y0 && p.y < a.y1;
const bloqueado = (g: RuaGerada, p: V2) => g.bloqueado.some((b) => dentro(p, b));

describe('atalho escuro e fins de beco no gerador', () => {
  it('quase toda rua tem um atalho escuro, sem postes, com baú e lixeiras no caminho', () => {
    let comAtalho = 0;
    for (let s = 1; s <= 12; s++) {
      const g = gerar(s);
      if (!g.atalho) continue;
      comAtalho++;
      const { a, b, bau } = g.atalho;
      expect(a.x === b.x || a.y === b.y).toBe(true);
      expect(bloqueado(g, bau)).toBe(false);
      const faixa = {
        x0: Math.min(a.x, b.x) - 3,
        y0: Math.min(a.y, b.y) - 3,
        x1: Math.max(a.x, b.x) + 3,
        y1: Math.max(a.y, b.y) + 3,
      };
      // Sem postes no miolo do atalho (os das pontas são das ruas da rota).
      const miolo = {
        x0: a.x === b.x ? faixa.x0 : faixa.x0 + 9,
        y0: a.y === b.y ? faixa.y0 : faixa.y0 + 9,
        x1: a.x === b.x ? faixa.x1 : faixa.x1 - 9,
        y1: a.y === b.y ? faixa.y1 : faixa.y1 - 9,
      };
      const postes = g.rua.objetos.filter(
        (o) => o.modelo === 'poste' && dentro({ x: o.x + 0.5, y: o.y + 0.5 }, miolo),
      );
      expect(postes).toEqual([]);
      const lixeiras = g.rua.objetos.filter(
        (o) => o.modelo === 'lixeira' && dentro({ x: o.x + 0.5, y: o.y + 0.5 }, miolo),
      );
      expect(lixeiras.length).toBeGreaterThan(0);
      // O atalho nunca passa por cima da rua interditada do 1º Poste.
      const nos = g.rota.slice(1, -1);
      const ia = nos.findIndex((n) => n.x === a.x && n.y === a.y);
      const ib = nos.findIndex((n) => n.x === b.x && n.y === b.y);
      const c = g.bloqueios[0]!.area;
      const m = { x: (c.x0 + c.x1) / 2, y: (c.y0 + c.y1) / 2 };
      const seg = nos.findIndex((n, k) => {
        const p = nos[k + 1];
        if (!p) return false;
        const r = {
          x0: Math.min(n.x, p.x) - 6,
          y0: Math.min(n.y, p.y) - 6,
          x1: Math.max(n.x, p.x) + 6,
          y1: Math.max(n.y, p.y) + 6,
        };
        return dentro(m, r) && (n.x === p.x ? Math.abs(m.x - n.x) < 6 : Math.abs(m.y - n.y) < 6);
      });
      expect(seg).toBeGreaterThanOrEqual(0);
      expect(ia <= seg && ib > seg).toBe(false);
    }
    expect(comAtalho).toBeGreaterThanOrEqual(9);
  });

  it('os fins de beco têm o poço, as três velas apagadas e a casa, longe dos obstáculos', () => {
    for (const tipo of ['poco', 'velas', 'assombrada'] as const) {
      const g = gerar(sementeCom(tipo));
      const f = g.fins!.find((x) => x.tipo === tipo)!;
      expect(bloqueado(g, f.centro)).toBe(false);
      expect(g.zonas.some((z) => z.tipo === 'quintal' && dentro(f.centro, z.area))).toBe(true);
      if (tipo === 'poco') expect(g.rua.objetos[f.objetos[0]!]!.modelo).toBe('poco');
      if (tipo === 'velas') {
        expect(f.objetos).toHaveLength(3);
        for (const i of f.objetos)
          expect(g.rua.objetos[i]).toMatchObject({ modelo: 'vela', apagada: true });
      }
      if (tipo === 'assombrada')
        expect(
          g.rua.objetos.some(
            (o) => o.modelo === 'sobrado' && dentro({ x: o.x + 1, y: o.y + 1 }, f.area),
          ),
        ).toBe(true);
    }
  });
});

describe('Poço dos Desejos', () => {
  it('sem doces suficientes só avisa; com eles, cobra o preço e dá um consumível uma vez', () => {
    const s = sementeCom('poco');
    const r = novaRua(s, cfg.poco.preco - 1);
    const fins = r.regras.fins!;
    const i = fins.fins.findIndex((f) => f.tipo === 'poco');
    const poco = fins.fins[i]!;
    levar(r, { x: poco.centro.x + 1.1, y: poco.centro.y });
    expect(fins.pertoDe(r.jogador.pos)).toEqual({ fim: i, vela: null });
    interagir(r);
    expect(r.regras.bolso.doces).toBe(cfg.poco.preco - 1);
    expect(r.regras.bolso.consumiveis).toEqual([]);
    expect(poco.usado).toBe(false);

    r.regras.bolso.doces = cfg.poco.preco + 5;
    interagir(r);
    expect(r.regras.bolso.doces).toBe(5);
    expect(r.regras.bolso.consumiveis).toHaveLength(1);
    expect(eventosDo(r.mundo.eventos, 'desejo')).toHaveLength(1);
    expect(fins.pertoDe(r.jogador.pos)).toBeNull();
    interagir(r);
    expect(r.regras.bolso.doces).toBe(5);
  });
});

describe('Quintal das Velas', () => {
  function velas(): { r: RuaDeLuta; i: number } {
    const r = novaRua(sementeCom('velas'));
    return { r, i: r.regras.fins!.fins.findIndex((f) => f.tipo === 'velas') };
  }

  it('a primeira vela começa o tempo e chama as pestinhas; as três acesas dão doces e XP', () => {
    const { r, i } = velas();
    const f = r.regras.fins!.fins[i]!;
    const antes = r.mundo.entidades.filter((e) => e.tipo === 'inimigo').length;
    levar(r, { x: f.velas[0]!.pos.x + 0.6, y: f.velas[0]!.pos.y });
    interagir(r);
    expect(f.velas[0]!.acesa).toBe(true);
    expect(f.ate).not.toBeNull();
    expect(r.mundo.entidades.filter((e) => e.tipo === 'inimigo').length).toBe(
      antes + cfg.velas.pestinhas,
    );
    expect(eventosDo(r.mundo.eventos, 'vela').at(-1)).toMatchObject({ acesa: true });
    afastarInimigos(r);
    for (const k of [1, 2]) {
      levar(r, { x: f.velas[k]!.pos.x + 0.6, y: f.velas[k]!.pos.y });
      interagir(r);
    }
    expect(f.vencido).toBe(true);
    expect(eventosDo(r.mundo.eventos, 'desafioVencido').at(-1)?.desafio).toBe('velas');
    expect(eventosDo(r.mundo.eventos, 'ganhouXp').some((e) => e.motivo === 'desafio')).toBe(true);
    expect(r.mundo.entidades.some((e) => e.especie === 'doce')).toBe(true);
  });

  it('inimigo encostado apaga a vela, e o tempo acabando apaga todas', () => {
    const { r, i } = velas();
    const f = r.regras.fins!.fins[i]!;
    levar(r, { x: f.velas[0]!.pos.x + 0.6, y: f.velas[0]!.pos.y });
    interagir(r);
    const pestinha = r.mundo.entidades.find(
      (e) => e.tipo === 'inimigo' && e.especie === 'pestinha_lencol',
    )!;
    afastarInimigos(r);
    pestinha.pos = { ...f.velas[0]!.pos };
    pestinha.posAnterior = { ...f.velas[0]!.pos };
    passo(r.mundo);
    expect(f.velas[0]!.acesa).toBe(false);
    expect(eventosDo(r.mundo.eventos, 'vela').at(-1)).toMatchObject({ acesa: false });

    afastarInimigos(r);
    levar(r, { x: f.velas[1]!.pos.x + 0.6, y: f.velas[1]!.pos.y });
    interagir(r);
    expect(f.velas[1]!.acesa).toBe(true);
    for (let t = 0; t < (cfg.velas.tempoS + 0.5) * 60; t++) {
      afastarInimigos(r);
      passo(r.mundo);
    }
    expect(f.velas.every((v) => !v.acesa)).toBe(true);
    expect(f.ate).toBeNull();
    expect(f.vencido).toBe(false);
  });
});

describe('Casa Assombrada', () => {
  it('entrar chama as ondas, uma depois da outra; vencidas, aparece um baú', () => {
    const r = novaRua(sementeCom('assombrada'));
    const f = r.regras.fins!.fins.find((x) => x.tipo === 'assombrada')!;
    rodar(r.mundo, 0.1);
    expect(f.onda).toBe(-1);
    levar(r, f.centro);
    passo(r.mundo);
    const ondas = cfg.assombrada.ondas;
    const baus = r.regras.estado.baus.length;
    for (let k = 0; k < ondas.length; k++) {
      expect(f.onda).toBe(k);
      expect(f.ids).toHaveLength(ondas[k]!);
      for (const id of f.ids) r.mundo.entidades.find((e) => e.id === id)!.combate!.coragem = 0;
      passo(r.mundo);
    }
    expect(f.vencido).toBe(true);
    expect(r.regras.estado.baus.length).toBe(baus + 1);
    expect(r.regras.estado.baus.at(-1)!.doces).toBe(cfg.assombrada.doces);
    expect(eventosDo(r.mundo.eventos, 'desafioVencido').at(-1)?.desafio).toBe('assombrada');
  });
});
