import { describe, expect, it } from 'vitest';
import { causarDano } from '../../../src/sim/combate';
import { conteudo, noite, ondas } from '../../../src/sim/content';
import { passo, type Entidade } from '../../../src/sim/mundo';
import { gerarRua } from '../../../src/sim/gerador';
import { eventosDo } from '../../../src/sim/partida';
import { Run, type ConteudoRun, type RuaDaRun, type Rota } from '../../../src/sim/run';
import { rodar, ondasPorTempo } from './ajuda';

const C = conteudo as ConteudoRun;

function novaRun(semente = 5): Run {
  return new Run(C, semente);
}

function imortal(r: RuaDaRun): void {
  r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
}

function golpear(r: RuaDaRun, e: Entidade, bruto: number): void {
  const inicio = r.mundo.eventos.length;
  causarDano(r.mundo, e, { origem: r.jogador.id, bruto, tipo: 'habilidade', verdadeiro: true });
  r.regras.sistema.depoisDoTick!(r.mundo, r.mundo.eventos.slice(inicio));
}

/** Derruba os Postes e sai pelo portão pedido. */
function sairPor(r: RuaDaRun, portao: number): void {
  for (const p of r.regras.estado.postes) golpear(r, p, 1e7);
  passo(r.mundo);
  const s = r.gerada.saida;
  const n = Math.max(1, r.regras.opcoes.portoes ?? 1);
  r.jogador.pos = { x: s.x0 + ((s.x1 - s.x0) * (portao + 0.5)) / n, y: s.y1 - 0.2 };
  passo(r.mundo);
}

/** A próxima rua com a rota pedida (condição, pedido) já escolhida. */
function ruaCom(run: Run, rota: Partial<Rota>, pedido?: string): RuaDaRun {
  run.estado.bairro = 0;
  run.estado.ruaNoBairro = 1;
  run.estado.proximaRota = {
    condicao: 'noite_comum',
    elites: [],
    recompensa: 'reroll',
    semente: 77,
    postes: 3,
    ...rota,
  };
  const r = run.novaRua();
  if (pedido) {
    run.estado.pedido = pedido;
    r.regras.opcoes.pedido = { id: pedido, def: noite.pedidos[pedido]! };
  }
  imortal(r);
  return r;
}

describe('portões com 2 rotas', () => {
  it('cada rua (menos a última do bairro) termina em 2 portões com condição, elite e recompensa', () => {
    const run = novaRun();
    const r = run.novaRua();
    expect(run.estado.rotaAtual?.condicao).toBe('noite_comum');
    expect(run.estado.rotas).toHaveLength(noite.portoes);
    for (const rota of run.estado.rotas) {
      expect(noite.condicoes[rota.condicao]).toBeDefined();
      expect(Object.keys(noite.recompensas)).toContain(rota.recompensa);
      expect(rota.elites).toHaveLength(1);
    }
    // As duas rotas da 1-2 oferecem elites diferentes.
    expect(new Set(run.estado.rotas.map((x) => x.elites[0]!.especie)).size).toBe(2);
    expect(new Set(run.estado.rotas.map((x) => x.recompensa)).size).toBe(2);
    expect(r.regras.opcoes.portoes).toBe(2);
    // A 3ª rua leva só à praça do chefe.
    run.estado.ruaNoBairro = 2;
    run.novaRua();
    expect(run.estado.rotas).toHaveLength(0);
  });

  it('sair pelo portão da direita leva à rua daquele caminho', () => {
    const run = novaRun();
    const r = run.novaRua();
    imortal(r);
    const direita = run.estado.rotas[1]!;
    sairPor(r, 1);
    expect(r.regras.estado.venceu).toBe(true);
    expect(r.regras.estado.portaoEscolhido).toBe(1);
    run.venceuRua(r.regras.estado);
    run.novaPorta();
    run.sairDaPorta();
    const seguinte = run.novaRua();
    expect(run.estado.rotaAtual).toEqual(direita);
    expect(seguinte.regras.opcoes.elites).toEqual(direita.elites);
  });

  it('condições raras aparecem em no máximo 1 portão por bairro', () => {
    const run = novaRun(9);
    let raras = 0;
    for (let k = 0; k < 40; k++) {
      const rota = run.sortearRota(0, 1, k % 2);
      if (noite.condicoes[rota.condicao]!.rara) raras++;
    }
    expect(raras).toBeLessThanOrEqual(noite.rarasPorBairro);
    // 40 ruas geradas: com os outros arquivos rodando junto, passa dos 5 s padrão.
  }, 20_000);
});

describe('condições da noite', () => {
  ondasPorTempo();
  it('Lua Vermelha: inimigos +20% de dano e doces em dobro', () => {
    const r = ruaCom(novaRun(), { condicao: 'lua_vermelha', recompensa: 'reroll' });
    expect(r.regras.opcoes.multDanoInimigo).toBe(1.2);
    expect(r.regras.opcoes.multDoces).toBe(2);
    const e = r.regras.criarInimigo(r.mundo, 'pestinha_lencol', { x: 3, y: 3 });
    expect(e.combate!.base.dano).toBeCloseTo(1.2);
  });

  it('Festa no Quarteirão: ondas com +2 pestinhas', () => {
    const r = ruaCom(novaRun(), { condicao: 'festa' });
    rodar(r.mundo, ondas.primeiraEm + 3);
    const nascidos = eventosDo(r.mundo.eventos, 'invocou').filter(
      (i) => i.especie === 'pestinha_lencol',
    );
    expect(nascidos.length).toBeGreaterThanOrEqual(ondas.porBairro[0]! + 2);
  });

  it('Ventania: projéteis inimigos fazem curva e um poste apaga a cada minuto', () => {
    const r = ruaCom(novaRun(), { condicao: 'ventania' });
    passo(r.mundo);
    expect(r.executor.curvaInimigos).toBe(noite.condicoes['ventania']!.curvaProjeteis);
    rodar(r.mundo, 60.2);
    expect(r.luz.fontes.some((f) => f.tipo === 'poste' && f.desligadaAte !== null)).toBe(true);
  });

  it('Apagão Parcial: casas apagadas e postes curando o dobro; Silêncio: corvos dormem', () => {
    const r = ruaCom(novaRun(), { condicao: 'apagao' });
    expect(r.gerada.rua.objetos.some((o) => 'apagada' in o && o.apagada)).toBe(true);
    expect(r.regras.opcoes.multCuraPostes).toBe(2);
    const s = ruaCom(novaRun(), { condicao: 'silencio' });
    expect(s.regras.opcoes.silencio).toBe(true);
  });

  it('Chuva de Doces: baús extras e o Gato Preto com certeza', () => {
    const r = ruaCom(novaRun(), { condicao: 'chuva_de_doces' });
    expect(r.mundo.entidades.some((e) => e.especie === 'gato_preto')).toBe(true);
    expect(r.regras.estado.baus.length).toBeGreaterThanOrEqual(r.gerada.quintais.length + 2);
  });

  it('recompensa de portão: baú raro na entrada; doces em dobro na rua', () => {
    const r = ruaCom(novaRun(), { recompensa: 'bau_raro' });
    expect(r.regras.estado.baus.some((b) => b.tipo === 'raro')).toBe(true);
    const d = ruaCom(novaRun(), { recompensa: 'doces_em_dobro' });
    expect(d.regras.opcoes.multDoces).toBe(2);
  });
});

describe('pedidos dos moradores', () => {
  it('toda rua tem um pedido, mostrado desde o começo', () => {
    const run = novaRun();
    const r = run.novaRua();
    expect(run.estado.pedido).not.toBeNull();
    expect(r.regras.opcoes.pedido?.def.texto).toBeTruthy();
    expect(r.regras.estado.pedido).toBe('andamento');
  });

  it('Poste 2 em até 20 s depois do Poste 1: reroll de preço', () => {
    const run = novaRun();
    const r = ruaCom(run, {}, 'postes_rapidos');
    golpear(r, r.regras.estado.postes[0]!, 1e7);
    rodar(r.mundo, 5);
    golpear(r, r.regras.estado.postes[1]!, 1e7);
    passo(r.mundo);
    expect(r.regras.estado.pedido).toBe('cumprido');
    expect(eventosDo(r.mundo.eventos, 'pedidoCumprido')).toHaveLength(1);
    const antes = run.estado.rerolls;
    run.venceuRua(r.regras.estado);
    // +1 do pedido e +1 da recompensa de portão (reroll).
    expect(run.estado.rerolls).toBe(antes + 2);
  });

  it('sem usar a lanterna: +1 casa acesa; usar falha o pedido', () => {
    const run = novaRun();
    const r = ruaCom(run, { recompensa: 'item_comum' }, 'sem_lanterna');
    sairPor(r, 0);
    expect(r.regras.estado.pedido).toBe('cumprido');
    run.venceuRua(r.regras.estado);
    expect(run.estado.porta!.ofertas).toHaveLength(C.gerador.portaAPorta.casas + 1);
    const porta = run.novaPorta();
    expect(porta.gerada.casas.filter((c) => c.acesa)).toHaveLength(4);

    const outra = ruaCom(novaRun(), {}, 'sem_lanterna');
    outra.regras.estado.usouLanterna = true;
    passo(outra.mundo);
    expect(outra.regras.estado.pedido).toBe('falhou');
  });

  it('pouco dano, Frenesi duplo e interrupções dão item, preço leve e Susto', () => {
    const run = novaRun();
    const r = ruaCom(run, {}, 'pouco_dano');
    sairPor(r, 0);
    run.venceuRua(r.regras.estado);
    expect(run.estado.itens.length).toBeGreaterThanOrEqual(1);

    const r2run = novaRun();
    const r2 = ruaCom(r2run, {}, 'frenesi_duplo');
    r2.regras.bolso.susto.frenesisNaRua = 2;
    sairPor(r2, 0);
    r2run.venceuRua(r2.regras.estado);
    const pesos = C.precos.pesos;
    for (const o of r2run.estado.porta!.ofertas) {
      const leve = Math.min(
        ...C.tratos.tratos[o.trato]!.precos.map((p) => pesos[C.precos.precos[p]!.peso]),
      );
      expect(pesos[C.precos.precos[o.precos[0]!]!.peso]).toBe(leve);
    }

    const r3run = novaRun();
    const r3 = ruaCom(r3run, {}, 'interrupcoes');
    r3.regras.estado.interrupcoes = 3;
    sairPor(r3, 0);
    r3run.venceuRua(r3.regras.estado);
    r3run.novaPorta();
    r3run.sairDaPorta();
    r3run.bolso.susto.valor = 0;
    const seguinte = r3run.novaRua();
    passo(seguinte.mundo);
    expect(r3run.bolso.susto.valor).toBeGreaterThanOrEqual(24);
  });
});

describe('curva dos bairros 2 e 3 (novidade de cada posição)', () => {
  /** A rua da posição pedida (bairro e rua contam de 0) e quantos postes ela teria sem a curva. */
  function ruaNaPosicao(bairro: number, rua: number): { r: RuaDaRun; semCurva: number } {
    const run = novaRun(9);
    run.estado.bairro = bairro;
    run.estado.ruaNoBairro = rua;
    const r = run.novaRua();
    imortal(r);
    const g = gerarRua(run.estado.rotaAtual!.semente, C.gerador, C.modelos, C.luz, {
      bairro,
      janelasApagadas: C.noite.condicoes[run.estado.rotaAtual!.condicao]?.janelasApagadas,
      saidas: rua === C.run.ruasPorBairro - 1 ? 1 : C.noite.portoes,
    });
    return { r, semCurva: g.luzes.filter((l) => l.tipo === 'poste').length };
  }
  const acesos = (r: RuaDaRun) =>
    r.luz.fontes.filter((f) => f.tipo === 'poste' && f.desligadaAte === null).length;

  it('2-1: metade dos postes amigos já nasce apagada; 3-1 quase todos; 3-3 a rua escura', () => {
    for (const [bairro, rua] of [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 2],
    ] as const) {
      const { r, semCurva } = ruaNaPosicao(bairro, rua);
      const f = C.run.curva[bairro]?.[rua]?.postesApagados ?? 0;
      expect(acesos(r)).toBe(semCurva - Math.round(f * semCurva));
      // Os apagados ficam cinza no desenho.
      const cinza = r.gerada.rua.objetos.filter(
        (o) => o.modelo === 'poste' && o.estado === 'apagado',
      ).length;
      expect(cinza).toBeGreaterThanOrEqual(Math.round(f * semCurva));
    }
    const { r: r33 } = ruaNaPosicao(2, 2);
    expect(acesos(r33)).toBe(0);
    // A cidade em volta apaga junto: nenhum poste de cenário aceso na rua escura.
    const cenario = r33.gerada.rua.cenario ?? [];
    expect(cenario.some((o) => o.modelo === 'poste')).toBe(true);
    expect(cenario.filter((o) => o.modelo === 'poste' && o.estado !== 'apagado')).toHaveLength(0);
    // Os postes de religar continuam lá: a luz da 3-3 é achada explorando.
    expect(r33.gerada.exploracao.postes.length).toBeGreaterThan(0);
  });

  it('2-3: ondas com mais Abóboras-Canhão', () => {
    const { r } = ruaNaPosicao(1, 2);
    const curva = C.run.curva[1]![2]!;
    expect(r.regras.opcoes.composicaoOndas).toEqual(curva.composicao);
    expect(curva.composicao!['abobora_canhao']).toBeGreaterThan(
      ondas.composicao[1]!['abobora_canhao']!,
    );
  });
});
