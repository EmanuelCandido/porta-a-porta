import { forcarMovimento } from './mundo';
import type { Inimigos, Habilidade } from './content/esquemas';
import type { V2 } from './geometria';
import type { EstadoHabilidades } from './habilidades';
import type { Entidade, Mundo } from './mundo';

// Táticas que todo inimigo compartilha (inimigos.json → reacoes.taticas): não se amontoar, chegar
// por lados diferentes, mirar onde o jogador vai estar, desviar dos projéteis dele e sair das áreas
// que ainda vão pulsar. Tudo determinístico: os sorteios vêm do id e do tick, sem gastar o gerador
// da rua (as sementes continuam dando as mesmas ruas).

export type ConfigTaticas = Inimigos['reacoes']['taticas'];

function distancia(a: V2, b: V2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizar(v: V2): V2 {
  const n = Math.hypot(v.x, v.y);
  return n < 1e-9 ? { x: 0, y: 0 } : { x: v.x / n, y: v.y / n };
}

/** Número em [0, 1) fixo para o par (a, b): o mesmo em qualquer máquina e sem tocar no gerador. */
export function sorteioFixo(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x27d4eb2f, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Separação: cada inimigo sólido se afasta dos aliados a menos de `raio` tiles, mais forte quanto
 * mais perto. Devolve a direção já unitária (ou a original, se a soma zerar).
 */
export function separar(mundo: Mundo, e: Entidade, dir: V2, cfg: ConfigTaticas['separacao']): V2 {
  if (!e.solido || e.atravessaCorpos || (dir.x === 0 && dir.y === 0)) return dir;
  const r = cfg.raio;
  let sx = 0;
  let sy = 0;
  const area = { x0: e.pos.x - r, y0: e.pos.y - r, x1: e.pos.x + r, y1: e.pos.y + r };
  for (const o of mundo.gradeEntidades.consultar(area)) {
    if (o === e || o.tipo !== 'inimigo' || !o.solido || !o.combate || o.combate.coragem <= 0)
      continue;
    const dx = e.pos.x - o.pos.x;
    const dy = e.pos.y - o.pos.y;
    const d = Math.hypot(dx, dy);
    if (d >= r) continue;
    // Empilhados no mesmo ponto: o id decide o lado.
    if (d < 1e-6) {
      sx += e.id < o.id ? 1 : -1;
      continue;
    }
    const forca = 1 - d / r;
    sx += (dx / d) * forca;
    sy += (dy / d) * forca;
  }
  if (sx === 0 && sy === 0) return dir;
  const soma = { x: dir.x + sx * cfg.peso, y: dir.y + sy * cfg.peso };
  // Nunca vira de costas para onde queria ir: no máximo anda de lado.
  const n = normalizar(soma);
  if (n.x * dir.x + n.y * dir.y < 0)
    return normalizar({
      x: n.x - dir.x * (n.x * dir.x + n.y * dir.y),
      y: n.y - dir.y * (n.x * dir.x + n.y * dir.y),
    });
  return n.x === 0 && n.y === 0 ? dir : n;
}

/** De que lado o inimigo chega no flanco: −1, 0 ou +1, fixo pelo id. */
export function ladoDoFlanco(e: Entidade): -1 | 0 | 1 {
  return ((e.id % 3) - 1) as -1 | 0 | 1;
}

/**
 * Flanco: de longe, cada um curva para um lado (pelo id) e o grupo chega espalhado em vez de em
 * fila; de perto (`ate`), vai reto. `livre` diz se o passo à frente está livre de casas.
 */
export function flanquear(
  e: Entidade,
  alvo: V2,
  dir: V2,
  cfg: ConfigTaticas['flanco'],
  livre: (p: V2) => boolean,
): V2 {
  if (!cfg.especies.includes(e.especie)) return dir;
  const lado = ladoDoFlanco(e);
  if (lado === 0) return dir;
  const d = distancia(e.pos, alvo);
  const w =
    cfg.peso * Math.max(0, Math.min(1, (d - cfg.ate) / Math.max(1e-6, cfg.desde - cfg.ate)));
  if (w <= 0 || d > cfg.desde + 4) return dir;
  const curva = normalizar({ x: dir.x - dir.y * lado * w, y: dir.y + dir.x * lado * w });
  return livre({ x: e.pos.x + curva.x * 0.7, y: e.pos.y + curva.y * 0.7 }) ? curva : dir;
}

/** Velocidade do alvo no último tick, limitada (dash e teleporte não viram mira absurda). */
export function velocidadeDe(alvo: Entidade, dt: number): V2 {
  const v = {
    x: (alvo.pos.x - alvo.posAnterior.x) / dt,
    y: (alvo.pos.y - alvo.posAnterior.y) / dt,
  };
  const n = Math.hypot(v.x, v.y);
  const max = Math.max(alvo.velocidade, 0.1) * 1.5;
  return n > max ? { x: (v.x / n) * max, y: (v.y / n) * max } : v;
}

/** Quanto tempo a habilidade leva do pedido até acertar quem está a `d` tiles. */
export function tempoAteAcertar(h: Habilidade, d: number): number {
  const f = h.forma;
  const voo = f.tipo === 'linha' && f.velocidade > 0 ? d / f.velocidade : 0;
  return h.lancamento + voo;
}

/**
 * Mira adiantada: onde o alvo vai estar se continuar andando, numa fração `fator` (1 = previsão
 * inteira). Quem para ou muda de direção escapa, então o aviso no chão continua honesto.
 */
export function mirarAdiante(
  de: V2,
  alvo: Entidade,
  h: Habilidade | undefined,
  fator: number,
  dt: number,
): V2 {
  if (!h || fator <= 0) return { ...alvo.pos };
  const v = velocidadeDe(alvo, dt);
  const t = tempoAteAcertar(h, distancia(de, alvo.pos)) * fator;
  return { x: alvo.pos.x + v.x * t, y: alvo.pos.y + v.y * t };
}

/** O projétil passa perto de `p` nos próximos `janela` segundos? Devolve de que lado ele vem. */
function ameaca(
  p: V2,
  raio: number,
  pr: EstadoHabilidades['projeteis'][number],
  janela: number,
): V2 | null {
  const rel = { x: p.x - pr.pos.x, y: p.y - pr.pos.y };
  const ao = rel.x * pr.dir.x + rel.y * pr.dir.y;
  if (ao <= 0 || ao > Math.min(pr.restante, pr.velocidade * janela)) return null;
  const lateral = rel.x * -pr.dir.y + rel.y * pr.dir.x;
  if (Math.abs(lateral) > raio + pr.largura / 2 + 0.15) return null;
  // Desvia para o lado em que já está (no meio, para a esquerda do projétil).
  const s = lateral >= 0 ? 1 : -1;
  return { x: -pr.dir.y * s, y: pr.dir.x * s };
}

/**
 * Esquiva: um projétil do jogador vindo na direção do inimigo, com a chance da espécie, vira um
 * pulinho de lado. Cada projétil é sorteado uma vez por inimigo; depois, a recarga.
 */
export function esquivar(
  mundo: Mundo,
  e: Entidade,
  projeteis: EstadoHabilidades['projeteis'],
  cfg: ConfigTaticas['esquiva'],
  livre: (p: V2) => boolean,
): boolean {
  const chance = cfg.chance[e.especie] ?? 0;
  if (chance <= 0 || e.forcado || e.lancador?.lancando) return false;
  const ia = e.ia as { esquivaEm?: number; sorteados?: number[] } | undefined;
  if (!ia || mundo.tick < (ia.esquivaEm ?? 0)) return false;
  for (const pr of projeteis) {
    if (pr.lado === 'inimigo' || pr.golpe || pr.alvo !== null) continue;
    const lado = ameaca(e.pos, e.raio, pr, cfg.avisoS);
    if (!lado) continue;
    const vistos = (ia.sorteados ??= []);
    if (vistos.includes(pr.id)) continue;
    vistos.push(pr.id);
    if (vistos.length > 8) vistos.shift();
    if (sorteioFixo(e.id, pr.id) >= chance) continue;
    const dir = livre({ x: e.pos.x + lado.x * cfg.distancia, y: e.pos.y + lado.y * cfg.distancia })
      ? lado
      : { x: -lado.x, y: -lado.y };
    if (!forcarMovimento(e, dir, cfg.distancia, cfg.velocidade, false)) return false;
    ia.esquivaEm = mundo.tick + Math.round(cfg.recargaS / mundo.dt);
    mundo.eventos.push({ tipo: 'esquivou', id: e.id, pos: { ...e.pos } });
    return true;
  }
  return false;
}

/**
 * Áreas do jogador que ainda vão pulsar (Névoa, Chuva, Poção): quem está dentro sai pelo caminho
 * mais curto. Devolve a direção de saída, ou null se não está em nenhuma.
 */
export function saidaDeArea(
  e: Entidade,
  areas: EstadoHabilidades['areas'],
  cfg: ConfigTaticas['areas'],
): V2 | null {
  if (!cfg.especies.includes(e.especie)) return null;
  for (const a of areas) {
    if (a.lado === 'inimigo' || a.pulsosRestantes < cfg.pulsosMin || a.presa || a.segue) continue;
    const d = distancia(e.pos, a.centro);
    if (d >= a.raio + e.raio) continue;
    return d < 1e-6
      ? { x: 1, y: 0 }
      : { x: (e.pos.x - a.centro.x) / d, y: (e.pos.y - a.centro.y) / d };
  }
  return null;
}
