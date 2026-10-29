import { describe, expect, it, vi } from 'vitest';
import { causarDano, combatenteDoCampeao } from '../../../src/sim/combate';
import {
  album,
  campeoes,
  combate,
  conteudo,
  entreRuns,
  evolucoes,
  habilidades,
  inimigos,
  luaCheia,
  noite,
  precos,
  tratos,
} from '../../../src/sim/content';
import { idsDoDiario, paginasDoDiario } from '../../../src/sim/diario';
import type { Mundo, Sistema } from '../../../src/sim/mundo';
import { criarSistemaPassivas } from '../../../src/sim/passivas';
import {
  alternarPassiva,
  desafioDaSemana,
  maestria,
  objetivoDoDiario,
  opcoesDaRun,
  progressoNovo,
  registrarFim,
  semanaDe,
  type ConteudoDoProgresso,
} from '../../../src/sim/progresso';
import { Run, type ConteudoRun, type ResumoDaRun } from '../../../src/sim/run';
import { boneco, cena, eventos, lancar, perdida, rodar } from './ajuda';

vi.setConfig({ testTimeout: 60_000 });

const C = conteudo as ConteudoRun;
const DIARIO = { tratos, precos, inimigos, noite, evolucoes, campeoes, habilidades, entreRuns };
const PAGINAS = paginasDoDiario(DIARIO);
const CP: ConteudoDoProgresso = {
  album,
  luaCheia,
  entreRuns,
  campeoes,
  tratos,
  diario: idsDoDiario(DIARIO),
};
const ALT = (id: string) => campeoes[id]!.passivaAlternativa.passiva;

/** Um sistema de teste que faz algo dentro do tick (como uma habilidade faria). */
function noTick(m: Mundo, f: (m: Mundo) => void): void {
  let feito = false;
  (m.sistemas as Sistema[]).push({
    antesDeMover: (mm: Mundo) => {
      if (feito) return;
      feito = true;
      f(mm);
    },
  });
}

describe('passivas alternativas (maestria 4)', () => {
  it('Feitiço Instável: cerca de 20% das habilidades saem em dobro e 5% falham', () => {
    const c = cena();
    c.heroi.lancador!.passiva = ALT('bruxinha');
    boneco(c, { x: 10, y: 15 }, 0, 1e9);
    for (let k = 0; k < 400; k++) {
      c.heroi.lancador!.slots['Q']!.recarga = 0;
      c.heroi.combate!.energia = c.heroi.combate!.attr.energiaMax;
      lancar(c, 'Q', { x: 10, y: 15 });
      rodar(c.mundo, 0.6);
    }
    const falhas = eventos(c.mundo, 'feiticoFalhou').length;
    const saiu = eventos(c.mundo, 'lancou');
    const dobros = saiu.filter((l) => l.fortalecida).length;
    const n = falhas + saiu.length;
    expect(n).toBeGreaterThan(300);
    expect(falhas / n).toBeGreaterThan(0.02);
    expect(falhas / n).toBeLessThan(0.1);
    expect(dobros / n).toBeGreaterThan(0.13);
    expect(dobros / n).toBeLessThan(0.28);
  });

  it('Frio na Espinha: quem está atrás do Fantasma leva +25% de dano', () => {
    const c = cena([], { campeao: 'fantasma' });
    c.heroi.lancador!.passiva = ALT('fantasma');
    c.heroi.olhar = { x: 1, y: 0 };
    const frente = boneco(c, { x: 7, y: 15 }, 0, 1e6);
    const atras = boneco(c, { x: 3, y: 15 }, 0, 1e6);
    noTick(c.mundo, (m) => {
      for (const alvo of [frente, atras])
        causarDano(m, alvo, { origem: c.heroi.id, bruto: 100, tipo: 'habilidade' });
    });
    rodar(c.mundo, 0.05);
    expect(perdida(atras) / perdida(frente)).toBeCloseTo(1.25);
  });

  it('Ossos Ocos: sem Remontar, mais rápido e com o E mais forte', () => {
    const def = campeoes['esqueleto']!;
    const comAlt = combatenteDoCampeao({ ...def, passiva: ALT('esqueleto') }, combate);
    const normal = combatenteDoCampeao(def, combate);
    expect(normal.remontar).toBeDefined();
    expect(comAlt.remontar).toBeUndefined();
    expect(comAlt.attr.velocidade).toBeCloseTo(normal.attr.velocidade * 1.3);
    const dano = (alt: boolean) => {
      const c = cena([], { campeao: 'esqueleto' });
      if (alt) c.heroi.lancador!.passiva = ALT('esqueleto');
      const b = boneco(c, { x: 6.5, y: 15 }, 0, 1e6);
      lancar(c, 'E', { x: 6.5, y: 15 });
      rodar(c.mundo, 2);
      return perdida(b);
    };
    const base = dano(false);
    expect(base).toBeGreaterThan(0);
    expect(dano(true) / base).toBeCloseTo(1.3, 1);
  });

  it('Luz do Dia: roubo de vida igual na sombra e cura ao derrubar um Poste', () => {
    const c = cena([], { campeao: 'vampirinho', extras: [criarSistemaPassivas()] });
    const p = ALT('vampirinho');
    c.heroi.lancador!.passiva = p;
    const cb = c.heroi.combate!;
    cb.coragem = cb.attr.coragemMax / 2;
    rodar(c.mundo, 0.05);
    // Sem luz no mundo é sombra: a Sede daria 15%, a Luz do Dia fica nos 10%.
    expect(cb.attr.rouboVida).toBeCloseTo(p.tipo === 'luzDoDia' ? p.rouboVida : 0);
    const antes = cb.coragem;
    noTick(c.mundo, (m) =>
      m.eventos.push({ tipo: 'posteCaiu', id: 999, pos: { x: 8, y: 15 }, indice: 0 }),
    );
    rodar(c.mundo, 0.05);
    expect(cb.coragem - antes).toBeCloseTo(cb.attr.coragemMax * 0.05, 0);
  });

  it('a run usa a passiva alternativa e pode ficar sem Despertares', () => {
    const run = new Run(C, 3, 'bruxinha', { passivaAlternativa: true, despertares: false });
    expect(run.ficha.lancador.passiva?.tipo).toBe('instavel');
    expect(run.ficha.campeao.nomePassiva).toBe('Feitiço Instável');
    expect(run.ficha.despertares).toBe(false);
    expect(new Run(C, 3).ficha.despertares).toBe(true);
  });
});

describe('começo alternativo (maestria 3)', () => {
  it('a run começa numa porta com 3 tratos sem preço, sem Medalha ao recusar', () => {
    const run = new Run(C, 5, 'bruxinha', { comeco: 3, tratos: album.tratosIniciais });
    expect(run.estado.fase).toBe('portaAPorta');
    const p = run.estado.porta!;
    expect(p.comeco).toBe(true);
    expect(p.ofertas).toHaveLength(3);
    for (const o of p.ofertas) {
      expect(o.precos).toEqual([]);
      expect(album.tratosIniciais).toContain(o.trato);
    }
    run.novaPorta();
    expect(run.aceitar(p.ofertas[0]!.casa)).toBe(true);
    expect(run.estado.precos).toHaveLength(0);
    run.sairDaPorta();
    expect(run.estado.fase).toBe('rua');
    const recusa = new Run(C, 5, 'bruxinha', { comeco: 3 });
    recusa.novaPorta();
    expect(recusa.sairDaPorta().recusou).toBe(false);
    expect(recusa.estado.medalhas).toBe(0);
    expect(recusa.estado.recusados).toEqual([]);
  });
});

describe('Diário do Bairro', () => {
  it('as páginas cobrem o conteúdo, cada entrada com dica', () => {
    expect(PAGINAS.tratos).toHaveLength(
      Object.keys(tratos.tratos).length +
        Object.keys(tratos.especiais).length +
        Object.keys(tratos.lendarios).length,
    );
    expect(PAGINAS.precos).toHaveLength(Object.keys(precos.precos).length);
    expect(PAGINAS.conjuntos).toHaveLength(12);
    expect(PAGINAS.condicoes).toHaveLength(Object.keys(noite.condicoes).length);
    expect(PAGINAS.encontros).toHaveLength(5);
    expect(PAGINAS.evolucoes).toHaveLength(Object.values(evolucoes).flat().length);
    expect(PAGINAS.inimigos.map((e) => e.id)).toContain('moradora_do_13');
    expect(PAGINAS.inimigos.map((e) => e.id)).not.toContain('gato_preto');
    for (const lista of Object.values(PAGINAS))
      for (const e of lista) expect(e.dica.length, e.id).toBeGreaterThan(5);
  });

  it('a run anota tratos, preços, condições, inimigos, Conjuntos e evoluções vistos', () => {
    const run = new Run(C, 9);
    const r = run.novaRua();
    run.venceuRua(r.regras.estado);
    const v = run.estado.vistos;
    expect(v.condicoes).toContain('noite_comum');
    expect(v.inimigos).toContain('poste_corrompido');
    const ofertas = run.estado.porta!.ofertas;
    for (const o of ofertas) expect(v.tratos).toContain(o.trato);
    for (const id of ofertas.flatMap((o) => o.precos)) expect(v.precos).toContain(id);
    run.estado.tratos.push('vagalume', 'janela_aberta');
    run.aplicarNaFicha();
    expect(v.conjuntos).toContain('luz:2');
    const slot = run.ficha.lancador.slots['Q']!;
    slot.evolucao = evolucoes['bruxinha_q']![1]!.id;
    expect(run.resumo().vistos.evolucoes).toEqual(evolucoes['bruxinha_q']!.map((e) => e.id));
  });

  it('fechar uma página dá Doces Guardados uma vez; o objetivo vem do que falta', () => {
    const p = progressoNovo(album);
    expect(objetivoDoDiario(p, PAGINAS)).toMatch(/Conjunto/);
    const r = resumo({ vistos: { ...vazio(), encontros: CP.diario.encontros } });
    const n = registrarFim(p, r, CP, 'run');
    const doces = entreRuns.diario.paginas.encontros.doces;
    expect(n.paginas).toEqual([entreRuns.diario.paginas.encontros.nome]);
    expect(p.docesGuardados).toBe(r.docesGuardados + doces);
    expect(registrarFim(p, r, CP, 'run').paginas).toEqual([]);
    expect(p.docesGuardados).toBe(2 * r.docesGuardados + doces);
  });
});

describe('maestria', () => {
  it('pontos pela XP, chefes e vitória; o nível 2 dá uma cor; o 4 libera a passiva', () => {
    const p = progressoNovo(album);
    const cfg = entreRuns.maestria;
    registrarFim(p, resumo({ xpTotal: 2000, chefesVencidos: 1 }), CP, 'run');
    expect(p.maestria['bruxinha']).toBe(2000 * cfg.pontosPorXp + cfg.pontosPorChefe);
    expect(opcoesDaRun(p, CP, 'run', 'bruxinha').despertares).toBe(false);
    p.maestria['bruxinha'] = cfg.niveis[1]! - 1;
    const n = registrarFim(p, resumo({ xpTotal: 10 }), CP, 'run');
    expect(n.maestria).toBe(2);
    expect(n.cor).toBe(album.cores['bruxinha']![0]!.nome);
    expect(p.cores).toContain(album.cores['bruxinha']![0]!.id);
    const o2 = opcoesDaRun(p, CP, 'run', 'bruxinha');
    expect(o2.despertares).toBe(true);
    expect(o2.comeco).toBeUndefined();
    expect(alternarPassiva(p, 'bruxinha', entreRuns)).toBe(false);
    p.maestria['bruxinha'] = cfg.niveis[3]!;
    expect(maestria(p, 'bruxinha', entreRuns).nivel).toBe(4);
    expect(opcoesDaRun(p, CP, 'run', 'bruxinha').comeco).toBe(cfg.comeco.ofertas);
    expect(alternarPassiva(p, 'bruxinha', entreRuns)).toBe(true);
    expect(opcoesDaRun(p, CP, 'run', 'bruxinha').passivaAlternativa).toBe(true);
    // A semente da noite é igual para todos: nada de maestria.
    expect(opcoesDaRun(p, CP, 'noite', 'bruxinha').passivaAlternativa).toBeUndefined();
  });
});

describe('moradores que lembram', () => {
  it('quem teve o trato aceito cumprimenta e pechincha pela metade', () => {
    const run = new Run(C, 4, 'bruxinha', {
      lembrados: { tratos: ['eco'], fracaoPechincha: 0.5, falas: ['Oi de novo!'] },
    });
    run.novaRua();
    run.venceuRua();
    const p = run.estado.porta!;
    p.ofertas[0]!.trato = 'eco';
    p.ofertas[1]!.trato = 'vagalume';
    expect(run.lembra('eco')).toBe('Oi de novo!');
    expect(run.lembra('vagalume')).toBeNull();
    expect(run.custoDaPechincha(p.ofertas[0]!.casa)).toBe(Math.round(tratos.pechincha * 0.5));
    expect(run.custoDaPechincha(p.ofertas[1]!.casa)).toBe(tratos.pechincha);
  });

  it('três recusas ofendem; o ofendido aparece como elite e dá o trato sem preço', () => {
    const prog = progressoNovo(album);
    const m = entreRuns.moradores;
    for (let k = 0; k < m.recusasParaOfender; k++)
      registrarFim(prog, resumo({ recusados: ['eco'] }), CP, 'run');
    const o = opcoesDaRun(prog, CP, 'run', 'bruxinha');
    expect(o.ofendido?.trato).toBe('eco');
    // Aceitar o trato faz as pazes.
    const pazes = progressoNovo(album);
    pazes.recusas = { eco: 5 };
    registrarFim(pazes, resumo({ tratoIds: ['eco'] }), CP, 'run');
    expect(pazes.recusas['eco']).toBeUndefined();
    expect(pazes.lembrados).toEqual(['eco']);

    const run = new Run(C, 7, 'bruxinha', { ...o, ofendido: { ...o.ofendido!, aposRuas: 0 } });
    const r = run.novaRua();
    expect(run.estado.ofendido?.situacao).toBe('naRua');
    rodar(r.mundo, inimigos.elitesNaRua.extrasAosSegundos + 0.5);
    const morador = r.mundo.entidades.find((e) => e.especie === m.especieOfendido)!;
    expect(morador.marcas?.tratoDoMorador).toBe('eco');
    noTick(r.mundo, (mm) =>
      causarDano(mm, morador, {
        origem: r.jogador.id,
        bruto: 1e9,
        tipo: 'habilidade',
        verdadeiro: true,
      }),
    );
    rodar(r.mundo, 0.1);
    expect(run.estado.tratos).toContain('eco');
    expect(run.estado.precos.filter((x) => x.trato === 'eco')).toHaveLength(0);
    expect(run.estado.ofendido?.situacao).toBe('vencido');
  });
});

describe('desafio da semana', () => {
  it('a semana vai de segunda a domingo e cada uma tem um desafio', () => {
    // 12/10/2026 foi segunda-feira.
    const s = semanaDe(2026, 10, 12);
    expect(semanaDe(2026, 10, 18)).toBe(s);
    expect(semanaDe(2026, 10, 19)).toBe(s + 1);
    expect(desafioDaSemana(s + 1, entreRuns)).not.toEqual(desafioDaSemana(s, entreRuns));
  });

  it('as regras viram opções da run e a recompensa vale uma vez por semana', () => {
    const p = progressoNovo(album);
    const lista = entreRuns.desafios.lista;
    const porMarca = lista.find((d) => d.marca)!;
    const o = opcoesDaRun(p, CP, 'desafio', 'bruxinha', porMarca);
    for (const t of o.tratos!) expect(tratos.tratos[t]!.marcas).toContain(porMarca.marca);
    const porCondicao = lista.find((d) => d.condicao)!;
    const oc = opcoesDaRun(p, CP, 'desafio', 'bruxinha', porCondicao);
    const run = new Run(C, 2, 'bruxinha', oc);
    run.novaRua();
    expect(run.estado.rotaAtual?.condicao).toBe(porCondicao.condicao);
    const v = registrarFim(p, resumo({ venceu: true }), CP, 'desafio', 'S100');
    expect(v.desafio).toBe(true);
    expect(registrarFim(p, resumo({ venceu: true }), CP, 'desafio', 'S100').desafio).toBe(false);
    expect(p.docesGuardados).toBe(2 * 50 + entreRuns.desafios.doces);
  });
});

function vazio(): ResumoDaRun['vistos'] {
  return {
    tratos: [],
    precos: [],
    conjuntos: [],
    inimigos: [],
    condicoes: [],
    encontros: [],
    evolucoes: [],
  };
}

function resumo(r: Partial<ResumoDaRun> = {}): ResumoDaRun {
  return {
    venceu: false,
    campeao: 'Bruxinha',
    campeaoId: 'bruxinha',
    onde: 'Rua 1',
    faltou: null,
    nivel: 3,
    evolucoes: [],
    tratos: [],
    conjuntos: [],
    precos: [],
    itens: [],
    medalhas: 0,
    ruasVencidas: 2,
    chefesVencidos: 0,
    derrotados: 40,
    docesGanhos: 500,
    relogio: '21:40',
    tempoS: 600,
    danoCausado: 9000,
    tratoIds: [],
    recusados: [],
    vistos: vazio(),
    xpTotal: 0,
    ofendido: null,
    lua: 0,
    moradora: null,
    docesGuardados: 50,
    ...r,
  };
}
