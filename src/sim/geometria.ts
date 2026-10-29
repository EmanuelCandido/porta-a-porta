/** Ponto ou vetor no plano do mundo, em tiles. */
export interface V2 {
  x: number;
  y: number;
}

/** Retângulo alinhado à grade, em tiles. */
export interface Retangulo {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type Rotacao = 0 | 90 | 180 | 270;

export function comprimento(v: V2): number {
  return Math.hypot(v.x, v.y);
}

/** Vetor com comprimento no máximo 1 (o analógico pode pedir meia velocidade). */
export function limitarA1(v: V2): V2 {
  const n = comprimento(v);
  return n > 1 ? { x: v.x / n, y: v.y / n } : v;
}

/**
 * A parede com esta normal (no plano) fica de frente para a câmera? A câmera olha do lado de +x e
 * +y; as paredes de costas (−x, −y) não aparecem na tela.
 */
export function voltadaParaACamera(n: V2): boolean {
  return n.x + n.y > 1e-6;
}

export function girar(v: V2, rot: Rotacao): V2 {
  switch (rot) {
    case 0:
      return v;
    case 90:
      return { x: -v.y, y: v.x };
    case 180:
      return { x: -v.x, y: -v.y };
    case 270:
      return { x: v.y, y: -v.x };
  }
}

/** Para onde um modelo (frente em +x) deve olhar ao andar na direção `v`. */
export function rotacaoDaDirecao(v: V2, atual: Rotacao): Rotacao {
  if (v.x === 0 && v.y === 0) return atual;
  if (Math.abs(v.x) >= Math.abs(v.y)) return v.x > 0 ? 0 : 180;
  return v.y > 0 ? 90 : 270;
}

/**
 * Leva um ponto do espaço de um modelo (pegada largura × profundidade, frente para +x) para o mundo:
 * gira em volta do centro da pegada e põe o canto mínimo da pegada girada em (x, y).
 */
export function posicionador(
  largura: number,
  profundidade: number,
  x: number,
  y: number,
  rot: Rotacao,
): { ponto: (q: V2) => V2; pegada: Retangulo } {
  const deitado = rot === 90 || rot === 270;
  const w = deitado ? profundidade : largura;
  const d = deitado ? largura : profundidade;
  return {
    ponto: (q) => {
      const g = girar({ x: q.x - largura / 2, y: q.y - profundidade / 2 }, rot);
      return { x: x + w / 2 + g.x, y: y + d / 2 + g.y };
    },
    pegada: { x0: x, y0: y, x1: x + w, y1: y + d },
  };
}

export function transformarRetangulo(r: Retangulo, ponto: (q: V2) => V2): Retangulo {
  const a = ponto({ x: r.x0, y: r.y0 });
  const b = ponto({ x: r.x1, y: r.y1 });
  return {
    x0: Math.min(a.x, b.x),
    y0: Math.min(a.y, b.y),
    x1: Math.max(a.x, b.x),
    y1: Math.max(a.y, b.y),
  };
}

export function sobrepoem(a: Retangulo, b: Retangulo): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/**
 * Quanto empurrar um círculo para fora do retângulo (vetor zero se não se tocam). Com o centro
 * dentro do retângulo, sai pelo lado mais próximo.
 */
export function empurraoCirculoRetangulo(c: V2, raio: number, r: Retangulo): V2 {
  const px = Math.max(r.x0, Math.min(c.x, r.x1));
  const py = Math.max(r.y0, Math.min(c.y, r.y1));
  const dx = c.x - px;
  const dy = c.y - py;
  const d = Math.hypot(dx, dy);
  if (d >= raio) return { x: 0, y: 0 };
  if (d > 0) return { x: (dx / d) * (raio - d), y: (dy / d) * (raio - d) };
  const saidas = [
    { x: r.x0 - raio - c.x, y: 0 },
    { x: r.x1 + raio - c.x, y: 0 },
    { x: 0, y: r.y0 - raio - c.y },
    { x: 0, y: r.y1 + raio - c.y },
  ];
  return saidas.reduce((a, b) => (comprimento(b) < comprimento(a) ? b : a));
}

/** Quantos tiles da linha de pontos até o ponto dela mais perto de `p` (a projeção). */
export function distanciaNaLinha(linha: readonly V2[], p: V2): number {
  let melhor = { d2: Infinity, s: 0 };
  let andado = 0;
  for (let i = 0; i + 1 < linha.length; i++) {
    const a = linha[i]!;
    const b = linha[i + 1]!;
    const c = Math.hypot(b.x - a.x, b.y - a.y);
    const k =
      c > 0
        ? Math.max(
            0,
            Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (c * c)),
          )
        : 0;
    const q = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    const d2 = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
    if (d2 < melhor.d2) melhor = { d2, s: andado + c * k };
    andado += c;
  }
  return melhor.s;
}
