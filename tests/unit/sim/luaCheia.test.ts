import { describe, expect, it, vi } from 'vitest';
import { causarDano } from '../../../src/sim/combate';
import { album, campeoes, conteudo, inimigos, luaCheia } from '../../../src/sim/content';
import type { Entidade, Mundo, Sistema } from '../../../src/sim/mundo';
import { eventosDo } from '../../../src/sim/partida';
import { LUA, Run, type ConteudoRun, type OpcoesDaRun } from '../../../src/sim/run';
import { rodar } from './ajuda';

// Cada teste gera várias ruas e praças: com a suíte inteira em paralelo, leva mais que 5 s.
vi.setConfig({ testTimeout: 60_000 });

const C = conteudo as ConteudoRun;
const MORADORA = inimigos.inimigos['moradora_do_13']!;

/** Vence as ruas e os chefes até o fim da run (sem aceitar tratos). */
function venceTudo(run: Run): void {
  for (let guarda = 0; guarda < 40; guarda++) {
    const f = run.estado.fase;
    if (f === 'rua') {
      run.novaRua();
      run.venceuRua();
    } else if (f === 'portaAPorta') {
      run.novaPorta();
      run.sairDaPorta();
    } else if (f === 'chefe') {
      run.novaArena();
      run.venceuChefe();
    } else return;
  }
}

function pestinha(run: Run): Entidade {
  const r = run.novaRua();
  return r.regras.criarInimigo(r.mundo, 'pestinha_lencol', { ...r.jogador.pos });
}

describe('opções do Álbum na run', () => {
  it('as portas só oferecem os tratos liberados', () => {
    for (let s = 1; s <= 6; s++) {
      const run = new Run(C, s, 'bruxinha', { tratos: album.tratosIniciais });
      run.novaRua();
      run.venceuRua();
      for (const o of run.estado.porta!.ofertas.filter((x) => !x.vermelha))
        expect(album.tratosIniciais).toContain(o.trato);
    }
  });

  it('a loja só tem itens iniciais, mais os comprados no Álbum', () => {
    const extras = ['ampulheta', 'pote_de_mel'];
    let viuExtra = false;
    for (let s = 1; s <= 8; s++) {
      const run = new Run(C, s, 'bruxinha', { itensExtras: extras });
      run.novaRua();
      run.venceuRua();
      for (const id of run.estado.porta!.loja) {
        expect(C.itens.itens[id]!.inicial || extras.includes(id)).toBe(true);
        viuExtra ||= extras.includes(id);
      }
    }
    expect(viuExtra).toBe(true);
  });

  it('os bônus iniciais dão doces, pechinchas e Coragem máxima', () => {
    const base = new Run(C, 3);
    const run = new Run(C, 3, 'bruxinha', { bonus: { coragem: 0.1, doces: 100, rerolls: 2 } });
    expect(run.bolso.doces).toBe(base.bolso.doces + 100);
    expect(run.estado.rerolls).toBe(base.estado.rerolls + 2);
    expect(run.ficha.combate.attr.coragemMax).toBeCloseTo(base.ficha.combate.attr.coragemMax * 1.1);
  });
});

describe('Lua Cheia', () => {
  const comLua = (lua: number, semente = 4, extra: OpcoesDaRun = {}) =>
    new Run(C, semente, 'bruxinha', { lua, ...extra });

  it('cada nível soma o seu efeito aos de baixo, até o 10', () => {
    expect(luaCheia.niveis).toHaveLength(10);
    expect(
      comLua(3)
        .efeitosDaLua()
        .map((e) => e.tipo),
    ).toEqual(['inimigos', 'recargaPostes', 'precoInicial']);
    expect(comLua(99).lua).toBe(10);
    expect(comLua(-2).lua).toBe(0);
  });

  it('1: inimigos com +15% de Coragem; 6: +15% de dano', () => {
    const c0 = pestinha(comLua(0)).combate!;
    const c1 = pestinha(comLua(1)).combate!;
    const c6 = pestinha(comLua(6)).combate!;
    expect(c1.attr.coragemMax).toBeCloseTo(c0.attr.coragemMax * 1.15);
    expect(c1.attr.dano).toBeCloseTo(c0.attr.dano);
    expect(c6.attr.dano).toBeCloseTo(c0.attr.dano * 1.15);
  });

  it('2: Postes Corrompidos recarregam 30% mais rápido', () => {
    const r = comLua(2).novaRua();
    const poste = r.regras.estado.postes[0]!;
    expect(poste.combate!.attr.velocidadeRecarga).toBeCloseTo(1.3);
    const r0 = comLua(1).novaRua();
    expect(r0.regras.estado.postes[0]!.combate!.attr.velocidadeRecarga).toBe(1);
  });

  it('3: a run começa com um preço pago; 4: o relógio começa 5 min adiantado', () => {
    const run = comLua(3);
    expect(run.estado.precos).toHaveLength(1);
    expect(run.estado.precos[0]!.trato).toBe(LUA);
    expect(comLua(2).estado.precos).toHaveLength(0);
    // Mesma semente, mesmo preço inicial: só a Lua 4 muda o relógio, em 5 min reais × 4.
    const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
    expect(minutos(comLua(4).relogio()) - minutos(comLua(3).relogio())).toBe(
      5 * C.run.relogio.minutosDeJogoPorMinuto,
    );
  });

  it('7 a 10: mais pestinhas por onda, banco mais caro, ondas mais curtas e chefes mais fortes', () => {
    expect(comLua(6).opcoesDaRua().extraPorOnda).toBeUndefined();
    expect(comLua(7).opcoesDaRua().extraPorOnda).toBe(1);
    expect(comLua(8).precoNoBanco('pirulito')).toBe(
      Math.round(C.itens.itens['pirulito']!.preco * 1.25),
    );
    expect(comLua(9).opcoesDaRua().intervaloOndas).toBe(20);
    expect(comLua(9).opcoesDaRua().multCoragemChefe).toBe(1);
    expect(comLua(10).opcoesDaRua().multCoragemChefe).toBeCloseTo(1.25);
  });

  it('os Doces Guardados crescem com o nível da Lua', () => {
    const r0 = comLua(0);
    const r5 = comLua(5);
    for (const r of [r0, r5]) {
      r.estado.docesGanhos = 1000;
      r.estado.chefesVencidos = 1;
    }
    const g0 = r0.resumo().docesGuardados;
    expect(r5.resumo().docesGuardados).toBe(Math.floor(g0 * (1 + 5 * C.run.album.porLua)));
  });
});

describe('A Moradora do 13', () => {
  it('só aparece com a Lua Cheia 5 e o último bairro vencido sem nenhum trato', () => {
    const semLua = comMoradora(4);
    venceTudo(semLua);
    expect(semLua.estado.fase).toBe('vitoria');
    const run = comMoradora(5);
    venceTudo(run);
    expect(run.estado.fase).toBe('moradora');
    const comTrato = comMoradora(5);
    comTrato.estado.tratos.push('eco');
    venceTudo(comTrato);
    expect(comTrato.estado.fase).toBe('vitoria');
    expect(comTrato.estado.moradora).toBeNull();
  });

  it('copia as 4 habilidades do campeão, anunciadas, sem custo e com projéteis legíveis', () => {
    for (const campeao of Object.keys(campeoes)) {
      const { r, moradora } = duelo(campeao);
      const l = moradora.lancador!;
      expect(Object.keys(l.slots)).toEqual(['Q', 'W', 'E', 'R']);
      for (const t of ['Q', 'W', 'E', 'R'] as const) {
        const s = l.slots[t]!;
        expect(s.def.id).toBe(r.jogador.lancador!.slots[t]!.def.id);
        expect(s.def.custo).toBe(0);
        expect(s.def.aviso).toBe(true);
        expect(s.def.lancamento).toBeGreaterThanOrEqual(0.4);
        if (s.def.forma.tipo === 'linha') expect(s.def.forma.velocidade).toBeLessThanOrEqual(9);
        expect(s.posto).toBeGreaterThanOrEqual(1);
      }
      expect(moradora.marcas?.visual).toBe(campeao);
      // A Lua Cheia 5 inclui o +15% de Coragem do nível 1.
      expect(moradora.combate!.attr.coragemMax).toBeCloseTo(MORADORA.coragem * 1.15);
      const f = MORADORA.param['fatorAtributos']!;
      const a = r.jogador.combate!.attr;
      expect(moradora.combate!.attr.forca).toBeCloseTo(a.forca * f);
      expect(moradora.combate!.attr.feitico).toBeCloseTo(a.feitico * f);
    }
  });

  it('no duelo ela anuncia e lança as cópias contra o jogador', () => {
    const { r, moradora } = duelo('bruxinha');
    rodar(r.mundo, 12);
    const anuncios = eventosDo(r.mundo.eventos, 'anunciou').filter((a) => a.id === moradora.id);
    expect(anuncios.length).toBeGreaterThan(1);
    for (const a of anuncios) expect(a.duracao).toBeGreaterThanOrEqual(0.4);
  });

  it('abaixo da metade o reflexo se parte e as recargas encurtam', () => {
    const { r, moradora } = duelo('fantasma');
    const antes = moradora.lancador!.slots['Q']!.def.recarga[0]!;
    moradora.combate!.coragem = moradora.combate!.attr.coragemMax * 0.4;
    rodar(r.mundo, 0.2);
    expect(eventosDo(r.mundo.eventos, 'faseChefe').at(-1)?.fase).toBe(2);
    expect(moradora.lancador!.slots['Q']!.def.recarga[0]).toBeCloseTo(
      antes * MORADORA.param['fatorRecargaFase2']!,
    );
  });

  it('no corredor, enquanto houver espelho, ela repete a habilidade que o jogador usou', () => {
    const { r, moradora } = duelo('bruxinha');
    expect(espelhos(r.mundo)).toHaveLength(4);
    calar(moradora);
    const j = r.jogador;
    j.combate!.energia = j.combate!.attr.energiaMax;
    j.lancador!.slots['Q']!.posto = 1;
    r.regras.executor.pedir(r.mundo, j, 'Q', { ...moradora.pos });
    rodar(r.mundo, 2);
    const delas = eventosDo(r.mundo.eventos, 'lancou').filter((e) => e.id === moradora.id);
    expect(delas.map((e) => e.tecla)).toContain('Q');
  });

  it('quebrar todos os espelhos acaba com a cópia e com o Reflexo partido', () => {
    const { r, moradora } = duelo('fantasma');
    const base = moradora.lancador!.slots['Q']!.def.recarga[0]!;
    moradora.combate!.coragem = moradora.combate!.attr.coragemMax * 0.4;
    rodar(r.mundo, 0.2);
    const f = MORADORA.param['fatorRecargaFase2']!;
    expect(moradora.lancador!.slots['Q']!.def.recarga[0]).toBeCloseTo(base * f);
    // Cada espelho cai dentro de um tick (as regras veem o `derrotado`).
    for (const e of espelhos(r.mundo)) {
      const s: Sistema = {
        antesDeMover(m) {
          causarDano(m, e, { origem: r.jogador.id, bruto: 1e5, tipo: 'autoAtaque' });
        },
      };
      const sistemas = r.mundo.sistemas as Sistema[];
      sistemas.unshift(s);
      rodar(r.mundo, 1 / 60);
      sistemas.splice(sistemas.indexOf(s), 1);
    }
    rodar(r.mundo, 0.2);
    expect(espelhos(r.mundo)).toHaveLength(0);
    const avisos = eventosDo(r.mundo.eventos, 'aviso').map((a) => a.texto);
    expect(avisos.some((t) => t.includes('último espelho'))).toBe(true);
    expect(moradora.lancador!.slots['Q']!.def.recarga[0]).toBeCloseTo(base);
    // Sem espelho, a habilidade do jogador não volta repetida.
    calar(moradora);
    const antes = r.mundo.eventos.length;
    const j = r.jogador;
    j.combate!.energia = j.combate!.attr.energiaMax;
    j.lancador!.slots['Q']!.posto = 1;
    r.regras.executor.pedir(r.mundo, j, 'Q', { ...moradora.pos });
    rodar(r.mundo, 2);
    const delas = eventosDo(r.mundo.eventos.slice(antes), 'lancou').filter(
      (e) => e.id === moradora.id,
    );
    expect(delas).toHaveLength(0);
  });

  it('vencer o duelo dá os Doces Guardados dela; perder ainda é vitória', () => {
    const ganha = comMoradora(5);
    venceTudo(ganha);
    ganha.novaArena();
    ganha.venceuChefe();
    expect(ganha.estado.fase).toBe('vitoria');
    const rg = ganha.resumo();
    expect(rg.moradora).toBe('venceu');
    const perde = comMoradora(5);
    venceTudo(perde);
    perde.novaArena();
    perde.perdeu();
    const rp = perde.resumo();
    expect(rp.venceu).toBe(true);
    expect(rp.moradora).toBe('perdeu');
    expect(rg.docesGuardados - rp.docesGuardados).toBe(C.run.album.moradora);
  });
});

describe('dano causado', () => {
  it('a rua conta o dano do jogador e a run soma no resumo', () => {
    const run = new Run(C, 8);
    const r = run.novaRua();
    const alvo = r.regras.criarInimigo(r.mundo, 'pestinha_lencol', {
      x: r.jogador.pos.x + 3,
      y: r.jogador.pos.y,
    });
    let feito = false;
    // Um sistema de teste causa o dano dentro do tick, como uma habilidade.
    (r.mundo.sistemas as Sistema[]).push({
      antesDeMover: (m: Mundo) => {
        if (feito) return;
        feito = true;
        causarDano(m, alvo, { origem: r.jogador.id, bruto: 30, tipo: 'habilidade' });
      },
    });
    rodar(r.mundo, 0.1);
    expect(r.regras.estado.danoCausado).toBeGreaterThan(0);
    run.venceuRua(r.regras.estado);
    expect(run.resumo().danoCausado).toBe(Math.round(r.regras.estado.danoCausado));
  });
});

function comMoradora(lua: number): Run {
  return new Run(C, 11, 'bruxinha', { lua });
}

const espelhos = (m: Mundo) =>
  m.entidades.filter((e) => e.especie === 'espelho' && e.marcas?.quebravel);

/** A Moradora sem lançar nada por conta própria (recargas longas e pausa grande). */
function calar(moradora: Entidade): void {
  for (const s of Object.values(moradora.lancador!.slots)) if (s) s.recarga = 99;
  (moradora.ia as Record<string, unknown>)['pausa'] = 99;
}

function duelo(campeao: string) {
  const run = new Run(C, 21, campeao, { lua: 5 });
  venceTudo(run);
  expect(run.estado.fase).toBe('moradora');
  const r = run.novaArena();
  r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
  const moradora = r.regras.estado.chefe!;
  expect(moradora.especie).toBe('moradora_do_13');
  return { run, r, moradora };
}
