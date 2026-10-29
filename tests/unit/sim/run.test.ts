import { describe, expect, it } from 'vitest';
import { causarDano, recalcular, type Golpe } from '../../../src/sim/combate';
import { conteudo, itens as cfgItens, tratos as cfgTratos } from '../../../src/sim/content';
import { TECLAS } from '../../../src/sim/content/esquemas';
import type { V2 } from '../../../src/sim/geometria';
import { definirPosto } from '../../../src/sim/habilidades';
import { visivelPara } from '../../../src/sim/ia';
import { enfileirar, passo, type Entidade } from '../../../src/sim/mundo';
import { eventosDo } from '../../../src/sim/partida';
import { quantos } from '../../../src/sim/regrasDaRua';
import { Run, type ConteudoRun, type RuaDaRun } from '../../../src/sim/run';
import { rodar } from './ajuda';

const C = conteudo as ConteudoRun;

function novaRun(semente = 5): Run {
  return new Run(C, semente);
}

/** Dá tratos direto, sem passar pela porta. */
function comTratos(run: Run, ...ids: string[]): Run {
  run.estado.tratos.push(...ids);
  run.aplicarNaFicha();
  return run;
}

/** Dá preços direto. */
function comPrecos(run: Run, ...ids: string[]): Run {
  for (const id of ids) run.estado.precos.push({ id, trato: 'teste' });
  run.aplicarNaFicha();
  return run;
}

/** A próxima rua, com as habilidades no posto 1. */
function rua(run: Run): RuaDaRun {
  const r = run.novaRua();
  for (const t of TECLAS) definirPosto(r.ficha.lancador, t, 1);
  return r;
}

/** Um inimigo parado, sem IA, com muita Coragem se pedido. */
function alvo(r: RuaDaRun, pos: V2, coragem?: number): Entidade {
  const e = r.regras.criarInimigo(r.mundo, 'pestinha_lencol', pos, { velocidade: 0 });
  e.ia = undefined;
  if (coragem !== undefined) {
    e.combate!.base.coragemMax = coragem;
    recalcular(e.combate!);
    e.combate!.coragem = coragem;
  }
  return e;
}

/** Dano do jogador como se fosse dentro de um tick (regras e tratos leem os eventos). */
function golpear(r: RuaDaRun, e: Entidade, bruto: number): void {
  const inicio = r.mundo.eventos.length;
  const g: Golpe = { origem: r.jogador.id, bruto, tipo: 'habilidade', verdadeiro: true };
  causarDano(r.mundo, e, g);
  const doTick = r.mundo.eventos.slice(inicio);
  const fim = r.mundo.eventos.length;
  r.regras.sistema.depoisDoTick!(r.mundo, doTick);
  r.tratos.sistema.depoisDoTick!(r.mundo, doTick);
  // O que nasceu agora (uma explosão que derruba alguém) os sistemas leem no próximo tick.
  r.mundo.atrasados.push(...r.mundo.eventos.slice(fim));
}

function lancar(r: RuaDaRun, tecla: string, p: V2): void {
  enfileirar(r.mundo, { tipo: 'lancar', id: r.jogador.id, tecla, alvo: p });
}

function semLuz(r: RuaDaRun): void {
  r.luz.fontes = [];
  r.luz.versao++;
}

const doJogador = (r: RuaDaRun) =>
  eventosDo(r.mundo.eventos, 'lancou').filter((l) => l.id === r.jogador.id);

describe('fluxo da run', () => {
  it('começa na rua 1 do bairro 1 com 2 Doce-iscas e o relógio às 21:00', () => {
    const run = novaRun();
    expect(run.estado.fase).toBe('rua');
    expect(run.estado.bairro).toBe(0);
    expect(quantos(run.bolso, 'doce_isca')).toBe(2);
    expect(run.relogio()).toBe('21:00');
  });

  it('3 bairros de 3 ruas: porta a porta depois das ruas 1 e 2, chefe depois da 3ª', () => {
    const run = novaRun();
    const fases: string[] = [];
    for (let b = 0; b < 3; b++) {
      for (let k = 0; k < 3; k++) {
        run.novaRua();
        run.venceuRua();
        fases.push(run.estado.fase);
        if (run.estado.fase === 'portaAPorta') {
          run.novaPorta();
          run.sairDaPorta();
        }
      }
      run.venceuChefe();
    }
    expect(fases).toEqual(Array(3).fill(['portaAPorta', 'portaAPorta', 'chefe']).flat());
    expect(run.estado.fase).toBe('vitoria');
    expect(run.estado.ruasVencidas).toBe(9);
  }, 30_000);

  it('o Relógio da Meia-Noite anda 4 min por minuto e, depois da meia-noite, fortalece os inimigos', () => {
    const run = novaRun();
    run.estado.tempoS = 60;
    expect(run.relogio()).toBe('21:04');
    run.estado.tempoS = 45 * 60;
    expect(run.relogio()).toBe('00:00');
    expect(run.multMeiaNoite()).toBeCloseTo(1);
    run.estado.tempoS = 47 * 60;
    expect(run.multMeiaNoite()).toBeCloseTo(1.2);
    // Meia-Noite Adiantada: começa 2 min adiantado.
    const outra = comPrecos(novaRun(), 'meia_noite_adiantada');
    expect(outra.relogio()).toBe('21:08');
  });

  it('o relógio conta o tempo jogado nas ruas', () => {
    const run = novaRun();
    const r = rua(run);
    r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
    rodar(r.mundo, 3);
    expect(run.estado.tempoS).toBeCloseTo(3, 1);
  });
});

describe('fase Porta a Porta', () => {
  function portaAberta(run = novaRun()) {
    run.novaRua();
    // Recompensa de portão neutra (a "+1 casa" mudaria a contagem das casas).
    run.estado.rotaAtual!.recompensa = 'doces_em_dobro';
    run.venceuRua();
    return { run, porta: run.novaPorta() };
  }

  it('3 casas acesas, cada uma com um trato e um preço da lista dele, e o banco com 4 itens', () => {
    const { run, porta } = portaAberta();
    const p = run.estado.porta!;
    expect(p.ofertas).toHaveLength(3);
    expect(porta.gerada.casas.filter((c) => c.acesa)).toHaveLength(3);
    for (const o of p.ofertas) {
      expect(o.precos).toHaveLength(1);
      expect(cfgTratos.tratos[o.trato]!.precos).toContain(o.precos[0]);
      expect(porta.gerada.casas[o.casa]!.acesa).toBe(true);
    }
    expect(new Set(p.ofertas.map((o) => o.trato)).size).toBe(3);
    expect(p.loja).toHaveLength(C.run.loja.itensOferecidos);
    expect(p.banco).toBe(true);
  });

  it('encostar na porta acesa ou no banco é o que a fase reconhece; o portão norte encerra', () => {
    const { porta } = portaAberta();
    const casa = porta.gerada.casas.findIndex((c) => c.acesa);
    expect(porta.regras.perto(porta.gerada.casas[casa]!.porta)).toEqual({ tipo: 'casa', casa });
    expect(porta.regras.perto(porta.gerada.banco!)).toEqual({ tipo: 'banco' });
    expect(porta.regras.perto(porta.jogador.pos)).toBeNull();
    porta.jogador.pos = { x: (porta.gerada.saida.x0 + porta.gerada.saida.x1) / 2, y: 3 };
    enfileirar(porta.mundo, { tipo: 'direcao', id: porta.jogador.id, x: 0, y: -1 });
    rodar(porta.mundo, 1.5);
    expect(porta.regras.saiu).toBe(true);
  });

  it('aceitar dá o poder na hora; o preço vale nas ruas seguintes', () => {
    const { run } = portaAberta();
    const p = run.estado.porta!;
    p.ofertas[0] = {
      casa: p.ofertas[0]!.casa,
      trato: 'relogio_de_bolso',
      precos: ['ondas_famintas'],
      pechinchou: false,
      aceito: false,
    };
    const pressa = run.ficha.combate.attr.pressa;
    expect(run.aceitar(p.ofertas[0]!.casa)).toBe(true);
    expect(run.ficha.combate.attr.pressa).toBe(pressa + 20);
    // Só 1 trato por fase.
    expect(run.aceitar(p.ofertas[1]!.casa)).toBe(false);
    run.sairDaPorta();
    const r = rua(run);
    expect(r.regras.opcoes.intervaloOndas).toBe(20);
  });

  it('Poste Apagado: cada rua seguinte nasce com 1 poste amigo apagado', () => {
    const run = comPrecos(novaRun(), 'poste_apagado');
    const r = run.novaRua();
    // Os postes apagados das ruas de trás (que o jogador religa) não contam.
    const religaveis = new Set(r.gerada.exploracao.postes.map((p) => p.objeto));
    const apagados = r.gerada.rua.objetos.filter(
      (o, i) => o.modelo === 'poste' && o.estado === 'apagado' && !religaveis.has(i),
    );
    expect(apagados.length).toBe(1);
  });

  it('Rua Sem Luz vale só para a próxima rua', () => {
    const { run } = portaAberta();
    const p = run.estado.porta!;
    p.ofertas[0]!.precos = ['rua_sem_luz'];
    run.aceitar(p.ofertas[0]!.casa);
    run.sairDaPorta();
    const escura = run.novaRua();
    expect(escura.gerada.luzes).toHaveLength(0);
    expect(escura.gerada.rua.objetos.some((o) => 'apagada' in o && o.apagada)).toBe(true);
    const seguinte = run.novaRua();
    expect(seguinte.gerada.luzes.length).toBeGreaterThan(0);
  });

  it('Janelas Fechadas tira uma casa acesa; Banco Quebrado tira o banco', () => {
    const run = comPrecos(novaRun(), 'janelas_fechadas', 'banco_quebrado');
    const { porta } = portaAberta(run);
    expect(run.estado.porta!.ofertas).toHaveLength(2);
    expect(porta.gerada.casas.filter((c) => c.acesa)).toHaveLength(2);
    expect(porta.gerada.banco).toBeNull();
    expect(run.comprar('pirulito')).toBe(false);
  });

  it('Lanterna Fraca tira 30 de Luz máxima e encolhe o pulso', () => {
    const run = comPrecos(novaRun(), 'lanterna_fraca');
    expect(run.ficha.combate.attr.luzMax).toBe(C.combate.luz.maxima - 30);
    expect(run.ficha.combate.attr.raioLanterna).toBeLessThan(0);
  });

  it('pechinchar custa 100 doces, troca o preço e vale uma vez por casa', () => {
    const { run } = portaAberta();
    const o = run.estado.porta!.ofertas[0]!;
    expect(run.pechinchar(o.casa)).toBe(false);
    run.bolso.doces = 250;
    const antes = [...o.precos];
    expect(run.pechinchar(o.casa)).toBe(true);
    expect(run.bolso.doces).toBe(150);
    expect(o.precos).not.toEqual(antes);
    expect(cfgTratos.tratos[o.trato]!.precos).toContain(o.precos[0]);
    expect(run.pechinchar(o.casa)).toBe(false);
  });

  it('recusar todos dá 80 doces e uma Medalha (+4% de dano e de Coragem máxima)', () => {
    const { run } = portaAberta();
    const coragem = run.ficha.combate.attr.coragemMax;
    expect(run.sairDaPorta()).toEqual({ recusou: true });
    expect(run.bolso.doces).toBe(80);
    expect(run.estado.medalhas).toBe(1);
    expect(run.ficha.combate.attr.dano).toBeCloseTo(1.04);
    expect(run.ficha.combate.attr.coragemMax).toBeCloseTo(coragem * 1.04);
  });

  it('com 4 Medalhas, a porta oferece a Chave da Cidade: sem preço, +25% em tudo', () => {
    const run = novaRun();
    run.estado.medalhas = 4;
    run.aplicarNaFicha();
    const forca = run.ficha.combate.attr.feitico;
    const { run: r2 } = portaAberta(run);
    const chave = r2.estado.porta!.ofertas.find((o) => o.trato === 'chave_da_cidade')!;
    expect(chave.precos).toEqual([]);
    r2.aceitar(chave.casa);
    expect(r2.ficha.combate.attr.feitico).toBeCloseTo(forca * 1.25);
    expect(r2.estado.precos).toHaveLength(0);
  });

  it('Assinatura em Sangue: o próximo trato vem com 2 preços; Recibo Rasgado apaga o mais antigo', () => {
    const run = novaRun();
    run.novaRua();
    run.venceuRua();
    const p = run.estado.porta!;
    p.ofertas[0] = { ...p.ofertas[0]!, trato: 'assinatura_em_sangue', precos: ['divida'] };
    run.aceitar(p.ofertas[0]!.casa);
    run.sairDaPorta();
    run.novaRua();
    run.venceuRua();
    const p2 = run.estado.porta!;
    for (const o of p2.ofertas) expect(o.precos).toHaveLength(2);
    p2.ofertas[0] = {
      ...p2.ofertas[0]!,
      trato: 'recibo_rasgado',
      precos: ['ondas_famintas', 'vizinhanca_atenta'],
    };
    run.aceitar(p2.ofertas[0]!.casa);
    // Dívida (o mais antigo) foi apagada; ficaram os 2 do Recibo.
    expect(run.estado.precos.map((x) => x.id)).toEqual(['ondas_famintas', 'vizinhanca_atenta']);
    expect(run.estado.reciboUsado).toBe(true);
  });

  it('banco: itens ocupam até 5 espaços, consumíveis empilham em 2, e sentar cura 30% uma vez', () => {
    const { run } = portaAberta();
    run.bolso.doces = 5000;
    const item = run.estado.porta!.loja[0]!;
    expect(run.comprar(item)).toBe(true);
    expect(run.estado.itens).toEqual([item]);
    expect(run.comprar(item)).toBe(false);
    expect(run.comprar('pirulito')).toBe(true);
    expect(run.comprar('pirulito')).toBe(true);
    expect(run.bolso.consumiveis.map((c) => c.id)).toEqual(['doce_isca', 'pirulito']);
    expect(run.comprar('bala_efervescente')).toBe(false);
    expect(run.motivoParaNaoComprar('bala_efervescente')).toBe('Sem espaço');
    const outros = Object.keys(cfgItens.itens).filter(
      (id) => cfgItens.itens[id]!.tipo === 'item' && !run.estado.porta!.loja.includes(id),
    );
    run.estado.itens.push(...outros.slice(0, 4));
    expect(run.motivoParaNaoComprar(run.estado.porta!.loja[1]!)).toBe('Bolso cheio');
    const c = run.ficha.combate;
    c.coragem = c.attr.coragemMax * 0.5;
    expect(run.sentarNoBanco()).toBe(true);
    expect(c.coragem).toBeCloseTo(c.attr.coragemMax * (0.5 + cfgItens.curaDoBanco));
    expect(run.sentarNoBanco()).toBe(false);
  });

  it('Cofre de Porquinho: o banco cobra 20% a mais; Bala de Coco: comprar cura', () => {
    const run = comTratos(novaRun(), 'cofre_de_porquinho', 'bala_de_coco');
    portaAberta(run);
    expect(run.precoNoBanco('pirulito')).toBe(Math.round(cfgItens.itens['pirulito']!.preco * 1.2));
    run.bolso.doces = 1000;
    const c = run.ficha.combate;
    c.coragem = c.attr.coragemMax * 0.5;
    run.comprar('pirulito');
    expect(c.coragem).toBeCloseTo(c.attr.coragemMax * 0.6);
  });
});

describe('tratos na luta', () => {
  it('Eco: o Q se repete 0,5 s depois com 40% do dano', () => {
    const r = rua(comTratos(novaRun(), 'eco'));
    const p = { x: r.jogador.pos.x, y: r.jogador.pos.y - 3 };
    const e = alvo(r, p, 1e5);
    lancar(r, 'Q', p);
    rodar(r.mundo, 1.5);
    expect(doJogador(r).map((l) => !!l.eco)).toEqual([false, true]);
    // Só o dano das habilidades (parada, a Bruxinha também faz auto-ataque).
    const danos = eventosDo(r.mundo.eventos, 'dano').filter(
      (d) => d.alvo === e.id && d.golpe === 'habilidade',
    );
    expect(danos).toHaveLength(2);
    expect(danos[1]!.valor / danos[0]!.valor).toBeCloseTo(0.4, 2);
    // A repetição não gasta Energia nem põe o Q em recarga de novo.
    expect(r.ficha.lancador.lancadas).toBe(1);
  });

  it('Segundo Fôlego: escudo de 20% da Coragem ao entrar na rua', () => {
    const r = rua(comTratos(novaRun(), 'segundo_folego'));
    passo(r.mundo);
    const c = r.jogador.combate!;
    const escudo = c.estados.find((s) => s.tipo === 'escudo');
    expect(escudo && 'valor' in escudo ? escudo.valor : 0).toBeCloseTo(c.attr.coragemMax * 0.2);
  });

  it('Sombra Amiga: +15% de dano e de velocidade só na sombra', () => {
    const r = rua(comTratos(novaRun(), 'sombra_amiga'));
    semLuz(r);
    rodar(r.mundo, 0.05);
    expect(r.jogador.combate!.attr.dano).toBeCloseTo(1.15);
    const vSombra = r.jogador.combate!.attr.velocidade;
    r.luz.adicionar({ tipo: 'poste', ...r.jogador.pos, raio: 3, cura: false });
    rodar(r.mundo, 0.05);
    expect(r.jogador.combate!.attr.dano).toBeCloseTo(1);
    expect(vSombra / r.jogador.combate!.attr.velocidade).toBeCloseTo(1.15);
  });

  it('Gato no Telhado: sair da sombra deixa invisível por 1 s', () => {
    const r = rua(comTratos(novaRun(), 'gato_no_telhado'));
    semLuz(r);
    rodar(r.mundo, 0.05);
    r.luz.adicionar({ tipo: 'poste', ...r.jogador.pos, raio: 3, cura: false });
    passo(r.mundo);
    expect(r.jogador.combate!.estados.some((s) => s.tipo === 'invisivel')).toBe(true);
  });

  it('Espantalho: uma vez por rua, a 20% de Coragem, explode e empurra quem está perto', () => {
    const r = rua(comTratos(novaRun(), 'espantalho'));
    const e = alvo(r, { x: r.jogador.pos.x + 1, y: r.jogador.pos.y }, 1e5);
    const c = r.jogador.combate!;
    c.coragem = c.attr.coragemMax * 0.15;
    rodar(r.mundo, 0.5);
    expect(r.tratos.estado.espantalhoUsado).toBe(true);
    expect(Math.hypot(e.pos.x - r.jogador.pos.x, e.pos.y - r.jogador.pos.y)).toBeGreaterThan(2);
    expect(eventosDo(r.mundo.eventos, 'explosaoAbobora')).toHaveLength(1);
  });

  it('Sino da Igreja: o R reinicia a recarga do E', () => {
    const r = rua(comTratos(novaRun(), 'sino_da_igreja'));
    const l = r.ficha.lancador;
    l.slots['E']!.recarga = 9;
    r.jogador.combate!.energia = 999;
    lancar(r, 'R', { x: r.jogador.pos.x, y: r.jogador.pos.y - 3 });
    rodar(r.mundo, 1);
    expect(l.slots['E']!.recarga).toBe(0);
  });

  it('Disco Riscado: auto-ataque que acerta tira 0,3 s de todas as recargas', () => {
    const r = rua(comTratos(novaRun(), 'disco_riscado'));
    alvo(r, { x: r.jogador.pos.x, y: r.jogador.pos.y - 2 }, 1e5);
    const l = r.ficha.lancador;
    l.slots['W']!.recarga = 30;
    // Ataque manual: golpes seguidos para cima, como quem segura o botão esquerdo.
    for (let i = 0; i < 120; i++) {
      enfileirar(r.mundo, { tipo: 'golpear', id: r.jogador.id, x: 0, y: -1 });
      rodar(r.mundo, 1 / 60);
    }
    const acertos = eventosDo(r.mundo.eventos, 'acertoAuto').filter((a) => a.dono === r.jogador.id);
    expect(acertos.length).toBeGreaterThan(0);
    expect(l.slots['W']!.recarga).toBeLessThan(30 - 2 - 0.3 * acertos.length + 0.05);
  });

  it('Corrente de Abóbora: quem cai explode com 20% da Coragem dele; Semente põe fogo, Lanterna acende', () => {
    const r = rua(
      comTratos(novaRun(), 'corrente_de_abobora', 'semente_de_abobora', 'lanterna_de_abobora'),
    );
    const p = { x: r.jogador.pos.x, y: r.jogador.pos.y - 3 };
    const caido = alvo(r, p, 500);
    const vizinho = alvo(r, { x: p.x + 0.8, y: p.y }, 1e4);
    golpear(r, caido, 1e6);
    const dano = eventosDo(r.mundo.eventos, 'dano').filter((d) => d.alvo === vizinho.id);
    expect(dano).toHaveLength(1);
    expect(r.tratos.estado.explosoes).toBe(1);
    expect(r.executor.estado.areas.some((a) => a.chave === 'chamas_de_abobora')).toBe(true);
    expect(r.luz.fontes.some((f) => f.tipo === 'explosao')).toBe(true);
  });

  it('Chave Mestra: um baú diante de uma porta; F encostado abre e dá 120 doces', () => {
    const r = rua(comTratos(novaRun(), 'chave_mestra'));
    r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
    // O da Chave Mestra vem primeiro; depois, os dos quintais que têm baú.
    // (a recompensa de portão e a Chuva de Doces podem pôr mais baús)
    expect(r.regras.estado.baus.length).toBeGreaterThanOrEqual(1);
    const bau = r.regras.estado.baus[0]!;
    r.jogador.pos = { x: bau.entidade.pos.x + 0.8, y: bau.entidade.pos.y };
    enfileirar(r.mundo, { tipo: 'usar', id: r.jogador.id, acao: 'interagir', x: 0, y: 0 });
    rodar(r.mundo, 2);
    expect(bau.aberto).toBe(true);
    expect(r.regras.bolso.doces).toBe(120);
  });

  it('Pote sem Fundo: uma Doce-isca de graça por rua, mesmo sem nenhuma no bolso', () => {
    const run = comTratos(novaRun(), 'pote_sem_fundo');
    run.bolso.consumiveis = [];
    const r = rua(run);
    const p = { x: r.jogador.pos.x, y: r.jogador.pos.y - 2 };
    enfileirar(r.mundo, { tipo: 'usar', id: r.jogador.id, acao: 'consumivel:0', ...p });
    passo(r.mundo);
    expect(r.mundo.entidades.some((e) => e.especie === 'doce_isca')).toBe(true);
    expect(r.regras.estado.iscasGratis).toBe(0);
  });

  it('Pirulito cura 25% em 3 s; Bala Efervescente dá 50 de Energia', () => {
    const run = novaRun();
    run.bolso.consumiveis = [
      { id: 'pirulito', qtd: 1 },
      { id: 'bala_efervescente', qtd: 1 },
    ];
    const r = rua(run);
    const c = r.jogador.combate!;
    c.coragem = c.attr.coragemMax * 0.5;
    c.energia = 0;
    enfileirar(r.mundo, { tipo: 'usar', id: r.jogador.id, acao: 'consumivel:0', x: 0, y: 0 });
    enfileirar(r.mundo, { tipo: 'usar', id: r.jogador.id, acao: 'consumivel:0', x: 0, y: 0 });
    rodar(r.mundo, 3.1);
    // O Pirulito saiu do bolso; a bala passou a ser o espaço 0 e foi usada também.
    expect(c.coragem).toBeGreaterThanOrEqual(c.attr.coragemMax * 0.74);
    expect(c.energia).toBeGreaterThanOrEqual(50);
    expect(run.bolso.consumiveis).toHaveLength(0);
  });
});

describe('os 6 Conjuntos', () => {
  it('Luz de 2: postes amigos curam o dobro', () => {
    const run = comTratos(novaRun(), 'segundo_folego', 'casca_grossa');
    expect(run.conjuntos().find((c) => c.marca === 'luz')!.nivel).toBe(2);
    expect(run.opcoesDaRua().multCuraPostes).toBe(2);
  });

  it('Luz de 4 (Farol): a lanterna não gasta Luz e o pulso causa dano; Vagalume cura', () => {
    const r = rua(
      comTratos(novaRun(), 'segundo_folego', 'casca_grossa', 'vagalume', 'lampada_no_bolso'),
    );
    const e = alvo(r, { x: r.jogador.pos.x + 2, y: r.jogador.pos.y }, 1e4);
    const c = r.jogador.combate!;
    c.coragem = c.attr.coragemMax * 0.5;
    const luz = c.luz;
    enfileirar(r.mundo, { tipo: 'usar', id: r.jogador.id, acao: 'lanterna', x: 0, y: 0 });
    rodar(r.mundo, 0.1);
    expect(c.luz).toBe(luz);
    expect(eventosDo(r.mundo.eventos, 'dano').some((d) => d.alvo === e.id)).toBe(true);
    expect(c.coragem).toBeGreaterThan(c.attr.coragemMax * 0.59);
    // Lâmpada no Bolso: pulso com 1 tile a mais.
    expect(eventosDo(r.mundo.eventos, 'pulsoLanterna')[0]!.raio).toBe(C.combate.luz.raioPulso + 1);
  });

  it('Sombra de 2: +10% de dano na sombra; de 4 (Noite Eterna): invisível aos vigias na sombra', () => {
    const dois = rua(comTratos(novaRun(), 'lua_no_bolso', 'cortina_pesada'));
    semLuz(dois);
    rodar(dois.mundo, 0.05);
    expect(dois.jogador.combate!.attr.dano).toBeCloseTo(1.1);

    const r = rua(
      comTratos(novaRun(), 'lua_no_bolso', 'cortina_pesada', 'gato_no_telhado', 'sombra_amiga'),
    );
    semLuz(r);
    passo(r.mundo);
    const vigia = alvo(r, { x: r.jogador.pos.x + 1, y: r.jogador.pos.y });
    expect(visivelPara(vigia, r.jogador, r.ia, 10, 10)).toBe(false);
    r.luz.adicionar({ tipo: 'poste', ...r.jogador.pos, raio: 3, cura: false });
    passo(r.mundo);
    expect(visivelPara(vigia, r.jogador, r.ia, 10, 10)).toBe(true);
  });

  it('Doce de 2: doces ×1,2; de 4 (Fome de Doce): +3% de dano a cada 100 doces, até 30%', () => {
    const dois = comTratos(novaRun(), 'chave_mestra', 'colecao_de_chaves');
    expect(dois.ficha.combate.attr.doces).toBeCloseTo(1.2);
    const run = comTratos(
      novaRun(),
      'chave_mestra',
      'colecao_de_chaves',
      'bala_de_coco',
      'pote_sem_fundo',
    );
    run.bolso.doces = 350;
    const r = rua(run);
    rodar(r.mundo, 0.05);
    expect(r.jogador.combate!.attr.dano).toBeCloseTo(1.09);
    run.bolso.doces = 5000;
    rodar(r.mundo, 0.05);
    expect(r.jogador.combate!.attr.dano).toBeCloseTo(1.3);
  });

  it('Eco de 2: habilidades às vezes se repetem; de 4 (Coro): toda 3ª se repete', () => {
    const casts = (r: RuaDaRun, n: number) => {
      const p = { x: r.jogador.pos.x, y: r.jogador.pos.y - 3 };
      alvo(r, p, 1e6);
      for (let i = 0; i < n; i++) {
        r.ficha.lancador.slots['Q']!.recarga = 0;
        r.jogador.combate!.energia = 999;
        lancar(r, 'Q', p);
        rodar(r.mundo, 0.6);
      }
      return r.tratos.estado.ecos;
    };
    const dois = rua(comTratos(novaRun(), 'relogio_de_bolso', 'mira_torta'));
    const ecos2 = casts(dois, 40);
    expect(ecos2).toBeGreaterThan(0);
    expect(ecos2).toBeLessThan(20);
    const quatro = rua(
      comTratos(novaRun(), 'relogio_de_bolso', 'mira_torta', 'sino_da_igreja', 'disco_riscado'),
    );
    expect(casts(quatro, 6)).toBeGreaterThanOrEqual(2);
  });

  it('Abóbora de 2: inimigos às vezes explodem; de 4 (Colheita): explosões enchem o Susto e encadeiam', () => {
    const dois = rua(comTratos(novaRun(), 'espantalho', 'semente_de_abobora'));
    for (let i = 0; i < 30; i++) {
      const e = alvo(dois, { x: 4 + (i % 10) * 1.5, y: 4 + Math.floor(i / 10) * 3 }, 10);
      golpear(dois, e, 1e6);
    }
    expect(dois.tratos.estado.explosoes).toBeGreaterThan(0);
    expect(dois.tratos.estado.explosoes).toBeLessThan(20);

    const r = rua(
      comTratos(
        novaRun(),
        'espantalho',
        'semente_de_abobora',
        'corrente_de_abobora',
        'lanterna_de_abobora',
      ),
    );
    r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
    const p = { x: r.jogador.pos.x, y: r.jogador.pos.y - 4 };
    const primeiro = alvo(r, p, 500);
    // Uma fila: cada explosão (20% da Coragem de quem caiu) derruba o próximo, que explode de novo.
    [80, 10, 1].forEach((coragem, k) => alvo(r, { x: p.x + (k + 1) * 1.2, y: p.y }, coragem));
    golpear(r, primeiro, 1e6);
    rodar(r.mundo, 0.2);
    expect(r.tratos.estado.explosoes).toBeGreaterThanOrEqual(3);
    const colheita = eventosDo(r.mundo.eventos, 'susto').filter((s) => s.motivo === 'colheita');
    expect(colheita.length).toBeGreaterThan(0);
  });

  it('Pacto de 2: +5% de dano por preço; de 4 (Contrato Fechado): −4% de recarga por preço', () => {
    const dois = comPrecos(
      comTratos(novaRun(), 'dentes_afiados', 'pacto_do_porao'),
      'divida',
      'lanterna_fraca',
      'ondas_famintas',
    );
    expect(dois.ficha.combate.attr.dano).toBeCloseTo(1.15);
    const run = comPrecos(
      comTratos(
        novaRun(),
        'dentes_afiados',
        'pacto_do_porao',
        'assinatura_em_sangue',
        'divida_antiga',
      ),
      'divida',
      'lanterna_fraca',
      'ondas_famintas',
    );
    expect(run.ficha.combate.attr.dano).toBeCloseTo(1.15 * 1.3);
    expect(1 / run.ficha.combate.attr.velocidadeRecarga).toBeCloseTo(1 - 0.12);
  });
});
