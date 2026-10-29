// Navegação por foco nos menus (controle): qual botão vem a seguir numa direção. Conta pura, sem
// Phaser, para os testes rodarem em Node (src/game/controleNosMenus.ts usa).

/** Um retângulo na tela (px). */
export interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Quanto pesa o desvio de lado na escolha do próximo botão (mais que a distância em frente). */
const PESO_DO_LADO = 2.2;
/** O próximo botão precisa estar pelo menos isso à frente (px), para não voltar ao mesmo. */
const MINIMO_A_FRENTE = 4;

export const centroDa = (a: Caixa) => ({ x: a.x + a.w / 2, y: a.y + a.h / 2 });

/** O próximo botão naquela direção: perto em frente e pouco de lado (null se não houver). */
export function proximoNaDirecao<T extends Caixa>(
  de: { x: number; y: number },
  dir: { x: number; y: number },
  alvos: readonly T[],
): T | null {
  let melhor: T | null = null;
  let custo = Infinity;
  for (const a of alvos) {
    const c = centroDa(a);
    const vx = c.x - de.x;
    const vy = c.y - de.y;
    const frente = vx * dir.x + vy * dir.y;
    if (frente < MINIMO_A_FRENTE) continue;
    const k = frente + PESO_DO_LADO * Math.abs(vx * dir.y - vy * dir.x);
    if (k < custo) {
      custo = k;
      melhor = a;
    }
  }
  return melhor;
}
