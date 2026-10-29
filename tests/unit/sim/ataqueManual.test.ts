import { describe, expect, it } from 'vitest';
import { campeoes, combate } from '../../../src/sim/content';
import { enfileirar } from '../../../src/sim/mundo';
import { boneco, cena, eventos, perdida, rodar } from './ajuda';

const m = combate.ataqueManual;

function preparar(campeao: string) {
  const c = cena([], { autoAtaque: true, manual: true, campeao });
  // Sem crítico, para comparar os golpes do combo.
  c.heroi.combate!.attr.critico = 0;
  return c;
}

const golpear = (c: ReturnType<typeof preparar>, x: number, y: number) =>
  enfileirar(c.mundo, { tipo: 'golpear', id: c.heroi.id, x, y });

describe('ataque básico manual (botão esquerdo)', () => {
  it('parado perto de um boneco, o jogador não ataca sozinho', () => {
    const c = preparar('fantasma');
    const b = boneco(c, { x: c.heroi.pos.x + 1, y: c.heroi.pos.y });
    rodar(c.mundo, 2);
    expect(perdida(b)).toBe(0);
  });

  it('o golpe de perto acerta todos no arco à frente e ninguém atrás', () => {
    const c = preparar('esqueleto');
    const { x, y } = c.heroi.pos;
    const frente = boneco(c, { x: x + 1, y });
    const lado = boneco(c, { x: x + 0.8, y: y + 0.7 });
    const atras = boneco(c, { x: x - 1, y });
    golpear(c, 1, 0);
    rodar(c.mundo, 0.05);
    expect(perdida(frente)).toBeGreaterThan(0);
    expect(perdida(lado)).toBeGreaterThan(0);
    expect(perdida(atras)).toBe(0);
    const g = eventos(c.mundo, 'golpeou');
    expect(g).toHaveLength(1);
    expect(g[0]!.acertos).toBe(2);
  });

  it('o combo sobe a cada golpe, o último bate mais forte, e uma pausa recomeça', () => {
    const c = preparar('esqueleto');
    const b = boneco(c, { x: c.heroi.pos.x + 1, y: c.heroi.pos.y }, 0, 1e6);
    const recarga = 1 / campeoes['esqueleto']!.autoAtaque.porSegundo;
    const danos: number[] = [];
    for (let i = 0; i < m.golpesNoCombo; i++) {
      const antes = perdida(b);
      golpear(c, 1, 0);
      rodar(c.mundo, recarga + 0.02);
      danos.push(perdida(b) - antes);
    }
    expect(eventos(c.mundo, 'golpeou').map((e) => e.combo)).toEqual([0, 1, 2]);
    expect(danos[2]! / danos[0]!).toBeCloseTo(
      campeoes['esqueleto']!.autoAtaque.combo!.multFinal!,
      1,
    );
    rodar(c.mundo, m.janelaComboS + 0.1);
    golpear(c, 1, 0);
    rodar(c.mundo, 0.05);
    expect(eventos(c.mundo, 'golpeou').at(-1)!.combo).toBe(0);
  });

  it('segurar o botão não passa da recarga do golpe', () => {
    const c = preparar('esqueleto');
    boneco(c, { x: c.heroi.pos.x + 1, y: c.heroi.pos.y }, 0, 1e6);
    for (let i = 0; i < 60; i++) {
      golpear(c, 1, 0);
      rodar(c.mundo, 1 / 60);
    }
    const porSegundo = campeoes['esqueleto']!.autoAtaque.porSegundo;
    expect(eventos(c.mundo, 'golpeou').length).toBeLessThanOrEqual(Math.ceil(porSegundo) + 1);
  });

  it('a Bruxinha atira reto, puxando para o inimigo perto da mira', () => {
    const c = preparar('bruxinha');
    const { x, y } = c.heroi.pos;
    // A 10° da mira: a assistência puxa o tiro para ele.
    const quase = boneco(c, { x: x + 5, y: y + 5 * Math.tan((10 * Math.PI) / 180) });
    golpear(c, 1, 0);
    rodar(c.mundo, 1);
    expect(perdida(quase)).toBeGreaterThan(0);
    // Longe da mira (60°): o tiro vai reto e não acerta.
    const c2 = preparar('bruxinha');
    const longe = boneco(c2, { x: c2.heroi.pos.x + 3, y: c2.heroi.pos.y + 5 });
    golpear(c2, 1, 0);
    rodar(c2.mundo, 1);
    expect(perdida(longe)).toBe(0);
  });

  it('cada campeão de perto fecha o combo do seu jeito', () => {
    expect(campeoes['fantasma']!.autoAtaque.combo!.final.tipo).toBe('passagem');
    expect(campeoes['esqueleto']!.autoAtaque.combo!.final.tipo).toBe('pancada');
    expect(campeoes['vampirinho']!.autoAtaque.combo!.final.tipo).toBe('puxao');
    expect(campeoes['vampirinho']!.autoAtaque.combo!.golpes).toBe(4);
  });
});

/** Dá os golpes do combo até o último (exclusive) e devolve a recarga entre eles. */
function ateOFinal(c: ReturnType<typeof preparar>, campeao: string): void {
  const a = campeoes[campeao]!.autoAtaque;
  const recarga = 1 / a.porSegundo;
  const golpes = a.combo?.golpes ?? m.golpesNoCombo;
  // Os golpes comuns para trás (ninguém lá), só para subir o combo.
  for (let i = 0; i < golpes - 1; i++) {
    golpear(c, -1, 0);
    rodar(c.mundo, recarga + 0.02);
  }
}

describe('golpe final do combo de cada campeão de perto', () => {
  it('Fantasma: a Passagem atravessa a fila, acerta todos e termina do outro lado', () => {
    const c = preparar('fantasma');
    const { x, y } = c.heroi.pos;
    const perto = boneco(c, { x: x + 0.8, y }, 0, 1e6);
    const longe = boneco(c, { x: x + 1.8, y: y + 0.3 }, 0, 1e6);
    const fora = boneco(c, { x: x + 1, y: y + 1.5 }, 0, 1e6);
    ateOFinal(c, 'fantasma');
    golpear(c, 1, 0);
    rodar(c.mundo, 0.6);
    expect(perdida(perto)).toBeGreaterThan(0);
    expect(perdida(longe)).toBeGreaterThan(0);
    expect(perdida(fora)).toBe(0);
    expect(c.heroi.pos.x).toBeGreaterThan(perto.pos.x);
    expect(eventos(c.mundo, 'golpeLinha').length).toBeGreaterThan(0);
  });

  it('Esqueleto: a Pancada no chão acerta quem está atrás e empurra para fora', () => {
    const c = preparar('esqueleto');
    const { x, y } = c.heroi.pos;
    ateOFinal(c, 'esqueleto');
    const atras = boneco(c, { x: x - 1.2, y }, 0, 1e6);
    atras.combate!.recuo = combate.recuo;
    const x0 = atras.pos.x;
    golpear(c, 1, 0);
    rodar(c.mundo, 0.5);
    expect(perdida(atras)).toBeGreaterThan(0);
    expect(x0 - atras.pos.x).toBeGreaterThan(0.5);
  });

  it('Vampirinho: o Puxão traz o inimigo para perto e cura parte do dano', () => {
    const c = preparar('vampirinho');
    const { x, y } = c.heroi.pos;
    ateOFinal(c, 'vampirinho');
    const alvo = boneco(c, { x: x + 1.7, y }, 0, 1e6);
    alvo.combate!.recuo = combate.recuo;
    c.heroi.combate!.coragem = c.heroi.combate!.attr.coragemMax / 2;
    const antes = c.heroi.combate!.coragem;
    const d0 = alvo.pos.x - c.heroi.pos.x;
    golpear(c, 1, 0);
    rodar(c.mundo, 0.5);
    expect(perdida(alvo)).toBeGreaterThan(0);
    expect(alvo.pos.x - c.heroi.pos.x).toBeLessThan(d0 - 0.3);
    expect(c.heroi.combate!.coragem).toBeGreaterThan(antes);
  });
});

describe('golpe da Bruxinha: leque no fim do combo e Energia por acerto', () => {
  it('o último golpe do combo sai em leque de projéteis', () => {
    const c = preparar('bruxinha');
    const recarga = 1 / campeoes['bruxinha']!.autoAtaque.porSegundo;
    for (let i = 0; i < m.golpesNoCombo; i++) {
      golpear(c, 1, 0);
      rodar(c.mundo, i === m.golpesNoCombo - 1 ? 1 / 60 : recarga + 0.02);
    }
    // Os do último golpe acabaram de sair (os anteriores já voaram mais).
    const novos = c.hab.projeteis.filter((p) => p.restante > m.alcanceProjetil - 0.5);
    expect(novos).toHaveLength(m.lequeUltimo.n);
    const ys = novos.map((p) => p.dir.y).sort((a, b) => a - b);
    expect(ys[0]).toBeLessThan(0);
    expect(ys.at(-1)).toBeGreaterThan(0);
  });

  it('o golpe que acerta devolve Energia', () => {
    const c = preparar('bruxinha');
    boneco(c, { x: c.heroi.pos.x + 2, y: c.heroi.pos.y });
    c.heroi.combate!.energia = 10;
    c.heroi.combate!.attr.regenEnergia = 0;
    c.heroi.combate!.base.regenEnergia = 0;
    golpear(c, 1, 0);
    rodar(c.mundo, 0.5);
    expect(eventos(c.mundo, 'acertoAuto')).toHaveLength(1);
    expect(c.heroi.combate!.energia).toBeCloseTo(10 + m.energiaPorAcerto, 6);
  });
});
