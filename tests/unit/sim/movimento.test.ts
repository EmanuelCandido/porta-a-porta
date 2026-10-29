import { describe, expect, it } from 'vitest';
import {
  jogador as cfgJogador,
  conteudo,
  modelos,
  ruas,
  simulacao,
} from '../../../src/sim/content';
import { empurraoCirculoRetangulo, sobrepoem } from '../../../src/sim/geometria';
import {
  adicionarEntidade,
  criarMundo,
  enfileirar,
  passo,
  type Entidade,
  type Mundo,
} from '../../../src/sim/mundo';
import { simularRua } from '../../../src/sim/partida';
import { obstaculosDaRua } from '../../../src/sim/rua';

const RAIO = cfgJogador.raio;
const VEL = cfgJogador.velocidade;
const TPS = simulacao.ticksPorSegundo;

function mundoVazio(obstaculos = [] as { x0: number; y0: number; x1: number; y1: number }[]) {
  return criarMundo(
    { limites: { x0: 0, y0: 0, x1: 20, y1: 20 }, obstaculos, semente: 1 },
    simulacao,
  );
}

function novoJogador(mundo: Mundo, x: number, y: number): Entidade {
  return adicionarEntidade(mundo, { tipo: 'jogador', pos: { x, y }, raio: RAIO, velocidade: VEL });
}

function rodar(mundo: Mundo, ticks: number): void {
  for (let i = 0; i < ticks; i++) passo(mundo);
}

describe('movimento', () => {
  it('um segundo andando numa direção percorre a velocidade em tiles', () => {
    const m = mundoVazio();
    const j = novoJogador(m, 5, 5);
    enfileirar(m, { tipo: 'direcao', id: j.id, x: 1, y: 0 });
    rodar(m, TPS);
    expect(j.pos.x).toBeCloseTo(5 + VEL, 9);
    expect(j.pos.y).toBeCloseTo(5, 9);
  });

  it('na diagonal anda a mesma velocidade, não mais', () => {
    const m = mundoVazio();
    const j = novoJogador(m, 5, 5);
    enfileirar(m, { tipo: 'direcao', id: j.id, x: 1, y: 1 });
    rodar(m, TPS);
    expect(Math.hypot(j.pos.x - 5, j.pos.y - 5)).toBeCloseTo(VEL, 9);
  });

  it('o comando só vale no tick seguinte', () => {
    const m = mundoVazio();
    const j = novoJogador(m, 5, 5);
    enfileirar(m, { tipo: 'direcao', id: j.id, x: 1, y: 0 });
    expect(j.pos.x).toBe(5);
    passo(m);
    expect(j.pos.x).toBeCloseTo(5 + VEL / TPS, 9);
  });

  it('mover para um ponto para exatamente nele', () => {
    const m = mundoVazio();
    const j = novoJogador(m, 2, 2);
    enfileirar(m, { tipo: 'moverPara', id: j.id, x: 6, y: 5 });
    rodar(m, 2 * TPS);
    expect(j.pos).toEqual({ x: 6, y: 5 });
    expect(j.destino).toBeNull();
  });

  it('a direção cancela o destino do clique', () => {
    const m = mundoVazio();
    const j = novoJogador(m, 5, 5);
    enfileirar(m, { tipo: 'moverPara', id: j.id, x: 15, y: 5 });
    passo(m);
    enfileirar(m, { tipo: 'direcao', id: j.id, x: 0, y: 1 });
    rodar(m, TPS);
    expect(j.destino).toBeNull();
    expect(j.pos.y).toBeGreaterThan(8);
  });

  it('parar zera a intenção', () => {
    const m = mundoVazio();
    const j = novoJogador(m, 5, 5);
    enfileirar(m, { tipo: 'direcao', id: j.id, x: 1, y: 0 });
    passo(m);
    enfileirar(m, { tipo: 'parar', id: j.id });
    passo(m);
    const x = j.pos.x;
    rodar(m, 10);
    expect(j.pos.x).toBe(x);
  });
});

describe('colisão', () => {
  const casa = { x0: 8, y0: 0, x1: 12, y1: 20 };

  it('para encostado na parede, a um raio de distância', () => {
    const m = mundoVazio([casa]);
    const j = novoJogador(m, 5, 10);
    enfileirar(m, { tipo: 'direcao', id: j.id, x: 1, y: 0 });
    rodar(m, 2 * TPS);
    expect(j.pos.x).toBeCloseTo(casa.x0 - RAIO, 9);
  });

  it('desliza ao longo da parede quando anda na diagonal', () => {
    const m = mundoVazio([casa]);
    const j = novoJogador(m, 7, 5);
    enfileirar(m, { tipo: 'direcao', id: j.id, x: 1, y: 1 });
    rodar(m, TPS);
    expect(j.pos.x).toBeCloseTo(casa.x0 - RAIO, 9);
    expect(j.pos.y).toBeGreaterThan(5 + VEL * 0.6);
  });

  it('contorna a quina sem atravessar', () => {
    const m = mundoVazio([{ x0: 8, y0: 8, x1: 10, y1: 10 }]);
    const j = novoJogador(m, 6, 6);
    enfileirar(m, { tipo: 'moverPara', id: j.id, x: 12, y: 12 });
    for (let i = 0; i < 4 * TPS; i++) {
      passo(m);
      const emp = empurraoCirculoRetangulo(j.pos, RAIO - 1e-6, { x0: 8, y0: 8, x1: 10, y1: 10 });
      expect(emp).toEqual({ x: 0, y: 0 });
    }
  });

  it('não sai do mapa', () => {
    const m = mundoVazio();
    const j = novoJogador(m, 1, 1);
    enfileirar(m, { tipo: 'direcao', id: j.id, x: -1, y: -1 });
    rodar(m, TPS);
    expect(j.pos).toEqual({ x: RAIO, y: RAIO });
  });

  it('inimigo corpo a corpo bloqueia o caminho', () => {
    const m = mundoVazio();
    const j = novoJogador(m, 5, 10);
    const inimigo = adicionarEntidade(m, {
      tipo: 'inimigo',
      pos: { x: 8, y: 10 },
      raio: 0.35,
      velocidade: 0,
    });
    enfileirar(m, { tipo: 'direcao', id: j.id, x: 1, y: 0 });
    rodar(m, 2 * TPS);
    expect(j.pos.x).toBeCloseTo(inimigo.pos.x - RAIO - inimigo.raio, 6);
    expect(inimigo.pos).toEqual({ x: 8, y: 10 });
  });

  it('dash atravessa corpos, mas não casas', () => {
    const m = mundoVazio([{ x0: 12, y0: 0, x1: 14, y1: 20 }]);
    const j = novoJogador(m, 5, 10);
    j.atravessaCorpos = true;
    adicionarEntidade(m, { tipo: 'inimigo', pos: { x: 8, y: 10 }, raio: 0.35, velocidade: 0 });
    enfileirar(m, { tipo: 'direcao', id: j.id, x: 1, y: 0 });
    rodar(m, 3 * TPS);
    expect(j.pos.x).toBeCloseTo(12 - RAIO, 9);
  });

  it('quem atravessa paredes passa pela casa', () => {
    const m = mundoVazio([{ x0: 8, y0: 0, x1: 9, y1: 20 }]);
    const j = novoJogador(m, 5, 10);
    j.atravessaParedes = true;
    enfileirar(m, { tipo: 'direcao', id: j.id, x: 1, y: 0 });
    rodar(m, 2 * TPS);
    expect(j.pos.x).toBeGreaterThan(9 + RAIO);
  });

  it('um corpo sólido sobreposto não empurra para o outro lado de uma cerca', () => {
    // Cerca de 0,3 tile; o jogador encostado nela e dentro do corpo de um chefe parado.
    const m = mundoVazio([{ x0: 6.25, y0: 0, x1: 6.55, y1: 20 }]);
    const j = novoJogador(m, 6.55 + RAIO, 10);
    adicionarEntidade(m, { tipo: 'inimigo', pos: { x: 7.2, y: 10 }, raio: 0.6, velocidade: 0 });
    enfileirar(m, { tipo: 'direcao', id: j.id, x: 0, y: 1 });
    rodar(m, TPS / 2);
    expect(j.pos.x).toBeGreaterThanOrEqual(6.55 + RAIO - 1e-9);
  });

  it('um passo muito longo não atravessa parede fina', () => {
    const m = mundoVazio([{ x0: 8, y0: 0, x1: 8.1, y1: 20 }]);
    const j = adicionarEntidade(m, {
      tipo: 'jogador',
      pos: { x: 5, y: 10 },
      raio: RAIO,
      velocidade: 600,
    });
    enfileirar(m, { tipo: 'direcao', id: j.id, x: 1, y: 0 });
    passo(m);
    expect(j.pos.x).toBeLessThanOrEqual(8 - RAIO + 1e-9);
  });
});

describe('determinismo', () => {
  it('mesma semente e mesmos comandos dão o mesmo mundo', () => {
    const rodarRua = () => {
      const { mundo, jogador } = simularRua(ruas[0]!, conteudo, 99);
      const destinos = Array.from({ length: 8 }, () => ({
        x: mundo.rng.entre(0, ruas[0]!.largura),
        y: mundo.rng.entre(0, ruas[0]!.profundidade),
      }));
      for (const d of destinos) {
        enfileirar(mundo, { tipo: 'moverPara', id: jogador.id, ...d });
        rodar(mundo, TPS);
      }
      return { ...jogador.pos, tick: mundo.tick };
    };
    expect(rodarRua()).toEqual(rodarRua());
  });
});

describe('rua de teste', () => {
  const rua = ruas.find((r) => r.id === 'rua_teste')!;

  it('vira obstáculos girados dentro do mapa', () => {
    const obstaculos = obstaculosDaRua(rua, modelos);
    expect(obstaculos.length).toBeGreaterThan(rua.objetos.length);
    for (const r of obstaculos) {
      expect(r.x0).toBeGreaterThanOrEqual(0);
      expect(r.y0).toBeGreaterThanOrEqual(0);
      expect(r.x1).toBeLessThanOrEqual(rua.largura);
      expect(r.y1).toBeLessThanOrEqual(rua.profundidade);
    }
  });

  it('o jogador nasce na entrada sem encostar em nada', () => {
    const { mundo, jogador } = simularRua(rua, conteudo, 1);
    const corpo = {
      x0: jogador.pos.x - RAIO,
      y0: jogador.pos.y - RAIO,
      x1: jogador.pos.x + RAIO,
      y1: jogador.pos.y + RAIO,
    };
    expect(mundo.obstaculos.some((r) => sobrepoem(r, corpo))).toBe(false);
  });

  it('dá para atravessar a rua de ponta a ponta pelo meio', () => {
    const { mundo, jogador } = simularRua(rua, conteudo, 1);
    enfileirar(mundo, { tipo: 'moverPara', id: jogador.id, x: 12, y: 1 });
    rodar(mundo, 8 * TPS);
    expect(jogador.pos.y).toBeCloseTo(1, 6);
  });

  it('as casas não deixam o jogador entrar', () => {
    const { mundo, jogador } = simularRua(rua, conteudo, 1);
    // Anda para o oeste, de encontro à fileira de casas.
    jogador.pos = { x: 12, y: 11 };
    enfileirar(mundo, { tipo: 'direcao', id: jogador.id, x: -1, y: 0 });
    rodar(mundo, 4 * TPS);
    expect(jogador.pos.x).toBeGreaterThan(7);
  });
});

describe('arranque e frenagem (movimento com peso)', () => {
  const ACEL = cfgJogador.aceleracao!;

  function comPeso(mundo: Mundo): Entidade {
    const e = novoJogador(mundo, 5, 5);
    e.aceleracao = { ...ACEL };
    return e;
  }

  it('responde no primeiro tick, mas só chega na velocidade cheia depois do arranque', () => {
    const mundo = mundoVazio();
    const e = comPeso(mundo);
    enfileirar(mundo, { tipo: 'direcao', id: e.id, x: 1, y: 0 });
    passo(mundo);
    const primeiro = e.pos.x - 5;
    expect(primeiro).toBeGreaterThan(0);
    expect(primeiro).toBeLessThan(VEL / TPS);
    rodar(mundo, Math.ceil(ACEL.arranqueS * TPS) + 1);
    const antes = e.pos.x;
    passo(mundo);
    expect(e.pos.x - antes).toBeCloseTo(VEL / TPS, 9);
  });

  it('ao soltar, escorrega um pouco e para dentro do tempo de frenagem', () => {
    const mundo = mundoVazio();
    const e = comPeso(mundo);
    enfileirar(mundo, { tipo: 'direcao', id: e.id, x: 1, y: 0 });
    rodar(mundo, TPS);
    enfileirar(mundo, { tipo: 'direcao', id: e.id, x: 0, y: 0 });
    const soltou = e.pos.x;
    rodar(mundo, Math.ceil(ACEL.freioS * TPS) + 1);
    const escorregou = e.pos.x - soltou;
    expect(escorregou).toBeGreaterThan(0);
    // Escorrega no máximo o que andaria parando de forma constante (metade da velocidade).
    expect(escorregou).toBeLessThanOrEqual((VEL * ACEL.freioS) / 2 + VEL / TPS);
    const parado = e.pos.x;
    rodar(mundo, 5);
    expect(e.pos.x).toBe(parado);
  });

  it('virar para trás passa pelo parado, e preso para na hora', () => {
    const mundo = mundoVazio();
    const e = comPeso(mundo);
    enfileirar(mundo, { tipo: 'direcao', id: e.id, x: 1, y: 0 });
    rodar(mundo, TPS);
    enfileirar(mundo, { tipo: 'direcao', id: e.id, x: -1, y: 0 });
    passo(mundo);
    expect(e.vel!.x).toBeGreaterThan(0);
    rodar(mundo, Math.ceil((ACEL.freioS + ACEL.arranqueS) * TPS) + 2);
    expect(e.vel!.x).toBeCloseTo(-VEL, 9);
    // Preso (multiplicador zero, como na raiz): a velocidade zera no mesmo tick.
    const s = { antesDeMover: (m: Mundo) => void (m.entidades[0]!.multVelocidade = 0) };
    (mundo.sistemas as unknown[]).push(s);
    passo(mundo);
    expect(e.vel).toEqual({ x: 0, y: 0 });
  });
});
