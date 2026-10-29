import type { Luz } from '../sim/content/esquemas';
import { voltadaParaACamera } from '../sim/geometria';
import { alcanceDoFeixe, feixeDeJanela, noFeixe, posicaoNoFeixe, type Feixe } from '../sim/luz';
import type { Iso, Vec2 } from './iso';
import type { FonteDeLuz, TipoLuz } from './modelos';
import type { Pegada } from './primitivas';

export interface LuzNoMundo {
  tipo: TipoLuz | 'pulso';
  x: number;
  y: number;
  /** Círculo: o raio da regra. Feixe: só o alcance dele, a partir do pé da abertura. */
  raio: number;
  /** Luz amiga recorta a escuridão; a do Poste Corrompido só tinge o chão de roxo. */
  recortaEscuridao: boolean;
  /** Luz de janela ou de porta: sai do pé da abertura (`x`, `y`) para um lado só. */
  feixe?: Feixe;
}

/** Como o feixe aparece na tela (content/visual.json, `luzNaTela.feixe`). */
export interface ConfigFeixe {
  /** Queda ao longo do feixe e para os lados, em frações do comprimento e da meia largura. */
  queda: Queda;
  /** Quantos tiles antes do começo a luz ainda chega (a de cima começa longe da parede). */
  suaveInicio: number;
  /** Quanto a luz de cada andar acima do térreo enfraquece (multiplica por andar). */
  forcaPorAndar: number;
}

/** O feixe da regra: cheio dentro dele e nada fora (sem a queda suave da tela). */
const FEIXE_DA_REGRA: ConfigFeixe = {
  queda: { pleno: 1, naBorda: 1, alem: 0 },
  suaveInicio: 1e-6,
  forcaPorAndar: 1,
};

export function luzesNoMundo(fontes: FonteDeLuz[], cfg: Luz): LuzNoMundo[] {
  // Janela de costas para a câmera não ilumina o chão: a luz precisa de uma fonte à vista.
  // Com `janela.iluminaChao` desligado, a janela só brilha na vidraça (sem feixe no chão).
  const vistas = fontes.filter(
    (f) =>
      f.tipo !== 'janela' ||
      (cfg.janela.iluminaChao && (!f.normal || voltadaParaACamera(f.normal))),
  );
  return vistas.map((f) => {
    switch (f.tipo) {
      case 'poste':
        return { tipo: f.tipo, x: f.x, y: f.y, raio: cfg.poste.raio, recortaEscuridao: true };
      case 'janela': {
        // Cada janela joga o próprio feixe, da parede para fora, com a largura dela.
        const n = f.normal ?? { x: 1, y: 0 };
        const feixe = feixeDeJanela(
          { nx: n.x, ny: n.y, largura: f.largura ?? 0.5, andar: f.andar ?? 0 },
          cfg.janela,
        );
        return {
          tipo: f.tipo,
          x: f.x,
          y: f.y,
          raio: alcanceDoFeixe(feixe),
          recortaEscuridao: true,
          feixe,
        };
      }
      case 'posteCorrompido':
        return {
          tipo: f.tipo,
          x: f.x,
          y: f.y,
          raio: cfg.posteCorrompido.raio,
          recortaEscuridao: false,
        };
    }
  });
}

/** Pontos do eixo do feixe por onde a pegada é testada (do começo ao fim da luz). */
const AMOSTRAS_DO_FEIXE = 6;

/**
 * Pontos da pegada para testar um feixe: o ponto dela mais perto de cada amostra do eixo (o
 * feixe é estreito e comprido; o centro só não basta para uma casa grande na frente dele).
 */
function pontosParaOFeixe(l: LuzNoMundo, f: Feixe, p: Pegada): { x: number; y: number }[] {
  return Array.from({ length: AMOSTRAS_DO_FEIXE + 1 }, (_, i) => {
    const t = f.inicio + (f.comprimento * i) / AMOSTRAS_DO_FEIXE;
    const ax = l.x + f.nx * t;
    const ay = l.y + f.ny * t;
    return {
      x: Math.max(p.x0, Math.min(ax, p.x1)) - l.x,
      y: Math.max(p.y0, Math.min(ay, p.y1)) - l.y,
    };
  });
}

/** A luz da regra toca a pegada? (círculo do poste ou feixe da janela) */
export function luzTocaPegada(l: LuzNoMundo, p: Pegada): boolean {
  if (l.feixe) {
    const f = l.feixe;
    return pontosParaOFeixe(l, f, p).some((q) => noFeixe(f, q.x, q.y));
  }
  return distanciaAte(l, p) <= l.raio;
}

/**
 * Quanto o feixe vence a escuridão no ponto a (`dx`, `dy`) tiles do pé da abertura: cheio perto
 * dela, caindo até o fim e para os lados, nada atrás da parede, e mais fraco se vem de cima.
 */
export function intensidadeDoFeixe(f: Feixe, dx: number, dy: number, c: ConfigFeixe): number {
  const frente = dx * f.nx + dy * f.ny;
  if (frente < 0) return 0;
  const { ao, lado } = posicaoNoFeixe(f, dx, dy);
  const aoLongo =
    ao >= 0 ? quedaDaLuz(ao, c.queda) : Math.max(0, 1 + (ao * f.comprimento) / c.suaveInicio);
  if (aoLongo <= 0) return 0;
  return aoLongo * quedaDaLuz(lado, c.queda) * c.forcaPorAndar ** f.andar;
}

/** Até onde (tiles do pé) o feixe ainda aparece na tela, com a queda suave. */
export function alcanceNaTela(f: Feixe, c: ConfigFeixe): number {
  const fim = (f.inicio + f.comprimento * (1 + c.queda.alem)) * 1;
  return Math.hypot(fim, (f.largura / 2 + fim * f.abertura) * (1 + c.queda.alem));
}

/** Distância (tiles) do centro da luz até o ponto mais perto da pegada (0 se está dentro). */
function distanciaAte(l: LuzNoMundo, p: Pegada): number {
  const px = Math.max(p.x0, Math.min(l.x, p.x1));
  const py = Math.max(p.y0, Math.min(l.y, p.y1));
  return Math.hypot(l.x - px, l.y - py);
}

/**
 * Como a luz cai do centro para fora, em frações do raio da regra (content/visual.json,
 * `luzNaTela.queda`): cheia até `pleno`, `naBorda` no raio da regra (ainda se vê onde ela acaba) e
 * apagada `alem` depois dele.
 */
export interface Queda {
  pleno: number;
  naBorda: number;
  alem: number;
}

function suave(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

/** Quanto a luz vence a escuridão a `d` raios do centro (1 = em cheio, 0 = escuro). */
export function quedaDaLuz(d: number, q: Queda): number {
  if (d <= q.pleno) return 1;
  if (d <= 1) return 1 + (q.naBorda - 1) * suave((d - q.pleno) / (1 - q.pleno));
  if (q.alem <= 0 || d >= 1 + q.alem) return 0;
  return q.naBorda * (1 - suave((d - 1) / q.alem));
}

/** Brilho da poça de luz no chão a `d` raios do centro: forte no pé da luz, some depois de `alem`. */
export function pocaDaLuz(d: number, q: Queda): number {
  const fim = 1 + q.alem;
  if (d >= fim) return 0;
  const t = 1 - d / fim;
  return t * t;
}

/**
 * Tint de quem está com `luz` (0 a 1): o tom do escuro na sombra, branco (sem tint) em cheio, e a
 * mistura dos dois na meia-luz, canal a canal.
 */
export function tintNaLuz(luz: number, escuro: string): number {
  const e = Number.parseInt(escuro.slice(1), 16);
  const t = Math.max(0, Math.min(1, luz));
  const canal = (desloc: number) => {
    const a = (e >> desloc) & 255;
    return Math.round(a + (255 - a) * t);
  };
  return (canal(16) << 16) | (canal(8) << 8) | canal(0);
}

/**
 * A que fração do raio fica, no chão, o ponto da tela a (`dx`, `dy`) px do centro de uma luz de
 * `raio` tiles (o círculo da luz vira uma elipse 2:1 na tela).
 */
export function distanciaNaTela(dx: number, dy: number, raio: number, iso: Iso): number {
  const a = dx / iso.meioTileX;
  const b = dy / iso.meioTileY;
  return Math.hypot((a + b) / 2, (b - a) / 2) / raio;
}

/** A luz mais forte que chega na pegada (0 = no escuro, 1 = em cheio). */
export function luminosidade(
  p: Pegada,
  luzes: readonly LuzNoMundo[],
  q: Queda,
  cf: ConfigFeixe = FEIXE_DA_REGRA,
): number {
  let melhor = 0;
  for (const l of luzes) {
    if (!l.recortaEscuridao) continue;
    const f = l.feixe;
    if (f) {
      for (const d of pontosParaOFeixe(l, f, p))
        melhor = Math.max(melhor, intensidadeDoFeixe(f, d.x, d.y, cf));
    } else melhor = Math.max(melhor, quedaDaLuz(distanciaAte(l, p) / l.raio, q));
    if (melhor >= 1) return 1;
  }
  return melhor;
}

/** Alturas (px) das fontes de luz para projetar sombras: lâmpada do poste, janela, lanterna. */
export interface AlturasDaLuz {
  postePx: number;
  janelaPx: number;
  pulsoPx: number;
  andarPx: number;
}

/** De que altura a luz vem: a lâmpada do poste, o meio da janela (no andar dela) ou a lanterna. */
export function alturaDaLuz(l: LuzNoMundo, a: AlturasDaLuz): number {
  if (l.feixe) return l.feixe.andar * a.andarPx + a.janelaPx;
  return l.tipo === 'poste' ? a.postePx : a.pulsoPx;
}

/** Até onde a luz aparece na tela, em tiles do ponto dela (a sombra não passa disso). */
export function alcanceDaLuz(l: LuzNoMundo, q: Queda, cf: ConfigFeixe): number {
  return l.feixe ? alcanceNaTela(l.feixe, cf) : l.raio * (1 + q.alem);
}

export function pegadaIluminada(p: Pegada, luzes: LuzNoMundo[]): boolean {
  return luzes.some((l) => l.recortaEscuridao && luzTocaPegada(l, p));
}

/** Lado dos baldes do índice de luzes, em tiles. */
const BALDE_DE_LUZ = 4;

/**
 * As luzes que recortam a escuridão, em baldes: perguntar se uma pegada está iluminada olha só as
 * luzes dos baldes que ela toca (a rota tem centenas de janelas e milhares de objetos).
 */
export class IndiceDeLuzes {
  private readonly baldes = new Map<number, LuzNoMundo[]>();

  /**
   * `queda` e `feixe`: a queda suave da tela, nos círculos e nos feixes (a luz ainda alcança um
   * pouco além da regra).
   */
  constructor(
    luzes: readonly LuzNoMundo[],
    private readonly queda: Queda = { pleno: 1, naBorda: 1, alem: 0 },
    private readonly feixe: ConfigFeixe = FEIXE_DA_REGRA,
  ) {
    for (const l of luzes) {
      if (!l.recortaEscuridao) continue;
      const r = l.feixe ? alcanceNaTela(l.feixe, feixe) : l.raio * (1 + queda.alem);
      this.cada({ x0: l.x - r, y0: l.y - r, x1: l.x + r, y1: l.y + r }, (k) => {
        const b = this.baldes.get(k);
        if (b) b.push(l);
        else this.baldes.set(k, [l]);
      });
    }
  }

  private cada(p: Pegada, f: (k: number) => void): void {
    const i0 = Math.floor(p.x0 / BALDE_DE_LUZ);
    const i1 = Math.floor(p.x1 / BALDE_DE_LUZ);
    const j0 = Math.floor(p.y0 / BALDE_DE_LUZ);
    const j1 = Math.floor(p.y1 / BALDE_DE_LUZ);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) f(j * 65536 + i);
  }

  /** A luz mais forte que chega na pegada, pela queda do índice (0 a 1). */
  luminosidade(p: Pegada): number {
    let melhor = 0;
    this.cada(p, (k) => {
      if (melhor >= 1) return;
      const b = this.baldes.get(k);
      if (b) melhor = Math.max(melhor, luminosidade(p, b, this.queda, this.feixe));
    });
    return melhor;
  }

  /**
   * As luzes que chegam no ponto, da mais forte para a mais fraca, com a força de cada uma (as que
   * ficam abaixo de `minimo` ficam de fora): as sombras de um personagem vêm delas.
   */
  luzesNoPonto(x: number, y: number, minimo: number): { luz: LuzNoMundo; forca: number }[] {
    const vistas = new Set<LuzNoMundo>();
    const saida: { luz: LuzNoMundo; forca: number }[] = [];
    const p = { x0: x, y0: y, x1: x, y1: y };
    this.cada(p, (k) => {
      for (const l of this.baldes.get(k) ?? []) {
        if (vistas.has(l)) continue;
        vistas.add(l);
        const forca = luminosidade(p, [l], this.queda, this.feixe);
        if (forca >= minimo) saida.push({ luz: l, forca });
      }
    });
    return saida.sort((a, b) => b.forca - a.forca);
  }

  ilumina(p: Pegada): boolean {
    let sim = false;
    this.cada(p, (k) => {
      if (sim) return;
      const b = this.baldes.get(k);
      if (b?.some((l) => luzTocaPegada(l, p))) sim = true;
    });
    return sim;
  }
}

/** Círculo do chão como polígono regular (vira uma elipse 2:1 na tela, com cara de low-poly). */
export function poligonoDeLuz(cx: number, cy: number, raio: number, lados: number): Vec2[] {
  return Array.from({ length: lados }, (_, i) => {
    const t = (i / lados) * Math.PI * 2;
    return { x: cx + raio * Math.cos(t), y: cy + raio * Math.sin(t) };
  });
}
