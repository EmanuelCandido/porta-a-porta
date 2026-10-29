import { describe, expect, it } from 'vitest';
import { conteudo, inimigos } from '../../../src/sim/content';
import { enfileirar, passo } from '../../../src/sim/mundo';
import { eventosDo } from '../../../src/sim/partida';
import { Run, type ConteudoRun, type RuaDaRun } from '../../../src/sim/run';

// Tarefa G8 (GAMEPLAY.md, "Surpresas e recompensas variáveis"): baús, encontros raros e tratos
// lendários.

const C = conteudo as ConteudoRun;

/** O conteúdo com outros pesos de baú (para forçar um tipo). */
function comPesos(pesos: ConteudoRun['run']['baus']['pesos']): ConteudoRun {
  return { ...C, run: { ...C.run, baus: { ...C.run.baus, pesos } } };
}

function imortal(r: RuaDaRun): void {
  r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
}

/** Leva o jogador até o ponto e roda um tick. */
function levar(r: RuaDaRun, x: number, y: number): void {
  r.jogador.pos = { x, y };
  r.jogador.posAnterior = { x, y };
  passo(r.mundo);
}

describe('baús', () => {
  it('comum, raro e amaldiçoado saem pelos pesos do complemento (70%, 25% e 5%)', () => {
    const run = new Run(C, 3);
    const n = 4000;
    const conta = { comum: 0, raro: 0, amaldicoado: 0 };
    for (let i = 0; i < n; i++) conta[run.sortearBau({ x: 0, y: 0 }).tipo]++;
    const { pesos } = C.run.baus;
    const total = pesos.comum + pesos.raro + pesos.amaldicoado;
    expect(conta.comum / n).toBeCloseTo(pesos.comum / total, 1);
    expect(conta.raro / n).toBeCloseTo(pesos.raro / total, 1);
    expect(Math.abs(conta.amaldicoado / n - pesos.amaldicoado / total)).toBeLessThan(0.02);
  });

  it('todo baú nasce com cara de comum e mostra o tipo quando o jogador chega perto', () => {
    const run = new Run(comPesos({ comum: 0, raro: 1, amaldicoado: 0 }), 5);
    const r = run.novaRua();
    imortal(r);
    const bau = r.regras.estado.baus.find((b) => b.tipo === 'raro')!;
    expect(bau).toBeDefined();
    expect(bau.entidade.especie).toBe('bau');
    const p = bau.entidade.pos;
    const raio = C.run.baus.raioRevelar;
    levar(r, p.x + raio + 2, p.y);
    expect(bau.revelado).toBe(false);
    const inicio = r.mundo.eventos.length;
    levar(r, p.x + raio - 0.5, p.y);
    expect(bau.revelado).toBe(true);
    expect(bau.entidade.especie).toBe('bau_raro');
    const ev = eventosDo(r.mundo.eventos.slice(inicio), 'bauRevelado');
    expect(ev.map((e) => e.tipoBau)).toContain('raro');
  });

  it('o amaldiçoado oferece um trato forte com 1 preço, aceito ou recusado na hora', () => {
    const run = new Run(comPesos({ comum: 0, raro: 0, amaldicoado: 1 }), 5);
    const r = run.novaRua();
    imortal(r);
    const bau = r.regras.estado.baus.find((b) => b.tipo === 'amaldicoado')!;
    expect(bau.trato).toBeDefined();
    expect(bau.precos).toHaveLength(1);
    expect(run.defTrato(bau.trato!).forca).toBe(C.run.baus.forcaAmaldicoado);
    const p = bau.entidade.pos;
    levar(r, p.x + 0.9, p.y);
    expect(bau.entidade.especie).toBe('bau_amaldicoado');
    r.regras.sistema.antesDeMover!(r.mundo, [
      { tipo: 'usar', id: r.jogador.id, acao: 'interagir', x: p.x, y: p.y },
    ]);
    expect(bau.aberto).toBe(true);
    expect(run.estado.ofertaDoBau).toEqual({ trato: bau.trato, precos: bau.precos });
    expect(run.aceitarOfertaDoBau()).toBe(true);
    expect(run.estado.tratos).toContain(bau.trato);
    expect(run.estado.precos.map((x) => x.id)).toEqual(bau.precos);
    expect(run.estado.ofertaDoBau).toBeNull();

    // Recusado: nada entra.
    const run2 = new Run(comPesos({ comum: 0, raro: 0, amaldicoado: 1 }), 5);
    run2.ganhar({ tipo: 'ofertaDoBau', trato: bau.trato!, precos: bau.precos! });
    run2.recusarOfertaDoBau();
    expect(run2.estado.tratos).toEqual([]);
    expect(run2.estado.precos).toEqual([]);
  });

  it('regra de frequência: todo bairro tem ao menos um baú raro', () => {
    // Sem baú raro no sorteio: a última rua do bairro ganha um mesmo assim.
    const run = new Run(comPesos({ comum: 1, raro: 0, amaldicoado: 0 }), 7);
    const raros: number[] = [];
    for (let k = 0; k < C.run.ruasPorBairro; k++) {
      const r = run.novaRua();
      raros.push(r.regras.estado.baus.filter((b) => b.tipo === 'raro').length);
      run.venceuRua();
      if (run.estado.fase === 'portaAPorta') {
        run.novaPorta();
        run.sairDaPorta();
      }
    }
    expect(raros.slice(0, -1).every((n) => n === 0)).toBe(true);
    expect(raros.at(-1)).toBeGreaterThanOrEqual(C.run.baus.rarosPorBairro);
    expect(run.estado.rarosNoBairro).toBeGreaterThanOrEqual(C.run.baus.rarosPorBairro);
    run.novaArena();
    run.venceuChefe();
    expect(run.estado.rarosNoBairro).toBe(0);
  });
});

/** O conteúdo com outras chances de encontro (e o Carrinho só nos bairros pedidos). */
function comEncontros(
  chances: Partial<ConteudoRun['run']['encontros']['chances']>,
  bairrosDoCarrinho = C.run.encontros.carrinhoDePipoca.bairros,
): ConteudoRun {
  const e = C.run.encontros;
  return {
    ...C,
    run: {
      ...C.run,
      encontros: {
        ...e,
        chances: { gato_preto: 0, crianca_perdida: 0, festa_na_garagem: 0, ...chances },
        carrinhoDePipoca: { ...e.carrinhoDePipoca, bairros: bairrosDoCarrinho },
      },
    },
  };
}

/** Vence a rua de agora e passa pela porta, como a sessão faz. */
function proximaRua(run: Run): void {
  run.venceuRua();
  if (run.estado.fase === 'portaAPorta') {
    run.novaPorta();
    run.sairDaPorta();
  } else if (run.estado.fase === 'chefe') {
    run.novaArena();
    run.venceuChefe();
  }
}

describe('encontros raros', () => {
  it('no máximo um por rua; o Carrinho vem uma vez, num dos bairros 2 e 3', () => {
    for (let semente = 1; semente <= 4; semente++) {
      const run = new Run(C, semente);
      for (let k = 0; k < 9; k++) {
        run.novaRua();
        proximaRua(run);
      }
      const enc = run.estado.encontros;
      const ruas = enc.map((x) => `${x.bairro}-${x.rua}`);
      expect(new Set(ruas).size).toBe(ruas.length);
      const carrinhos = enc.filter((x) => x.tipo === 'carrinho_de_pipoca');
      expect(carrinhos).toHaveLength(1);
      expect(C.run.encontros.carrinhoDePipoca.bairros).toContain(carrinhos[0]!.bairro);
    }
  }, 60_000);

  it('Criança Perdida: segue o jogador e, levada ao portão, dá doces e uma Medalha', () => {
    const run = new Run(comEncontros({ crianca_perdida: 1 }), 4);
    const r = run.novaRua();
    imortal(r);
    const c = r.regras.encontros!;
    expect(c.encontro.tipo).toBe('crianca_perdida');
    const crianca = c.entidade!;
    expect(crianca.especie).toBe('crianca_perdida');
    // Longe, ela espera; perto, ela vem junto.
    const p = { ...crianca.pos };
    levar(r, p.x + 3, p.y);
    expect(c.situacao).toBe('esperando');
    levar(r, p.x + 1.2, p.y);
    expect(c.situacao).toBe('ativo');
    r.jogador.pos = { x: p.x + 4, y: p.y };
    r.jogador.posAnterior = { ...r.jogador.pos };
    for (let t = 0; t < 60; t++) passo(r.mundo);
    expect(Math.hypot(crianca.pos.x - p.x, crianca.pos.y - p.y)).toBeGreaterThan(1);
    // Ninguém a persegue.
    expect(r.regras.heroi).toBe(r.jogador);
    // No portão com ela junto: doces e Medalha.
    const medalhas = run.estado.medalhas;
    crianca.pos = { ...r.jogador.pos };
    c.aoVencer(r.mundo);
    expect(c.situacao).toBe('cumprido');
    expect(run.estado.medalhas).toBe(medalhas + C.run.encontros.criancaPerdida.medalhas);
    const doces = eventosDo(r.mundo.eventos, 'doces').at(-1);
    expect(doces?.valor).toBe(C.run.encontros.criancaPerdida.doces);
  });

  it('Criança Perdida atingida foge e o encontro falha', () => {
    const run = new Run(comEncontros({ crianca_perdida: 1 }), 4);
    const r = run.novaRua();
    imortal(r);
    const c = r.regras.encontros!;
    const crianca = c.entidade!;
    const inicio = r.mundo.eventos.length;
    r.mundo.eventos.push({
      tipo: 'dano',
      origem: 999,
      alvo: crianca.id,
      valor: 5,
      absorvido: 0,
      critico: false,
      golpe: 'ataque',
      comAviso: true,
      pos: { ...crianca.pos },
    });
    r.regras.sistema.depoisDoTick!(r.mundo, r.mundo.eventos.slice(inicio));
    expect(c.situacao).toBe('falhou');
    expect(r.mundo.entidades.some((e) => e.especie === 'crianca_perdida')).toBe(false);
  });

  it('Festa na Garagem: perto da porta, 8 pestinhas que valem o triplo de doces', () => {
    const run = new Run(comEncontros({ festa_na_garagem: 1 }), 4);
    const r = run.novaRua();
    imortal(r);
    const c = r.regras.encontros!;
    expect(c.encontro.tipo).toBe('festa_na_garagem');
    const f = C.run.encontros.festaNaGaragem;
    levar(r, c.encontro.pos.x + f.raioAbrir - 0.5, c.encontro.pos.y);
    const festa = r.mundo.entidades.filter((e) => e.marcas?.festa);
    expect(festa).toHaveLength(f.pestinhas);
    const base = inimigos.inimigos['pestinha_lencol']!.doces;
    expect(festa.every((e) => Number(e.marcas?.doces) === base * f.multDoces)).toBe(true);
  });

  it('Carrinho de Pipoca: chega com o jogador perto, vende 3 itens com desconto e vai embora', () => {
    const run = new Run(comEncontros({}, [0]), 4);
    run.estado.ruaNoBairro = 2;
    const r = run.novaRua();
    imortal(r);
    const c = r.regras.encontros!;
    expect(c.encontro.tipo).toBe('carrinho_de_pipoca');
    const carrinho = c.entidade!;
    const cfg = C.run.encontros.carrinhoDePipoca;
    levar(r, carrinho.pos.x + 1, carrinho.pos.y);
    expect(c.situacao).toBe('ativo');
    r.regras.sistema.antesDeMover!(r.mundo, [
      { tipo: 'usar', id: r.jogador.id, acao: 'interagir', x: 0, y: 0 },
    ]);
    const loja = run.estado.lojaDoCarrinho!;
    expect(loja.itens).toHaveLength(cfg.itens);
    expect(loja.aberta).toBe(true);
    const id = loja.itens[0]!;
    expect(run.precoNoCarrinho(id)).toBe(Math.round(run.precoNoBanco(id) * (1 - cfg.desconto)));
    run.bolso.doces = 1000;
    expect(run.comprarNoCarrinho(id)).toBe(true);
    expect(run.estado.itens).toContain(id);
    expect(run.bolso.doces).toBe(1000 - run.precoNoCarrinho(id));
    run.fecharCarrinho();
    for (let t = 0; t < Math.round(cfg.duracaoS * 60) + 2; t++) passo(r.mundo);
    expect(c.situacao).toBe('cumprido');
    expect(r.mundo.entidades.some((e) => e.especie === 'carrinho_pipoca')).toBe(false);
  });
});

/** Dá à run um trato lendário pelo caminho do baú (sem preço), como se tivesse aceitado. */
function comLendario(run: Run, trato: string): void {
  run.ganhar({ tipo: 'ofertaDoBau', trato, precos: [] });
  run.aceitarOfertaDoBau();
}

describe('Janela Vermelha e tratos lendários', () => {
  it('a Janela Vermelha oferece um trato lendário com 2 preços, aceito como os outros', () => {
    const c: ConteudoRun = {
      ...C,
      run: {
        ...C.run,
        encontros: {
          ...C.run.encontros,
          janelaVermelha: { ...C.run.encontros.janelaVermelha, chance: 1 },
        },
      },
    };
    const run = new Run(c, 6);
    run.novaRua();
    run.venceuRua();
    const p = run.estado.porta!;
    const v = p.ofertas.find((o) => o.vermelha)!;
    expect(v).toBeDefined();
    expect(Object.keys(C.tratos.lendarios)).toContain(v.trato);
    expect(v.precos).toHaveLength(C.run.encontros.janelaVermelha.precos);
    expect(run.estado.janelasVermelhas).toBe(1);
    expect(run.aceitar(v.casa)).toBe(true);
    expect(run.estado.tratos).toContain(v.trato);
    expect(run.estado.precos.filter((x) => x.trato === v.trato)).toHaveLength(2);
    // Sem a chance, nenhuma janela vermelha.
    const run2 = new Run(C, 6);
    run2.novaRua();
    run2.venceuRua();
    expect(run2.estado.porta!.ofertas.some((o) => o.vermelha)).toBe(false);
  });

  it('Noite Sem Fim: o Frenesi dura o dobro e o Susto não esvazia sozinho', () => {
    const run = new Run(C, 6);
    comLendario(run, 'noite_sem_fim');
    expect(run.bolso.susto.duracaoFrenesiMult).toBe(2);
    expect(run.bolso.susto.naoEsvazia).toBe(true);
    const r = run.novaRua();
    imortal(r);
    r.regras.susto.encher(r.mundo, 100, 'pedido');
    expect(run.bolso.susto.frenesi).toBeCloseTo(C.susto!.frenesi.duracao * 2);
  });

  it('Relógio Parado: o Relógio da Meia-Noite não anda por 10 minutos', () => {
    const run = new Run(C, 6);
    comLendario(run, 'relogio_parado');
    const r = run.novaRua();
    imortal(r);
    const antes = run.relogio();
    for (let t = 0; t < 120 * 60; t++) passo(r.mundo);
    expect(run.relogio()).toBe(antes);
    expect(run.estado.relogioParadoFalta).toBeCloseTo(10 * 60 - 120, 0);
  });

  it('Espelho do Mirante: toda habilidade sai também de um reflexo', () => {
    const run = new Run(C, 6);
    comLendario(run, 'espelho_do_mirante');
    const r = run.novaRua();
    imortal(r);
    const j = r.jogador;
    j.lancador!.slots['Q']!.posto = 1;
    const inicio = r.mundo.eventos.length;
    enfileirar(r.mundo, {
      tipo: 'lancar',
      id: j.id,
      tecla: 'Q',
      alvo: { x: j.pos.x + 3, y: j.pos.y },
    });
    for (let t = 0; t < 60; t++) passo(r.mundo);
    const lancou = eventosDo(r.mundo.eventos.slice(inicio), 'lancou').filter((l) => l.id === j.id);
    expect(lancou.filter((l) => !l.eco)).toHaveLength(1);
    expect(lancou.filter((l) => l.eco)).toHaveLength(1);
  });

  it('Coroa de Abóbora: cada explosão de abóbora dispara uma Q de graça', () => {
    const run = new Run(C, 6);
    comLendario(run, 'coroa_de_abobora');
    const r = run.novaRua();
    imortal(r);
    const j = r.jogador;
    j.lancador!.slots['Q']!.posto = 1;
    const energia = j.combate!.energia;
    const inicio = r.mundo.eventos.length;
    r.tratos!.explodir(r.mundo, { x: j.pos.x + 2, y: j.pos.y }, 10, 1.5);
    const q = eventosDo(r.mundo.eventos.slice(inicio), 'lancou').filter(
      (l) => l.id === j.id && l.tecla === 'Q',
    );
    expect(q).toHaveLength(1);
    expect(q[0]!.eco).toBe(true);
    expect(j.combate!.energia).toBe(energia);
  });

  it('Chave Mestra Dourada: todo baú é raro ou melhor', () => {
    const run = new Run(C, 6);
    comLendario(run, 'chave_mestra_dourada');
    for (let i = 0; i < 300; i++) expect(run.sortearBau({ x: 0, y: 0 }).tipo).not.toBe('comum');
  });
});
