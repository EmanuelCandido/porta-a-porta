import { describe, expect, it } from 'vitest';
import { alvosDeGolpe, causarDano } from '../../../src/sim/combate';
import {
  combate,
  conteudo,
  exploracao,
  gerador,
  luz as cfgLuz,
  modelos,
} from '../../../src/sim/content';
import type { Rua } from '../../../src/sim/content/esquemas';
import { gerarRua } from '../../../src/sim/gerador';
import { posicionador, transformarRetangulo } from '../../../src/sim/geometria';
import { adicionarObstaculo, enfileirar, forcarMovimento } from '../../../src/sim/mundo';
import { criarFicha } from '../../../src/sim/partida';
import { criarQuebraveis, quebrar } from '../../../src/sim/quebraveis';
import type { Bolso } from '../../../src/sim/regrasDaRua';
import { montarRua } from '../../../src/sim/ruaDeLuta';
import { novoSusto } from '../../../src/sim/susto';
import { cena, eventos, rodar } from './ajuda';

const cfg = exploracao.quebraveis;

/** Uma lixeira logo à direita do jogador (o `cena` dos testes tem só o jogador). */
function comLixeira(campeao = 'fantasma') {
  const c = cena([], { autoAtaque: true, manual: true, campeao });
  const lixeira = {
    modelo: 'lixeira' as const,
    x: c.heroi.pos.x + 0.4,
    y: c.heroi.pos.y - 0.5,
    rot: 0 as const,
  };
  const rua = { objetos: [lixeira] } as unknown as Rua;
  const { pegada, colisao } = modelos.lixeira;
  const { ponto } = posicionador(pegada.largura, pegada.profundidade, lixeira.x, lixeira.y, 0);
  for (const r of colisao) adicionarObstaculo(c.mundo, transformarRetangulo(r, ponto));
  const [obj] = criarQuebraveis(c.mundo, rua, modelos, cfg, combate);
  return { c, rua, obj: obj! };
}

describe('objetos quebráveis', () => {
  it('cada lixeira vira um alvo neutro com a Coragem da tabela', () => {
    const { obj } = comLixeira();
    expect(obj.tipo).toBe('neutro');
    expect(obj.combate!.coragem).toBe(cfg.modelos['lixeira']!.coragem);
    expect(obj.marcas?.material).toBe('metal');
  });

  it('o golpe do jogador acerta o objeto, mas não conta como acerto em inimigo', () => {
    const { c, obj } = comLixeira();
    enfileirar(c.mundo, { tipo: 'golpear', id: c.heroi.id, x: 1, y: 0 });
    rodar(c.mundo, 0.05);
    expect(obj.combate!.coragem).toBeLessThan(cfg.modelos['lixeira']!.coragem);
    expect(eventos(c.mundo, 'objetoAtingido')).toHaveLength(1);
    expect(eventos(c.mundo, 'acertoAuto')).toHaveLength(0);
    expect(eventos(c.mundo, 'golpeou')[0]!.acertos).toBe(0);
    const dano = eventos(c.mundo, 'dano')[0]!;
    expect(dano.objeto).toBe(true);
  });

  it('a estrela da Bruxinha também quebra (para no objeto, como numa cobertura)', () => {
    const { c, obj } = comLixeira('bruxinha');
    enfileirar(c.mundo, { tipo: 'golpear', id: c.heroi.id, x: 0.4, y: 0 });
    rodar(c.mundo, 0.6);
    expect(obj.combate!.coragem).toBeLessThan(cfg.modelos['lixeira']!.coragem);
    expect(eventos(c.mundo, 'objetoAtingido').length).toBeGreaterThanOrEqual(1);
  });

  it('os inimigos não miram nem acertam objetos, e nada empurra um objeto', () => {
    const { c, obj } = comLixeira();
    expect(alvosDeGolpe(c.mundo, 'inimigo')).not.toContain(obj);
    expect(alvosDeGolpe(c.mundo, 'jogador')).toContain(obj);
    const antes = { ...obj.pos };
    expect(forcarMovimento(obj, { x: 1, y: 0 }, 2, 10, false)).toBeNull();
    rodar(c.mundo, 0.3);
    expect(obj.pos).toEqual(antes);
  });

  it('quebrado: libera o lugar, solta doces na faixa da tabela e sai do mundo', () => {
    const { c, rua, obj } = comLixeira();
    const obstaculos = c.mundo.obstaculos.length;
    const doces: number[] = [];
    causarDano(c.mundo, obj, { origem: c.heroi.id, bruto: 1e6, tipo: 'autoAtaque' });
    quebrar(
      c.mundo,
      obj,
      rua,
      modelos,
      { ...cfg, chanceSurpresa: 0, chanceItem: 0 },
      {
        soltarDoces: (_m, _p, base) => doces.push(base),
        darConsumivel: () => true,
        nascerPestinha: () => 0,
        itens: [],
      },
    );
    expect(c.mundo.obstaculos.length).toBe(obstaculos - modelos.lixeira.colisao.length);
    const [min, max] = cfg.modelos['lixeira']!.doces;
    expect(doces).toHaveLength(1);
    expect(doces[0]).toBeGreaterThanOrEqual(min);
    expect(doces[0]).toBeLessThanOrEqual(max);
    expect(eventos(c.mundo, 'quebrou')[0]).toMatchObject({ objeto: 0, material: 'metal' });
    expect(c.mundo.entidades).not.toContain(obj);
  });

  it('às vezes sai uma pestinha escondida ou um consumível', () => {
    const { c, rua, obj } = comLixeira();
    const nasceu: number[] = [];
    quebrar(
      c.mundo,
      obj,
      rua,
      modelos,
      { ...cfg, chanceSurpresa: 1, chanceItem: 0 },
      {
        soltarDoces: () => undefined,
        darConsumivel: () => true,
        nascerPestinha: () => nasceu.push(1),
        itens: ['x'],
      },
    );
    expect(nasceu).toHaveLength(1);
  });
});

describe('tabela dos quebráveis', () => {
  it('o corpo de cada objeto cobre a colisão dele (o projétil acerta antes de bater na parede)', () => {
    for (const [nome, def] of Object.entries(cfg.modelos)) {
      const m = modelos[nome as keyof typeof modelos];
      expect(m, nome).toBeDefined();
      const { pegada } = m;
      for (const r of m.colisao) {
        const meio = { x: pegada.largura / 2, y: pegada.profundidade / 2 };
        const longe = Math.max(
          ...[
            [r.x0, r.y0],
            [r.x1, r.y0],
            [r.x0, r.y1],
            [r.x1, r.y1],
          ].map(([x, y]) => Math.max(Math.abs(x! - meio.x), Math.abs(y! - meio.y))),
        );
        expect(def.raio, nome).toBeGreaterThanOrEqual(longe);
      }
    }
  });
});

describe('quebráveis numa rua gerada', () => {
  it('a rua tem objetos para quebrar, e quebrar dá doces ao bolso', () => {
    const g = gerarRua(3, gerador, modelos, cfgLuz, { bairro: 0 });
    const bolso: Bolso = { doces: 0, consumiveis: [], susto: novoSusto() };
    const r = montarRua(g, criarFicha('bruxinha', conteudo), conteudo, 3, bolso, { bairro: 0 });
    const objs = r.mundo.entidades.filter((e) => e.marcas?.quebravel);
    expect(objs.length).toBeGreaterThan(10);
    const alvo = objs.find((e) => e.especie === 'lixeira') ?? objs[0]!;
    // Fora da colisão do objeto, de frente para ele.
    r.jogador.pos = { x: alvo.pos.x - alvo.raio - 0.7, y: alvo.pos.y };
    r.jogador.posAnterior = { ...r.jogador.pos };
    r.jogador.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
    // Quase quebrado: o golpe do jogador (dentro de um tick) termina o serviço.
    alvo.combate!.coragem = 0.01;
    enfileirar(r.mundo, { tipo: 'golpear', id: r.jogador.id, x: 1, y: 0 });
    rodar(r.mundo, 2);
    expect(r.mundo.entidades).not.toContain(alvo);
    expect(eventos(r.mundo, 'quebrou').length).toBeGreaterThanOrEqual(0);
    // Os doces caem ao lado e vêm até o jogador.
    const [min] = cfg.modelos[alvo.especie]!.doces;
    expect(bolso.doces).toBeGreaterThanOrEqual(min);
  });
});
