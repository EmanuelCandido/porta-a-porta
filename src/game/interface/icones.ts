import type * as Phaser from 'phaser';
import { COR } from './estilo';

// Ícones desenhados por código (regra 4), em formas chapadas como o resto do jogo. Cada função
// desenha centrada em (cx, cy) dentro de um quadrado de lado `s`.

type G = Phaser.GameObjects.Graphics;
type Desenho = (g: G, cx: number, cy: number, s: number, cor: number) => void;

function linha(g: G, x0: number, y0: number, x1: number, y1: number, esp: number, cor: number) {
  g.lineStyle(esp, cor, 1).beginPath().moveTo(x0, y0).lineTo(x1, y1).strokePath();
}

function poligono(g: G, pts: [number, number][], cor: number, alfa = 1) {
  g.fillStyle(cor, alfa).beginPath().moveTo(pts[0]![0], pts[0]![1]);
  for (const [x, y] of pts.slice(1)) g.lineTo(x, y);
  g.closePath().fillPath();
}

function abobora(g: G, cx: number, cy: number, r: number, cor: number) {
  g.fillStyle(cor, 1).fillEllipse(cx, cy, r * 2.2, r * 1.8);
  g.fillStyle(0x000000, 0.25).fillRect(cx - 0.5, cy - r * 0.8, 1, r * 1.6);
  g.fillStyle(COR.fantasma, 1).fillRect(cx - 1, cy - r * 1.25, 2, r * 0.5);
}

const HABILIDADES: Record<string, Desenho> = {
  /** Vassoura Disparada: a vassoura em diagonal com rastro de velocidade. */
  bruxinha_q: (g, cx, cy, s, cor) => {
    linha(g, cx - s * 0.32, cy + s * 0.3, cx + s * 0.36, cy - s * 0.36, Math.max(2, s * 0.08), cor);
    poligono(
      g,
      [
        [cx - s * 0.28, cy + s * 0.12],
        [cx - s * 0.12, cy + s * 0.28],
        [cx - s * 0.4, cy + s * 0.46],
        [cx - s * 0.46, cy + s * 0.4],
      ],
      COR.jogador,
    );
    for (const k of [0, 1, 2])
      linha(
        g,
        cx + s * (0.05 + k * 0.1),
        cy + s * (0.2 + k * 0.08),
        cx + s * (0.25 + k * 0.1),
        cy + s * (0.2 + k * 0.08),
        1.5,
        cor,
      );
  },
  /** Poção Pegajosa: frasco redondo com a gosma escorrendo. */
  bruxinha_w: (g, cx, cy, s, cor) => {
    g.fillStyle(cor, 1).fillCircle(cx, cy + s * 0.1, s * 0.27);
    g.fillStyle(COR.magia, 1).fillCircle(cx, cy + s * 0.16, s * 0.2);
    g.fillStyle(cor, 1).fillRect(cx - s * 0.07, cy - s * 0.32, s * 0.14, s * 0.22);
    g.fillStyle(COR.jogador, 1).fillRect(cx - s * 0.1, cy - s * 0.4, s * 0.2, s * 0.08);
    g.fillStyle(COR.magia, 1).fillCircle(cx + s * 0.3, cy + s * 0.38, s * 0.06);
  },
  /** Salto de Vassoura: duas setas de avanço. */
  bruxinha_e: (g, cx, cy, s, cor) => {
    for (const [dx, c] of [
      [-0.18, cor],
      [0.12, COR.jogador],
    ] as const) {
      poligono(
        g,
        [
          [cx + s * (dx - 0.12), cy - s * 0.3],
          [cx + s * (dx + 0.12), cy],
          [cx + s * (dx - 0.12), cy + s * 0.3],
          [cx + s * (dx - 0.02), cy],
        ],
        c,
      );
    }
  },
  /** Chuva de Abóboras: três abóboras caindo. */
  bruxinha_r: (g, cx, cy, s, cor) => {
    abobora(g, cx - s * 0.22, cy - s * 0.18, s * 0.12, COR.jogador);
    abobora(g, cx + s * 0.18, cy - s * 0.02, s * 0.14, COR.jogador);
    abobora(g, cx - s * 0.06, cy + s * 0.26, s * 0.12, COR.jogador);
    for (const [x, y] of [
      [-0.22, -0.42],
      [0.18, -0.3],
      [-0.06, 0.0],
    ] as const)
      linha(g, cx + s * x, cy + s * y, cx + s * x, cy + s * (y + 0.12), 1.5, cor);
  },
};

/** Fantasma, Esqueleto e Vampirinho: um desenho por habilidade, no mesmo traço da Bruxinha. */
const HABILIDADES_NOVAS: Record<string, Desenho> = {
  /** Arranhão Gélido: três riscos de garra. */
  fantasma_q: (g, cx, cy, s, cor) => {
    for (const dx of [-0.2, 0, 0.2])
      linha(
        g,
        cx + s * (dx - 0.12),
        cy + s * 0.34,
        cx + s * (dx + 0.12),
        cy - s * 0.34,
        Math.max(2, s * 0.08),
        cor,
      );
    g.fillStyle(COR.fantasma, 1).fillCircle(cx + s * 0.3, cy - s * 0.32, s * 0.06);
  },
  /** Atravessar: a seta passando através de uma parede. */
  fantasma_w: (g, cx, cy, s, cor) => {
    g.fillStyle(cor, 0.45).fillRect(cx - s * 0.06, cy - s * 0.36, s * 0.12, s * 0.72);
    linha(g, cx - s * 0.4, cy, cx + s * 0.22, cy, Math.max(2, s * 0.08), COR.fantasma);
    poligono(
      g,
      [
        [cx + s * 0.4, cy],
        [cx + s * 0.18, cy - s * 0.16],
        [cx + s * 0.18, cy + s * 0.16],
      ],
      COR.fantasma,
    );
  },
  /** Lençol: um fantasminha meio transparente. */
  fantasma_e: (g, cx, cy, s, cor) => {
    g.fillStyle(cor, 0.5).fillCircle(cx, cy - s * 0.08, s * 0.24);
    g.fillStyle(cor, 0.5).fillRect(cx - s * 0.24, cy - s * 0.08, s * 0.48, s * 0.36);
    g.fillStyle(COR.jogador, 1)
      .fillRect(cx - s * 0.12, cy - s * 0.1, s * 0.07, s * 0.08)
      .fillRect(cx + s * 0.05, cy - s * 0.1, s * 0.07, s * 0.08);
  },
  /** Assombração: a mira no alvo e o fantasma surgindo atrás. */
  fantasma_r: (g, cx, cy, s, cor) => {
    g.fillStyle(COR.fantasma, 0.85).fillCircle(cx + s * 0.18, cy - s * 0.12, s * 0.16);
    g.lineStyle(Math.max(2, s * 0.06), cor, 1).strokeCircle(cx - s * 0.08, cy + s * 0.06, s * 0.24);
    linha(g, cx - s * 0.08, cy - s * 0.26, cx - s * 0.08, cy + s * 0.38, 1.5, cor);
    linha(g, cx - s * 0.4, cy + s * 0.06, cx + s * 0.24, cy + s * 0.06, 1.5, cor);
  },
  /** Soco de Osso: um osso e a estrela do impacto. */
  esqueleto_q: (g, cx, cy, s, cor) => {
    linha(g, cx - s * 0.32, cy + s * 0.22, cx + s * 0.1, cy - s * 0.12, Math.max(3, s * 0.12), cor);
    g.fillStyle(cor, 1)
      .fillCircle(cx - s * 0.36, cy + s * 0.18, s * 0.07)
      .fillCircle(cx - s * 0.28, cy + s * 0.28, s * 0.07);
    estrela(g, cx + s * 0.22, cy - s * 0.22, s * 0.18, 5, COR.jogador, 0.45);
  },
  /** Escudo de Costelas: o escudo com as costelas. */
  esqueleto_w: (g, cx, cy, s, cor) => {
    poligono(
      g,
      [
        [cx - s * 0.32, cy - s * 0.34],
        [cx + s * 0.32, cy - s * 0.34],
        [cx + s * 0.28, cy + s * 0.1],
        [cx, cy + s * 0.4],
        [cx - s * 0.28, cy + s * 0.1],
      ],
      cor,
    );
    for (const k of [-0.18, -0.04, 0.1])
      g.fillStyle(COR.placa, 1).fillRect(cx - s * 0.2, cy + s * k, s * 0.4, s * 0.05);
    g.fillStyle(COR.placa, 1).fillRect(cx - s * 0.025, cy - s * 0.28, s * 0.05, s * 0.5);
  },
  /** Investida: o ombro avançando com as linhas de velocidade. */
  esqueleto_e: (g, cx, cy, s, cor) => {
    poligono(
      g,
      [
        [cx - s * 0.06, cy - s * 0.3],
        [cx + s * 0.38, cy],
        [cx - s * 0.06, cy + s * 0.3],
      ],
      cor,
    );
    for (const [y, w] of [
      [-0.16, 0.3],
      [0, 0.4],
      [0.16, 0.3],
    ] as const)
      linha(g, cx - s * 0.12 - s * w, cy + s * y, cx - s * 0.14, cy + s * y, 1.5, COR.jogador);
  },
  /** Ossuário: o anel de ossos. */
  esqueleto_r: (g, cx, cy, s, cor) => {
    g.lineStyle(Math.max(2, s * 0.05), COR.jogador, 0.8).strokeCircle(cx, cy, s * 0.32);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const x = cx + Math.cos(a) * s * 0.32;
      const y = cy + Math.sin(a) * s * 0.32;
      linha(
        g,
        x - Math.sin(a) * s * 0.08,
        y + Math.cos(a) * s * 0.08,
        x + Math.sin(a) * s * 0.08,
        y - Math.cos(a) * s * 0.08,
        Math.max(2, s * 0.07),
        cor,
      );
    }
  },
  /** Mordida: a boca com as duas presas. */
  vampirinho_q: (g, cx, cy, s, cor) => {
    g.lineStyle(Math.max(2, s * 0.07), cor, 1)
      .beginPath()
      .arc(cx, cy - s * 0.1, s * 0.3, 0.15 * Math.PI, 0.85 * Math.PI)
      .strokePath();
    poligono(
      g,
      [
        [cx - s * 0.18, cy + s * 0.08],
        [cx - s * 0.06, cy + s * 0.08],
        [cx - s * 0.12, cy + s * 0.34],
      ],
      cor,
    );
    poligono(
      g,
      [
        [cx + s * 0.06, cy + s * 0.08],
        [cx + s * 0.18, cy + s * 0.08],
        [cx + s * 0.12, cy + s * 0.34],
      ],
      cor,
    );
    g.fillStyle(COR.jogador, 1).fillCircle(cx + s * 0.12, cy + s * 0.4, s * 0.04);
  },
  /** Capa de Morcego: um morcego de asas abertas. */
  vampirinho_w: (g, cx, cy, s, cor) => {
    poligono(
      g,
      [
        [cx - s * 0.44, cy - s * 0.1],
        [cx - s * 0.2, cy - s * 0.04],
        [cx - s * 0.08, cy - s * 0.16],
        [cx, cy - s * 0.06],
        [cx + s * 0.08, cy - s * 0.16],
        [cx + s * 0.2, cy - s * 0.04],
        [cx + s * 0.44, cy - s * 0.1],
        [cx + s * 0.3, cy + s * 0.12],
        [cx + s * 0.14, cy + s * 0.06],
        [cx, cy + s * 0.2],
        [cx - s * 0.14, cy + s * 0.06],
        [cx - s * 0.3, cy + s * 0.12],
      ],
      cor,
    );
    g.fillStyle(COR.jogador, 1)
      .fillRect(cx - s * 0.05, cy - s * 0.04, s * 0.03, s * 0.03)
      .fillRect(cx + s * 0.02, cy - s * 0.04, s * 0.03, s * 0.03);
  },
  /** Névoa: a nuvem baixa. */
  vampirinho_e: (g, cx, cy, s, cor) => {
    g.fillStyle(cor, 0.55)
      .fillEllipse(cx - s * 0.16, cy + s * 0.08, s * 0.44, s * 0.3)
      .fillEllipse(cx + s * 0.16, cy + s * 0.06, s * 0.48, s * 0.34);
    g.fillStyle(cor, 0.75).fillEllipse(cx, cy - s * 0.06, s * 0.44, s * 0.34);
  },
  /** Banquete: a taça com a gota. */
  vampirinho_r: (g, cx, cy, s, cor) => {
    poligono(
      g,
      [
        [cx - s * 0.26, cy - s * 0.3],
        [cx + s * 0.26, cy - s * 0.3],
        [cx + s * 0.14, cy],
        [cx - s * 0.14, cy],
      ],
      cor,
    );
    g.fillStyle(cor, 1)
      .fillRect(cx - s * 0.03, cy, s * 0.06, s * 0.24)
      .fillRect(cx - s * 0.16, cy + s * 0.24, s * 0.32, s * 0.06);
    g.fillStyle(COR.jogador, 1).fillRect(cx - s * 0.2, cy - s * 0.26, s * 0.4, s * 0.1);
  },
};

const POR_FORMA: Record<string, Desenho> = {
  linha: (g, cx, cy, s, cor) => {
    linha(g, cx - s * 0.36, cy + s * 0.18, cx + s * 0.2, cy - s * 0.1, Math.max(2, s * 0.08), cor);
    poligono(
      g,
      [
        [cx + s * 0.38, cy - s * 0.2],
        [cx + s * 0.12, cy - s * 0.22],
        [cx + s * 0.24, cy + s * 0.02],
      ],
      cor,
    );
  },
  area: (g, cx, cy, s, cor) => {
    g.lineStyle(2, cor, 1).strokeCircle(cx, cy, s * 0.34);
    g.fillStyle(cor, 0.5).fillCircle(cx, cy, s * 0.2);
  },
  cone: (g, cx, cy, s, cor) =>
    poligono(
      g,
      [
        [cx - s * 0.36, cy],
        [cx + s * 0.36, cy - s * 0.3],
        [cx + s * 0.36, cy + s * 0.3],
      ],
      cor,
    ),
  dash: (g, cx, cy, s, cor) => HABILIDADES['bruxinha_e']!(g, cx, cy, s, cor),
  alvo: (g, cx, cy, s, cor) => {
    g.lineStyle(2, cor, 1).strokeCircle(cx, cy, s * 0.26);
    linha(g, cx - s * 0.42, cy, cx - s * 0.12, cy, 2, cor);
    linha(g, cx + s * 0.12, cy, cx + s * 0.42, cy, 2, cor);
    linha(g, cx, cy - s * 0.42, cx, cy - s * 0.12, 2, cor);
    linha(g, cx, cy + s * 0.12, cx, cy + s * 0.42, 2, cor);
  },
};

export function iconeHabilidade(
  g: G,
  id: string,
  forma: string,
  cx: number,
  cy: number,
  s: number,
  cor: number,
): void {
  (HABILIDADES[id] ?? HABILIDADES_NOVAS[id] ?? POR_FORMA[forma] ?? POR_FORMA['alvo']!)(
    g,
    cx,
    cy,
    s,
    cor,
  );
}

/** Estrela de `n` pontas (faíscas, explosões, atordoamento). */
function estrela(g: G, cx: number, cy: number, r: number, n: number, cor: number, miolo = 0.45) {
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const rr = i % 2 === 0 ? r : r * miolo;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  poligono(g, pts, cor);
}

const EVOLUCOES: Record<string, Desenho> = {
  /** Ricochete: o caminho em zigue-zague, com a ponta no fim. */
  ricochete: (g, cx, cy, s, cor) => {
    const e = Math.max(2, s * 0.08);
    const p: [number, number][] = [
      [-0.4, 0.3],
      [-0.12, -0.2],
      [0.1, 0.22],
      [0.36, -0.28],
    ];
    for (let i = 0; i < p.length - 1; i++)
      linha(
        g,
        cx + s * p[i]![0],
        cy + s * p[i]![1],
        cx + s * p[i + 1]![0],
        cy + s * p[i + 1]![1],
        e,
        cor,
      );
    poligono(
      g,
      [
        [cx + s * 0.44, cy - s * 0.42],
        [cx + s * 0.22, cy - s * 0.32],
        [cx + s * 0.42, cy - s * 0.14],
      ],
      cor,
    );
    for (const [x, y] of p.slice(1, 3))
      g.fillStyle(COR.jogador, 1).fillCircle(cx + s * x, cy + s * y, s * 0.08);
  },
  /** Vassoura Pesada: uma seta grossa atravessando dois alvos. */
  vassoura_pesada: (g, cx, cy, s, cor) => {
    g.fillStyle(COR.jogador, 1)
      .fillCircle(cx - s * 0.12, cy, s * 0.13)
      .fillCircle(cx + s * 0.16, cy, s * 0.13);
    linha(g, cx - s * 0.44, cy, cx + s * 0.28, cy, Math.max(3, s * 0.13), cor);
    poligono(
      g,
      [
        [cx + s * 0.46, cy],
        [cx + s * 0.22, cy - s * 0.18],
        [cx + s * 0.22, cy + s * 0.18],
      ],
      cor,
    );
  },
  /** Poção Explosiva: a estrela da explosão com o miolo roxo. */
  pocao_explosiva: (g, cx, cy, s, cor) => {
    estrela(g, cx, cy, s * 0.44, 8, cor, 0.5);
    g.fillStyle(COR.magia, 1).fillCircle(cx, cy, s * 0.16);
  },
  /** Poção Grudenta: a gota que escorre e prende no chão. */
  pocao_grudenta: (g, cx, cy, s, cor) => {
    g.fillStyle(COR.magia, 1).fillEllipse(cx, cy - s * 0.12, s * 0.62, s * 0.36);
    for (const dx of [-0.2, 0, 0.2])
      linha(
        g,
        cx + s * dx,
        cy - s * 0.04,
        cx + s * dx,
        cy + s * 0.3,
        Math.max(2, s * 0.07),
        COR.magia,
      );
    linha(g, cx - s * 0.4, cy + s * 0.36, cx + s * 0.4, cy + s * 0.36, Math.max(2, s * 0.07), cor);
  },
  /** Rastro de Faíscas: o caminho tracejado com faíscas. */
  rastro_de_faiscas: (g, cx, cy, s, cor) => {
    for (let k = 0; k < 4; k++) {
      const t0 = -0.42 + k * 0.22;
      linha(
        g,
        cx + s * t0,
        cy + s * -t0 * 0.6,
        cx + s * (t0 + 0.12),
        cy - s * (t0 + 0.12) * 0.6,
        Math.max(2, s * 0.07),
        cor,
      );
    }
    estrela(g, cx - s * 0.12, cy - s * 0.24, s * 0.14, 4, COR.jogador, 0.35);
    estrela(g, cx + s * 0.22, cy + s * 0.18, s * 0.12, 4, COR.jogador, 0.35);
  },
  /** Pouso Leve: uma pena caindo. */
  pouso_leve: (g, cx, cy, s, cor) => {
    poligono(
      g,
      [
        [cx + s * 0.34, cy - s * 0.4],
        [cx + s * 0.18, cy + s * 0.04],
        [cx - s * 0.18, cy + s * 0.3],
        [cx - s * 0.1, cy - s * 0.06],
      ],
      cor,
    );
    linha(
      g,
      cx + s * 0.3,
      cy - s * 0.34,
      cx - s * 0.36,
      cy + s * 0.42,
      Math.max(1.5, s * 0.05),
      COR.jogador,
    );
  },
  /** Tempestade: cinco abóboras em volta da mira. */
  tempestade: (g, cx, cy, s, cor) => {
    g.lineStyle(Math.max(1.5, s * 0.05), cor, 1).strokeCircle(cx, cy, s * 0.12);
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k * Math.PI * 2) / 5;
      abobora(g, cx + Math.cos(a) * s * 0.32, cy + Math.sin(a) * s * 0.32, s * 0.09, COR.jogador);
    }
  },
  /** Abóbora Gigante: uma abóbora grande e as estrelas do atordoamento. */
  abobora_gigante: (g, cx, cy, s, cor) => {
    abobora(g, cx, cy + s * 0.1, s * 0.26, COR.jogador);
    estrela(g, cx - s * 0.3, cy - s * 0.32, s * 0.1, 4, cor, 0.4);
    estrela(g, cx, cy - s * 0.4, s * 0.1, 4, cor, 0.4);
    estrela(g, cx + s * 0.3, cy - s * 0.32, s * 0.1, 4, cor, 0.4);
  },
};

/** Ícone de uma evolução (o selo no botão e a carta da escolha); sem desenho, um losango. */
export function iconeEvolucao(
  g: G,
  id: string,
  cx: number,
  cy: number,
  s: number,
  cor: number,
): void {
  const d = EVOLUCOES[id];
  if (d) {
    d(g, cx, cy, s, cor);
    return;
  }
  poligono(
    g,
    [
      [cx, cy - s * 0.36],
      [cx + s * 0.36, cy],
      [cx, cy + s * 0.36],
      [cx - s * 0.36, cy],
    ],
    COR.magia,
  );
}

/** Passivas: o Caldeirão da Bruxinha; as outras caem num símbolo genérico. */
export function iconePassiva(
  g: G,
  campeao: string,
  cx: number,
  cy: number,
  s: number,
  cor: number,
): void {
  if (campeao === 'fantasma') {
    // Arrepio: o fantasma e o tremor do susto.
    g.fillStyle(cor, 1)
      .fillCircle(cx, cy - s * 0.04, s * 0.22)
      .fillRect(cx - s * 0.22, cy - s * 0.04, s * 0.44, s * 0.3);
    g.fillStyle(COR.jogador, 1)
      .fillRect(cx - s * 0.1, cy - s * 0.06, s * 0.06, s * 0.08)
      .fillRect(cx + s * 0.04, cy - s * 0.06, s * 0.06, s * 0.08);
    for (const dx of [-0.38, 0.32])
      linha(g, cx + s * dx, cy - s * 0.2, cx + s * (dx + 0.06), cy + s * 0.2, 1.5, COR.fantasma);
    return;
  }
  if (campeao === 'esqueleto') {
    // Remontar: dois ossos cruzados.
    linha(g, cx - s * 0.3, cy - s * 0.3, cx + s * 0.3, cy + s * 0.3, Math.max(3, s * 0.12), cor);
    linha(g, cx + s * 0.3, cy - s * 0.3, cx - s * 0.3, cy + s * 0.3, Math.max(3, s * 0.12), cor);
    for (const [x, y] of [
      [-0.34, -0.3],
      [-0.3, -0.36],
      [0.34, 0.3],
      [0.3, 0.36],
      [0.34, -0.3],
      [0.3, -0.36],
      [-0.34, 0.3],
      [-0.3, 0.36],
    ] as const)
      g.fillStyle(cor, 1).fillCircle(cx + s * x, cy + s * y, s * 0.06);
    return;
  }
  if (campeao === 'vampirinho') {
    // Sede: a gota.
    poligono(
      g,
      [
        [cx, cy - s * 0.38],
        [cx + s * 0.24, cy + s * 0.04],
        [cx + s * 0.2, cy + s * 0.22],
        [cx, cy + s * 0.32],
        [cx - s * 0.2, cy + s * 0.22],
        [cx - s * 0.24, cy + s * 0.04],
      ],
      COR.jogador,
    );
    g.fillStyle(0xffffff, 0.3).fillCircle(cx - s * 0.08, cy + s * 0.08, s * 0.05);
    return;
  }
  if (campeao === 'bruxinha') {
    g.fillStyle(cor, 1).fillEllipse(cx, cy + s * 0.12, s * 0.7, s * 0.5);
    g.fillStyle(COR.placa, 1).fillRect(cx - s * 0.38, cy - s * 0.12, s * 0.76, s * 0.12);
    g.fillStyle(cor, 1).fillRect(cx - s * 0.4, cy - s * 0.16, s * 0.8, s * 0.08);
    g.fillStyle(COR.magia, 1)
      .fillCircle(cx - s * 0.12, cy - s * 0.28, s * 0.07)
      .fillCircle(cx + s * 0.08, cy - s * 0.36, s * 0.05)
      .fillCircle(cx + s * 0.16, cy - s * 0.24, s * 0.04);
    return;
  }
  poligono(
    g,
    [
      [cx, cy - s * 0.38],
      [cx + s * 0.32, cy],
      [cx, cy + s * 0.38],
      [cx - s * 0.32, cy],
    ],
    cor,
  );
}

/** Retrato do campeão: rosto em bloco e a silhueta da fantasia, olhos na cor do jogador. */
export function retrato(g: G, campeao: string, cx: number, cy: number, s: number): void {
  const pele = 0x6b6c76;
  const escuro = 0x2c2d33;
  // Gola da fantasia e a cabeça redonda.
  poligono(
    g,
    [
      [cx - s * 0.3, cy + s * 0.46],
      [cx + s * 0.3, cy + s * 0.46],
      [cx + s * 0.18, cy + s * 0.3],
      [cx - s * 0.18, cy + s * 0.3],
    ],
    escuro,
  );
  g.fillStyle(pele, 1).fillCircle(cx, cy + s * 0.12, s * 0.21);
  g.fillStyle(0xffffff, 0.12).fillCircle(cx - s * 0.06, cy + s * 0.06, s * 0.1);
  if (campeao === 'bruxinha') {
    // Aba larga e o cone torto do chapéu, com a faixa laranja.
    g.fillStyle(escuro, 1).fillEllipse(cx, cy - s * 0.04, s * 0.78, s * 0.16);
    poligono(
      g,
      [
        [cx - s * 0.22, cy - s * 0.06],
        [cx + s * 0.22, cy - s * 0.06],
        [cx + s * 0.16, cy - s * 0.3],
        [cx + s * 0.3, cy - s * 0.46],
        [cx + s * 0.02, cy - s * 0.34],
      ],
      escuro,
    );
    g.fillStyle(COR.jogador, 1).fillRect(cx - s * 0.2, cy - s * 0.12, s * 0.4, s * 0.05);
  } else if (campeao === 'fantasma') {
    // O lençol cobrindo a cabeça e caindo sobre a gola.
    const lencol = 0xb4b6bf;
    g.fillStyle(lencol, 1).fillCircle(cx, cy + s * 0.06, s * 0.27);
    poligono(
      g,
      [
        [cx - s * 0.27, cy + s * 0.06],
        [cx + s * 0.27, cy + s * 0.06],
        [cx + s * 0.32, cy + s * 0.46],
        [cx - s * 0.32, cy + s * 0.46],
      ],
      lencol,
    );
    g.fillStyle(0xffffff, 0.18).fillCircle(cx - s * 0.08, cy - s * 0.04, s * 0.1);
  } else if (campeao === 'esqueleto') {
    // Caveira clara, órbitas fundas e a fileira de dentes.
    const osso = 0xc9cad1;
    g.fillStyle(osso, 1).fillCircle(cx, cy + s * 0.08, s * 0.24);
    g.fillStyle(osso, 1).fillRect(cx - s * 0.13, cy + s * 0.22, s * 0.26, s * 0.12);
    g.fillStyle(escuro, 1)
      .fillCircle(cx - s * 0.08, cy + s * 0.13, s * 0.065)
      .fillCircle(cx + s * 0.08, cy + s * 0.13, s * 0.065);
    for (let k = 0; k < 4; k++)
      g.fillStyle(escuro, 1).fillRect(
        cx - s * 0.1 + k * s * 0.06,
        cy + s * 0.28,
        s * 0.025,
        s * 0.06,
      );
  } else if (campeao === 'vampirinho') {
    // Gola alta da capa, cabelo penteado em bico.
    poligono(
      g,
      [
        [cx - s * 0.34, cy + s * 0.46],
        [cx - s * 0.3, cy - s * 0.02],
        [cx - s * 0.18, cy + s * 0.28],
      ],
      escuro,
    );
    poligono(
      g,
      [
        [cx + s * 0.34, cy + s * 0.46],
        [cx + s * 0.3, cy - s * 0.02],
        [cx + s * 0.18, cy + s * 0.28],
      ],
      escuro,
    );
    poligono(
      g,
      [
        [cx - s * 0.22, cy + s * 0.02],
        [cx + s * 0.22, cy + s * 0.02],
        [cx + s * 0.16, cy - s * 0.12],
        [cx, cy - s * 0.1],
        [cx - s * 0.16, cy - s * 0.12],
      ],
      escuro,
    );
    poligono(
      g,
      [
        [cx - s * 0.05, cy + s * 0.0],
        [cx + s * 0.05, cy + s * 0.0],
        [cx, cy + s * 0.08],
      ],
      escuro,
    );
  }
  // Olhos acesos na cor do jogador.
  g.fillStyle(COR.jogador, 1)
    .fillRect(cx - s * 0.11, cy + s * 0.1, s * 0.07, s * 0.08)
    .fillRect(cx + s * 0.04, cy + s * 0.1, s * 0.07, s * 0.08);
}

/** Fantasia ainda trancada: a mesma silhueta do retrato, toda escura, com um "?" no rosto. */
export function silhueta(g: G, cx: number, cy: number, s: number): void {
  const escuro = 0x1b1c21;
  poligono(
    g,
    [
      [cx - s * 0.3, cy + s * 0.46],
      [cx + s * 0.3, cy + s * 0.46],
      [cx + s * 0.18, cy + s * 0.3],
      [cx - s * 0.18, cy + s * 0.3],
    ],
    escuro,
  );
  g.fillStyle(escuro, 1).fillCircle(cx, cy + s * 0.12, s * 0.21);
  g.fillStyle(escuro, 1).fillEllipse(cx, cy - s * 0.12, s * 0.5, s * 0.34);
}

/** Cadeado das fantasias trancadas. */
export function iconeCadeado(g: G, cx: number, cy: number, s: number, cor: number): void {
  g.lineStyle(Math.max(2, s * 0.1), cor, 1)
    .beginPath()
    .arc(cx, cy - s * 0.08, s * 0.22, Math.PI, 0)
    .strokePath();
  g.fillStyle(cor, 1).fillRect(cx - s * 0.32, cy - s * 0.08, s * 0.64, s * 0.46);
  g.fillStyle(COR.placa, 1).fillRect(cx - s * 0.05, cy + s * 0.06, s * 0.1, s * 0.18);
}

const ITENS: Record<string, Desenho> = {
  chapeu_pontudo: (g, cx, cy, s, cor) => {
    g.fillStyle(cor, 1).fillRect(cx - s * 0.36, cy + s * 0.18, s * 0.72, s * 0.08);
    poligono(
      g,
      [
        [cx - s * 0.2, cy + s * 0.18],
        [cx + s * 0.2, cy + s * 0.18],
        [cx + s * 0.08, cy - s * 0.38],
      ],
      cor,
    );
  },
  taco_de_beisebol: (g, cx, cy, s, cor) =>
    linha(g, cx - s * 0.3, cy + s * 0.3, cx + s * 0.3, cy - s * 0.3, Math.max(3, s * 0.16), cor),
  capa_grossa: (g, cx, cy, s, cor) =>
    poligono(
      g,
      [
        [cx - s * 0.16, cy - s * 0.3],
        [cx + s * 0.16, cy - s * 0.3],
        [cx + s * 0.34, cy + s * 0.32],
        [cx - s * 0.34, cy + s * 0.32],
      ],
      cor,
    ),
  tenis_de_luzinha: (g, cx, cy, s, cor) => {
    g.fillStyle(cor, 1)
      .fillRect(cx - s * 0.32, cy, s * 0.64, s * 0.16)
      .fillRect(cx - s * 0.32, cy - s * 0.2, s * 0.24, s * 0.22);
    g.fillStyle(COR.doce, 1).fillRect(cx - s * 0.3, cy + s * 0.12, s * 0.14, s * 0.06);
  },
  ampulheta: (g, cx, cy, s, cor) => {
    poligono(
      g,
      [
        [cx - s * 0.24, cy - s * 0.34],
        [cx + s * 0.24, cy - s * 0.34],
        [cx, cy],
      ],
      cor,
    );
    poligono(
      g,
      [
        [cx, cy],
        [cx + s * 0.24, cy + s * 0.34],
        [cx - s * 0.24, cy + s * 0.34],
      ],
      cor,
    );
  },
  pote_de_mel: (g, cx, cy, s, cor) => {
    g.fillStyle(cor, 1).fillRect(cx - s * 0.26, cy - s * 0.18, s * 0.52, s * 0.48);
    g.fillStyle(COR.doce, 1).fillRect(cx - s * 0.22, cy, s * 0.44, s * 0.26);
  },
  pirulito: (g, cx, cy, s, cor) => {
    linha(g, cx, cy, cx, cy + s * 0.42, 2, cor);
    g.fillStyle(COR.doce, 1).fillCircle(cx, cy - s * 0.1, s * 0.26);
  },
  bala_efervescente: (g, cx, cy, s, cor) => {
    g.fillStyle(COR.magia, 1).fillEllipse(cx, cy, s * 0.4, s * 0.3);
    poligono(
      g,
      [
        [cx - s * 0.2, cy],
        [cx - s * 0.4, cy - s * 0.14],
        [cx - s * 0.4, cy + s * 0.14],
      ],
      cor,
    );
    poligono(
      g,
      [
        [cx + s * 0.2, cy],
        [cx + s * 0.4, cy - s * 0.14],
        [cx + s * 0.4, cy + s * 0.14],
      ],
      cor,
    );
  },
  doce_isca: (g, cx, cy, s) => {
    g.lineStyle(2, COR.doce, 1).strokeCircle(cx, cy, s * 0.36);
    g.fillStyle(COR.doce, 1).fillEllipse(cx, cy, s * 0.36, s * 0.26);
  },
  lanterna_de_pilha: (g, cx, cy, s, cor) => {
    g.fillStyle(cor, 1).fillRect(cx - s * 0.34, cy - s * 0.1, s * 0.44, s * 0.2);
    poligono(
      g,
      [
        [cx + s * 0.1, cy - s * 0.18],
        [cx + s * 0.3, cy - s * 0.28],
        [cx + s * 0.3, cy + s * 0.28],
        [cx + s * 0.1, cy + s * 0.18],
      ],
      COR.luz,
    );
  },
  meia_de_la: (g, cx, cy, s, cor) => {
    g.fillStyle(cor, 1)
      .fillRect(cx - s * 0.1, cy - s * 0.36, s * 0.22, s * 0.5)
      .fillRect(cx - s * 0.3, cy + s * 0.06, s * 0.42, s * 0.2);
  },
  estilingue: (g, cx, cy, s, cor) => {
    linha(g, cx, cy + s * 0.38, cx, cy, 3, cor);
    linha(g, cx, cy, cx - s * 0.24, cy - s * 0.3, 3, cor);
    linha(g, cx, cy, cx + s * 0.24, cy - s * 0.3, 3, cor);
  },
  moeda_da_sorte: (g, cx, cy, s) => {
    g.fillStyle(COR.doce, 1).fillCircle(cx, cy, s * 0.32);
    g.fillStyle(0x000000, 0.25).fillCircle(cx, cy, s * 0.18);
  },
  cachecol_listrado: (g, cx, cy, s, cor) => {
    for (let k = 0; k < 4; k++)
      g.fillStyle(k % 2 ? COR.jogador : cor, 1).fillRect(
        cx - s * 0.34 + k * s * 0.17,
        cy - s * 0.1,
        s * 0.17,
        s * 0.2,
      );
    g.fillStyle(cor, 1).fillRect(cx + s * 0.18, cy + s * 0.1, s * 0.14, s * 0.24);
  },
};

export function iconeItem(g: G, id: string, cx: number, cy: number, s: number, cor: number): void {
  const d = ITENS[id];
  if (d) return d(g, cx, cy, s, cor);
  poligono(
    g,
    [
      [cx, cy - s * 0.3],
      [cx + s * 0.3, cy],
      [cx, cy + s * 0.3],
      [cx - s * 0.3, cy],
    ],
    cor,
  );
}

/** Doce embrulhado (contador de doces). */
export function iconeDoce(g: G, cx: number, cy: number, s: number): void {
  ITENS['bala_efervescente']!(g, cx, cy, s, COR.doce);
  g.fillStyle(COR.doce, 1).fillEllipse(cx, cy, s * 0.42, s * 0.32);
}

/** Relógio da Meia-Noite com os ponteiros na hora dada ("21:40"). */
export function iconeRelogio(
  g: G,
  cx: number,
  cy: number,
  s: number,
  hora: string,
  cor: number,
): void {
  const [h, m] = hora.split(':').map(Number);
  g.lineStyle(2, cor, 1).strokeCircle(cx, cy, s * 0.42);
  for (let k = 0; k < 12; k += 3) {
    const t = (k / 12) * Math.PI * 2;
    g.fillStyle(cor, 1).fillRect(
      cx + Math.sin(t) * s * 0.32 - 1,
      cy - Math.cos(t) * s * 0.32 - 1,
      2,
      2,
    );
  }
  const angM = (((m ?? 0) / 60) * Math.PI * 2) as number;
  const angH = ((((h ?? 0) % 12) + (m ?? 0) / 60) / 12) * Math.PI * 2;
  linha(g, cx, cy, cx + Math.sin(angM) * s * 0.34, cy - Math.cos(angM) * s * 0.34, 1.5, cor);
  linha(
    g,
    cx,
    cy,
    cx + Math.sin(angH) * s * 0.22,
    cy - Math.cos(angH) * s * 0.22,
    2.5,
    COR.jogador,
  );
}

/** Lanterna (a barra de Luz). */
export function iconeLanterna(g: G, cx: number, cy: number, s: number, cor: number): void {
  g.fillStyle(cor, 1).fillRect(cx - s * 0.18, cy - s * 0.26, s * 0.36, s * 0.46);
  g.fillStyle(COR.placa, 1).fillRect(cx - s * 0.12, cy - s * 0.18, s * 0.24, s * 0.3);
  g.fillStyle(COR.luz, 1).fillRect(cx - s * 0.08, cy - s * 0.12, s * 0.16, s * 0.2);
  g.fillStyle(cor, 1).fillRect(cx - s * 0.1, cy - s * 0.36, s * 0.2, s * 0.08);
}

/** Losango do Poste Corrompido (roxo de pé, cinza caído). */
export function iconePoste(g: G, cx: number, cy: number, s: number, caido: boolean): void {
  poligono(
    g,
    [
      [cx, cy - s * 0.42],
      [cx + s * 0.26, cy],
      [cx, cy + s * 0.42],
      [cx - s * 0.26, cy],
    ],
    caido ? COR.apagado : COR.magia,
  );
  if (caido) linha(g, cx - s * 0.3, cy + s * 0.3, cx + s * 0.3, cy - s * 0.3, 2, COR.placa);
}

/** Onda de pestinhas: três ondinhas. */
export function iconeOnda(g: G, cx: number, cy: number, s: number, cor: number): void {
  for (const dy of [-0.22, 0, 0.22]) {
    g.lineStyle(2, cor, 1).beginPath();
    for (let k = 0; k <= 8; k++) {
      const x = cx - s * 0.36 + (k / 8) * s * 0.72;
      const y = cy + s * dy + Math.sin((k / 8) * Math.PI * 2) * s * 0.06;
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokePath();
  }
}

/** Pedido do morador: carta dobrada. */
export function iconePedido(g: G, cx: number, cy: number, s: number, cor: number): void {
  g.lineStyle(2, cor, 1).strokeRect(cx - s * 0.34, cy - s * 0.24, s * 0.68, s * 0.48);
  linha(g, cx - s * 0.34, cy - s * 0.24, cx, cy + s * 0.04, 1.5, cor);
  linha(g, cx + s * 0.34, cy - s * 0.24, cx, cy + s * 0.04, 1.5, cor);
}

/** Portão: grade fechada ou aberta. */
export function iconePortao(
  g: G,
  cx: number,
  cy: number,
  s: number,
  aberto: boolean,
  cor: number,
): void {
  g.fillStyle(cor, 1)
    .fillRect(cx - s * 0.36, cy - s * 0.34, s * 0.1, s * 0.68)
    .fillRect(cx + s * 0.26, cy - s * 0.34, s * 0.1, s * 0.68);
  if (aberto) {
    poligono(
      g,
      [
        [cx - s * 0.12, cy - s * 0.2],
        [cx + s * 0.14, cy],
        [cx - s * 0.12, cy + s * 0.2],
      ],
      COR.fantasma,
    );
  } else {
    for (let k = 0; k < 3; k++)
      g.fillStyle(cor, 1).fillRect(cx - s * 0.18 + k * s * 0.15, cy - s * 0.3, s * 0.05, s * 0.6);
  }
}

/** Marca de cumprido (✔) ou de falha (✘). */
export function iconeSituacao(g: G, cx: number, cy: number, s: number, ok: boolean): void {
  if (ok) {
    linha(g, cx - s * 0.3, cy, cx - s * 0.08, cy + s * 0.24, 3, COR.fantasma);
    linha(g, cx - s * 0.08, cy + s * 0.24, cx + s * 0.32, cy - s * 0.26, 3, COR.fantasma);
  } else {
    linha(g, cx - s * 0.26, cy - s * 0.26, cx + s * 0.26, cy + s * 0.26, 3, COR.perigo);
    linha(g, cx + s * 0.26, cy - s * 0.26, cx - s * 0.26, cy + s * 0.26, 3, COR.perigo);
  }
}
