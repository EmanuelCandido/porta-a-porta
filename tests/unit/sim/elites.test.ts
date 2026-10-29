import { describe, expect, it } from 'vitest';
import { causarDano, vivo } from '../../../src/sim/combate';
import { conteudo, inimigos } from '../../../src/sim/content';
import type { V2 } from '../../../src/sim/geometria';
import { enfileirar, passo, type Entidade } from '../../../src/sim/mundo';
import { eventosDo } from '../../../src/sim/partida';
import { Run, type ConteudoRun, type RuaDaRun } from '../../../src/sim/run';
import { rodar } from './ajuda';

const C = conteudo as ConteudoRun;

function novaRun(semente = 5): Run {
  return new Run(C, semente);
}

/** A rua da posição pedida (bairro e rua, contando de 0). */
function ruaEm(run: Run, bairro: number, rua: number): RuaDaRun {
  run.estado.bairro = bairro;
  run.estado.ruaNoBairro = rua;
  return run.novaRua();
}

function imortal(r: RuaDaRun): void {
  r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
}

const da = (r: RuaDaRun, especie: string) => r.mundo.entidades.filter((e) => e.especie === especie);

/** Uma rua (de alguma semente) que tenha o selvagem pedido. */
function ruaCom(especie: string): { run: Run; r: RuaDaRun; e: Entidade } {
  for (let s = 1; s < 60; s++) {
    const run = novaRun(s);
    const r = run.novaRua();
    const e = da(r, especie)[0];
    if (e) return { run, r, e };
  }
  throw new Error(`nenhuma rua com ${especie}`);
}

/** Dano do jogador dentro de um tick (as regras leem os eventos). */
function golpear(r: RuaDaRun, e: Entidade, bruto: number): void {
  const inicio = r.mundo.eventos.length;
  causarDano(r.mundo, e, { origem: r.jogador.id, bruto, tipo: 'habilidade', verdadeiro: true });
  const doTick = r.mundo.eventos.slice(inicio);
  r.regras.sistema.depoisDoTick!(r.mundo, doTick);
}

function invocar(r: RuaDaRun, especie: string, pos: V2): Entidade {
  return r.regras.servicos().invocar(r.mundo, especie, pos);
}

describe('quintais', () => {
  it('cada quintal tem um selvagem e a maioria tem baú; o Gato Preto aparece em 1 a cada 3 ruas', () => {
    let comGato = 0;
    let quintais = 0;
    let comBau = 0;
    for (let s = 1; s <= 30; s++) {
      const r = novaRun(s).novaRua();
      const selvagens = r.mundo.entidades.filter((e) =>
        ['cao_de_guarda', 'corvo', 'gato_preto'].includes(e.especie),
      );
      expect(selvagens).toHaveLength(r.gerada.quintais.length);
      quintais += r.gerada.quintais.length;
      comBau += r.gerada.quintais.filter((q) =>
        r.regras.estado.baus.some(
          (b) => Math.hypot(b.entidade.pos.x - q.bau.x, b.entidade.pos.y - q.bau.y) < 0.01,
        ),
      ).length;
      if (selvagens.some((e) => e.especie === 'gato_preto')) comGato++;
    }
    expect(comGato).toBeGreaterThanOrEqual(5);
    expect(comGato).toBeLessThanOrEqual(17);
    // content/run.json: chance de baú em cada quintal.
    expect(comBau / quintais).toBeGreaterThan(0.4);
    expect(comBau / quintais).toBeLessThan(0.9);
  }, 30_000);

  it('o Cão de Guarda ataca quem entra no quintal, volta para casa e dá +15% de velocidade', () => {
    const { r, e } = ruaCom('cao_de_guarda');
    imortal(r);
    r.jogador.pos = { x: e.pos.x + 2, y: e.pos.y };
    r.jogador.posAnterior = { ...r.jogador.pos };
    rodar(r.mundo, 2);
    const anuncios = eventosDo(r.mundo.eventos, 'anunciou').filter((a) => a.id === e.id);
    expect(anuncios.length).toBeGreaterThan(0);
    // Longe do quintal, ele volta para a casinha.
    r.jogador.pos = { x: r.gerada.ruaX[0] + 1, y: r.gerada.yEntrada - 1 };
    r.jogador.posAnterior = { ...r.jogador.pos };
    const casa = (e.ia as Record<string, V2>)['casa']!;
    rodar(r.mundo, 6);
    expect(Math.hypot(e.pos.x - casa.x, e.pos.y - casa.y)).toBeLessThan(0.6);
    golpear(r, e, 1e6);
    const bonus = r.jogador.combate!.mods.find((m) => m.origem === 'cao');
    expect(bonus?.mult).toBeCloseTo(0.15);
    expect(bonus?.restante).toBe(60);
  });

  it('o Corvo grita ao ver o jogador e chama 2 pestinhas; com Silêncio, dorme', () => {
    const { r, e } = ruaCom('corvo');
    imortal(r);
    r.luz.adicionar({ tipo: 'poste', x: e.pos.x + 2, y: e.pos.y, raio: 3, cura: false });
    r.jogador.pos = { x: e.pos.x + 2, y: e.pos.y };
    r.jogador.posAnterior = { ...r.jogador.pos };
    rodar(r.mundo, 0.5);
    expect(eventosDo(r.mundo.eventos, 'alarme')).toHaveLength(1);
    const chamadas = eventosDo(r.mundo.eventos, 'invocou').filter(
      (i) => i.especie === 'pestinha_lencol',
    );
    expect(chamadas).toHaveLength(2);

    const run = novaRun(1);
    const quieta = run.novaRua();
    quieta.regras.opcoes.silencio = true;
    const corvo = da(quieta, 'corvo')[0];
    if (corvo) {
      quieta.jogador.pos = { x: corvo.pos.x + 1, y: corvo.pos.y };
      rodar(quieta.mundo, 0.5);
      expect(eventosDo(quieta.mundo.eventos, 'alarme')).toHaveLength(0);
    }
  });

  it('o Gato Preto foge e some em 20 s; pegá-lo dá um trato extra sem preço na porta', () => {
    const { run, r, e } = ruaCom('gato_preto');
    imortal(r);
    r.jogador.pos = { x: e.pos.x + 2, y: e.pos.y };
    r.jogador.posAnterior = { ...r.jogador.pos };
    const antes = Math.hypot(e.pos.x - r.jogador.pos.x, e.pos.y - r.jogador.pos.y);
    rodar(r.mundo, 0.5);
    expect(Math.hypot(e.pos.x - r.jogador.pos.x, e.pos.y - r.jogador.pos.y)).toBeGreaterThan(antes);
    golpear(r, e, 1e6);
    expect(run.estado.tratosGratis).toBe(1);
    run.venceuRua();
    run.novaPorta();
    const p = run.estado.porta!;
    expect(p.limite).toBe(2);
    expect(run.aceitar(p.ofertas[0]!.casa)).toBe(true);
    expect(run.aceitar(p.ofertas[1]!.casa)).toBe(true);
    expect(run.estado.precos).toHaveLength(1);
    expect(run.estado.tratos).toHaveLength(2);

    // Sem ser pego, some depois de 20 s.
    const outro = ruaCom('gato_preto');
    imortal(outro.r);
    outro.r.jogador.pos = { x: outro.e.pos.x + 2, y: outro.e.pos.y };
    rodar(outro.r.mundo, 21);
    expect(outro.r.mundo.entidades.includes(outro.e)).toBe(false);
  });

  it('baú raro dá um item comum para a run; baú comum dá doces', () => {
    const run = novaRun();
    const r = run.novaRua();
    imortal(r);
    const raro = r.regras.adicionarBau(r.mundo, {
      pos: { x: r.jogador.pos.x + 1, y: r.jogador.pos.y },
      tipo: 'raro',
      doces: 0,
      item: 'chapeu_pontudo',
      rerolls: 0,
    });
    enfileirar(r.mundo, { tipo: 'usar', id: r.jogador.id, acao: 'interagir', x: 0, y: 0 });
    passo(r.mundo);
    expect(raro.aberto).toBe(true);
    expect(run.estado.itens).toEqual(['chapeu_pontudo']);
    expect(run.ficha.combate.attr.feitico).toBeGreaterThanOrEqual(15);
  });
});

describe('elites', () => {
  it('nenhuma elite na rua 1-1; da 1-2 em diante, uma nasce quando o 1º Poste cai', () => {
    const primeira = ruaEm(novaRun(), 0, 0);
    imortal(primeira);
    for (const p of primeira.regras.estado.postes.slice(0, 1)) golpear(primeira, p, 1e6);
    rodar(primeira.mundo, 0.1);
    expect(primeira.regras.estado.elites).toHaveLength(0);

    const r = ruaEm(novaRun(), 0, 1);
    imortal(r);
    rodar(r.mundo, 1);
    expect(r.regras.estado.elites).toHaveLength(0);
    golpear(r, r.regras.estado.postes[0]!, 1e6);
    rodar(r.mundo, 0.1);
    expect(r.regras.estado.elites).toHaveLength(1);
    expect(['vizinho_curioso', 'casa_perseguidora']).toContain(r.regras.estado.elites[0]!.especie);
  });

  it('elite reforçada tem +30% de Coragem; na 3-3 vêm duas', () => {
    const r = ruaEm(novaRun(), 1, 2);
    imortal(r);
    golpear(r, r.regras.estado.postes[0]!, 1e6);
    rodar(r.mundo, 0.1);
    const e = r.regras.estado.elites[0]!;
    expect(e.marcas?.reforcado).toBe(true);
    const def = inimigos.inimigos[e.especie]!;
    expect(e.combate!.attr.coragemMax).toBeCloseTo(
      def.coragem * inimigos.escalaPorBairro.coragem[1]! * 1.3,
    );
    const duas = ruaEm(novaRun(), 2, 2);
    imortal(duas);
    golpear(duas, duas.regras.estado.postes[0]!, 1e6);
    rodar(duas.mundo, 0.1);
    expect(duas.regras.estado.elites).toHaveLength(2);
  });

  it('Casa Perseguidora: Pisão anunciado por 1,2 s; abaixo de 50% chama 2 pestinhas', () => {
    const r = novaRun().novaRua();
    imortal(r);
    const casa = invocar(r, 'casa_perseguidora', {
      x: r.jogador.pos.x,
      y: r.jogador.pos.y - 1.5,
    });
    rodar(r.mundo, 0.5);
    const pisao = eventosDo(r.mundo.eventos, 'anunciou').find((a) => a.id === casa.id);
    expect(pisao?.chave).toBe('pisao_casa');
    expect(pisao?.duracao).toBeCloseTo(1.2);
    const c = casa.combate!;
    c.coragem = c.attr.coragemMax * 0.45;
    r.mundo.eventos = [];
    passo(r.mundo);
    expect(eventosDo(r.mundo.eventos, 'invocou')).toHaveLength(2);
  });

  it('Vizinho Curioso: visto de frente na luz, alerta as pestinhas (+30% de dano) e foge', () => {
    const r = novaRun().novaRua();
    imortal(r);
    const j = r.jogador;
    r.luz.adicionar({ tipo: 'poste', ...j.pos, raio: 4, cura: false });
    const viz = invocar(r, 'vizinho_curioso', { x: j.pos.x, y: j.pos.y - 3 });
    viz.olhar = { x: 0, y: 1 };
    const pestinha = invocar(r, 'pestinha_lencol', { x: j.pos.x + 2, y: j.pos.y - 4 });
    passo(r.mundo);
    expect((viz.ia as { estado: string }).estado).toBe('fuga');
    expect(pestinha.combate!.mods.some((m) => m.origem === 'alerta' && m.mult === 0.3)).toBe(true);
    rodar(r.mundo, 10);
    expect(r.mundo.entidades.includes(viz)).toBe(false);
  });

  it('Vizinho Curioso não vê quem chega por trás, na sombra', () => {
    const r = novaRun().novaRua();
    imortal(r);
    r.luz.fontes = [];
    const j = r.jogador;
    const viz = invocar(r, 'vizinho_curioso', { x: j.pos.x, y: j.pos.y - 3 });
    viz.olhar = { x: 0, y: -1 };
    rodar(r.mundo, 0.2);
    expect((viz.ia as { estado: string }).estado).not.toBe('fuga');
  });

  it('Cobrador: +10% de dano por trato; a corrente puxa o jogador', () => {
    const run = novaRun();
    run.estado.tratos.push('eco', 'mira_torta', 'casca_grossa');
    run.aplicarNaFicha();
    const r = run.novaRua();
    imortal(r);
    r.jogador.combate!.estados = [];
    r.jogador.combate!.mods.push({ origem: 'teste', atributo: 'danoRecebido', mult: -0.99 });
    const cob = invocar(r, 'cobrador', { x: r.jogador.pos.x, y: r.jogador.pos.y - 5 });
    passo(r.mundo);
    expect(cob.combate!.mods.find((m) => m.origem === 'divida')?.mult).toBeCloseTo(0.3);
    const antes = Math.hypot(cob.pos.x - r.jogador.pos.x, cob.pos.y - r.jogador.pos.y);
    rodar(r.mundo, 2);
    const corrente = eventosDo(r.mundo.eventos, 'anunciou').find(
      (a) => a.id === cob.id && a.chave === 'corrente_cobrador',
    );
    expect(corrente).toBeDefined();
    expect(Math.hypot(cob.pos.x - r.jogador.pos.x, cob.pos.y - r.jogador.pos.y)).toBeLessThan(
      antes - 1,
    );
  });

  it('Sombra Rasteira: na luz, some e reaparece no escuro, longe do jogador', () => {
    const r = novaRun().novaRua();
    imortal(r);
    r.luz.fontes = [];
    const s = invocar(r, 'sombra_rasteira', { x: r.jogador.pos.x, y: r.jogador.pos.y - 3 });
    passo(r.mundo);
    r.luz.adicionar({ tipo: 'pulso', ...s.pos, raio: 2, cura: false });
    passo(r.mundo);
    expect(r.luz.iluminado(s.pos)).toBe(false);
    expect(Math.hypot(s.pos.x - r.jogador.pos.x, s.pos.y - r.jogador.pos.y)).toBeGreaterThanOrEqual(
      3.9,
    );
    expect(vivo(s)).toBe(true);
  });

  it('preços com elites: Vizinhança Atenta põe um Vizinho Curioso em toda rua', () => {
    const run = novaRun();
    run.estado.precos.push({ id: 'vizinhanca_atenta', trato: 'teste' });
    const r = run.novaRua();
    imortal(r);
    rodar(r.mundo, inimigos.elitesNaRua.extrasAosSegundos + 0.5);
    expect(r.regras.estado.elites.map((e) => e.especie)).toContain('vizinho_curioso');
  });
});
