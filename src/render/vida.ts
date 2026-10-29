import type { V2 } from '../sim/geometria';

// Vida no cenário (PLANO_MUNDO_VIVO.md, passo 12): contas puras do que mexe só na tela — o vento
// das folhas e da fumaça, a fumaça subindo, o salto do gato e o voo dos morcegos. Nada daqui entra
// na simulação.

/** Sorteio pequeno e determinístico da tela (o projeto não usa `Math.random`). */
export class SorteioDaTela {
  constructor(private estado = 0x2545f491) {}

  proximo(): number {
    this.estado = (Math.imul(this.estado ^ (this.estado >>> 15), 0x2c1b3c6d) + 0x297a2d39) >>> 0;
    return this.estado / 0x100000000;
  }

  entre(a: number, b: number): number {
    return a + (b - a) * this.proximo();
  }
}

/**
 * O vento agora (tiles por segundo, no plano do mundo): sopra sempre mais ou menos do mesmo lado,
 * com rajadas lentas, para as folhas e a fumaça irem juntas.
 */
export function vento(tempoS: number, forca: number): V2 {
  const rajada = 0.6 + 0.4 * Math.sin(tempoS * 0.37) * Math.sin(tempoS * 0.11 + 1.3);
  // Sopra para a direita da tela (+x e um pouco de −y no mundo), virando devagar.
  const angulo = -0.6 + 0.35 * Math.sin(tempoS * 0.07);
  return { x: Math.cos(angulo) * forca * rajada, y: Math.sin(angulo) * forca * rajada };
}

/**
 * Um fiapo de fumaça com `t` de 0 (saiu da chaminé) a 1 (sumiu): quanto subiu (px), quanto o
 * vento levou (fração do deslocamento do vento), o tamanho e a transparência.
 */
export function fiapoDeFumaca(
  t: number,
  subidaPx: number,
): { subida: number; arrasto: number; escala: number; alfa: number } {
  const u = Math.max(0, Math.min(1, t));
  return {
    subida: subidaPx * (1 - (1 - u) ** 2),
    arrasto: u * u,
    escala: 0.5 + 1.5 * u,
    // Aparece rápido e some devagar.
    alfa: Math.min(1, u * 6) * (1 - u) ** 1.5,
  };
}

/** Salto do gato do muro: do alto (`alturaPx`) até o chão, em arco, com `t` de 0 a 1. */
export function saltoDoGato(
  t: number,
  de: V2,
  para: V2,
  alturaPx: number,
  arcoPx: number,
): { pos: V2; z: number } {
  const u = Math.max(0, Math.min(1, t));
  return {
    pos: { x: de.x + (para.x - de.x) * u, y: de.y + (para.y - de.y) * u },
    z: alturaPx * (1 - u) + arcoPx * 4 * u * (1 - u),
  };
}

/**
 * Um morcego do bando: ao longo da reta de `de` a `para` (px de tela) com `t` de 0 a 1, ondulando
 * para cima e para baixo; `fase` separa os do bando. Devolve o ponto e se a asa está aberta.
 */
export function vooDoMorcego(
  t: number,
  de: V2,
  para: V2,
  fase: number,
  tempoS: number,
): { pos: V2; asaAberta: boolean } {
  const u = Math.max(0, Math.min(1, t));
  const onda = Math.sin(u * Math.PI * 3 + fase) * 10;
  return {
    pos: { x: de.x + (para.x - de.x) * u, y: de.y + (para.y - de.y) * u + onda },
    asaAberta: Math.sin(tempoS * 18 + fase * 3) > 0,
  };
}

export { distanciaNaLinha } from '../sim/geometria';

/** Ponto a `distancia` tiles ao longo de uma linha de pontos (vai e volta nas pontas). */
export function aoLongoDaLinha(linha: readonly V2[], distancia: number): { pos: V2; dir: V2 } {
  if (linha.length < 2) return { pos: { ...(linha[0] ?? { x: 0, y: 0 }) }, dir: { x: 1, y: 0 } };
  const comps: number[] = [];
  let total = 0;
  for (let i = 0; i + 1 < linha.length; i++) {
    const c = Math.hypot(linha[i + 1]!.x - linha[i]!.x, linha[i + 1]!.y - linha[i]!.y);
    comps.push(c);
    total += c;
  }
  if (total <= 0) return { pos: { ...linha[0]! }, dir: { x: 1, y: 0 } };
  const ida = ((distancia % (2 * total)) + 2 * total) % (2 * total);
  const voltando = ida > total;
  let d = voltando ? 2 * total - ida : ida;
  for (let i = 0; i < comps.length; i++) {
    const c = comps[i]!;
    if (d <= c || i === comps.length - 1) {
      const a = linha[i]!;
      const b = linha[i + 1]!;
      const k = c > 0 ? Math.min(1, d / c) : 0;
      const dir = c > 0 ? { x: (b.x - a.x) / c, y: (b.y - a.y) / c } : { x: 1, y: 0 };
      return {
        pos: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k },
        dir: voltando ? { x: -dir.x, y: -dir.y } : dir,
      };
    }
    d -= c;
  }
  return { pos: { ...linha[0]! }, dir: { x: 1, y: 0 } };
}
