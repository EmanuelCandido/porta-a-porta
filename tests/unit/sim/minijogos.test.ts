import { describe, expect, it } from 'vitest';
import { exploracao } from '../../../src/sim/content';
import {
  Minijogo,
  TIPOS_DE_MINIJOGO,
  type EntradaMinijogo,
  type OpcoesMinijogo,
  type TipoMinijogo,
} from '../../../src/sim/minijogos';

const CFG = exploracao.desconfiada.minijogos;
const DT = 1 / 60;
const FANTASIAS = ['bruxinha', 'fantasma', 'esqueleto', 'vampirinho'];

function novo(tipo: TipoMinijogo, bairro = 0, semente = 7, extra: Partial<OpcoesMinijogo> = {}) {
  return new Minijogo(tipo, CFG, semente, DT, {
    bairro,
    fantasia: 'bruxinha',
    fantasias: FANTASIAS,
    ...extra,
  });
}

/** Joga até o fim: `decidir` diz o que entrar em cada tick (null = nada). */
function jogar(m: Minijogo, decidir: (m: Minijogo) => EntradaMinijogo | null): string {
  for (let k = 0; k < 60 * 20 && !m.terminou; k++) {
    const e = decidir(m);
    if (e) m.entrar(e);
    m.passo();
  }
  return m.resultado ?? 'sem fim';
}

/** A resposta certa, atrasada em `atrasoTicks` (o bot humano). */
function comAtraso(atrasoTicks: number): (m: Minijogo) => EntradaMinijogo | null {
  const fila: { tick: number; e: EntradaMinijogo }[] = [];
  return (m) => {
    const certa = m.respostaCerta();
    if (certa && !fila.some((f) => f.tick >= m.tick))
      fila.push({ tick: m.tick + atrasoTicks, e: certa });
    const pronta = fila.findIndex((f) => f.tick === m.tick);
    return pronta >= 0 ? fila.splice(pronta, 1)[0]!.e : null;
  };
}

describe('minijogos da Casa Desconfiada', () => {
  it.each(TIPOS_DE_MINIJOGO)(
    '%s: a resposta certa na hora é perfeita, nos três bairros',
    (tipo) => {
      for (const b of [0, 1, 2])
        expect(jogar(novo(tipo, b), (m) => m.respostaCerta())).toBe('perfeito');
    },
  );

  it.each(TIPOS_DE_MINIJOGO)('%s: sem fazer nada, o tempo acaba em erro (em até 9 s)', (tipo) => {
    const m = novo(tipo);
    expect(jogar(m, () => null)).toBe('erro');
    expect(m.segundos).toBeLessThanOrEqual(9);
  });

  it.each(TIPOS_DE_MINIJOGO)('%s: a mesma semente dá o mesmo jogo', (tipo) => {
    expect(novo(tipo, 1, 42).vista).toEqual(novo(tipo, 1, 42).vista);
  });

  it('Toque Combinado: fora da janela é erro; meio atrasado é acerto', () => {
    const janela = CFG.toque.janelaS[0]!;
    // Bate cedo demais no segundo toque.
    const cedo = novo('toque');
    let primeiro: number | null = null;
    expect(
      jogar(cedo, (m) => {
        const v = m.vista;
        if (v.tipo !== 'toque' || v.fase !== 'repetir') return null;
        if (primeiro === null) {
          primeiro = m.tick;
          return { tipo: 'toque' };
        }
        return m.tick === primeiro + 2 ? { tipo: 'toque' } : null;
      }),
    ).toBe('erro');
    // Cada toque a 75% da janela de atraso: dentro, mas não perfeito.
    const atraso = Math.round((janela * 0.75) / DT);
    const meio = novo('toque');
    let base: number | null = null;
    expect(
      jogar(meio, (m) => {
        const v = m.vista;
        if (v.tipo !== 'toque' || v.fase !== 'repetir') return null;
        if (base === null) {
          base = m.tick;
          return { tipo: 'toque' };
        }
        const k = v.toques.length;
        const alvo = base + Math.round((v.batidas[k]! - v.batidas[0]!) / DT) + atraso;
        return m.tick === alvo ? { tipo: 'toque' } : null;
      }),
    ).toBe('acerto');
  });

  it('Toque Combinado: os bairros pedem mais toques e janelas menores', () => {
    const v0 = novo('toque', 0).vista;
    const v2 = novo('toque', 2).vista;
    if (v0.tipo !== 'toque' || v2.tipo !== 'toque') throw new Error('tipo');
    expect(v2.batidas.length).toBeGreaterThan(v0.batidas.length);
    expect(v2.janelaS).toBeLessThan(v0.janelaS);
  });

  it('Olho Mágico: uma seta errada encerra; digitar devagar é acerto', () => {
    const m = novo('olho');
    expect(
      jogar(m, (j) => {
        const c = j.respostaCerta();
        if (!c || c.tipo !== 'seta') return null;
        return { tipo: 'seta', seta: c.seta === 'cima' ? 'baixo' : 'cima' };
      }),
    ).toBe('erro');
    expect(jogar(novo('olho'), comAtraso(Math.round(0.6 / DT)))).toBe('acerto');
  });

  it('Doce na Fresta: parar fora do vão é erro', () => {
    const m = novo('fresta');
    expect(
      jogar(m, (j) => {
        const v = j.vista;
        if (v.tipo !== 'fresta') return null;
        return Math.abs(v.doce - v.centro) > v.vao ? { tipo: 'toque' } : null;
      }),
    ).toBe('erro');
  });

  it('Quem Bate?: a fantasia do jogador está entre as silhuetas; a errada é erro', () => {
    const m = novo('quem', 0, 3, { fantasia: 'fantasma' });
    const v = m.vista;
    if (v.tipo !== 'quem') throw new Error('tipo');
    expect(v.opcoes).toHaveLength(CFG.quem.silhuetas);
    expect(v.opcoes).toContain('fantasma');
    const errada = v.opcoes.findIndex((o) => o !== 'fantasma');
    expect(
      jogar(m, (j) =>
        j.vista.tipo === 'quem' && j.vista.fase === 'escolher'
          ? { tipo: 'escolha', indice: errada }
          : null,
      ),
    ).toBe('erro');
  });

  it('com folga, a janela do toque e o vão da fresta ficam maiores', () => {
    const f = exploracao.desconfiada.folga;
    const a = novo('toque', 2).vista;
    const b = novo('toque', 2, 7, { folga: f }).vista;
    if (a.tipo !== 'toque' || b.tipo !== 'toque') throw new Error('tipo');
    expect(b.janelaS).toBeCloseTo(a.janelaS * f);
    const c = novo('fresta', 2).vista;
    const d = novo('fresta', 2, 7, { folga: f }).vista;
    if (c.tipo !== 'fresta' || d.tipo !== 'fresta') throw new Error('tipo');
    expect(d.vao).toBeGreaterThan(c.vao);
  });
});
