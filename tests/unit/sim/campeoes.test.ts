import { describe, expect, it } from 'vitest';
import { aplicarEstado, causarDano, temEstado, vivo } from '../../../src/sim/combate';
import { campeoes, combate, conteudo, tabelaDeEvolucoes } from '../../../src/sim/content';
import { escolherEvolucao } from '../../../src/sim/evolucoes';
import { MapaDeLuz } from '../../../src/sim/luz';
import { enfileirar, passo, type Entidade } from '../../../src/sim/mundo';
import { criarSistemaPassivas } from '../../../src/sim/passivas';
import { Run, type ConteudoRun } from '../../../src/sim/run';
import { boneco, cena, eventos, habilidadeDe, lancar, perdida, rodar, type Cena } from './ajuda';

const niveis = combate.niveis;

/** Campo com o campeão no posto pedido, as passivas ligadas e a evolução escolhida. */
function campo(
  campeao: string,
  opcoes: {
    posto?: number;
    evolucao?: [string, string];
    obstaculos?: { x0: number; y0: number; x1: number; y1: number }[];
  } = {},
): Cena {
  const c = cena(opcoes.obstaculos ?? [], {
    campeao,
    posto: opcoes.posto ?? niveis.postoDaEvolucao,
    extras: [criarSistemaPassivas()],
    autoAtaque: true,
  });
  // Como na montagem de um mapa: empurrado contra a parede, fica atordoado (Atropelo).
  c.mundo.aoBaterNaParede = (e, s) =>
    aplicarEstado(e, { tipo: 'atordoado', restante: s }, combate.estados);
  if (opcoes.evolucao) {
    const [tecla, id] = opcoes.evolucao;
    const ficha = { lancador: c.heroi.lancador!, despertares: true };
    expect(escolherEvolucao(ficha, tecla, id, tabelaDeEvolucoes, niveis)).toBe(true);
  }
  return c;
}

/** Um mapa de luz com um poste em `p` (o resto é sombra). */
function luzEm(c: Cena, p: { x: number; y: number }, raio = 3): MapaDeLuz {
  const luz = new MapaDeLuz();
  luz.adicionar({ tipo: 'poste', x: p.x, y: p.y, raio, cura: false });
  c.mundo.luz = luz;
  return luz;
}

const estados = (e: Entidade) => e.combate!.estados.map((s) => s.tipo);
const pestinha = (c: Cena, pos: { x: number; y: number }) => {
  const b = boneco(c, pos);
  b.especie = 'pestinha_lencol';
  return b;
};
const golpe = (
  c: Cena,
  alvo: Entidade,
  bruto: number,
  tipo: 'habilidade' | 'autoAtaque' = 'habilidade',
) => causarDano(c.mundo, alvo, { origem: c.heroi.id, bruto, tipo, podeCritar: true });

describe('os campeões do GDD', () => {
  it('Fantasma, Esqueleto e Vampirinho têm Coragem, auto-ataque corpo a corpo e passiva', () => {
    // Os números exatos são calibrados pelos bots (docs/CONTENT.md); o papel fica: o tanque tem a
    // maior Coragem e o assassino, a menor entre os de corpo a corpo.
    const coragem = (id: string) => campeoes[id]!.coragem;
    for (const id of Object.keys(campeoes))
      if (id !== 'esqueleto') expect(coragem('esqueleto')).toBeGreaterThan(coragem(id));
    expect(coragem('fantasma')).toBeLessThan(coragem('vampirinho'));
    for (const id of ['fantasma', 'esqueleto', 'vampirinho']) {
      const c = campeoes[id]!;
      expect(c.autoAtaque.alcance).toBe(1.5);
      expect(c.autoAtaque.projetil).toBeNull();
      for (const t of ['Q', 'W', 'E', 'R'] as const) {
        expect(tabelaDeEvolucoes.get(c.habilidades[t])).toHaveLength(2);
      }
    }
    expect(campeoes['fantasma']!.passiva.tipo).toBe('arrepio');
    expect(campeoes['esqueleto']!.passiva.tipo).toBe('remontar');
    expect(campeoes['vampirinho']!.passiva.tipo).toBe('sede');
  });
});

describe('Fantasma', () => {
  it('Q Arranhão Gélido: corte de 4 tiles que atravessa todos', () => {
    const c = campo('fantasma', { posto: 1 });
    const perto = [6.5, 7.5, 8.5].map((x) => boneco(c, { x, y: 15 }));
    const longe = boneco(c, { x: 11, y: 15 });
    lancar(c, 'Q', { x: 12, y: 15 });
    rodar(c.mundo, 0.5);
    for (const b of perto) expect(perdida(b)).toBeGreaterThan(0);
    expect(perdida(longe)).toBe(0);
  });

  it('W Atravessar: passa através de uma casa', () => {
    const casa = { x0: 6, y0: 13, x1: 7, y1: 17 };
    const c = campo('fantasma', { posto: 1, obstaculos: [casa] });
    lancar(c, 'W', { x: 9, y: 15 });
    rodar(c.mundo, 0.6);
    expect(c.heroi.pos.x).toBeGreaterThan(7.4);
  });

  it('E Lençol: 3 s invisível na sombra, 1,5 s na luz, 30% de velocidade; golpear revela', () => {
    const sombra = campo('fantasma', { posto: 1 });
    rodar(sombra.mundo, 0.1);
    const v0 = sombra.heroi.combate!.attr.velocidade;
    lancar(sombra, 'E', { x: 5, y: 15 });
    rodar(sombra.mundo, 2.5);
    expect(temEstado(sombra.heroi.combate, 'invisivel')).toBe(true);
    expect(sombra.heroi.combate!.attr.velocidade).toBeCloseTo(v0 * 1.3, 6);
    rodar(sombra.mundo, 0.6);
    expect(temEstado(sombra.heroi.combate, 'invisivel')).toBe(false);

    const luz = campo('fantasma', { posto: 1 });
    luzEm(luz, luz.heroi.pos);
    lancar(luz, 'E', { x: 5, y: 15 });
    rodar(luz.mundo, 1.4);
    expect(temEstado(luz.heroi.combate, 'invisivel')).toBe(true);
    rodar(luz.mundo, 0.2);
    expect(temEstado(luz.heroi.combate, 'invisivel')).toBe(false);

    // Golpear não revela: o Lençol acaba pelo tempo.
    const golpeia = campo('fantasma', { posto: 1 });
    const b = boneco(golpeia, { x: 8, y: 15 });
    lancar(golpeia, 'E', { x: 5, y: 15 });
    rodar(golpeia.mundo, 0.2);
    golpe(golpeia, b, 10);
    expect(temEstado(golpeia.heroi.combate, 'invisivel')).toBe(true);
  });

  it('R Assombração: aparece atrás do alvo depois de 1 s, dobra abaixo de 30% e reinicia se derrubar', () => {
    const c = campo('fantasma', { posto: 1 });
    const alvo = boneco(c, { x: 9, y: 15 }, 0, 1e5);
    lancar(c, 'R', { x: 9, y: 15 });
    rodar(c.mundo, 0.9);
    expect(perdida(alvo)).toBe(0);
    rodar(c.mundo, 0.3);
    expect(c.heroi.pos.x).toBeGreaterThan(9);
    const cheio = perdida(alvo);
    expect(cheio).toBeGreaterThan(0);

    const fraco = campo('fantasma', { posto: 1 });
    const quase = boneco(fraco, { x: 9, y: 15 }, 0, 1e5);
    quase.combate!.coragem = 0.2 * quase.combate!.attr.coragemMax;
    const antes = quase.combate!.coragem;
    lancar(fraco, 'R', { x: 9, y: 15 });
    rodar(fraco.mundo, 1.2);
    // Dobra (o arredondamento do dano tira um pouco da conta exata).
    const razao = (antes - quase.combate!.coragem) / cheio;
    expect(razao).toBeGreaterThan(1.85);
    expect(razao).toBeLessThan(2.15);

    const abate = campo('fantasma', { posto: 1 });
    boneco(abate, { x: 9, y: 15 }, 0, 50);
    lancar(abate, 'R', { x: 9, y: 15 });
    rodar(abate.mundo, 1.2);
    expect(abate.heroi.lancador!.slots['R']!.recarga).toBe(0);
  });

  it('Arrepio: depois de 1 s na sombra, o próximo golpe é crítico e assusta as pestinhas', () => {
    const c = campo('fantasma', { posto: 1 });
    c.heroi.ataque = undefined;
    const alvo = boneco(c, { x: 7, y: 15 }, 0, 1e5);
    const vizinha = pestinha(c, { x: 7.5, y: 16 });
    rodar(c.mundo, 1.1);
    expect(estados(c.heroi)).toContain('preparado');
    golpe(c, alvo, 10);
    const ev = eventos(c.mundo, 'dano').filter((d) => d.alvo === alvo.id);
    expect(ev.at(-1)!.critico).toBe(true);
    expect(estados(vizinha)).toContain('medo');
    expect(estados(c.heroi)).not.toContain('preparado');
    // Na luz não carrega.
    const luz = campo('fantasma', { posto: 1 });
    luzEm(luz, luz.heroi.pos);
    rodar(luz.mundo, 2);
    expect(estados(luz.heroi)).not.toContain('preparado');
  });
});

describe('evoluções do Fantasma', () => {
  it('Corte Duplo: a Q sai de novo em até 2 s, com 50% do dano', () => {
    const c = campo('fantasma', { evolucao: ['Q', 'corte_duplo'] });
    const b = boneco(c, { x: 7, y: 15 }, 0, 1e5);
    lancar(c, 'Q', { x: 10, y: 15 });
    rodar(c.mundo, 0.5);
    const primeiro = perdida(b);
    lancar(c, 'Q', { x: 10, y: 15 });
    rodar(c.mundo, 0.5);
    expect((perdida(b) - primeiro) / primeiro).toBeCloseTo(0.5, 2);
  });

  it('Gelo: o corte deixa lento', () => {
    const c = campo('fantasma', { evolucao: ['Q', 'gelo'] });
    const b = boneco(c, { x: 7, y: 15 });
    lancar(c, 'Q', { x: 10, y: 15 });
    rodar(c.mundo, 0.5);
    expect(estados(b)).toContain('lentidao');
  });

  it('Passagem Fria: quem está no caminho do W fica com Medo; Duas Paredes: 2 cargas', () => {
    const c = campo('fantasma', { evolucao: ['W', 'passagem_fria'] });
    const b = boneco(c, { x: 6.5, y: 15 });
    lancar(c, 'W', { x: 10, y: 15 });
    rodar(c.mundo, 0.3);
    expect(estados(b)).toContain('medo');

    const d = campo('fantasma', { evolucao: ['W', 'duas_paredes'] });
    lancar(d, 'W', { x: 10, y: 15 });
    rodar(d.mundo, 0.4);
    lancar(d, 'W', { x: 2, y: 15 });
    rodar(d.mundo, 0.4);
    expect(d.heroi.lancador!.lancadas).toBe(2);
  });

  it('Lençol Longo: dura mais e se renova ao derrubar alguém', () => {
    const c = campo('fantasma', { evolucao: ['E', 'lencol_longo'] });
    const fraco = boneco(c, { x: 7, y: 15 }, 0, 5);
    lancar(c, 'E', { x: 5, y: 15 });
    rodar(c.mundo, 4);
    golpe(c, fraco, 100);
    expect(vivo(fraco)).toBe(false);
    rodar(c.mundo, 3);
    expect(temEstado(c.heroi.combate, 'invisivel')).toBe(true);
  });

  it('Lençol Vazio: o primeiro golpe depois de sair da invisibilidade causa 80% a mais', () => {
    const c = campo('fantasma', { evolucao: ['E', 'lencol_vazio'] });
    luzEm(c, { x: 5, y: 15 }, 30);
    const b = boneco(c, { x: 7, y: 15 }, 0, 1e5);
    c.heroi.ataque = undefined;
    lancar(c, 'E', { x: 5, y: 15 });
    rodar(c.mundo, 0.2);
    // Ainda invisível: golpe normal.
    golpe(c, b, 100);
    const normal = perdida(b);
    rodar(c.mundo, 1.5);
    expect(temEstado(c.heroi.combate, 'invisivel')).toBe(false);
    // O Arrepio carregou na invisibilidade: o golpe leva os dois (crítico × 1,8).
    golpe(c, b, 100);
    const critico = combate.danoCritico;
    expect((perdida(b) - normal) / normal).toBeCloseTo(1.8 * critico, 2);
    golpe(c, b, 100);
    expect((perdida(b) - normal) / normal).toBeCloseTo(1.8 * critico + 1, 2);
  });

  it('Corrente de Almas salta para o mais fraco; Pesadelo dá Medo antes do golpe', () => {
    const c = campo('fantasma', { evolucao: ['R', 'corrente_de_almas'] });
    boneco(c, { x: 9, y: 15 }, 0, 50);
    const proximo = boneco(c, { x: 11, y: 15 }, 0, 1e5);
    lancar(c, 'R', { x: 9, y: 15 });
    rodar(c.mundo, 2.5);
    expect(perdida(proximo)).toBeGreaterThan(0);

    const p = campo('fantasma', { evolucao: ['R', 'pesadelo'] });
    const alvo = boneco(p, { x: 9, y: 15 }, 0, 1e5);
    lancar(p, 'R', { x: 9, y: 15 });
    rodar(p.mundo, 0.1);
    expect(estados(alvo)).toContain('medo');
  });
});

describe('Esqueleto', () => {
  it('Q Soco de Osso: cone curto que atordoa', () => {
    const c = campo('esqueleto', { posto: 1 });
    const perto = boneco(c, { x: 6.5, y: 15 });
    const longe = boneco(c, { x: 8.5, y: 15 });
    lancar(c, 'Q', { x: 9, y: 15 });
    rodar(c.mundo, 0.3);
    expect(estados(perto)).toContain('atordoado');
    expect(perdida(longe)).toBe(0);
  });

  it('W Escudo de Costelas: se não quebrar, devolve metade do que sobrou', () => {
    const c = campo('esqueleto', { posto: 1 });
    const j = c.heroi;
    j.combate!.coragem = 50;
    lancar(c, 'W', { x: 5, y: 15 });
    passo(c.mundo);
    const escudo = j.combate!.estados.find((s) => s.tipo === 'escudo');
    expect(escudo).toBeDefined();
    const valor = escudo && escudo.tipo === 'escudo' ? escudo.valor : 0;
    rodar(c.mundo, 4.1);
    expect(j.combate!.coragem - 50).toBeCloseTo(valor * 0.5, 0);
  });

  it('E Investida: corre 5 tiles, machuca e empurra para o lado', () => {
    const c = campo('esqueleto', { posto: 1 });
    const b = boneco(c, { x: 7, y: 15.2 }, 0);
    lancar(c, 'E', { x: 12, y: 15 });
    rodar(c.mundo, 0.6);
    expect(c.heroi.pos.x).toBeGreaterThan(9.5);
    expect(perdida(b)).toBeGreaterThan(0);
    expect(Math.abs(b.pos.y - 15)).toBeGreaterThan(0.6);
  });

  it('R Ossuário: prende e provoca quem está dentro, dá Resistência e machuca ao fechar', () => {
    const c = campo('esqueleto', { posto: 1 });
    const b = boneco(c, { x: 7, y: 15 }, 2);
    const r0 = c.heroi.combate!.attr.resistencia;
    lancar(c, 'R', { x: 5, y: 15 });
    rodar(c.mundo, 0.6);
    expect(estados(b)).toContain('provocado');
    expect(c.heroi.combate!.attr.resistencia).toBeCloseTo(r0 + 40, 6);
    b.pos = { x: 9.5, y: 15 };
    rodar(c.mundo, 0.1);
    expect(Math.hypot(b.pos.x - 5, b.pos.y - 15)).toBeLessThanOrEqual(3);
    const antes = perdida(b);
    rodar(c.mundo, 2.5);
    expect(eventos(c.mundo, 'pulso').some((p) => p.final)).toBe(true);
    expect(perdida(b)).toBeGreaterThan(antes);
  });

  it('Remontar: na primeira queda do bairro desmonta 2 s e volta com 30%; na segunda, cai', () => {
    const c = campo('esqueleto', { posto: 1 });
    const j = c.heroi;
    golpe(c, j, 1e6);
    expect(j.marcas?.remontando).toBe(true);
    expect(vivo(j)).toBe(false);
    rodar(c.mundo, 2.1);
    expect(vivo(j)).toBe(true);
    expect(j.combate!.coragem).toBeCloseTo(0.3 * j.combate!.attr.coragemMax, 3);
    golpe(c, j, 1e6);
    rodar(c.mundo, 3);
    expect(vivo(j)).toBe(false);
    expect(j.marcas?.remontando).toBe(false);
  });

  it('o Remontar volta a valer no bairro seguinte', () => {
    const run = new Run(conteudo as ConteudoRun, 1, 'esqueleto');
    run.ficha.combate.remontar!.usado = true;
    run.estado.ruaNoBairro = run.conteudo.run.ruasPorBairro;
    run.estado.fase = 'chefe';
    run.venceuChefe();
    expect(run.ficha.combate.remontar!.usado).toBe(false);
  });
});

describe('evoluções do Esqueleto', () => {
  it('Osso Quebrado dobra o cone; Fratura deixa o alvo frágil', () => {
    const c = campo('esqueleto', { evolucao: ['Q', 'osso_quebrado'] });
    const longe = boneco(c, { x: 8.5, y: 15 });
    lancar(c, 'Q', { x: 9, y: 15 });
    rodar(c.mundo, 0.3);
    expect(perdida(longe)).toBeGreaterThan(0);

    const f = campo('esqueleto', { evolucao: ['Q', 'fratura'] });
    const b = boneco(f, { x: 6.5, y: 15 });
    lancar(f, 'Q', { x: 9, y: 15 });
    rodar(f.mundo, 0.3);
    expect(estados(b)).toContain('fragil');
  });

  it('Espinhos devolvem 30% do dano absorvido; Escudo Duplo tem 2 cargas de 60%', () => {
    const c = campo('esqueleto', { evolucao: ['W', 'espinhos'] });
    const bate = boneco(c, { x: 7, y: 15 });
    lancar(c, 'W', { x: 5, y: 15 });
    passo(c.mundo);
    causarDano(c.mundo, c.heroi, { origem: bate.id, bruto: 100, tipo: 'ataque', verdadeiro: true });
    expect(perdida(bate)).toBeCloseTo(30, 3);

    const d = campo('esqueleto', { evolucao: ['W', 'escudo_duplo'] });
    const simples = campo('esqueleto');
    lancar(d, 'W', { x: 5, y: 15 });
    lancar(simples, 'W', { x: 5, y: 15 });
    passo(d.mundo);
    passo(simples.mundo);
    const valor = (x: Cena) =>
      x.heroi.combate!.estados.reduce((s, e) => (e.tipo === 'escudo' ? s + e.valor : s), 0);
    expect(valor(d) / valor(simples)).toBeCloseTo(0.6, 3);
    expect(d.heroi.lancador!.slots['W']!.cargas).toBe(1);
  });

  it('Atropelo atordoa quem bate na casa; Retorno volta ao ponto de partida', () => {
    const casa = { x0: 6.5, y0: 15.8, x1: 8, y1: 17 };
    const c = campo('esqueleto', { evolucao: ['E', 'atropelo'], obstaculos: [casa] });
    const b = boneco(c, { x: 7, y: 15.3 }, 0);
    lancar(c, 'E', { x: 12, y: 15 });
    rodar(c.mundo, 0.5);
    expect(estados(b)).toContain('atordoado');

    const r = campo('esqueleto', { evolucao: ['E', 'retorno'] });
    lancar(r, 'E', { x: 12, y: 15 });
    rodar(r.mundo, 0.6);
    expect(r.heroi.pos.x).toBeGreaterThan(9.5);
    lancar(r, 'E', { x: 0, y: 0 });
    rodar(r.mundo, 0.6);
    expect(r.heroi.pos.x).toBeCloseTo(5, 0);
  });

  it('Cemitério cura dentro do anel por 4 s; Desabamento soma 15% da Coragem máxima', () => {
    const c = campo('esqueleto', { evolucao: ['R', 'cemiterio'] });
    c.heroi.combate!.coragem = 50;
    lancar(c, 'R', { x: 5, y: 15 });
    rodar(c.mundo, 4.5);
    expect(c.heroi.combate!.coragem).toBeGreaterThan(
      50 + 0.03 * 3 * c.heroi.combate!.attr.coragemMax,
    );

    const dano = (evo: string | null) => {
      const x = campo('esqueleto', evo ? { evolucao: ['R', evo] } : {});
      const b = boneco(x, { x: 6, y: 15 }, 0, 1e5);
      lancar(x, 'R', { x: 5, y: 15 });
      rodar(x.mundo, 3.5);
      return { perdida: perdida(b), max: x.heroi.combate!.attr.coragemMax };
    };
    const sem = dano(null);
    const com = dano('desabamento');
    // 15% da Coragem máxima a mais, antes da Resistência 10 do boneco.
    expect(com.perdida - sem.perdida).toBeCloseTo((0.15 * com.max * 100) / 110, 0);
  });
});

describe('Vampirinho', () => {
  it('Q Mordida: salta até o alvo e cura metade do dano', () => {
    const c = campo('vampirinho', { posto: 1 });
    c.heroi.ataque = undefined;
    const b = boneco(c, { x: 7.5, y: 15 }, 0, 1e5);
    c.heroi.combate!.coragem = 50;
    lancar(c, 'Q', { x: 7.5, y: 15 });
    rodar(c.mundo, 0.4);
    expect(c.heroi.pos.x).toBeGreaterThan(6.4);
    const curas = eventos(c.mundo, 'cura').filter((x) => x.origem === 'Q');
    expect(curas[0]!.valor).toBeCloseTo(perdida(b) * 0.5, 3);
  });

  it('W Capa de Morcego: 3 tiles sem levar dano', () => {
    const c = campo('vampirinho', { posto: 1 });
    lancar(c, 'W', { x: 10, y: 15 });
    rodar(c.mundo, 0.2);
    golpe(c, c.heroi, 50);
    expect(c.heroi.combate!.coragem).toBe(c.heroi.combate!.attr.coragemMax);
    rodar(c.mundo, 0.5);
    expect(c.heroi.pos.x).toBeCloseTo(8, 1);
  });

  it('E Névoa: vira sombra e dentro dela o Vampirinho recebe 30% menos dano', () => {
    const c = campo('vampirinho', { posto: 1 });
    const luz = luzEm(c, c.heroi.pos, 6);
    lancar(c, 'E', { x: 5, y: 15 });
    rodar(c.mundo, 0.6);
    expect(luz.iluminado(c.heroi.pos)).toBe(false);
    expect(c.heroi.combate!.attr.danoRecebido).toBeCloseTo(0.7, 6);
  });

  it('R Banquete: 100% de roubo de vida e 5% de velocidade por golpe, até 30%', () => {
    const c = campo('vampirinho', { posto: 1 });
    luzEm(c, c.heroi.pos, 30);
    // Velocidade sem bônus nenhum (em combate não vale o bônus de fora de combate).
    const v0 = c.heroi.combate!.base.velocidade;
    const b = boneco(c, { x: 7, y: 15 }, 0, 1e5);
    lancar(c, 'R', { x: 5, y: 15 });
    rodar(c.mundo, 0.1);
    for (let k = 0; k < 8; k++) golpe(c, b, 10, 'autoAtaque');
    rodar(c.mundo, 0.1);
    expect(c.heroi.combate!.attr.rouboVida).toBeCloseTo(1, 6);
    expect(c.heroi.combate!.attr.velocidade / v0).toBeCloseTo(1.3, 3);
    rodar(c.mundo, 6.5);
    expect(c.heroi.combate!.attr.rouboVida).toBeCloseTo(0.1, 6);
  });

  it('Sede: roubo de vida na luz e um roubo maior na sombra', () => {
    const sede = campeoes['vampirinho']!.passiva as {
      rouboVida: number;
      rouboVidaNaSombra: number;
    };
    expect(sede.rouboVidaNaSombra).toBeGreaterThan(sede.rouboVida);
    const c = campo('vampirinho', { posto: 1 });
    const luz = luzEm(c, { x: 5, y: 15 });
    rodar(c.mundo, 0.1);
    expect(c.heroi.combate!.attr.rouboVida).toBeCloseTo(sede.rouboVida, 6);
    enfileirar(c.mundo, { tipo: 'moverPara', id: c.heroi.id, x: 15, y: 15 });
    rodar(c.mundo, 4);
    expect(luz.iluminado(c.heroi.pos)).toBe(false);
    expect(c.heroi.combate!.attr.rouboVida).toBeCloseTo(sede.rouboVidaNaSombra, 6);
  });
});

describe('evoluções do Vampirinho', () => {
  it('Mordida Dupla morde 2 vezes com 60%; Sangria sangra 50% do golpe', () => {
    const dano = (evo: string | null) => {
      const c = campo('vampirinho', evo ? { evolucao: ['Q', evo] } : {});
      c.heroi.ataque = undefined;
      const b = boneco(c, { x: 7.5, y: 15 }, 0, 1e5);
      lancar(c, 'Q', { x: 7.5, y: 15 });
      rodar(c.mundo, 0.5);
      const golpes = eventos(c.mundo, 'dano').filter((d) => d.alvo === b.id).length;
      rodar(c.mundo, 3.5);
      return { perdida: perdida(b), golpes };
    };
    const sem = dano(null);
    const dupla = dano('mordida_dupla');
    expect(dupla.golpes).toBe(2);
    expect(dupla.perdida / sem.perdida).toBeCloseTo(1.2, 2);
    expect(dano('sangria').perdida / sem.perdida).toBeCloseTo(1.5, 1);
  });

  it('Revoada machuca no caminho; Capa Longa voa 5 tiles', () => {
    const c = campo('vampirinho', { evolucao: ['W', 'revoada'] });
    const b = boneco(c, { x: 6.5, y: 15 });
    lancar(c, 'W', { x: 10, y: 15 });
    rodar(c.mundo, 0.7);
    expect(perdida(b)).toBeGreaterThan(0);

    const l = campo('vampirinho', { evolucao: ['W', 'capa_longa'] });
    lancar(l, 'W', { x: 12, y: 15 });
    rodar(l.mundo, 1);
    expect(l.heroi.pos.x).toBeCloseTo(10, 1);
  });

  it('Névoa Faminta tira 2% da Coragem por segundo; Névoa Densa deixa lento', () => {
    const c = campo('vampirinho', { evolucao: ['E', 'nevoa_faminta'] });
    const b = boneco(c, { x: 8, y: 15 }, 0, 1000);
    lancar(c, 'E', { x: 8, y: 15 });
    rodar(c.mundo, 4.2);
    expect(perdida(b)).toBeCloseTo(0.02 * 4 * 1000, -1);

    const d = campo('vampirinho', { evolucao: ['E', 'nevoa_densa'] });
    const lento = boneco(d, { x: 8, y: 15 });
    lancar(d, 'E', { x: 8, y: 15 });
    rodar(d.mundo, 0.2);
    expect(estados(lento)).toContain('lentidao');
  });

  it('Sem Fim prolonga 1 s por inimigo derrotado; Transfusão cura 30% ao terminar', () => {
    const c = campo('vampirinho', { evolucao: ['R', 'sem_fim'] });
    lancar(c, 'R', { x: 5, y: 15 });
    rodar(c.mundo, 0.1);
    for (let k = 0; k < 3; k++) golpe(c, boneco(c, { x: 7, y: 13 + k }, 0, 5), 50);
    const b = c.heroi.combate!.estados.find((s) => s.tipo === 'banquete');
    expect(b && b.tipo === 'banquete' ? b.restante : 0).toBeGreaterThan(6 - 0.2 + 2.9);

    const t = campo('vampirinho', { evolucao: ['R', 'transfusao'] });
    t.heroi.combate!.coragem = 20;
    lancar(t, 'R', { x: 5, y: 15 });
    rodar(t.mundo, 6.2);
    expect(t.heroi.combate!.coragem).toBeGreaterThanOrEqual(
      20 + 0.3 * t.heroi.combate!.attr.coragemMax - 1e-6,
    );
  });
});

describe('dados das habilidades', () => {
  it('todos os campeões usam habilidades que existem, na tecla certa', () => {
    for (const [id, c] of Object.entries(campeoes)) {
      for (const t of ['Q', 'W', 'E', 'R'] as const) {
        const h = habilidadeDe(id, t);
        expect(h, `${id} ${t}`).toBeDefined();
        expect(h.tecla).toBe(t);
      }
      expect(c.nomePassiva.length).toBeGreaterThan(0);
    }
  });
});
