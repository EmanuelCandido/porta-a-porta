import { describe, expect, it } from 'vitest';
import { BotDeCombate, type RegrasDoBot } from '../../../src/bots/bot';
import { jogarRun, type ResultadoDaRun } from '../../../src/bots/jogarRun';
import { metricasDoPerfil, relatorio, valorDaMeta } from '../../../src/bots/relatorio';
import { bots, conteudo, tabelaDeEvolucoes } from '../../../src/sim/content';
import { passo } from '../../../src/sim/mundo';
import { Run, type ConteudoRun } from '../../../src/sim/run';
import { Minijogo, TIPOS_DE_MINIJOGO } from '../../../src/sim/minijogos';
import { exploracao } from '../../../src/sim/content';

const C = conteudo as ConteudoRun;
const regras: RegrasDoBot = {
  cfg: bots,
  combate: C.combate,
  evolucoes: tabelaDeEvolucoes,
  selvagens: new Set(['cao_de_guarda', 'corvo', 'gato_preto']),
  lanterna: { custo: 25, raio: 3, duracao: 2 },
};

describe('bots', () => {
  it('na Casa Desconfiada, cada perfil vence o minijogo na chance dele; 30% dos acertos são perfeitos', () => {
    for (const [id, perfil] of Object.entries(bots.perfis)) {
      const bot = new BotDeCombate(perfil, regras, 11);
      let vencidos = 0;
      let perfeitos = 0;
      const n = 400;
      for (let k = 0; k < n; k++) {
        const tipo = TIPOS_DE_MINIJOGO[k % TIPOS_DE_MINIJOGO.length]!;
        const mj = new Minijogo(tipo, exploracao.desconfiada.minijogos, k + 1, 1 / 60, {
          bairro: k % 3,
          fantasia: 'bruxinha',
          fantasias: ['bruxinha', 'fantasma', 'esqueleto', 'vampirinho'],
        });
        bot.jogarMinijogo(mj);
        expect(mj.terminou, id).toBe(true);
        if (mj.resultado !== 'erro') vencidos++;
        if (mj.resultado === 'perfeito') perfeitos++;
      }
      // 400 jogos: o acaso sozinho espalha uns 2 pontos para cada lado.
      expect(Math.abs(vencidos / n - perfil.acertoMinijogo), id).toBeLessThan(0.08);
      expect(perfeitos / Math.max(1, vencidos), id).toBeGreaterThan(0.18);
      expect(perfeitos / Math.max(1, vencidos), id).toBeLessThan(0.42);
    }
  });

  it('cada perfil do GDD tem reação e erro de mira crescentes do experiente ao iniciante', () => {
    const { iniciante, medio, experiente } = bots.perfis;
    expect(iniciante!.reacaoS).toBeGreaterThan(medio!.reacaoS);
    expect(medio!.reacaoS).toBeGreaterThan(experiente!.reacaoS);
    expect(iniciante!.erroMira).toBeGreaterThan(medio!.erroMira);
    expect(medio!.erroMira).toBeGreaterThan(experiente!.erroMira);
  });

  it('gasta os pontos pela ordem do perfil e escolhe a evolução no posto 3', () => {
    const run = new Run(C, 3);
    const bot = new BotDeCombate(bots.perfis['experiente']!, regras, 1);
    run.ficha.progresso.pontos = 6;
    bot.gastarPontos(run.ficha);
    const postos = (['Q', 'W', 'E'] as const).map((t) => run.ficha.lancador.slots[t]!.posto);
    // Ordem: Q, W, E, Q, Q, W...
    expect(postos).toEqual([3, 2, 1]);
    expect(run.ficha.lancador.slots['Q']!.evolucao).not.toBeNull();
    expect(run.ficha.progresso.pontos).toBe(0);
  });

  it('o bot experiente anda pela rota, luta e derruba o 1º Poste', () => {
    const run = new Run(C, 1000);
    const r = run.novaRua();
    const bot = new BotDeCombate(bots.perfis['experiente']!, regras, 7);
    bot.novoMapa();
    const m = {
      mundo: r.mundo,
      jogador: r.jogador,
      ficha: r.ficha,
      executor: r.executor,
      grade: r.campo.grade,
      luz: r.luz,
      regras: r.regras,
      portao: 0,
    };
    r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
    const inicio = { ...r.jogador.pos };
    for (let t = 0; t < 60 * 240 && r.regras.estado.postesCaidos < 1; t++) {
      bot.agir(m);
      passo(r.mundo);
      r.mundo.eventos = [];
    }
    expect(Math.hypot(r.jogador.pos.x - inicio.x, r.jogador.pos.y - inicio.y)).toBeGreaterThan(10);
    expect(r.regras.estado.derrotados).toBeGreaterThan(3);
    expect(r.regras.estado.postesCaidos).toBe(1);
    expect(bot.lancamentos).toBeGreaterThan(0);
  }, 120_000);

  it('desvia das Lágrimas da Viúva correndo para longe do centro de cada uma', () => {
    // Até a praça do bairro 2, sem lutar.
    const run = new Run(C, 1000);
    for (let b = 0; b <= 1; b++) {
      for (let k = 0; k < C.run.ruasPorBairro; k++) {
        run.novaRua();
        run.venceuRua();
        if (run.estado.fase === 'portaAPorta') {
          run.novaPorta();
          run.sairDaPorta();
        }
      }
      if (b === 0) {
        run.novaArena();
        run.venceuChefe();
      }
    }
    const r = run.novaArena();
    expect(r.regras.estado.chefe?.especie).toBe('viuva_do_mirante');
    // Imune: o dano ainda é contado (com valor 0), mas a luta não acaba.
    r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
    const bot = new BotDeCombate({ ...bots.perfis['experiente']!, chanceDesvio: 1 }, regras, 7);
    bot.novoMapa();
    const m = {
      mundo: r.mundo,
      jogador: r.jogador,
      ficha: r.ficha,
      executor: r.executor,
      grade: r.campo.grade,
      luz: r.luz,
      regras: r.regras,
      portao: 0,
    };
    let lagrimas = 0;
    let acertos = 0;
    for (let t = 0; t < 60 * 40; t++) {
      bot.agir(m);
      passo(r.mundo);
      for (const ev of r.mundo.eventos) {
        if (ev.tipo === 'anunciou' && ev.chave === 'lagrimas_viuva') lagrimas++;
        if (ev.tipo === 'dano' && ev.alvo === r.jogador.id && ev.fonte === 'lagrimas_viuva')
          acertos++;
      }
      r.mundo.eventos = [];
    }
    expect(lagrimas).toBeGreaterThan(20);
    expect(acertos).toBeLessThanOrEqual(2);
  }, 120_000);

  it('uma run de bot termina e conta cada mapa', () => {
    const r = jogarRun(1001, 'iniciante', { conteudo: C, bots, evolucoes: tabelaDeEvolucoes });
    expect(r.mapas.length).toBeGreaterThan(0);
    for (const m of r.mapas) {
      expect(m.tempoS).toBeGreaterThan(0);
      expect(m.venceu || m === r.mapas.at(-1)).toBe(true);
    }
    expect(r.venceu).toBe(r.mapas.every((m) => m.venceu));
  }, 120_000);
});

/** Uma run de mentira para conferir as contas do relatório. */
function runFalsa(venceu: boolean, extra: Partial<ResultadoDaRun> = {}): ResultadoDaRun {
  const mapa = {
    tipo: 'rua' as const,
    bairro: 0,
    rua: 0,
    venceu,
    esgotou: false,
    tempoS: 180,
    frenesis: 2,
    fracaoSusto50: 0.4,
    pedido: 'sem_lanterna',
    situacaoPedido: 'cumprido' as const,
    condicao: 'noite_comum',
    oferecidas: ['neblina', 'festa'],
    escolhida: venceu ? 'festa' : null,
    postesCaidos: 2,
    derrotados: 30,
    coragemMinima: 0.3,
    coragemDoChefe: null,
    danoPor: { pestinha_lencol: 50 },
    docesPorFonte: { inimigos: 180, campainha: 40, desconfiada: venceu ? 45 : 0 },
    minijogos: { jogados: 1, vencidos: venceu ? 1 : 0, perfeitos: 0 },
  };
  return {
    perfil: 'medio',
    campeao: 'bruxinha',
    semente: 1,
    venceu,
    bairrosVencidos: venceu ? 1 : 0,
    tempoS: 900,
    mapas: [mapa],
    tratos: venceu ? ['eco'] : [],
    evolucoes: [{ habilidade: 'bruxinha_q', opcao: venceu ? 0 : 1 }],
    conjuntosDe4: [],
    conjuntos: [],
    nivel: 5,
    faltou: null,
    ...extra,
  };
}

describe('relatório dos bots', () => {
  it('conta os doces por fonte e os minijogos da Casa Desconfiada', () => {
    const m = metricasDoPerfil('medio', [runFalsa(true), runFalsa(false)]);
    expect(m.docesPorFonte).toEqual({ inimigos: 360, campainha: 80, desconfiada: 45 });
    expect(m.minijogos).toEqual({ jogados: 2, vencidos: 1, perfeitos: 0 });
  });

  it('conta vitórias, durações, Frenesi, pedidos e escolhas', () => {
    const runs = [runFalsa(true), runFalsa(false), runFalsa(true), runFalsa(false)];
    const m = metricasDoPerfil('medio', runs);
    expect(m.vitorias).toBe(2);
    expect(m.duracaoRuaMin).toBeCloseTo(3);
    expect(m.frenesisPorRua).toBe(2);
    expect(m.pedidosCumpridos).toBe(1);
    expect(m.evolucoes['bruxinha_q']).toEqual([2, 2]);
    expect(m.condicoes['festa']).toEqual({ oferecida: 2, escolhida: 2 });
    const porPerfil = { medio: m };
    const meta = (metrica: (typeof bots.metas)[number]['metrica']) =>
      bots.metas.find(
        (x) => x.metrica === metrica && (x.perfil === 'medio' || x.perfil === 'todos'),
      )!;
    expect(valorDaMeta(meta('vitorias'), porPerfil)).toBe(0.5);
    expect(valorDaMeta(meta('evolucaoMenosEscolhida'), porPerfil)).toBe(0.5);
  });

  it('separa as vitórias por campeão e mede a diferença entre eles', () => {
    const runs = [
      runFalsa(true),
      runFalsa(false),
      runFalsa(true, { campeao: 'esqueleto' }),
      runFalsa(true, { campeao: 'esqueleto' }),
    ];
    const m = metricasDoPerfil('medio', runs);
    expect(m.porCampeao['bruxinha']).toMatchObject({ runs: 2, vitorias: 1 });
    expect(m.porCampeao['esqueleto']).toMatchObject({ runs: 2, vitorias: 2 });
    const meta = (metrica: (typeof bots.metas)[number]['metrica']) =>
      bots.metas.find((x) => x.metrica === metrica)!;
    expect(valorDaMeta({ ...meta('diferencaEntreCampeoes'), perfil: 'medio' }, { medio: m })).toBe(
      0.5,
    );
    expect(valorDaMeta({ ...meta('campeaoQueMenosVence'), perfil: 'medio' }, { medio: m })).toBe(
      0.5,
    );
    const md = relatorio({ medio: runs }, bots, '14/10/2026');
    expect(md).toContain('## Por campeão');
    expect(md).toContain('| esqueleto | Médio | 2 | 100% |');
  });

  it('conta quem passou de cada bairro e resume as lutas contra cada chefe', () => {
    const rua = runFalsa(true).mapas[0]!;
    const chefe = (bairro: number, venceu: boolean, sobrou: number) => ({
      ...rua,
      tipo: 'chefe' as const,
      bairro,
      venceu,
      tempoS: 240,
      coragemDoChefe: sobrou,
    });
    const runs = [
      runFalsa(false, {
        bairrosVencidos: 1,
        mapas: [rua, chefe(0, true, 0), chefe(1, false, 0.4)],
      }),
      runFalsa(true, {
        bairrosVencidos: 3,
        mapas: [chefe(0, true, 0), chefe(1, true, 0), chefe(2, true, 0)],
      }),
      runFalsa(false, { bairrosVencidos: 0, mapas: [chefe(0, false, 0.2)] }),
    ];
    const m = metricasDoPerfil('experiente', runs);
    expect(m.passouDoBairro).toEqual([2, 1, 1]);
    expect(m.chefes[1]).toEqual({
      tentativas: 3,
      vitorias: 2,
      duracaoMin: 4,
      sobrouNasDerrotas: 0.2,
    });
    expect(m.chefes[2]).toMatchObject({ tentativas: 2, vitorias: 1, sobrouNasDerrotas: 0.4 });
    const doBairro1 = bots.metas.find((x) => x.id === 'campeaoQueMenosVence')!;
    const daRun = bots.metas.find((x) => x.id === 'campeaoQueMenosVenceARun')!;
    expect(doBairro1.bairro).toBe(1);
    expect(valorDaMeta(doBairro1, { experiente: m })).toBeCloseTo(2 / 3);
    expect(valorDaMeta(daRun, { experiente: m })).toBeCloseTo(1 / 3);
    const md = relatorio({ experiente: runs }, bots, '15/10/2026');
    expect(md).toContain('## Chefes');
    expect(md).toContain('| Bairro 2 | Experiente | 2 | 50% | 4,0 | 40% |');
    // Os fins seguem a ordem da run: o chefe 1 antes da vitória.
    expect(md).toMatch(/\| Perfil \| chefe 1 \| chefe 2 \| vitória \|/);
  });

  it('o Markdown traz o resumo, as metas e as tabelas', () => {
    const md = relatorio({ medio: [runFalsa(true), runFalsa(false)] }, bots, '14/10/2026');
    expect(md).toContain('# Relatório de balanceamento dos bots');
    expect(md).toContain('| Médio | 2 | 50% |');
    expect(md).toContain('## Metas');
    expect(md).toContain('pestinha_lencol');
  });
});
