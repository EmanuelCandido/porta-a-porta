import { describe, expect, it } from 'vitest';
import {
  fechoConvexo,
  ordenarPartes,
  poligonosDasPartes,
  sombrasDasPartes,
  sombrasDeLuzPontual,
  tomDaNormal,
  type PaletaVolumes,
  type Parte,
} from '../../../src/render/geometria';
import { criarIso } from '../../../src/render/iso';
import { caixa, decalqueNaParede, retanguloDeParede } from '../../../src/render/primitivas';

const iso = criarIso({ largura: 64, altura: 32 });
const paleta: PaletaVolumes = {
  topo: 'topo',
  faceEsquerda: 'esquerda',
  faceDireita: 'direita',
  sombra: { cor: 'sombra', opacidade: 0.35 },
};
const LIMIAR = 0.5;

function permutacoes<T>(lista: T[]): T[][] {
  if (lista.length <= 1) return [lista];
  return lista.flatMap((x, i) =>
    permutacoes([...lista.slice(0, i), ...lista.slice(i + 1)]).map((resto) => [x, ...resto]),
  );
}

describe('tons por face', () => {
  it('uma caixa mostra topo, face esquerda (+y) e face direita (+x)', () => {
    const polys = poligonosDasPartes(
      [caixa({ x0: 0, y0: 0, x1: 1, y1: 1 }, 0, 48)],
      iso,
      paleta,
      LIMIAR,
    );
    expect(polys.map((p) => p.cor).sort()).toEqual(['direita', 'esquerda', 'topo']);
  });

  it('escolhe o tom pela normal', () => {
    expect(tomDaNormal({ x: 0, y: 0, z: 1 }, LIMIAR)).toBe('topo');
    expect(tomDaNormal({ x: 0, y: 1, z: 0 }, LIMIAR)).toBe('faceEsquerda');
    expect(tomDaNormal({ x: 1, y: 0, z: 0 }, LIMIAR)).toBe('faceDireita');
    expect(tomDaNormal({ x: 0.6, y: 0, z: 0.8 }, LIMIAR)).toBe('topo');
  });

  it('decalque numa parede escondida não aparece', () => {
    const r = { x0: 0, y0: 0, x1: 1, y1: 1 };
    const p = caixa(r, 0, 48);
    const janela = (lado: '+x' | '-x') =>
      decalqueNaParede(
        r,
        lado,
        [retanguloDeParede(0.3, 0.7, 10, 30)],
        { tipo: 'emissivo', cor: 'luz' },
        0.01,
      );
    p.decalques.push(janela('+x'), janela('-x'));
    const brilhos = poligonosDasPartes([p], iso, paleta, LIMIAR).filter((q) => q.emissivo);
    expect(brilhos).toHaveLength(1);
    expect(brilhos[0]!.pts.every((q) => q.x > 0)).toBe(true);
  });
});

describe('ordem de desenho', () => {
  const fundo = caixa({ x0: 0, y0: 0, x1: 1, y1: 1 }, 0, 48);
  const frenteX = caixa({ x0: 1, y0: 0, x1: 2, y1: 1 }, 0, 48);
  const frenteY = caixa({ x0: 0, y0: 1, x1: 1, y1: 2 }, 0, 24);
  const telhado = caixa({ x0: -0.1, y0: -0.1, x1: 1.1, y1: 1.1 }, 48, 56);

  it('o que está atrás é desenhado antes, em qualquer ordem de entrada', () => {
    for (const entrada of permutacoes<Parte>([frenteX, fundo, telhado, frenteY])) {
      const ordem = ordenarPartes(entrada, iso);
      expect(ordem.indexOf(fundo)).toBeLessThan(ordem.indexOf(frenteX));
      expect(ordem.indexOf(fundo)).toBeLessThan(ordem.indexOf(frenteY));
      expect(ordem.indexOf(fundo)).toBeLessThan(ordem.indexOf(telhado));
    }
  });

  it('não perde nem repete partes', () => {
    const ordem = ordenarPartes([frenteX, fundo, telhado, frenteY], iso);
    expect(new Set(ordem).size).toBe(4);
  });
});

describe('sombras projetadas', () => {
  it('a sombra escorrega na direção da luz proporcionalmente à altura', () => {
    const [sombra] = sombrasDasPartes(
      [caixa({ x0: 0, y0: 0, x1: 1, y1: 1 }, 0, 100)],
      { x: 0, y: 1 },
      0.01,
    );
    expect(Math.max(...sombra!.map((p) => p.y))).toBeCloseTo(2, 9);
    expect(Math.min(...sombra!.map((p) => p.y))).toBeCloseTo(0, 9);
  });

  it('o fecho convexo descarta os pontos de dentro', () => {
    const fecho = fechoConvexo([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
      { x: 1, y: 1 },
    ]);
    expect(fecho).toHaveLength(4);
  });
});

describe('sombra de uma luz pontual', () => {
  const coluna = caixa({ x0: 2, y0: -0.1, x1: 2.2, y1: 0.1 }, 0, 30);

  it('cai para longe da luz e cresce com a altura do objeto', () => {
    const [s] = sombrasDeLuzPontual([coluna], { x: 0, y: 0, z: 60 }, 10);
    const xs = s!.map((p) => p.x);
    // A coluna de 30 px sob uma luz de 60 px: a ponta vai ao dobro da distância (2,2 → 4,4).
    expect(Math.min(...xs)).toBeCloseTo(2, 5);
    expect(Math.max(...xs)).toBeCloseTo(4.4, 5);
  });

  it('duas luzes dão duas sombras em lados opostos', () => {
    const [a] = sombrasDeLuzPontual([coluna], { x: 0, y: 0, z: 60 }, 10);
    const [b] = sombrasDeLuzPontual([coluna], { x: 4, y: 0, z: 60 }, 10);
    expect(Math.max(...a!.map((p) => p.x))).toBeGreaterThan(2.2);
    expect(Math.min(...b!.map((p) => p.x))).toBeLessThan(2);
  });

  it('o que passa da altura da luz para no alcance dela', () => {
    const alta = caixa({ x0: 2, y0: -0.1, x1: 2.2, y1: 0.1 }, 0, 90);
    const [s] = sombrasDeLuzPontual([alta], { x: 0, y: 0, z: 60 }, 5);
    for (const p of s!) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(5 + 1e-9);
    expect(Math.max(...s!.map((p) => Math.hypot(p.x, p.y)))).toBeCloseTo(5, 5);
  });
});
