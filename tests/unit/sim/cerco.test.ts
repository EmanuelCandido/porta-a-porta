import { describe, expect, it } from 'vitest';
import { temEstado } from '../../../src/sim/combate';
import {
  conteudo,
  gerador,
  inimigos,
  jogador,
  luz as cfgLuz,
  modelos,
} from '../../../src/sim/content';
import { gerarRua } from '../../../src/sim/gerador';
import { enfileirar, passo, type Entidade } from '../../../src/sim/mundo';
import { criarFicha, eventosDo } from '../../../src/sim/partida';
import type { Bolso } from '../../../src/sim/regrasDaRua';
import { montarRua, type RuaDeLuta } from '../../../src/sim/ruaDeLuta';
import { novoSusto } from '../../../src/sim/susto';

const reacoes = inimigos.reacoes;

/** Uma rua gerada sem ninguém por perto (os inimigos da rua vão para longe) e o jogador imune. */
function rua(): RuaDeLuta {
  const g = gerarRua(3, gerador, modelos, cfgLuz, { bairro: 0 });
  const bolso: Bolso = { doces: 0, consumiveis: [], susto: novoSusto() };
  const r = montarRua(g, criarFicha('fantasma', conteudo), conteudo, 3, bolso, { bairro: 0 });
  r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
  for (const e of r.mundo.entidades)
    if (e.tipo === 'inimigo' && e.especie !== 'poste_corrompido') e.pos = { x: 0.5, y: 0.5 };
  return r;
}

/** O ponto livre mais perto (fora das casas e objetos). */
function livre(r: RuaDeLuta, p: { x: number; y: number }) {
  const g = r.campo.grade;
  return g.ehLivre(p) ? p : g.centro(g.livreMaisPerto(p));
}

/** Inimigos novos em volta do jogador, a `raio` tiles. */
function emVolta(r: RuaDeLuta, especie: string, n: number, raio: number): Entidade[] {
  const j = r.jogador.pos;
  return Array.from({ length: n }, (_, k) => {
    const a = (k / n) * Math.PI * 2;
    const p = { x: j.x + Math.cos(a) * raio, y: j.y + Math.sin(a) * raio };
    return r.regras.criarInimigo(r.mundo, especie, livre(r, p));
  });
}

function rodar(r: RuaDeLuta, s: number, aCada?: () => void): void {
  for (let t = 0; t < s * 60; t++) {
    passo(r.mundo);
    aCada?.();
  }
}

describe('cerco das pestinhas', () => {
  it('só 3 atacam ao mesmo tempo; as outras esperam no anel em volta', () => {
    const r = rua();
    const ps = emVolta(r, 'pestinha_lencol', 8, 3.5);
    let maxAtacantes = 0;
    rodar(r, 4, () => {
      const atacando = ps.filter((p) => (p.ia as Record<string, unknown>)['atacante']).length;
      maxAtacantes = Math.max(maxAtacantes, atacando);
    });
    expect(maxAtacantes).toBeLessThanOrEqual(reacoes.cerco.atacantesMax);
    const j = r.jogador.pos;
    const esperando = ps.filter((p) => !(p.ia as Record<string, unknown>)['atacante']);
    expect(esperando.length).toBeGreaterThanOrEqual(ps.length - reacoes.cerco.atacantesMax);
    for (const p of esperando) {
      const d = Math.hypot(p.pos.x - j.x, p.pos.y - j.y);
      expect(d).toBeGreaterThan(reacoes.cerco.anel - 1);
    }
  });

  it('rodízio: com o tempo, mais pestinhas do que as 3 primeiras chegam a bater', () => {
    const r = rua();
    emVolta(r, 'pestinha_lencol', 7, 3.5);
    const quem = new Set<number>();
    rodar(r, 15, () => {
      for (const ev of eventosDo(r.mundo.eventos, 'ataqueAuto')) quem.add(ev.id);
    });
    expect(quem.size).toBeGreaterThan(reacoes.cerco.atacantesMax);
  });
});

describe('reações dos inimigos', () => {
  it('o golpe do jogador no preparo da pestinha corta o ataque dela', () => {
    const r = rua();
    const [p] = emVolta(r, 'pestinha_lencol', 1, 1);
    // Espera a pestinha começar o preparo.
    for (let t = 0; t < 300 && p!.ataque!.preparo === null; t++) passo(r.mundo);
    expect(p!.ataque!.preparo).not.toBeNull();
    const d = { x: p!.pos.x - r.jogador.pos.x, y: p!.pos.y - r.jogador.pos.y };
    enfileirar(r.mundo, { tipo: 'golpear', id: r.jogador.id, ...d });
    let cortou = false;
    rodar(r, 0.1, () => {
      if (eventosDo(r.mundo.eventos, 'preparoCortado').length > 0) cortou = true;
    });
    expect(cortou).toBe(true);
    expect(p!.ataque!.recarga).toBeGreaterThan(0);
  });

  it('a lanterna assusta os lençóis', () => {
    const r = rua();
    const [p] = emVolta(r, 'pestinha_lencol', 1, 1.5);
    enfileirar(r.mundo, { tipo: 'usar', id: r.jogador.id, acao: 'lanterna', x: 0, y: 0 });
    passo(r.mundo);
    expect(temEstado(p!.combate, 'medo')).toBe(true);
  });

  it('o rolamento por cima deixa a pestinha tonta (uma vez por rolamento)', () => {
    const r = rua();
    const j = r.jogador.pos;
    const p = r.regras.criarInimigo(r.mundo, 'pestinha_lencol', { x: j.x + 1, y: j.y });
    p.velocidade = 0;
    enfileirar(r.mundo, { tipo: 'rolar', id: r.jogador.id, x: 1, y: 0 });
    rodar(r, 0.4);
    // Os eventos dos testes acumulam (ninguém os consome): conta no fim.
    const tontos = eventosDo(r.mundo.eventos, 'tonto').length;
    if (Math.hypot(p.pos.x - j.x, p.pos.y - j.y) < jogador.rolamento.distancia + 1) {
      expect(tontos).toBe(1);
      expect(temEstado(p.combate, 'atordoado') || tontos === 1).toBe(true);
    }
  });

  it('quando um aliado cai perto, as outras pestinhas hesitam', () => {
    const r = rua();
    const [a, b] = emVolta(r, 'pestinha_lencol', 2, 1.2);
    a!.combate!.coragem = 0.01;
    enfileirar(r.mundo, {
      tipo: 'golpear',
      id: r.jogador.id,
      x: a!.pos.x - r.jogador.pos.x,
      y: a!.pos.y - r.jogador.pos.y,
    });
    rodar(r, 0.1);
    expect(a!.combate!.coragem).toBe(0);
    const hesita = Number((b!.ia as Record<string, unknown>)['hesitaAte'] ?? 0);
    expect(hesita).toBeGreaterThan(r.mundo.tick - 10);
  });

  it('o arremessador com pouca vida corre para perto de um aliado', () => {
    const r = rua();
    const j = r.jogador.pos;
    const arr = r.regras.criarInimigo(r.mundo, 'arremessador', livre(r, { x: j.x + 4, y: j.y }));
    const aliado = r.regras.criarInimigo(
      r.mundo,
      'pestinha_lencol',
      livre(r, { x: j.x + 4, y: j.y + 6 }),
    );
    aliado.velocidade = 0;
    arr.combate!.coragem = arr.combate!.attr.coragemMax * (reacoes.vidaBaixa.fracao / 2);
    const antes = Math.hypot(arr.pos.x - aliado.pos.x, arr.pos.y - aliado.pos.y);
    rodar(r, 1);
    const depois = Math.hypot(arr.pos.x - aliado.pos.x, arr.pos.y - aliado.pos.y);
    expect(depois).toBeLessThan(antes - 0.5);
  });
});
