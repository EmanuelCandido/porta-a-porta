import { parte, type Decalque, type Face, type Material, type Parte } from './geometria';
import type { Iso, Vec3 } from './iso';

/** Retângulo no chão, em tiles. */
export interface Pegada {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type Lado = '+x' | '-x' | '+y' | '-y';

export const NORMAL_DO_LADO: Record<Lado, Vec3> = {
  '+x': { x: 1, y: 0, z: 0 },
  '-x': { x: -1, y: 0, z: 0 },
  '+y': { x: 0, y: 1, z: 0 },
  '-y': { x: 0, y: -1, z: 0 },
};

const SOLIDO: Material = { tipo: 'solido' };

function f(pts: Vec3[], material: Material = SOLIDO): Face {
  return { pts, material };
}

/** Caixa sem a face de baixo (nunca aparece). */
export function caixa(r: Pegada, z0: number, z1: number, material: Material = SOLIDO): Parte {
  const { x0, y0, x1, y1 } = r;
  return parte([
    f(
      [
        { x: x0, y: y0, z: z1 },
        { x: x1, y: y0, z: z1 },
        { x: x1, y: y1, z: z1 },
        { x: x0, y: y1, z: z1 },
      ],
      material,
    ),
    f(
      [
        { x: x1, y: y0, z: z0 },
        { x: x1, y: y1, z: z0 },
        { x: x1, y: y1, z: z1 },
        { x: x1, y: y0, z: z1 },
      ],
      material,
    ),
    f(
      [
        { x: x0, y: y0, z: z0 },
        { x: x0, y: y1, z: z0 },
        { x: x0, y: y1, z: z1 },
        { x: x0, y: y0, z: z1 },
      ],
      material,
    ),
    f(
      [
        { x: x0, y: y1, z: z0 },
        { x: x1, y: y1, z: z0 },
        { x: x1, y: y1, z: z1 },
        { x: x0, y: y1, z: z1 },
      ],
      material,
    ),
    f(
      [
        { x: x0, y: y0, z: z0 },
        { x: x1, y: y0, z: z0 },
        { x: x1, y: y0, z: z1 },
        { x: x0, y: y0, z: z1 },
      ],
      material,
    ),
  ]);
}

/** Telhado de duas águas sobre `r`, com a cumeeira correndo ao longo do eixo dado. */
export function telhadoDuasAguas(
  r: Pegada,
  z0: number,
  altura: number,
  cumeeira: 'x' | 'y',
): Parte {
  const { x0, y0, x1, y1 } = r;
  const zc = z0 + altura;
  if (cumeeira === 'x') {
    const ym = (y0 + y1) / 2;
    return parte([
      f([
        { x: x0, y: y0, z: z0 },
        { x: x1, y: y0, z: z0 },
        { x: x1, y: ym, z: zc },
        { x: x0, y: ym, z: zc },
      ]),
      f([
        { x: x0, y: y1, z: z0 },
        { x: x1, y: y1, z: z0 },
        { x: x1, y: ym, z: zc },
        { x: x0, y: ym, z: zc },
      ]),
      f([
        { x: x0, y: y0, z: z0 },
        { x: x0, y: y1, z: z0 },
        { x: x0, y: ym, z: zc },
      ]),
      f([
        { x: x1, y: y0, z: z0 },
        { x: x1, y: y1, z: z0 },
        { x: x1, y: ym, z: zc },
      ]),
    ]);
  }
  const xm = (x0 + x1) / 2;
  return parte([
    f([
      { x: x0, y: y0, z: z0 },
      { x: x0, y: y1, z: z0 },
      { x: xm, y: y1, z: zc },
      { x: xm, y: y0, z: zc },
    ]),
    f([
      { x: x1, y: y0, z: z0 },
      { x: x1, y: y1, z: z0 },
      { x: xm, y: y1, z: zc },
      { x: xm, y: y0, z: zc },
    ]),
    f([
      { x: x0, y: y0, z: z0 },
      { x: x1, y: y0, z: z0 },
      { x: xm, y: y0, z: zc },
    ]),
    f([
      { x: x0, y: y1, z: z0 },
      { x: x1, y: y1, z: z0 },
      { x: xm, y: y1, z: zc },
    ]),
  ]);
}

/** Telhado de quatro águas (vira pirâmide quando a base é quadrada). */
export function telhadoQuatroAguas(r: Pegada, z0: number, altura: number): Parte {
  const { x0, y0, x1, y1 } = r;
  const zc = z0 + altura;
  const largura = x1 - x0;
  const fundo = y1 - y0;
  const meio = Math.min(largura, fundo) / 2;
  const xm = (x0 + x1) / 2;
  const ym = (y0 + y1) / 2;
  // Cumeeira ao longo do lado mais comprido, recuada meio lado curto de cada ponta.
  const a: Vec3 =
    largura >= fundo ? { x: x0 + meio, y: ym, z: zc } : { x: xm, y: y0 + meio, z: zc };
  const b: Vec3 =
    largura >= fundo ? { x: x1 - meio, y: ym, z: zc } : { x: xm, y: y1 - meio, z: zc };
  const c00 = { x: x0, y: y0, z: z0 };
  const c10 = { x: x1, y: y0, z: z0 };
  const c11 = { x: x1, y: y1, z: z0 };
  const c01 = { x: x0, y: y1, z: z0 };
  const semRepetir = (pts: Vec3[]) =>
    pts.filter((p, i) => {
      const q = pts[(i + 1) % pts.length]!;
      return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) > 1e-9;
    });
  if (largura >= fundo) {
    return parte([
      f(semRepetir([c00, c10, b, a])),
      f(semRepetir([c01, c11, b, a])),
      f([c00, c01, a]),
      f([c10, c11, b]),
    ]);
  }
  return parte([
    f(semRepetir([c00, c01, b, a])),
    f(semRepetir([c10, c11, b, a])),
    f([c00, c10, a]),
    f([c01, c11, b]),
  ]);
}

function anel(cx: number, cy: number, raio: number, lados: number, z: number): Vec3[] {
  // Começa meio passo girado para ter faces retas voltadas para ±x e ±y quando lados = 4k.
  return Array.from({ length: lados }, (_, i) => {
    const t = ((i + 0.5) / lados) * Math.PI * 2;
    return { x: cx + raio * Math.cos(t), y: cy + raio * Math.sin(t), z };
  });
}

/** Prisma de base regular (cilindro low-poly). */
export function prisma(
  cx: number,
  cy: number,
  raio: number,
  lados: number,
  z0: number,
  z1: number,
  material: Material = SOLIDO,
): Parte {
  const baixo = anel(cx, cy, raio, lados, z0);
  const alto = anel(cx, cy, raio, lados, z1);
  const faces: Face[] = [f(alto, material)];
  for (let i = 0; i < lados; i++) {
    const j = (i + 1) % lados;
    faces.push(f([baixo[i]!, baixo[j]!, alto[j]!, alto[i]!], material));
  }
  return parte(faces);
}

/** Cone de base regular (chapéu de bruxa, ponta de telhado). */
export function cone(
  cx: number,
  cy: number,
  raio: number,
  lados: number,
  z0: number,
  z1: number,
): Parte {
  const base = anel(cx, cy, raio, lados, z0);
  const ponta = { x: cx, y: cy, z: z1 };
  return parte(base.map((p, i) => f([p, base[(i + 1) % lados]!, ponta])));
}

/** Esfera low-poly (copa de árvore, cabeça de lençol); o raio é em tiles. */
export function esfera(
  cx: number,
  cy: number,
  cz: number,
  raio: number,
  iso: Iso,
  fatias: number,
  aneis: number,
): Parte {
  const ponto = (lat: number, lon: number): Vec3 => ({
    x: cx + raio * Math.cos(lat) * Math.cos(lon),
    y: cy + raio * Math.cos(lat) * Math.sin(lon),
    z: cz + raio * iso.zPorTile * Math.sin(lat),
  });
  const faces: Face[] = [];
  for (let a = 0; a < aneis; a++) {
    const lat0 = -Math.PI / 2 + (a / aneis) * Math.PI;
    const lat1 = -Math.PI / 2 + ((a + 1) / aneis) * Math.PI;
    for (let s = 0; s < fatias; s++) {
      const lon0 = ((s + 0.5) / fatias) * Math.PI * 2;
      const lon1 = ((s + 1.5) / fatias) * Math.PI * 2;
      if (a === 0) faces.push(f([ponto(lat0, 0), ponto(lat1, lon1), ponto(lat1, lon0)]));
      else if (a === aneis - 1)
        faces.push(f([ponto(lat0, lon0), ponto(lat0, lon1), ponto(lat1, 0)]));
      else
        faces.push(f([ponto(lat0, lon0), ponto(lat0, lon1), ponto(lat1, lon1), ponto(lat1, lon0)]));
    }
  }
  return parte(faces);
}

/** Ponto numa parede: `a` corre ao longo dela (y nas paredes ±x, x nas paredes ±y). */
function naParede(r: Pegada, lado: Lado, a: number, z: number, afastamento: number): Vec3 {
  switch (lado) {
    case '+x':
      return { x: r.x1 + afastamento, y: a, z };
    case '-x':
      return { x: r.x0 - afastamento, y: a, z };
    case '+y':
      return { x: a, y: r.y1 + afastamento, z };
    case '-y':
      return { x: a, y: r.y0 - afastamento, z };
  }
}

export interface Contorno {
  a: number;
  z: number;
}

export function retanguloDeParede(a0: number, a1: number, z0: number, z1: number): Contorno[] {
  return [
    { a: a0, z: z0 },
    { a: a1, z: z0 },
    { a: a1, z: z1 },
    { a: a0, z: z1 },
  ];
}

/** Retângulo com topo em arco (porta da casa grande, janela do sótão). */
export function arcoDeParede(
  a0: number,
  a1: number,
  z0: number,
  z1: number,
  iso: Iso,
  segmentos: number,
): Contorno[] {
  const raioA = (a1 - a0) / 2;
  const raioZ = raioA * iso.zPorTile;
  const am = (a0 + a1) / 2;
  const zArco = Math.max(z0, z1 - raioZ);
  const arco = Array.from({ length: segmentos - 1 }, (_, i) => {
    const t = ((i + 1) / segmentos) * Math.PI;
    return { a: am + raioA * Math.cos(t), z: zArco + raioZ * Math.sin(t) };
  });
  return [{ a: a0, z: z0 }, { a: a1, z: z0 }, { a: a1, z: zArco }, ...arco, { a: a0, z: zArco }];
}

export function decalqueNaParede(
  r: Pegada,
  lado: Lado,
  contornos: Contorno[][],
  material: Material,
  afastamento: number,
): Decalque {
  return {
    normal: NORMAL_DO_LADO[lado],
    faces: contornos.map((c) =>
      f(
        c.map((p) => naParede(r, lado, p.a, p.z, afastamento)),
        material,
      ),
    ),
  };
}

/** Friso (cinta saliente) em volta da caixa na altura `z`: frente e topo de cada lado. */
export function frisos(r: Pegada, z: number, espessura: number, saliencia: number): Decalque[] {
  const e = espessura / 2;
  const s = saliencia;
  const lados: Lado[] = ['+x', '-x', '+y', '-y'];
  return lados.map((lado) => {
    const ext: Pegada = { x0: r.x0 - s, y0: r.y0 - s, x1: r.x1 + s, y1: r.y1 + s };
    const ao = lado === '+x' || lado === '-x' ? [ext.y0, ext.y1] : [ext.x0, ext.x1];
    const frente = retanguloDeParede(ao[0]!, ao[1]!, z - e, z + e).map((p) =>
      naParede(r, lado, p.a, p.z, s),
    );
    const topo = [
      naParede(r, lado, ao[0]!, z + e, 0),
      naParede(r, lado, ao[1]!, z + e, 0),
      naParede(r, lado, ao[1]!, z + e, s),
      naParede(r, lado, ao[0]!, z + e, s),
    ];
    return {
      normal: NORMAL_DO_LADO[lado],
      faces: [f(frente), { ...f(topo), normal: { x: 0, y: 0, z: 1 } }],
    };
  });
}

/** Ponto de um perfil: `u` é a coordenada horizontal do corte (y se a extrusão corre em x). */
export interface PontoDePerfil {
  u: number;
  z: number;
}

/**
 * Prisma de perfil convexo puxado ao longo de um eixo (toldos, telhados de galpão, rampas): o
 * perfil fica no plano (u, z), com u = y quando o eixo é x e u = x quando o eixo é y.
 */
export function extrusao(
  perfil: PontoDePerfil[],
  eixo: 'x' | 'y',
  a0: number,
  a1: number,
  material: Material = SOLIDO,
): Parte {
  const ponto = (p: PontoDePerfil, a: number): Vec3 =>
    eixo === 'x' ? { x: a, y: p.u, z: p.z } : { x: p.u, y: a, z: p.z };
  const faces: Face[] = [
    f(
      perfil.map((p) => ponto(p, a0)),
      material,
    ),
    f(
      perfil.map((p) => ponto(p, a1)),
      material,
    ),
  ];
  perfil.forEach((p, i) => {
    const q = perfil[(i + 1) % perfil.length]!;
    faces.push(f([ponto(p, a0), ponto(q, a0), ponto(q, a1), ponto(p, a1)], material));
  });
  return parte(faces);
}
