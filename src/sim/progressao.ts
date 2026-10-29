import { definirModificadores, type Combatente } from './combate';
import type { Combate } from './content/esquemas';
import type { Lancador } from './habilidades';

export interface Progresso {
  nivel: number;
  xp: number;
  /** Pontos de habilidade ainda não gastos. */
  pontos: number;
  atributoPrincipal: 'forca' | 'feitico';
}

type Niveis = Combate['niveis'];

export function novoProgresso(atributoPrincipal: 'forca' | 'feitico'): Progresso {
  // O nível 1 já dá o primeiro ponto.
  return { nivel: 1, xp: 0, pontos: 1, atributoPrincipal };
}

/** XP para sair do nível `n`: 100 + 60 × (n − 1). */
export function xpParaSubir(n: number, cfg: Niveis): number {
  return cfg.xpBase + cfg.xpPorNivel * (n - 1);
}

/** XP total para chegar ao nível `n` a partir do 1 (do 1 ao 12: 4.400). */
export function xpAteNivel(n: number, cfg: Niveis): number {
  let total = 0;
  for (let k = 1; k < n; k++) total += xpParaSubir(k, cfg);
  return total;
}

/** Cada nível dá +8% de Coragem e +2 no atributo principal do campeão. */
export function aplicarBonusDeNivel(c: Combatente, p: Progresso, cfg: Niveis): void {
  const n = p.nivel - 1;
  definirModificadores(c, 'nivel', [
    { origem: 'nivel', atributo: 'coragemMax', mult: cfg.coragemPorNivel * n },
    { origem: 'nivel', atributo: p.atributoPrincipal, soma: cfg.atributoPorNivel * n },
  ]);
}

/** Soma XP; devolve quantos níveis subiu. */
export function ganharXp(p: Progresso, valor: number, cfg: Niveis): number {
  if (p.nivel >= cfg.maximo) return 0;
  p.xp += valor;
  let subiu = 0;
  while (p.nivel < cfg.maximo && p.xp >= xpParaSubir(p.nivel, cfg)) {
    p.xp -= xpParaSubir(p.nivel, cfg);
    p.nivel++;
    p.pontos++;
    subiu++;
  }
  if (p.nivel >= cfg.maximo) p.xp = 0;
  return subiu;
}

/**
 * Pode pôr um ponto nesta habilidade agora? Q, W e E vão até o posto 5; o R só sobe nos níveis 4,
 * 8 e 12 (um posto em cada).
 */
export function podeSubirPosto(l: Lancador, p: Progresso, chave: string, cfg: Niveis): boolean {
  const s = l.slots[chave];
  if (!s || p.pontos <= 0) return false;
  if (chave === 'R') {
    if (s.posto >= cfg.postoMaximoR) return false;
    const precisa = cfg.niveisDoR[s.posto];
    return precisa !== undefined && p.nivel >= precisa;
  }
  return s.posto < cfg.postoMaximo;
}

/** Gasta um ponto; devolve o novo posto (ou null se não podia). */
export function subirPosto(l: Lancador, p: Progresso, chave: string, cfg: Niveis): number | null {
  if (!podeSubirPosto(l, p, chave, cfg)) return null;
  p.pontos--;
  l.slots[chave]!.posto++;
  return l.slots[chave]!.posto;
}
