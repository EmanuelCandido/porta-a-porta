import { describe, expect, it } from 'vitest';
import { assistenciaDeMira, miraAutomatica } from '../../../src/sim/assistencia';

describe('assistência de mira do controle', () => {
  const o = { x: 0, y: 0 };

  it('gruda no alvo a até 10° da direção do analógico', () => {
    const alvo = { x: 5, y: 0.6 }; // ~6,8°
    expect(assistenciaDeMira(o, { x: 1, y: 0 }, [alvo], 8, 10)).toEqual(alvo);
  });

  it('ignora alvos fora do ângulo ou do alcance', () => {
    const torto = { x: 5, y: 2 }; // ~21,8°
    const longe = { x: 9, y: 0 };
    expect(assistenciaDeMira(o, { x: 1, y: 0 }, [torto, longe], 8, 10)).toEqual({ x: 8, y: 0 });
  });

  it('entre dois alvos, fica com o mais alinhado', () => {
    const a = { x: 4, y: 0.5 };
    const b = { x: 6, y: 0.2 };
    expect(assistenciaDeMira(o, { x: 1, y: 0 }, [a, b], 8, 10)).toEqual(b);
  });
});

describe('mira automática das áreas no controle', () => {
  const o = { x: 0, y: 0 };
  const cfg = { graus: 70, qualquerLadoAte: 6, semAlvoTiles: 3.5 };

  it('cai no inimigo do cone, não no fim do alcance', () => {
    const alvo = { x: 4, y: 2.5 }; // ~32°, fora dos 10° da assistência antiga
    expect(miraAutomatica(o, { x: 1, y: 0 }, [alvo], 8, 1.5, cfg)).toEqual(alvo);
  });

  it('entre vários no cone, o que pega mais inimigos dentro do raio', () => {
    const sozinho = { x: 3, y: 0 };
    const grupo = [
      { x: 6, y: 1 },
      { x: 6.8, y: 1.4 },
      { x: 6.2, y: 2 },
    ];
    expect(miraAutomatica(o, { x: 1, y: 0 }, [sozinho, ...grupo], 8, 1.5, cfg)).toEqual(grupo[0]);
  });

  it('sem inimigo no cone, o mais perto de qualquer lado (até qualquerLadoAte)', () => {
    const atras = { x: -3, y: 0 };
    const longeAtras = { x: -7, y: 0 };
    expect(miraAutomatica(o, { x: 1, y: 0 }, [longeAtras, atras], 8, 1.5, cfg)).toEqual(atras);
    expect(miraAutomatica(o, { x: 1, y: 0 }, [longeAtras], 8, 1.5, cfg)).toEqual({ x: 3.5, y: 0 });
  });

  it('sem inimigo nenhum, a área cai perto, à frente', () => {
    expect(miraAutomatica(o, { x: 0, y: -2 }, [], 8, 1.5, cfg)).toEqual({ x: 0, y: -3.5 });
    // Um alcance menor que semAlvoTiles fica no alcance.
    expect(miraAutomatica(o, { x: 1, y: 0 }, [], 2, 1.5, cfg)).toEqual({ x: 2, y: 0 });
  });
});
