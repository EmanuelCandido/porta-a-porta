import { describe, expect, it } from 'vitest';
import { aplicarEstado, causarDano, combatenteInimigo } from '../../../src/sim/combate';
import { combate, inimigos } from '../../../src/sim/content';
import { adicionarEntidade, forcarMovimento } from '../../../src/sim/mundo';
import { cena, rodar } from './ajuda';

function preparar(especie = 'pestinha_lencol', parede = false) {
  const c = cena(parede ? [{ x0: 7.5, y0: 14, x1: 8, y1: 16 }] : []);
  const def = inimigos.inimigos[especie]!;
  const alvo = adicionarEntidade(c.mundo, {
    tipo: 'inimigo',
    especie,
    pos: { x: 7, y: 15 },
    raio: def.raio,
    velocidade: 0,
    combate: combatenteInimigo(def, combate),
    marcas: { elite: def.elite },
  });
  return { ...c, alvo };
}

describe('recuo central do combate', () => {
  it.each(['habilidade', 'autoAtaque', 'explosao'] as const)(
    '%s afasta o inimigo pequeno 0,3 tile de quem bateu',
    (tipo) => {
      const c = preparar();
      causarDano(c.mundo, c.alvo, { origem: c.heroi.id, bruto: 1, tipo });
      rodar(c.mundo, 0.1);
      expect(c.alvo.pos.x).toBeCloseTo(7.3);
      expect(c.alvo.pos.y).toBe(15);
      expect(c.alvo.forcado).toBeNull();
    },
  );

  it('respeita a parede e encerra o empurrão sem atravessá-la', () => {
    const c = preparar('pestinha_lencol', true);
    causarDano(c.mundo, c.alvo, { origem: c.heroi.id, bruto: 1, tipo: 'habilidade' });
    rodar(c.mundo, 0.1);
    expect(c.alvo.pos.x + c.alvo.raio).toBeLessThanOrEqual(7.5);
    expect(c.alvo.forcado).toBeNull();
  });

  it.each(['poste_corrompido', 'casa_perseguidora', 'sindico_zeloso'])(
    '%s não recua',
    (especie) => {
      const c = preparar(especie);
      causarDano(c.mundo, c.alvo, { origem: c.heroi.id, bruto: 1, tipo: 'habilidade' });
      expect(c.alvo.forcado).toBeNull();
    },
  );

  it('não substitui um empurrão mais longo nem empurra quem morreu ou está imune', () => {
    const c = preparar();
    forcarMovimento(c.alvo, { x: 0, y: 1 }, 2, 10, false);
    const anterior = c.alvo.forcado;
    causarDano(c.mundo, c.alvo, { origem: c.heroi.id, bruto: 1, tipo: 'habilidade' });
    expect(c.alvo.forcado).toBe(anterior);
    c.alvo.forcado = null;
    c.alvo.combate!.estados.push({ tipo: 'imune', restante: 1 });
    causarDano(c.mundo, c.alvo, { origem: c.heroi.id, bruto: 1, tipo: 'habilidade' });
    expect(c.alvo.forcado).toBeNull();
    c.alvo.combate!.estados = [];
    causarDano(c.mundo, c.alvo, { origem: c.heroi.id, bruto: 1e6, tipo: 'habilidade' });
    expect(c.alvo.forcado).toBeNull();
  });

  it('dano contínuo não mantém o inimigo preso em recuo', () => {
    const c = preparar();
    causarDano(c.mundo, c.alvo, { origem: c.heroi.id, bruto: 1, tipo: 'dot' });
    expect(c.alvo.forcado).toBeNull();
  });

  it.each(['atordoado', 'enraizado'] as const)(
    'o estado %s do mesmo golpe preserva o recuo',
    (tipo) => {
      const c = preparar();
      causarDano(c.mundo, c.alvo, { origem: c.heroi.id, bruto: 1, tipo: 'habilidade' });
      aplicarEstado(c.alvo, { tipo, restante: 1 }, combate.estados);
      rodar(c.mundo, 0.1);
      expect(c.alvo.pos.x).toBeCloseTo(7.3);
      expect(c.alvo.combate!.estados.some((e) => e.tipo === tipo)).toBe(true);
    },
  );
});
