import type { Face, Material, Parte, TresTons } from './geometria';
import type { Modelo } from './modelos';

/**
 * Cores alternativas das fantasias (GDD, "Álbum de Fantasias"): as cores vivas do modelo giram de
 * matiz, e os cinzas da roupa ganham um tingido leve da cor nova (o laranja do jogador girado).
 * Só personagens usam isto; o cenário continua sem cor.
 */

/** Abaixo deste croma (máximo − mínimo dos canais, 0 a 1) a cor é cinza e não gira. */
const CROMA_MINIMO = 0.12;

function canais(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hexDe(c: readonly number[]): string {
  return `#${c
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`.toUpperCase();
}

function croma(hex: string): number {
  const c = canais(hex);
  return (Math.max(...c) - Math.min(...c)) / 255;
}

function paraHsl(hex: string): [number, number, number] {
  const [r, g, b] = canais(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

function paraHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const [r, g, b] =
    hh < 1
      ? [c, x, 0]
      : hh < 2
        ? [x, c, 0]
        : hh < 3
          ? [0, c, x]
          : hh < 4
            ? [0, x, c]
            : hh < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = l - c / 2;
  return hexDe([r, g, b].map((k) => (k + m) * 255));
}

/** Gira o matiz de uma cor #RRGGBB em `graus`; cinzas ficam iguais. */
export function girarMatiz(hex: string, graus: number): string {
  if (croma(hex) < CROMA_MINIMO || graus % 360 === 0) return hex.toUpperCase();
  const [h, s, l] = paraHsl(hex);
  return paraHex(h + graus, s, l);
}

/** Tinge um cinza: multiplica pela cor da tinta numa fração (mantém o claro e o escuro). */
export function tingir(hex: string, tinta: string, fracao: number): string {
  const a = canais(hex);
  const t = canais(tinta);
  // A tinta multiplica (o cinza continua cinza-escuro ou cinza-claro) e clareia pelo brilho dela.
  const brilho = Math.max(...t) / 255 || 1;
  return hexDe(a.map((v, i) => v * (1 - fracao) + ((v * t[i]!) / 255 / brilho) * fracao));
}

export interface Pintura {
  graus: number;
  /** A cor que tinge os cinzas (o acento do jogador já girado). */
  tinta: string;
  fracao: number;
  /** Tons do sólido (a paleta do bairro), que viram tons próprios tingidos. */
  solido: TresTons;
}

function cor(hex: string, p: Pintura): string {
  return croma(hex) < CROMA_MINIMO ? tingir(hex, p.tinta, p.fracao) : girarMatiz(hex, p.graus);
}

function tons(t: TresTons, p: Pintura): TresTons {
  return {
    topo: cor(t.topo, p),
    faceEsquerda: cor(t.faceEsquerda, p),
    faceDireita: cor(t.faceDireita, p),
  };
}

function material(m: Material, p: Pintura): Material {
  switch (m.tipo) {
    case 'emissivo':
      return { ...m, cor: cor(m.cor, p) };
    case 'tom':
      return { ...m, tons: tons(m.tons, p) };
    case 'solido':
      return { tipo: 'tom', tons: tons(p.solido, p) };
    default:
      return m;
  }
}

function faces(fs: Face[], p: Pintura): Face[] {
  return fs.map((f) => ({ ...f, material: material(f.material, p) }));
}

/** O mesmo modelo pintado com a cor alternativa (as luzes que ele joga ficam como estão). */
export function comMatiz(modelo: Modelo, p: Pintura): Modelo {
  if (!p.graus) return modelo;
  const partes: Parte[] = modelo.partes.map((x) => ({
    ...x,
    faces: faces(x.faces, p),
    decalques: x.decalques.map((d) => ({ ...d, faces: faces(d.faces, p) })),
  }));
  return { ...modelo, partes };
}
