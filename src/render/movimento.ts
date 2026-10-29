import type { Rotacao, V2 } from '../sim/geometria';

// Contas puras do movimento na tela (docs/PLANO_MUNDO_VIVO.md, frente 5): virar o corpo aos poucos,
// escolher o desenho assado mais perto da direção e as curvas do golpe e de quem leva um golpe.

/** Ângulo da direção no plano do mundo, em graus (0 = +x, 90 = +y), de 0 a 360. */
export function grausDaDirecao(v: V2): number {
  const g = (Math.atan2(v.y, v.x) * 180) / Math.PI;
  return g < 0 ? g + 360 : g;
}

/** Diferença de `de` para `para` pelo lado mais curto, de −180 a 180. */
export function diferencaDeAngulo(de: number, para: number): number {
  const d = (((para - de) % 360) + 540) % 360;
  return d - 180;
}

/** Gira `atual` até `alvo` pelo lado mais curto, no máximo `maxGraus` (resultado de 0 a 360). */
export function girarAte(atual: number, alvo: number, maxGraus: number): number {
  const d = diferencaDeAngulo(atual, alvo);
  const passo = Math.abs(d) <= maxGraus ? d : Math.sign(d) * maxGraus;
  const g = (atual + passo) % 360;
  return g < 0 ? g + 360 : g;
}

/**
 * O desenho assado mais perto do ângulo: uma das 4 rotações dos modelos e a guinada que falta
 * (de −45 a menos de 45), arredondada em `direcoes` passos por volta. Com 4 direções, a guinada é
 * sempre 0 (o desenho só tem as 4 rotações).
 */
export function vistaDoAngulo(graus: number, direcoes: number): { rot: Rotacao; guinada: number } {
  const passo = 360 / direcoes;
  const q = (((Math.round(graus / passo) * passo) % 360) + 360) % 360;
  const rot = ((Math.round(q / 90) * 90) % 360) as Rotacao;
  let guinada = q - rot;
  if (guinada > 180) guinada -= 360;
  if (guinada < -180) guinada += 360;
  return { rot, guinada: Math.round(guinada * 1000) / 1000 };
}

/** Quanto a direção do mundo aponta para a direita na tela (−1 a 1): é para onde o corpo inclina. */
export function ladoNaTela(v: V2): number {
  const n = Math.hypot(v.x, v.y);
  if (n < 1e-9) return 0;
  return (v.x - v.y) / (n * Math.SQRT2);
}

export interface Deformacao {
  /** Escala vertical e horizontal (1 = normal). */
  sy: number;
  sx: number;
  /** Fração da inclinação para a frente (negativa: para trás). */
  inclina: number;
}

/**
 * O golpe em duas partes: a esticada rápida para a frente (até `fracaoEstica` do tempo) e a volta
 * à pose de base com uma achatada pequena que se acomoda (t de 0 a 1; `k` é a escala do golpe).
 */
export function curvaDoGolpe(t: number, k: number, fracaoEstica: number): Deformacao {
  if (t < 0 || t >= 1) return { sy: 1, sx: 1, inclina: 0 };
  if (t < fracaoEstica) {
    const u = Math.sin((t / fracaoEstica) * (Math.PI / 2));
    return { sy: 1 + k * u, sx: 1 - k * 0.5 * u, inclina: u };
  }
  // Acomodação: oscila e amortece até parar (passa um pouco do ponto, como quem freia o braço).
  const u = (t - fracaoEstica) / (1 - fracaoEstica);
  const onda = Math.cos(u * Math.PI * 1.5) * (1 - u) ** 2;
  return { sy: 1 + k * onda, sx: 1 - k * 0.5 * onda, inclina: Math.max(0, onda) };
}

/** Quem leva um golpe achata e volta, e inclina para longe de quem bateu (t de 0 a 1). */
export function curvaDoAtingido(t: number, achata: number): Deformacao {
  if (t < 0 || t >= 1) return { sy: 1, sx: 1, inclina: 0 };
  const u = Math.sin(t * Math.PI) * (1 - t);
  return { sy: 1 - achata * u * 1.6, sx: 1 + achata * u, inclina: -u * 1.6 };
}
