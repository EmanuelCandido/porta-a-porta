import { describe, expect, it } from 'vitest';
import { combatenteBoneco, danoFinal } from '../../../src/sim/combate';
import { combate } from '../../../src/sim/content';
import { definirPosto, pontoNoAlcance } from '../../../src/sim/habilidades';
import { adicionarEntidade, enfileirar, passo } from '../../../src/sim/mundo';
import {
  boneco,
  BRUXINHA,
  cena,
  CORAGEM_BONECO,
  eventos,
  habilidadeDe,
  lancar,
  perdida,
  RES_BONECO,
  rodar,
  TPS,
} from './ajuda';

const def = (tecla: 'Q' | 'W' | 'E' | 'R') => habilidadeDe('bruxinha', tecla);

describe('executor de habilidades', () => {
  it('gasta Energia e começa a recarga quando a habilidade sai', () => {
    const c = cena();
    lancar(c, 'Q', { x: 10, y: 15 });
    rodar(c.mundo, def('Q').lancamento + 1 / TPS);
    expect(c.heroi.lancador!.lancadas).toBe(1);
    // A Energia estava cheia; o gasto vem depois da regeneração do mesmo tick.
    expect(c.heroi.combate!.energia).toBeCloseTo(BRUXINHA.energia - def('Q').custo, 9);
    expect(c.heroi.lancador!.slots.Q!.recarga).toBeCloseTo(def('Q').recarga[0]!, 9);
  });

  it('sem posto, a habilidade não sai', () => {
    const c = cena([], { posto: 0 });
    lancar(c, 'Q', { x: 10, y: 15 });
    passo(c.mundo);
    expect(eventos(c.mundo, 'recusado')[0]?.motivo).toBe('posto');
  });

  it('recusa durante a recarga e aceita de novo quando ela acaba', () => {
    const c = cena();
    lancar(c, 'Q', { x: 10, y: 15 });
    rodar(c.mundo, 1);
    lancar(c, 'Q', { x: 10, y: 15 });
    passo(c.mundo);
    expect(eventos(c.mundo, 'recusado').map((e) => e.motivo)).toEqual(['recarga']);
    rodar(c.mundo, def('Q').recarga[0]!);
    lancar(c, 'Q', { x: 10, y: 15 });
    rodar(c.mundo, 0.5);
    expect(c.heroi.lancador!.lancadas).toBe(2);
  });

  it('recusa sem Energia; a Energia regenera 4 por segundo', () => {
    const c = cena();
    c.heroi.combate!.energia = def('R').custo / 2;
    lancar(c, 'R', { x: 8, y: 15 });
    passo(c.mundo);
    expect(eventos(c.mundo, 'recusado')[0]?.motivo).toBe('energia');
    const antes = c.heroi.combate!.energia;
    rodar(c.mundo, 1);
    expect(c.heroi.combate!.energia - antes).toBeCloseTo(BRUXINHA.regenEnergiaPorS, 6);
  });

  it('a Pressa reduz a recarga, até o limite', () => {
    const c = cena();
    c.heroi.combate!.base.pressa = 100;
    lancar(c, 'E', { x: 10, y: 15 });
    passo(c.mundo);
    const base = def('E').recarga[0]!;
    expect(c.heroi.lancador!.slots.E!.recarga).toBeCloseTo(
      base * (1 - combate.pressaMaxima / 100),
      6,
    );
  });

  it('o lançamento para o jogador pelo tempo da habilidade', () => {
    const c = cena();
    enfileirar(c.mundo, { tipo: 'direcao', id: c.heroi.id, x: 0, y: -1 });
    lancar(c, 'Q', { x: 10, y: 15 });
    rodar(c.mundo, def('Q').lancamento - 1 / TPS);
    expect(c.heroi.pos.y).toBe(15);
    expect(c.hab.projeteis).toHaveLength(0);
    rodar(c.mundo, 2 / TPS);
    expect(c.hab.projeteis).toHaveLength(1);
    rodar(c.mundo, 0.5);
    expect(c.heroi.pos.y).toBeLessThan(15);
  });

  it('comando guardado: tecla apertada até 0,15 s antes do fim sai logo depois', () => {
    const c = cena();
    lancar(c, 'Q', { x: 10, y: 15 });
    rodar(c.mundo, def('Q').lancamento - 0.1);
    lancar(c, 'W', { x: 9, y: 15 });
    rodar(c.mundo, 0.1 + 2 / TPS);
    expect(c.heroi.lancador!.lancando?.chave).toBe('W');
    expect(eventos(c.mundo, 'recusado')).toHaveLength(0);
  });

  it('cedo demais para guardar, o pedido é recusado como ocupado', () => {
    const c = cena();
    lancar(c, 'R', { x: 10, y: 15 });
    rodar(c.mundo, 0.2);
    lancar(c, 'Q', { x: 9, y: 15 });
    passo(c.mundo);
    expect(eventos(c.mundo, 'recusado')[0]?.motivo).toBe('ocupado');
  });

  it('atordoamento interrompe o lançamento e a habilidade volta com metade da recarga', () => {
    const c = cena();
    lancar(c, 'R', { x: 10, y: 15 });
    rodar(c.mundo, 0.3);
    c.heroi.combate!.estados.push({ tipo: 'atordoado', restante: 1 });
    c.heroi.lancador!.interrompido = true;
    passo(c.mundo);
    expect(c.heroi.lancador!.lancando).toBeNull();
    expect(c.hab.areas).toHaveLength(0);
    expect(c.heroi.lancador!.slots.R!.recarga).toBeCloseTo(def('R').recarga[0]! / 2, 1);
    expect(eventos(c.mundo, 'lancamentoInterrompido')).toHaveLength(1);
  });
});

describe('Q — Vassoura Disparada', () => {
  it('acerta o primeiro inimigo da linha e para nele', () => {
    const c = cena();
    const primeiro = boneco(c, { x: 9, y: 15 });
    const segundo = boneco(c, { x: 11, y: 15 });
    lancar(c, 'Q', { x: 20, y: 15 });
    rodar(c.mundo, 1.5);
    expect(perdida(primeiro)).toBeCloseTo(danoFinal(60, RES_BONECO), 6);
    expect(perdida(segundo)).toBe(0);
    expect(c.hab.projeteis).toHaveLength(0);
  });

  it('não passa do alcance de 8 tiles, mesmo mirando além', () => {
    const c = cena();
    // O projétil acerta quem encosta na faixa dele (meia largura + raio do alvo); no fim do voo
    // ele estoura, então o de longe fica além do estouro.
    const longe = boneco(c, { x: 5 + 8 + def('Q').estouro!.raio + 0.5, y: 15 });
    lancar(c, 'Q', { x: 29, y: 15 });
    rodar(c.mundo, 2);
    expect(perdida(longe)).toBe(0);
    const perto = boneco(c, { x: 5 + 7.8, y: 15 });
    c.heroi.lancador!.slots.Q!.recarga = 0;
    lancar(c, 'Q', { x: 29, y: 15 });
    rodar(c.mundo, 2);
    expect(perdida(perto)).toBeGreaterThan(0);
  });

  it('para na parede', () => {
    const c = cena([{ x0: 7, y0: 10, x1: 8, y1: 20 }]);
    const atras = boneco(c, { x: 9, y: 15 });
    lancar(c, 'Q', { x: 20, y: 15 });
    rodar(c.mundo, 2);
    expect(perdida(atras)).toBe(0);
  });

  it('escala com o posto e com o Feitiço', () => {
    const c = cena();
    definirPosto(c.heroi.lancador!, 'Q', 5);
    c.heroi.combate!.base.feitico = 100;
    const alvo = boneco(c, { x: 9, y: 15 });
    lancar(c, 'Q', { x: 9, y: 15 });
    rodar(c.mundo, 1.5);
    expect(perdida(alvo)).toBeCloseTo(danoFinal(180 + 0.6 * 100, RES_BONECO), 6);
  });
});

describe('Q — estouro no fim do voo', () => {
  it('quem está perto de onde a vassoura acerta leva uma fração do dano e é empurrado', () => {
    const c = cena();
    const est = def('Q').estouro!;
    const alvo = boneco(c, { x: 9, y: 15 });
    const vizinho = boneco(c, { x: 9, y: 15.8 });
    const chefe = boneco(c, { x: 9, y: 14.2 });
    chefe.combate!.chefe = true;
    lancar(c, 'Q', { x: 20, y: 15 });
    rodar(c.mundo, 1.5);
    // O alvo leva o golpe cheio (não leva o estouro de novo); o vizinho, a fração.
    expect(perdida(alvo)).toBeCloseTo(danoFinal(60, RES_BONECO), 6);
    expect(perdida(vizinho)).toBeCloseTo(danoFinal(60 * est.fracaoDano, RES_BONECO), 6);
    // Empurrado para longe do centro do estouro, a distância inteira do empurrão.
    expect(Math.hypot(vizinho.pos.x - 9, vizinho.pos.y - 15.8)).toBeCloseTo(est.empurrao, 1);
    expect(vizinho.pos.y).toBeGreaterThan(15.8);
    // Chefes levam o dano, mas não são empurrados.
    expect(perdida(chefe)).toBeGreaterThan(0);
    expect(chefe.pos.y).toBeCloseTo(14.2, 6);
    const e = eventos(c.mundo, 'estouro');
    expect(e).toHaveLength(1);
    expect(e[0]!.raio).toBe(est.raio);
  });

  it('sem acertar ninguém, estoura no fim do alcance', () => {
    const c = cena();
    lancar(c, 'Q', { x: 29, y: 15 });
    rodar(c.mundo, 2);
    const e = eventos(c.mundo, 'estouro');
    expect(e).toHaveLength(1);
    expect(e[0]!.centro.x).toBeCloseTo(5 + 8, 1);
  });
});

describe('W — Poção Pegajosa', () => {
  it('cai no ponto mirado e causa o dano por segundo durante 3 s', () => {
    const c = cena();
    const alvo = boneco(c, { x: 9, y: 15 });
    lancar(c, 'W', { x: 9, y: 15 });
    rodar(c.mundo, 4);
    expect(perdida(alvo)).toBeCloseTo(danoFinal(40 * 3, RES_BONECO), 6);
    expect(eventos(c.mundo, 'pulso')).toHaveLength(6);
    expect(c.hab.areas).toHaveLength(0);
  });

  it('fora do alcance, cai no ponto mais distante possível', () => {
    const c = cena();
    lancar(c, 'W', { x: 25, y: 15 });
    rodar(c.mundo, 0.3);
    const forma = def('W').forma;
    expect(forma.tipo).toBe('area');
    const alcance = forma.tipo === 'area' ? forma.alcance : 0;
    expect(c.hab.areas[0]!.centro.x).toBeCloseTo(5 + alcance, 6);
    expect(pontoNoAlcance({ x: 0, y: 0 }, { x: 3, y: 4 }, 10)).toEqual({ x: 3, y: 4 });
    expect(pontoNoAlcance({ x: 0, y: 0 }, { x: 6, y: 8 }, 5)).toEqual({ x: 3, y: 4 });
  });

  it('deixa lento em 40% quem fica dentro', () => {
    const c = cena();
    const andando = boneco(c, { x: 9, y: 15 }, 2);
    enfileirar(c.mundo, { tipo: 'direcao', id: andando.id, x: 0, y: 1 });
    lancar(c, 'W', { x: 9, y: 16 });
    // A poção voa (o atraso da área) antes de cair e começar a grudar.
    const f = def('W').forma;
    rodar(c.mundo, 0.3 + (f.tipo === 'area' ? f.atraso : 0));
    const y0 = andando.pos.y;
    rodar(c.mundo, 0.5);
    expect(andando.pos.y - y0).toBeCloseTo(2 * 0.6 * 0.5, 6);
  });
});

describe('E — Salto de Vassoura', () => {
  it('é instantâneo e percorre 4 tiles na direção do cursor', () => {
    const c = cena();
    lancar(c, 'E', { x: 5, y: 5 });
    passo(c.mundo);
    expect(c.heroi.forcado).not.toBeNull();
    rodar(c.mundo, 1);
    expect(c.heroi.pos.x).toBeCloseTo(5, 6);
    expect(c.heroi.pos.y).toBeCloseTo(15 - 4, 6);
    expect(c.heroi.forcado).toBeNull();
  });

  it('atravessa inimigos sem causar dano, mas não atravessa paredes', () => {
    const c = cena();
    const noCaminho = boneco(c, { x: 7, y: 15 });
    lancar(c, 'E', { x: 20, y: 15 });
    rodar(c.mundo, 1);
    expect(c.heroi.pos.x).toBeCloseTo(9, 6);
    expect(perdida(noCaminho)).toBe(0);
    expect(c.heroi.atravessaCorpos).toBe(false);

    const p = cena([{ x0: 7, y0: 10, x1: 8, y1: 20 }]);
    lancar(p, 'E', { x: 20, y: 15 });
    rodar(p.mundo, 1);
    expect(p.heroi.pos.x).toBeLessThanOrEqual(7 - 0.4 + 1e-9);
  });
});

describe('E — pouso do Salto', () => {
  it('o pouso empurra quem estiver perto, sem dano, uma vez só', () => {
    const c = cena();
    const est = def('E').estouro!;
    const perto = boneco(c, { x: 9.8, y: 15 });
    lancar(c, 'E', { x: 20, y: 15 });
    rodar(c.mundo, 1);
    expect(eventos(c.mundo, 'estouro')).toHaveLength(1);
    expect(perdida(perto)).toBe(0);
    expect(perto.pos.x).toBeGreaterThan(9.8 + est.empurrao * 0.9);
  });
});

describe('R — Chuva de Abóboras', () => {
  it('depois de 0,8 s, 3 ondas atingem quem está no raio de 3 tiles', () => {
    const c = cena();
    const dentro = boneco(c, { x: 12, y: 15 });
    const borda = boneco(c, { x: 12, y: 17.5 });
    const fora = boneco(c, { x: 12, y: 19 });
    lancar(c, 'R', { x: 12, y: 15 });
    rodar(c.mundo, def('R').lancamento - 1 / TPS);
    expect(c.hab.areas).toHaveLength(0);
    rodar(c.mundo, 3);
    const onda = danoFinal(150, RES_BONECO);
    expect(perdida(dentro)).toBeCloseTo(3 * onda, 6);
    expect(perdida(borda)).toBeCloseTo(3 * onda, 6);
    expect(perdida(fora)).toBe(0);
    expect(eventos(c.mundo, 'pulso').filter((p) => p.tecla === 'R')).toHaveLength(3);
  });

  it('o R vai até o posto 3, com a recarga do posto 3', () => {
    const c = cena();
    definirPosto(c.heroi.lancador!, 'R', 9);
    expect(c.heroi.lancador!.slots.R!.posto).toBe(3);
    lancar(c, 'R', { x: 8, y: 15 });
    rodar(c.mundo, 1);
    expect(c.heroi.lancador!.slots.R!.recarga).toBeCloseTo(def('R').recarga[2]! - (1 - 0.8), 1);
  });
});

describe('passiva — Caldeirão', () => {
  it('a cada 4 habilidades, a próxima causa 50% a mais e explode em volta do alvo', () => {
    const c = cena();
    const alvo = boneco(c, { x: 9, y: 15 });
    const vizinho = boneco(c, { x: 9, y: 15.9 });
    const l = c.heroi.lancador!;
    // 4 lançamentos (E conta) sem gastar recarga nem Energia de verdade.
    for (let i = 0; i < 4; i++) {
      lancar(c, 'E', { x: 5, y: 14 });
      rodar(c.mundo, 0.5);
      l.slots.E!.recarga = 0;
      c.heroi.combate!.energia = 100;
      c.heroi.pos = { x: 5, y: 15 };
    }
    expect(l.contagemPassiva).toBe(4);
    lancar(c, 'Q', { x: 9, y: 15 });
    rodar(c.mundo, 1.5);
    expect(eventos(c.mundo, 'lancou').at(-1)?.fortalecida).toBe(true);
    expect(perdida(alvo)).toBeCloseTo(danoFinal(60 * 1.5, RES_BONECO), 6);
    expect(eventos(c.mundo, 'explosaoCaldeirao')).toHaveLength(1);
    // O vizinho leva a explosão do Caldeirão e o estouro da vassoura (fortalecida também).
    const estouro = def('Q').estouro!.fracaoDano;
    expect(perdida(vizinho)).toBeCloseTo(
      danoFinal(60 * 0.5, RES_BONECO) + danoFinal(60 * 1.5 * estouro, RES_BONECO),
      6,
    );
    expect(l.contagemPassiva).toBe(0);
  });
});

describe('bonecos de treino', () => {
  it('caem em 0 de Coragem e voltam cheios depois do tempo de renascer', () => {
    const c = cena();
    const b = adicionarEntidade(c.mundo, {
      tipo: 'inimigo',
      pos: { x: 9, y: 15 },
      raio: 0.4,
      velocidade: 0,
      combate: combatenteBoneco(combate.bonecoTreino, combate),
    });
    b.combate!.coragem = 1;
    lancar(c, 'Q', { x: 9, y: 15 });
    rodar(c.mundo, 1);
    expect(b.combate!.coragem).toBe(0);
    expect(eventos(c.mundo, 'derrotado')).toHaveLength(1);
    rodar(c.mundo, combate.bonecoTreino.renascerS);
    expect(b.combate!.coragem).toBe(CORAGEM_BONECO);
  });
});
