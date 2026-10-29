import { describe, expect, it } from 'vitest';
import { golpearObjeto, temEstado } from '../../../src/sim/combate';
import { conteudo, exploracao, gerador, luz as cfgLuz, modelos } from '../../../src/sim/content';
import { gerarRua } from '../../../src/sim/gerador';
import { passo, type Entidade, type Sistema } from '../../../src/sim/mundo';
import { criarFicha, eventosDo } from '../../../src/sim/partida';
import type { Bolso } from '../../../src/sim/regrasDaRua';
import { montarRua, type RuaDeLuta } from '../../../src/sim/ruaDeLuta';
import { novoSusto } from '../../../src/sim/susto';

const armas = exploracao.armas;

function rua(semente = 3): RuaDeLuta {
  const g = gerarRua(semente, gerador, modelos, cfgLuz, { bairro: 0 });
  const bolso: Bolso = { doces: 0, consumiveis: [], susto: novoSusto() };
  const r = montarRua(g, criarFicha('fantasma', conteudo), conteudo, semente, bolso, { bairro: 0 });
  r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
  for (const e of r.mundo.entidades)
    if (e.tipo === 'inimigo' && e.especie !== 'poste_corrompido') e.pos = { x: 0.5, y: 0.5 };
  return r;
}

/** Um golpe básico do jogador no objeto, dentro de um tick (as regras veem os eventos). */
function bater(r: RuaDeLuta, alvo: Entidade, forte = false, bruto = 10): void {
  const s: Sistema = {
    antesDeMover(m) {
      golpearObjeto(m, alvo, { origem: r.jogador.id, bruto, tipo: 'autoAtaque', forte });
    },
  };
  const sistemas = r.mundo.sistemas as Sistema[];
  sistemas.unshift(s);
  passo(r.mundo);
  sistemas.splice(sistemas.indexOf(s), 1);
}

function rodar(r: RuaDeLuta, s: number): void {
  for (let t = 0; t < s * 60; t++) passo(r.mundo);
}

const achar = (r: RuaDeLuta, f: (e: Entidade) => boolean) => r.mundo.entidades.find(f);

describe('armas do cenário', () => {
  it('a rua gerada tem portões nos quintais, carros e postes interativos e abóboras gigantes', () => {
    const r = rua();
    expect(r.gerada.portoes!.length).toBe(r.gerada.quintais.length);
    expect(r.gerada.portoes!.length).toBeGreaterThan(0);
    expect(achar(r, (e) => e.marcas?.interativo === 'alarme')).toBeDefined();
    expect(achar(r, (e) => e.marcas?.interativo === 'fio')).toBeDefined();
    const gigantes = [3, 4, 5, 6].map(
      (s) =>
        gerarRua(s, gerador, modelos, cfgLuz, { bairro: 0 }).rua.objetos.filter(
          (o) => o.modelo === 'abobora_gigante',
        ).length,
    );
    expect(gigantes.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it('o portão do quintal aguenta o golpe comum e abre no golpe forte', () => {
    const r = rua();
    const portao = achar(r, (e) => e.especie === 'portao_quintal')!;
    const obstaculos = r.mundo.obstaculos.length;
    bater(r, portao, false);
    expect(eventosDo(r.mundo.eventos, 'objetoAtingido').at(-1)?.resistiu).toBe(true);
    expect(r.mundo.entidades).toContain(portao);
    bater(r, portao, true);
    passo(r.mundo);
    expect(r.mundo.entidades).not.toContain(portao);
    expect(eventosDo(r.mundo.eventos, 'quebrou').at(-1)?.grupo).toBe(portao.marcas?.grupo);
    expect(r.mundo.obstaculos.length).toBe(obstaculos - 1);
  });

  it('o carro toca o alarme: uma isca invisível atrai os inimigos e some no fim', () => {
    const r = rua();
    const carro = achar(r, (e) => e.marcas?.interativo === 'alarme')!;
    bater(r, carro);
    const isca = achar(r, (e) => e.especie === 'alarme')!;
    expect(isca.marcas?.isca).toBe(true);
    expect(carro.combate!.coragem).toBe(carro.combate!.attr.coragemMax);
    // Na recarga, outro golpe não toca de novo.
    bater(r, carro);
    expect(r.mundo.entidades.filter((e) => e.especie === 'alarme')).toHaveLength(1);
    const p = r.regras.criarInimigo(r.mundo, 'pestinha_lencol', {
      x: carro.pos.x + 3,
      y: carro.pos.y,
    });
    const antes = Math.hypot(p.pos.x - carro.pos.x, p.pos.y - carro.pos.y);
    rodar(r, 1);
    expect(Math.hypot(p.pos.x - carro.pos.x, p.pos.y - carro.pos.y)).toBeLessThan(antes);
    rodar(r, armas.alarme.duracaoS);
    expect(achar(r, (e) => e.especie === 'alarme')).toBeUndefined();
  });

  it('o fio do poste eletrifica o chão: machuca e deixa lento quem está perto', () => {
    const r = rua();
    const poste = achar(r, (e) => e.marcas?.interativo === 'fio')!;
    const p = r.regras.criarInimigo(r.mundo, 'pestinha_lencol', {
      x: poste.pos.x + 0.6,
      y: poste.pos.y,
    });
    p.velocidade = 0;
    const cheia = p.combate!.coragem;
    bater(r, poste);
    expect(eventosDo(r.mundo.eventos, 'fioCaiu')).toHaveLength(1);
    rodar(r, 0.2);
    expect(p.combate!.coragem).toBeLessThan(cheia);
    expect(temEstado(p.combate, 'lentidao')).toBe(true);
  });

  it('o hidrante quebrado solta um jato que empurra os inimigos', () => {
    let r = rua();
    let h: Entidade | undefined;
    for (const sem of [3, 4, 5, 6, 7, 8]) {
      r = rua(sem);
      h = achar(r, (e) => e.especie === 'hidrante' && !!e.marcas?.quebravel);
      if (h) break;
    }
    expect(h).toBeDefined();
    if (!h) return;
    const p = r.regras.criarInimigo(r.mundo, 'pestinha_lencol', { x: h.pos.x + 1, y: h.pos.y });
    p.velocidade = 0;
    bater(r, h, false, 1e6);
    passo(r.mundo);
    expect(eventosDo(r.mundo.eventos, 'jato').length).toBeGreaterThan(0);
    rodar(r, 0.3);
    expect(Math.hypot(p.pos.x - h.pos.x, p.pos.y - h.pos.y)).toBeGreaterThan(1.5);
  });

  it('a abóbora gigante quebrada avisa e explode, machucando quem está no raio', () => {
    let r: RuaDeLuta | null = null;
    let ab: Entidade | undefined;
    for (const s of [3, 4, 5, 6, 7, 8]) {
      r = rua(s);
      ab = achar(r, (e) => e.especie === 'abobora_gigante');
      if (ab) break;
    }
    expect(ab).toBeDefined();
    const p = r!.regras.criarInimigo(r!.mundo, 'pestinha_lencol', {
      x: ab!.pos.x + 1.5,
      y: ab!.pos.y,
    });
    p.velocidade = 0;
    const cheia = p.combate!.coragem;
    bater(r!, ab!, false, 1e6);
    passo(r!.mundo);
    expect(eventosDo(r!.mundo.eventos, 'avisoExplosao')).toHaveLength(1);
    expect(p.combate!.coragem).toBe(cheia);
    rodar(r!, armas.explosao.avisoS + 0.1);
    expect(eventosDo(r!.mundo.eventos, 'explosaoAbobora').length).toBeGreaterThan(0);
    expect(p.combate!.coragem).toBeLessThan(cheia);
  });
});
