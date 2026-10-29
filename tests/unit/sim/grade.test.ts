import { describe, expect, it } from 'vitest';
import { Grade } from '../../../src/sim/campoDeFluxo';

describe('grade de caminhar', () => {
  it('liberar um obstáculo solta também a folga em volta dele', () => {
    const grade = new Grade({ x0: 0, y0: 0, x1: 20, y1: 10 }, 0.5, [], 0);
    const barreira = { x0: 9, y0: 0, x1: 11, y1: 10 };
    grade.bloquear(barreira, 0.25);
    expect(grade.caminho({ x: 2, y: 5 }, { x: 18, y: 5 })).toBeNull();
    grade.liberar(barreira);
    for (let x = 8.25; x <= 11.75; x += 0.5) expect(grade.ehLivre({ x, y: 5 })).toBe(true);
    expect(grade.linhaLivre({ x: 2, y: 5 }, { x: 18, y: 5 })).toBe(true);
  });

  it('ao liberar, o que outro obstáculo ainda cobre continua bloqueado', () => {
    const grade = new Grade({ x0: 0, y0: 0, x1: 20, y1: 10 }, 0.5, [], 0);
    const casa = { x0: 11, y0: 4, x1: 13, y1: 6 };
    grade.bloquear(casa, 0.25);
    const barreira = { x0: 9, y0: 0, x1: 11, y1: 10 };
    grade.bloquear(barreira, 0.25);
    grade.liberar(barreira);
    expect(grade.ehLivre({ x: 11.1, y: 5 })).toBe(false);
    expect(grade.ehLivre({ x: 10, y: 5 })).toBe(true);
    expect(grade.ehLivre({ x: 11.1, y: 2 })).toBe(true);
  });
});
