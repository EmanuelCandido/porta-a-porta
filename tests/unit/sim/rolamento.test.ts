import { describe, expect, it } from 'vitest';
import { aplicarEstado, causarDano, temEstado } from '../../../src/sim/combate';
import { combate, jogador } from '../../../src/sim/content';
import { enfileirar } from '../../../src/sim/mundo';
import { criarSistemaRolamento } from '../../../src/sim/rolamento';
import { boneco, cena, eventos, rodar } from './ajuda';

const cfg = jogador.rolamento;

function preparar() {
  return cena([], { extras: [criarSistemaRolamento(cfg, combate.estados)] });
}

describe('rolamento do jogador (Espaço)', () => {
  it('anda a distância do rolamento na direção pedida e avisa a tela', () => {
    const c = preparar();
    const x0 = c.heroi.pos.x;
    enfileirar(c.mundo, { tipo: 'rolar', id: c.heroi.id, x: 1, y: 0 });
    rodar(c.mundo, cfg.distancia / cfg.velocidade + 0.1);
    expect(c.heroi.pos.x - x0).toBeCloseTo(cfg.distancia, 1);
    expect(eventos(c.mundo, 'rolou')).toHaveLength(1);
  });

  it('parado, rola para onde está olhando', () => {
    const c = preparar();
    c.heroi.olhar = { x: 0, y: 1 };
    const y0 = c.heroi.pos.y;
    enfileirar(c.mundo, { tipo: 'rolar', id: c.heroi.id, x: 0, y: 0 });
    rodar(c.mundo, 0.5);
    expect(c.heroi.pos.y - y0).toBeCloseTo(cfg.distancia, 1);
  });

  it('não leva dano no começo do rolamento, e volta a levar depois', () => {
    const c = preparar();
    enfileirar(c.mundo, { tipo: 'rolar', id: c.heroi.id, x: 1, y: 0 });
    rodar(c.mundo, 1 / 60);
    expect(temEstado(c.heroi.combate, 'imune')).toBe(true);
    const cheia = c.heroi.combate!.coragem;
    causarDano(c.mundo, c.heroi, { origem: 0, bruto: 30, tipo: 'habilidade' });
    expect(c.heroi.combate!.coragem).toBe(cheia);
    rodar(c.mundo, cfg.imuneS + 0.1);
    causarDano(c.mundo, c.heroi, { origem: 0, bruto: 30, tipo: 'habilidade' });
    expect(c.heroi.combate!.coragem).toBeLessThan(cheia);
  });

  it('espera a recarga e não rola atordoado', () => {
    const c = preparar();
    enfileirar(c.mundo, { tipo: 'rolar', id: c.heroi.id, x: 1, y: 0 });
    rodar(c.mundo, 0.4);
    enfileirar(c.mundo, { tipo: 'rolar', id: c.heroi.id, x: 1, y: 0 });
    rodar(c.mundo, 0.1);
    expect(eventos(c.mundo, 'rolou')).toHaveLength(1);
    rodar(c.mundo, cfg.recargaS);
    aplicarEstado(c.heroi, { tipo: 'atordoado', restante: 1 }, combate.estados);
    enfileirar(c.mundo, { tipo: 'rolar', id: c.heroi.id, x: 1, y: 0 });
    rodar(c.mundo, 0.1);
    expect(eventos(c.mundo, 'rolou')).toHaveLength(1);
  });

  it('passa pelos inimigos no caminho', () => {
    const c = preparar();
    boneco(c, { x: c.heroi.pos.x + 1.2, y: c.heroi.pos.y });
    const x0 = c.heroi.pos.x;
    enfileirar(c.mundo, { tipo: 'rolar', id: c.heroi.id, x: 1, y: 0 });
    rodar(c.mundo, 0.5);
    expect(c.heroi.pos.x - x0).toBeGreaterThan(2);
  });
});
