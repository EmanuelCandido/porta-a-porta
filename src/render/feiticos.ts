import type { Vec2 } from './iso';

/**
 * Geometria pura dos feitiços (docs/PLANO_MUNDO_VIVO.md, frente 3): a estrela do golpe, a vassoura
 * que voa, o arco da poção e os pontos espalhados das bolhas. A tela (`EfeitosDeCombate`) só pinta.
 */

/** Ângulo de ouro: espalha pontos num círculo sem sorteio e sem se repetir. */
const ANGULO_DE_OURO = Math.PI * (3 - Math.sqrt(5));

/** Estrela de `pontas` pontas em volta de (cx, cy), girada `angulo` radianos (px de tela). */
export function estrela(
  cx: number,
  cy: number,
  raioExterno: number,
  angulo: number,
  pontas = 4,
  fracaoInterna = 0.38,
): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < pontas * 2; i++) {
    const r = i % 2 === 0 ? raioExterno : raioExterno * fracaoInterna;
    const a = angulo + (i * Math.PI) / pontas;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

export interface MedidasDaVassoura {
  cabo: number;
  palha: number;
  larguraPalha: number;
}

/**
 * A vassoura no chão (em tiles), voando com o cabo para a frente: `cabo` é a linha da ponta até a
 * amarração, `palha` o leque que abre para trás e `amarra` a faixa entre os dois.
 */
export function vassouraVoando(
  pos: Vec2,
  dir: Vec2,
  m: MedidasDaVassoura,
): { cabo: [Vec2, Vec2]; palha: Vec2[]; amarra: [Vec2, Vec2] } {
  const n = Math.hypot(dir.x, dir.y) || 1;
  const d = { x: dir.x / n, y: dir.y / n };
  const lado = { x: -d.y, y: d.x };
  const em = (k: number, l = 0): Vec2 => ({
    x: pos.x + d.x * k + lado.x * l,
    y: pos.y + d.y * k + lado.y * l,
  });
  const ponta = em(m.cabo * 0.6);
  const amarracao = em(-m.cabo * 0.4);
  const fim = -m.cabo * 0.4 - m.palha;
  const meia = m.larguraPalha / 2;
  return {
    cabo: [ponta, amarracao],
    amarra: [em(-m.cabo * 0.4, -meia * 0.45), em(-m.cabo * 0.4, meia * 0.45)],
    palha: [
      em(-m.cabo * 0.4, -meia * 0.4),
      em(-m.cabo * 0.4, meia * 0.4),
      em(fim, meia),
      em(fim + m.palha * 0.15, 0),
      em(fim, -meia),
    ],
  };
}

/**
 * Onde a poção está no voo: no chão, a reta da mão até o alvo; no ar, uma parábola que sobe `arcoPx`
 * no meio. `t` vai de 0 (saiu da mão) a 1 (quebrou no chão).
 */
export function arcoDaPocao(
  origem: Vec2,
  destino: Vec2,
  t: number,
  arcoPx: number,
  alturaMaoPx: number,
): { chao: Vec2; zPx: number } {
  const k = Math.max(0, Math.min(1, t));
  return {
    chao: { x: origem.x + (destino.x - origem.x) * k, y: origem.y + (destino.y - origem.y) * k },
    zPx: alturaMaoPx * (1 - k) + arcoPx * 4 * k * (1 - k),
  };
}

/** O k-ésimo ponto espalhado dentro de um círculo (bolhas da poça, sementes, cacos). */
export function pontoEspalhado(centro: Vec2, raio: number, k: number, total = 16): Vec2 {
  const r = raio * Math.sqrt(((k % total) + 0.5) / total);
  const a = k * ANGULO_DE_OURO;
  return { x: centro.x + Math.cos(a) * r, y: centro.y + Math.sin(a) * r };
}

/** Direção da k-ésima de n faíscas, espalhadas em volta (com um giro para não parecer grade). */
export function direcaoDaFaisca(k: number, n: number, giro = 0): Vec2 {
  const a = giro + (k / Math.max(1, n)) * Math.PI * 2;
  return { x: Math.cos(a), y: Math.sin(a) };
}
