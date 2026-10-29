import { vivo } from './combate';
import type { Inimigos } from './content/esquemas';
import type { V2 } from './geometria';
import type { Entidade, Mundo } from './mundo';

// Cerco (docs/PLANO_MUNDO_VIVO.md, frente 4): as pestinhas perto do jogador não vêm em fila. Só
// `atacantesMax` atacam ao mesmo tempo; as outras ocupam vagas num anel em volta dele, que gira
// devagar, e esperam a vez. Quem espera mais ganha a vez de quem está atacando (rodízio), e quem
// ataca tem um pequeno bônus para não trocar a todo tick.

export type ConfigCerco = Inimigos['reacoes']['cerco'];

/**
 * O papel de uma pestinha neste tick: atacar (pelo lado marcado em `ponto`, para não chegarem todas
 * pelo mesmo lado), ou ir até um ponto do anel e esperar (null = esperar parada).
 */
export interface PapelNoCerco {
  atacar: boolean;
  ponto: V2 | null;
}

interface Plano {
  tick: number;
  papeis: Map<number, PapelNoCerco>;
}

const planos = new WeakMap<Mundo, Plano>();

function distancia(a: V2, b: V2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Diferença entre dois ângulos, de 0 a π. */
function difAngulo(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}

/** Quem entra no cerco: pestinhas acordadas, vivas e perto do jogador. */
function membros(mundo: Mundo, alvo: Entidade, cfg: ConfigCerco): Entidade[] {
  return mundo.entidades.filter(
    (e) =>
      e.tipo === 'inimigo' &&
      cfg.especies.includes(e.especie) &&
      vivo(e) &&
      !e.marcas?.adormecido &&
      distancia(e.pos, alvo.pos) <= cfg.raio,
  );
}

/** Monta o plano do tick: quem ataca (os de menor chave) e a vaga do anel de cada um dos outros. */
export function montarCerco(
  mundo: Mundo,
  alvo: Entidade,
  cfg: ConfigCerco,
): Map<number, PapelNoCerco> {
  const lista = membros(mundo, alvo, cfg).map((e) => {
    const ia = e.ia as { espera?: number; turno?: number; atacante?: boolean } | undefined;
    // Quem ataca segura a vez por `turnoS` (o bônus); depois disso, cede aos poucos.
    const turno = ia?.atacante
      ? -cfg.bonusAtacante + Math.max(0, (ia.turno ?? 0) - cfg.turnoS) * cfg.pesoEspera
      : 0;
    const chave = distancia(e.pos, alvo.pos) - (ia?.espera ?? 0) * cfg.pesoEspera + turno;
    return { e, chave };
  });
  // Empate: o id menor primeiro (o mesmo resultado em qualquer máquina).
  lista.sort((a, b) => a.chave - b.chave || a.e.id - b.e.id);
  const papeis = new Map<number, PapelNoCerco>();
  const giro = mundo.tick * mundo.dt * cfg.giroPorS;
  const livres = Array.from({ length: cfg.vagas }, (_, k) => giro + (k * Math.PI * 2) / cfg.vagas);
  // Lados de ataque: igualmente espaçados a partir de quem chega primeiro (ele vai reto).
  const n = Math.min(cfg.atacantesMax, lista.length);
  const primeira = lista[0]?.e;
  const base = primeira ? Math.atan2(primeira.pos.y - alvo.pos.y, primeira.pos.x - alvo.pos.x) : 0;
  const lados = Array.from({ length: n }, (_, k) => base + (k * Math.PI * 2) / Math.max(1, n));
  lista.forEach(({ e }, i) => {
    if (i < cfg.atacantesMax) {
      const ang = Math.atan2(e.pos.y - alvo.pos.y, e.pos.x - alvo.pos.x);
      let k = 0;
      for (let q = 1; q < lados.length; q++)
        if (difAngulo(lados[q]!, ang) < difAngulo(lados[k]!, ang)) k = q;
      const a = lados.splice(k, 1)[0] ?? ang;
      const r = cfg.encostar;
      papeis.set(e.id, {
        atacar: true,
        ponto: { x: alvo.pos.x + Math.cos(a) * r, y: alvo.pos.y + Math.sin(a) * r },
      });
      return;
    }
    // A vaga livre mais perto do ângulo em que a pestinha já está.
    const ang = Math.atan2(e.pos.y - alvo.pos.y, e.pos.x - alvo.pos.x);
    let melhor = -1;
    for (let k = 0; k < livres.length; k++) {
      if (melhor < 0 || difAngulo(livres[k]!, ang) < difAngulo(livres[melhor]!, ang)) melhor = k;
    }
    if (melhor < 0) {
      papeis.set(e.id, { atacar: false, ponto: null });
      return;
    }
    const a = livres.splice(melhor, 1)[0]!;
    papeis.set(e.id, {
      atacar: false,
      ponto: { x: alvo.pos.x + Math.cos(a) * cfg.anel, y: alvo.pos.y + Math.sin(a) * cfg.anel },
    });
  });
  return papeis;
}

/** O papel da pestinha neste tick (o plano é montado uma vez por tick e por mundo). */
export function papelNoCerco(
  mundo: Mundo,
  e: Entidade,
  alvo: Entidade,
  cfg: ConfigCerco,
): PapelNoCerco {
  let plano = planos.get(mundo);
  if (!plano || plano.tick !== mundo.tick) {
    plano = { tick: mundo.tick, papeis: montarCerco(mundo, alvo, cfg) };
    planos.set(mundo, plano);
  }
  return plano.papeis.get(e.id) ?? { atacar: true, ponto: null };
}
