import {
  caixaDaParte,
  normaisDaParte,
  type Decalque,
  type Face,
  type Material,
  type Parte,
} from './geometria';
import type { Iso, Vec3 } from './iso';
import { AFASTAMENTO_DECALQUE, Montagem, type ContextoModelo, type Modelo } from './modelos';
import {
  cone,
  decalqueNaParede,
  esfera,
  extrusao,
  frisos,
  prisma,
  retanguloDeParede,
  telhadoDuasAguas,
  telhadoQuatroAguas,
  type Lado,
  type Pegada,
} from './primitivas';
import { VARIANTES_DE_CARRO, type NomeModelo } from '../sim/content/esquemas';

// Modelos do acervo do Codex (Design Codex/Modelos 3D, revisão 04), portados do gerador dele
// (Design Codex/Fontes/modelos/construir.mjs.txt) para o desenho por código do jogo: casas,
// comércio, o prédio de esquina, o coreto, oito veículos e quatro objetos de rua. Mesmas regras de
// arte de modelos.ts: x/y em tiles, z em px, frente voltada para +x, três tons pela normal e o
// brilho no branco frio da paleta. Os fundos ganham as janelas da frente espelhadas (as casas
// do outro lado da rua mostram os fundos para a câmera) e toda janela fica dentro da parede dela.

const SOLIDO: Material = { tipo: 'solido' };
const RECESSO: Material = { tipo: 'recesso' };
/** Altura (px) a partir da qual uma parte é parede com fachada (recebe as janelas dos fundos). */
const ALTURA_DE_FACHADA = 40;
/** Folga (tiles) entre a parede e a janela espelhada nos fundos. */
const FOLGA_DO_ESPELHO = 0.012;
/** Janela da coleção: peitoril e verga (px acima do piso do andar). */
const PEITORIL = 14;
const VERGA = 39;

/** Cor chapada (pneu, calota, varal): os três tons iguais. */
function plano(cor: string): Material {
  return { tipo: 'tom', tons: { topo: cor, faceEsquerda: cor, faceDireita: cor } };
}

function ret(x0: number, y0: number, x1: number, y1: number): Pegada {
  return { x0, y0, x1, y1 };
}

function emVolta(r: Pegada, folga: number): Pegada {
  return { x0: r.x0 - folga, y0: r.y0 - folga, x1: r.x1 + folga, y1: r.y1 + folga };
}

/** Uma parede (caixa) com a pegada e a base dela, para janelas, portas e telhados. */
interface Parede {
  r: Pegada;
  p: Parte;
  z: number;
  h: number;
}

/** A montagem do Codex: os atalhos do gerador dele sobre a Montagem do jogo. */
class Obra extends Montagem {
  /** Vitrines e lâmpadas das lojas: o mesmo tom quente das janelas acesas (nada de branco). */
  get luz(): Material {
    return this.ctx.janelasApagadas
      ? RECESSO
      : { tipo: 'emissivo', cor: this.ctx.visual.janelasAcesas.cores[0]! };
  }

  bloco(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    z0: number,
    z1: number,
    mat = SOLIDO,
  ): Parte {
    return this.caixa(ret(x0, y0, x1, y1), z0, z1, mat);
  }

  parede(x0: number, y0: number, x1: number, y1: number, h: number, z = 0): Parede {
    const r = ret(x0, y0, x1, y1);
    return { r, p: this.caixa(r, z, z + h), z, h };
  }

  vidro(w: Parede, lado: Lado, a0: number, a1: number, z0: number, z1: number, opcoes = {}): void {
    this.janela(w.p, w.r, lado, a0, a1, [z0, z1], opcoes);
  }

  entrada(w: Parede, a0: number, a1: number, z = 0, arco = false, lado: Lado = '+x'): void {
    this.porta(w.p, w.r, lado, a0, a1, z, arco);
  }

  duasAguas(w: Parede, altura: number, eixo: 'x' | 'y' = 'x', beiral = 0.1): Parte {
    return this.add(telhadoDuasAguas(emVolta(w.r, beiral), w.z + w.h, altura, eixo));
  }

  quatroAguas(w: Parede, altura: number, beiral = 0.1): Parte {
    return this.add(telhadoQuatroAguas(emVolta(w.r, beiral), w.z + w.h, altura));
  }

  cinta(w: Parede, z: number, espessura = 3): void {
    w.p.decalques.push(...frisos(w.r, z, espessura, 0.04));
  }

  peitoril(w: Parede, lado: Lado, a0: number, a1: number, z: number): void {
    const q = w.r;
    if (lado === '+x') this.bloco(q.x1, a0 - 0.02, q.x1 + 0.07, a1 + 0.02, z - 2, z);
    if (lado === '+y') this.bloco(a0 - 0.02, q.y1, a1 + 0.02, q.y1 + 0.07, z - 2, z);
  }

  /** Janelas com peitoril num andar (`nivel` = px do piso do andar). */
  janelas(w: Parede, lado: Lado, vaos: [number, number][], nivel = 0, opcoes = {}): void {
    for (const [a0, a1] of vaos) {
      this.vidro(w, lado, a0, a1, nivel + PEITORIL, nivel + VERGA, opcoes);
      this.peitoril(w, lado, a0, a1, nivel + PEITORIL);
    }
  }

  /** Vitrine acesa que não ilumina o chão (expositor, revistas). */
  vitrine(
    w: Parede,
    lado: Lado,
    a0: number,
    a1: number,
    z0: number,
    z1: number,
    acesa = true,
  ): void {
    w.p.decalques.push(
      decalqueNaParede(
        w.r,
        lado,
        [retanguloDeParede(a0, a1, z0, z1)],
        acesa ? this.luz : RECESSO,
        AFASTAMENTO_DECALQUE,
      ),
    );
  }

  escada(x: number, y: number, largura: number, degraus = 3, topo = 8): void {
    for (let i = 0; i < degraus; i++)
      this.bloco(
        x + i * 0.15,
        y,
        x + (i + 1) * 0.15,
        y + largura,
        0,
        (topo * (degraus - i)) / degraus,
      );
  }

  guardaCorpo(x: number, y0: number, y1: number, z: number, h = 15): void {
    this.bloco(x, y0, x + 0.045, y1, z + h - 2, z + h);
    for (let y = y0; y < y1 + 0.001; y += 0.24) this.bloco(x, y, x + 0.045, y + 0.045, z, z + h);
  }

  floreira(x: number, y: number, largura = 0.6, fundo = 0.28, z = 0): void {
    this.bloco(x, y, x + fundo, y + largura, z, z + 7);
    this.bloco(x + 0.04, y + 0.04, x + fundo - 0.04, y + largura - 0.04, z + 7, z + 8, RECESSO);
    for (let j = 0; j < 3; j++)
      this.add(
        esfera(x + fundo / 2, y + ((j + 0.5) * largura) / 3, z + 12, 0.12, this.ctx.iso, 6, 3),
      );
  }

  caixaDagua(x: number, y: number, z: number, raio = 0.35): void {
    this.add(prisma(x, y, raio, 10, z, z + 23));
    this.add(prisma(x, y, raio + 0.035, 10, z + 23, z + 26));
  }

  chamine(x: number, y: number, z: number): void {
    this.bloco(x, y, x + 0.3, y + 0.34, 0, z);
    this.bloco(x - 0.04, y - 0.04, x + 0.34, y + 0.38, z, z + 4);
  }

  /** Toldo inclinado para a rua (+x), listrado de recesso. */
  toldo(x: number, y0: number, y1: number, z: number, fundo = 0.55): Parte {
    const p = this.add(
      extrusao(
        [
          { u: x, z },
          { u: x + fundo, z: z - 10 },
          { u: x + fundo, z: z - 13 },
          { u: x, z: z - 3 },
        ],
        'y',
        y0,
        y1,
      ),
    );
    for (let i = 0; i < 7; i += 2) {
      const a = y0 + ((y1 - y0) * i) / 7;
      const c = y0 + ((y1 - y0) * (i + 1)) / 7;
      p.decalques.push({
        normal: { x: 0.4, y: 0, z: 0.9 },
        faces: [
          {
            pts: [
              { x, y: a, z: z + 0.08 },
              { x: x + fundo, y: a, z: z - 9.92 },
              { x: x + fundo, y: c, z: z - 9.92 },
              { x, y: c, z: z + 0.08 },
            ],
            material: RECESSO,
          },
        ],
      });
    }
    return p;
  }

  /** Letreiro fino na fachada (+x): uma placa, sem luz (só janelas e postes brilham). */
  letreiro(x: number, y0: number, y1: number, z0: number, z1: number): void {
    this.caixa(ret(x, y0, x + 0.1, y1), z0, z1);
  }

  /** Caixas de entrega empilhadas. */
  caixas(x: number, y: number): void {
    for (const [dx, dy, z] of [
      [0, 0, 0],
      [0.36, 0, 0],
      [0, 0.35, 0],
      [0, 0, 12],
    ] as const) {
      const w = this.parede(x + dx, y + dy, x + dx + 0.32, y + dy + 0.3, 11, z);
      w.p.decalques.push(...frisos(w.r, z + 5, 1, 0.01));
    }
  }

  /** Roda de verdade: cilindro de 16 faces deitado no eixo y, com pneu e calota. */
  roda(cx: number, cy: number, cz: number, raio = 0.19, largura = 0.13, calota = 0.55): void {
    const { iso, visual } = this.ctx;
    const N = 16;
    const raioZ = raio * iso.zPorTile;
    const borracha = plano(visual.paleta.borracha);
    const disco = (y: number, r: number, rz: number, material: Material, normal: Vec3): Face => ({
      pts: Array.from({ length: N }, (_, i) => {
        const a = ((i + 0.5) * Math.PI * 2) / N;
        return { x: cx + Math.cos(a) * r, y, z: cz + Math.sin(a) * rz };
      }),
      material,
      normal,
    });
    const atras = disco(cy - largura / 2, raio, raioZ, borracha, { x: 0, y: -1, z: 0 });
    const frente = disco(cy + largura / 2, raio, raioZ, borracha, { x: 0, y: 1, z: 0 });
    const faces: Face[] = [atras, frente];
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      faces.push({
        pts: [atras.pts[i]!, atras.pts[j]!, frente.pts[j]!, frente.pts[i]!],
        material: borracha,
      });
    }
    const p = this.add<Parte>({ faces, decalques: [] });
    for (const s of [-1, 1]) {
      const y = cy + s * (largura / 2 + 0.007);
      const n = { x: 0, y: s, z: 0 };
      p.decalques.push({
        normal: n,
        faces: [disco(y, raio * calota, raioZ * calota, plano(visual.paleta.topo), n)],
      });
    }
  }
}

// ---------------------------------------------------------------------------------- casas

/** Casa com alpendre: varanda aberta com guarda-corpo, floreira e chaminé. */
export function casaComAlpendre(ctx: ContextoModelo): Modelo {
  const m = new Obra(ctx);
  const w = m.parede(0.2, 0.2, 2.8, 3.0, 52);
  m.quatroAguas(w, 26);
  m.janelas(w, '+x', [
    [0.42, 1.04],
    [2.1, 2.7],
  ]);
  m.janelas(w, '+y', [
    [0.6, 1.1],
    [1.65, 2.2],
  ]);
  m.entrada(w, 1.35, 1.75);
  m.bloco(2.8, 0.32, 3.5, 2.85, 0, 5);
  m.bloco(2.77, 0.25, 3.6, 2.92, 45, 49);
  for (const y of [0.36, 2.76]) m.bloco(3.42, y, 3.5, y + 0.08, 5, 45);
  m.guardaCorpo(3.46, 0.4, 1.14, 5, 12);
  m.guardaCorpo(3.46, 1.96, 2.79, 5, 12);
  m.escada(3.5, 1.3, 0.53, 2, 5);
  m.chamine(0, 2.3, 94);
  m.floreira(3.05, 0.5, 0.48, 0.25, 5);
  return acabar(m, 'casa_varanda');
}

/** Casa de sótão: empena alta e janela avançada sob o telhado. */
export function casaSotao(ctx: ContextoModelo): Modelo {
  const m = new Obra(ctx);
  const w = m.parede(0.1, 0.1, 2.65, 3.1, 53);
  m.duasAguas(w, 48, 'x');
  m.janelas(w, '+x', [
    [0.3, 0.8],
    [2.3, 2.82],
  ]);
  m.entrada(w, 1.15, 1.57);
  m.janelas(w, '+y', [
    [0.45, 0.95],
    [1.6, 2.1],
  ]);
  const agua = m.parede(2.65, 1.0, 3.05, 2.06, 28, 49);
  m.duasAguas(agua, 18);
  m.vidro(agua, '+x', 1.22, 1.83, 56, 73, { panos: 2 });
  m.bloco(2.62, 1.08, 3.22, 1.8, 37, 41);
  m.escada(2.65, 1.12, 0.54, 3, 7);
  m.chamine(0, 2.45, 110);
  m.floreira(2.72, 2.32, 0.5, 0.28);
  return acabar(m, 'casa_sotao');
}

/** Casa de laje: terraço com varal e caixa-d'água. */
export function casaLaje(ctx: ContextoModelo): Modelo {
  const m = new Obra(ctx);
  const w = m.parede(0.15, 0.1, 2.75, 3.25, 50);
  m.bloco(0.07, 0.02, 2.83, 3.33, 50, 55);
  m.janelas(
    w,
    '+x',
    [
      [0.4, 1.14],
      [2.0, 2.7],
    ],
    0,
    { panos: 2 },
  );
  m.entrada(w, 1.35, 1.72);
  m.janelas(w, '+y', [
    [0.55, 1.1],
    [1.68, 2.2],
  ]);
  m.bloco(0.15, 0.1, 0.25, 3.25, 55, 69);
  m.bloco(0.15, 0.1, 2.75, 0.2, 55, 69);
  m.bloco(0.15, 3.15, 2.75, 3.25, 55, 69);
  m.guardaCorpo(2.7, 0.23, 3.1, 55, 14);
  m.caixaDagua(0.83, 0.78, 55);
  for (const y of [1.3, 2.8]) m.bloco(0.6, y, 0.66, y + 0.06, 55, 94);
  m.bloco(0.615, 1.33, 0.645, 2.83, 92, 93);
  const roupa = plano(ctx.visual.paleta.piso.faixa);
  for (const [y, h] of [
    [1.48, 18],
    [2.1, 13],
  ] as const)
    m.bloco(0.6, y, 0.66, y + 0.41, 92 - h, 92, roupa);
  m.bloco(2.75, 1.25, 3.2, 1.83, 36, 40);
  return acabar(m, 'casa_laje');
}

/** Geminadas: duas moradias com alturas e coberturas diferentes. */
export function geminadas(ctx: ContextoModelo): Modelo {
  const m = new Obra(ctx);
  for (let i = 0; i < 2; i++) {
    const y = i * 1.85;
    const w = m.parede(0.2, y, 2.55, y + 1.85, i ? 84 : 96);
    if (i) m.quatroAguas(w, 21);
    else m.duasAguas(w, 31, 'x');
    m.cinta(w, 47);
    m.entrada(w, y + 0.23, y + 0.57);
    m.janelas(w, '+x', [[y + 0.9, y + 1.45]]);
    m.janelas(
      w,
      '+x',
      [
        [y + 0.22, y + 0.65],
        [y + 1.02, y + 1.48],
      ],
      i ? 43 : 48,
    );
    m.bloco(2.55, y + 0.15, 2.95, y + 0.67, 37, 41);
    m.escada(2.55, y + 0.2, 0.42, 2, 5);
    if (i)
      m.janelas(
        w,
        '+y',
        [
          [0.65, 1.1],
          [1.65, 2.12],
        ],
        43,
      );
    else m.chamine(0, 0.5, 138);
  }
  return acabar(m, 'geminadas');
}

/** Sobrado com ateliê: janela saliente ampla no andar de cima e floreira. */
export function sobradoAtelie(ctx: ContextoModelo): Modelo {
  const m = new Obra(ctx);
  const w = m.parede(0.15, 0.05, 2.75, 3.25, 94);
  m.cinta(w, 47);
  m.quatroAguas(w, 30);
  m.entrada(w, 0.3, 0.72);
  m.janelas(
    w,
    '+x',
    [
      [1.15, 1.72],
      [2.12, 2.72],
    ],
    0,
    { panos: 2 },
  );
  m.janelas(
    w,
    '+x',
    [
      [0.38, 0.82],
      [1.25, 1.78],
      [2.25, 2.78],
    ],
    48,
  );
  m.janelas(
    w,
    '+y',
    [
      [0.6, 1.1],
      [1.7, 2.2],
    ],
    48,
  );
  const atelie = m.parede(2.75, 1.08, 3.2, 2.96, 33, 52);
  m.vidro(atelie, '+x', 1.23, 1.93, 57, 80, { panos: 2 });
  m.vidro(atelie, '+x', 2.08, 2.8, 57, 80, { panos: 2 });
  m.bloco(2.72, 1.02, 3.26, 3.02, 85, 89);
  m.bloco(2.75, 0.23, 3.16, 0.81, 36, 40);
  m.floreira(3.21, 1.2, 0.65, 0.24, 45);
  return acabar(m, 'sobrado_atelie');
}

/** Vila de casinhas: três fachadas estreitas, cada uma com a sua entrada. */
export function vilinha(ctx: ContextoModelo): Modelo {
  const m = new Obra(ctx);
  for (let i = 0; i < 3; i++) {
    const y = i * 1.43;
    const w = m.parede(0.1, y, 2.48, y + 1.42, 45 + (i === 1 ? 7 : 0));
    m.duasAguas(w, 28, 'x');
    m.entrada(w, y + 0.18, y + 0.5);
    m.janelas(w, '+x', [[y + 0.78, y + 1.16]]);
    m.bloco(2.48, y + 0.13, 2.83, y + 0.55, 33, 36);
    m.floreira(2.53, y + 0.81, 0.3, 0.22);
    if (i === 2)
      m.janelas(w, '+y', [
        [0.6, 1.1],
        [1.55, 2.05],
      ]);
  }
  return acabar(m, 'vilinha');
}

// ---------------------------------------------------------------------------------- comércio

/** Padaria de esquina: vitrines, toldo e forno com chaminé. */
export function padaria(ctx: ContextoModelo): Modelo {
  const m = new Obra(ctx);
  const w = m.parede(0.15, 0.1, 3.0, 3.7, 90);
  m.cinta(w, 46);
  m.bloco(0.07, 0.02, 3.08, 3.78, 90, 97);
  for (const [a, c] of [
    [0.32, 1.02],
    [1.17, 1.87],
    [2.02, 2.72],
  ] as const)
    m.vidro(w, '+x', a, c, 6, 34);
  m.entrada(w, 2.98, 3.38);
  m.janelas(
    w,
    '+x',
    [
      [0.45, 1.0],
      [1.55, 2.1],
      [2.65, 3.2],
    ],
    48,
  );
  m.janelas(
    w,
    '+y',
    [
      [0.45, 1.02],
      [1.55, 2.2],
    ],
    48,
  );
  m.vidro(w, '+y', 0.45, 2.4, 8, 34, { panos: 2 });
  m.toldo(3.0, 0.18, 3.55, 49, 0.64);
  m.chamine(0, 2.9, 128);
  m.bloco(3.44, 3.04, 3.54, 3.45, 0, 22);
  m.bloco(3.54, 3.06, 3.57, 3.43, 6, 19, RECESSO);
  return acabar(m, 'padaria');
}

/** Mercadinho: toldo baixo, caixas de entrega e reservatório. */
export function mercado(ctx: ContextoModelo): Modelo {
  const m = new Obra(ctx);
  const w = m.parede(0.2, 0.1, 3.0, 3.6, 58);
  m.bloco(0.1, 0, 3.1, 3.7, 58, 64);
  m.vidro(w, '+x', 0.36, 1.2, 5, 33, { panos: 2 });
  m.vidro(w, '+x', 1.38, 2.2, 5, 33, { panos: 2 });
  m.entrada(w, 2.6, 3.08);
  m.janelas(w, '+y', [
    [0.6, 1.3],
    [1.7, 2.45],
  ]);
  m.toldo(3, 0.15, 3.45, 49, 0.72);
  m.caixas(3.1, 0.4);
  m.caixaDagua(0.9, 2.65, 64, 0.3);
  m.bloco(3.5, 2.66, 3.58, 3.24, 0, 24);
  return acabar(m, 'mercado');
}

/** Oficina do bairro: dois portões de enrolar, pneus empilhados e telhado longo. */
export function oficina(ctx: ContextoModelo): Modelo {
  const m = new Obra(ctx);
  const w = m.parede(0.2, 0.1, 3.15, 4, 68);
  m.duasAguas(w, 25, 'y');
  for (const [y0, y1] of [
    [0.35, 1.78],
    [2.12, 3.62],
  ] as const) {
    m.portao(w.p, w.r, '+x', y0, y1, 49);
    for (let z = 8; z < 48; z += 9) m.bloco(3.16, y0 + 0.03, 3.18, y1 - 0.03, z, z + 0.9);
  }
  for (const [a, c] of [
    [0.55, 1.3],
    [1.72, 2.5],
  ] as const)
    m.vidro(w, '+y', a, c, 40, 59);
  const borracha = plano(ctx.visual.paleta.borracha);
  for (let k = 0; k < 3; k++) {
    m.add(prisma(3.45, 3.72, 0.24, 12, k * 6, k * 6 + 5.5, borracha));
    m.add(prisma(3.45, 3.72, 0.12, 12, k * 6 + 5.5, k * 6 + 5.6, RECESSO));
  }
  m.bloco(3.18, 0.15, 3.28, 0.3, 0, 53);
  m.bloco(3.18, 3.84, 3.28, 4.0, 0, 53);
  return acabar(m, 'oficina');
}

/** Cinema de rua: marquise larga, cartazes acesos e fachada em degraus. */
export function cinema(ctx: ContextoModelo): Modelo {
  const m = new Obra(ctx);
  const w = m.parede(0.1, 0.1, 3.1, 4.0, 88);
  m.bloco(0.03, 0.03, 3.17, 4.07, 88, 95);
  const centro = m.parede(3.1, 1.3, 3.3, 2.8, 108);
  m.bloco(3.08, 1.22, 3.36, 2.88, 108, 113);
  m.entrada(w, 0.35, 0.87, 0, true);
  m.entrada(w, 3.17, 3.69, 0, true);
  m.vidro(centro, '+x', 1.64, 2.44, 5, 33, { panos: 2 });
  m.bloco(3.1, 0.2, 3.9, 3.9, 37, 43);
  for (const y of [0.52, 3.28]) {
    m.caixa(ret(3.11, y, 3.17, y + 0.35), 51, 76);
  }
  for (const y of [1.61, 1.99, 2.37]) m.vidro(centro, '+x', y, y + 0.16, 72, 96);
  m.bloco(3.35, 1.38, 3.38, 2.72, 58, 63);
  m.janelas(
    w,
    '+y',
    [
      [0.65, 1.1],
      [1.85, 2.3],
    ],
    25,
    { apagada: true },
  );
  return acabar(m, 'cinema');
}

/** Edifício de esquina: três pavimentos, varandas e acesso à cobertura. */
export function edificio(ctx: ContextoModelo): Modelo {
  const m = new Obra(ctx);
  const w = m.parede(0.15, 0.1, 2.95, 3.9, 144);
  for (const z of [48, 96]) m.cinta(w, z, 3);
  m.entrada(w, 1.85, 2.25);
  for (let andar = 0; andar < 3; andar++) {
    const z = andar * 48;
    m.janelas(
      w,
      '+x',
      andar === 0
        ? [
            [0.4, 0.9],
            [1.2, 1.65],
            [2.4, 2.85],
            [3.13, 3.63],
          ]
        : [
            [0.4, 0.9],
            [1.3, 1.8],
            [2.35, 2.85],
            [3.13, 3.63],
          ],
      z,
      { apagada: andar === 1 },
    );
    m.janelas(
      w,
      '+y',
      [
        [0.65, 1.17],
        [1.72, 2.24],
      ],
      z,
    );
    if (andar > 0) {
      m.bloco(2.95, 2.19, 3.35, 3.73, z, z + 3);
      m.guardaCorpo(3.31, 2.22, 3.66, z + 3, 12);
    }
  }
  m.bloco(0.07, 0.02, 3.03, 3.98, 144, 151);
  m.caixaDagua(0.83, 0.9, 151, 0.37);
  const acesso = m.parede(0.5, 2.45, 1.5, 3.4, 23, 151);
  m.quatroAguas(acesso, 8, 0.04);
  m.bloco(2.94, 1.55, 3.43, 2.38, 38, 42);
  return acabar(m, 'edificio');
}

/** Coreto da praça: cobertura octogonal com beiral espesso, colunas e a luminária no meio. */
export function coretoDaPraca(ctx: ContextoModelo): Modelo {
  const m = new Obra(ctx);
  const c = 1.8;
  m.add(prisma(c, c, 1.5, 8, 0, 5));
  m.add(prisma(c, c, 1.34, 8, 5, 12));
  for (let i = 0; i < 8; i++) {
    const t = ((i + 0.5) * Math.PI) / 4;
    const x = c + 1.16 * Math.cos(t);
    const y = c + 1.16 * Math.sin(t);
    m.bloco(x - 0.045, y - 0.045, x + 0.045, y + 0.045, 12, 59);
  }
  m.add(prisma(c, c, 1.39, 8, 55, 59));
  const beiral = m.add(prisma(c, c, 1.6, 8, 59, 69));
  const tampa = beiral.faces[0]!;
  beiral.faces.push({ pts: tampa.pts.map((p) => ({ ...p, z: 59 })).reverse(), material: SOLIDO });
  const cobertura = m.add(cone(c, c, 1.6, 8, 69, 115));
  cobertura.faces.push({
    pts: tampa.pts.map((p) => ({ ...p, z: 69 })).reverse(),
    material: SOLIDO,
  });
  m.add(prisma(c, c, 0.09, 8, 113, 123));
  m.bloco(3.1, 1.4, 3.3, 2.2, 0, 8);
  m.bloco(3.3, 1.4, 3.5, 2.2, 0, 4);
  for (const y of [0.9, 2.5]) m.bloco(0.95, y, 2.5, y + 0.15, 20, 23);
  m.bloco(1.73, 1.73, 1.87, 1.87, 49, 55, m.luz);
  return acabar(m, 'coreto');
}

// ---------------------------------------------------------------------------------- veículos

type Veiculo = (typeof VARIANTES_DE_CARRO)[number] | 'onibus';

/** Medidas de cada veículo: comprimento, largura, altura da carroceria e do teto, e a cabine. */
const VEICULOS: Record<
  Veiculo,
  { L: number; W: number; Z: number; H: number; cabine: [number, number, number, number] }
> = {
  compacto: { L: 2.15, W: 1.02, Z: 18, cabine: [0.35, 0.62, 1.35, 1.69], H: 33 },
  sedan: { L: 2.8, W: 1.1, Z: 19, cabine: [0.5, 0.83, 1.75, 2.15], H: 36 },
  perua: { L: 2.95, W: 1.1, Z: 19, cabine: [0.18, 0.4, 1.88, 2.2], H: 38 },
  picape: { L: 2.8, W: 1.13, Z: 21, cabine: [1.28, 1.45, 2.06, 2.35], H: 39 },
  van: { L: 2.8, W: 1.15, Z: 20, cabine: [0.13, 0.3, 2.48, 2.69], H: 46 },
  furgao: { L: 2.95, W: 1.18, Z: 21, cabine: [1.8, 2.03, 2.5, 2.82], H: 40 },
  onibus: { L: 4.0, W: 1.28, Z: 22, cabine: [0.1, 0.22, 3.69, 3.88], H: 51 },
  retro: { L: 2.35, W: 1.06, Z: 18, cabine: [0.27, 0.72, 1.45, 1.94], H: 36 },
};

type P2 = [number, number];

/** Recorta um polígono 2D pelo semiplano `distancia(p) >= 0`. */
function recortar2D(poly: P2[], distancia: (p: P2) => number): P2[] {
  const saida: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const da = distancia(a);
    const db = distancia(b);
    const ia = da >= -1e-8;
    if (ia) saida.push(a);
    if (ia !== db >= -1e-8) {
      const t = da / (da - db);
      saida.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return saida;
}

/** O perfil da cabine encolhido por `margem` (métrico): a faixa de vidro dentro da lataria. */
function vidroDentroDoPerfil(perfil: P2[], margem: number, iso: Iso): P2[] {
  const metrico: P2[] = perfil.map(([x, z]) => [x, z / iso.zPorTile]);
  let area = 0;
  for (let i = 0; i < metrico.length; i++) {
    const a = metrico[i]!;
    const b = metrico[(i + 1) % metrico.length]!;
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sinal = area >= 0 ? 1 : -1;
  let poly = metrico;
  for (let i = 0; i < metrico.length; i++) {
    const a = metrico[i]!;
    const b = metrico[(i + 1) % metrico.length]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const comprimento = Math.hypot(dx, dz);
    poly = recortar2D(
      poly,
      (p) => sinal * (dx * (p[1] - a[1]) - dz * (p[0] - a[0])) - margem * comprimento,
    );
  }
  return poly.map(([x, z]) => [x, z * iso.zPorTile]);
}

/** Carroceria com recorte nos para-lamas, cabine fechada com vidros, rodas e faróis. */
function montarVeiculo(ctx: ContextoModelo, tipo: Veiculo): Obra {
  const m = new Obra(ctx);
  const { iso, visual } = ctx;
  const { L, W, Z, H: teto, cabine } = VEICULOS[tipo];
  const onibus = tipo === 'onibus';
  const y0 = 0.1;
  const y1 = W + 0.1;
  const tras = onibus ? 0.8 : 0.46;
  const frente = L - (onibus ? 0.69 : 0.43);
  const raio = onibus ? 0.235 : 0.2;
  const cz = raio * iso.zPorTile;
  const perfil = (pts: P2[], a0: number, a1: number) =>
    m.add(
      extrusao(
        pts.map(([u, z]) => ({ u, z })),
        'y',
        a0,
        a1,
      ),
    );

  // Perfil com os para-lamas recortados: a roda não é um círculo pintado sobre a caixa.
  const baixo: P2[] = [[0.04, 10]];
  for (const centro of [tras, frente]) {
    const r = raio + 0.035;
    for (let j = 0; j <= 8; j++) {
      const a = Math.PI - (j * Math.PI) / 8;
      baixo.push([centro + r * Math.cos(a), Math.max(10, cz + r * iso.zPorTile * Math.sin(a))]);
    }
  }
  baixo.push([L - 0.04, 10], [L - 0.04, Z - 4], [L - 0.18, Z], [0.15, Z], [0.04, Z - 3]);
  perfil(baixo, y0, y1);

  const [a, c, d, e] = cabine;
  const contorno: P2[] =
    tipo === 'retro'
      ? [
          [a, Z],
          [a + 0.16, Z + 7],
          [c, teto - 3],
          [c + 0.25, teto],
          [d, teto - 2],
          [e - 0.15, Z + 6],
          [e, Z],
        ]
      : [
          [a, Z],
          [c, teto - 2],
          [c + 0.09, teto],
          [d - 0.07, teto],
          [d, teto - 1],
          [e, Z],
        ];
  const corpo = perfil(contorno, y0 + 0.06, y1 - 0.06);

  // Vidros laterais: uma faixa contínua dividida por colunas finas verticais.
  const panos = onibus
    ? 6
    : tipo === 'van'
      ? 4
      : tipo === 'perua'
        ? 3
        : tipo === 'picape' || tipo === 'furgao'
          ? 1
          : 2;
  const faixa = vidroDentroDoPerfil(contorno, 0.072, iso);
  const xMin = Math.min(...faixa.map((p) => p[0]));
  const xMax = Math.max(...faixa.map((p) => p[0]));
  const coluna = onibus || tipo === 'van' ? 0.075 : 0.06;
  for (const s of [-1, 1]) {
    const yy = s < 0 ? y0 + 0.048 : y1 - 0.048;
    for (let i = 0; i < panos; i++) {
      const x0 = xMin + ((xMax - xMin) * i) / panos + (i ? coluna / 2 : 0);
      const x1 = xMin + ((xMax - xMin) * (i + 1)) / panos - (i < panos - 1 ? coluna / 2 : 0);
      const pts = recortar2D(
        recortar2D(faixa, (p) => p[0] - x0),
        (p) => x1 - p[0],
      );
      if (pts.length < 3) continue;
      corpo.decalques.push({
        normal: { x: 0, y: s, z: 0 },
        faces: [{ pts: pts.map(([x, z]) => ({ x, y: yy, z })), material: RECESSO }],
      });
    }
  }
  // Para-brisa e vidro de trás, no plano inclinado da cabine.
  const noPlano = (p0: P2, p1: P2, sinal: number) => {
    const ponto = (t: number) => ({
      x: p0[0] + (p1[0] - p0[0]) * t + sinal * 0.008,
      z: p0[1] + (p1[1] - p0[1]) * t + 0.008,
    });
    const q0 = ponto(0.2);
    const q1 = ponto(0.82);
    corpo.decalques.push({
      normal: { x: sinal, y: 0, z: 0.45 },
      faces: [
        {
          pts: [
            { ...q0, y: y0 + 0.19 },
            { ...q0, y: y1 - 0.19 },
            { ...q1, y: y1 - 0.19 },
            { ...q1, y: y0 + 0.19 },
          ],
          material: RECESSO,
        },
      ],
    });
  };
  if (tipo === 'retro') {
    noPlano(contorno[5]!, contorno[4]!, 1);
    noPlano(contorno[1]!, contorno[2]!, -1);
  } else {
    noPlano(contorno.at(-1)!, contorno.at(-2)!, 1);
    noPlano(contorno[0]!, contorno[1]!, -1);
  }
  for (const x of [tras, frente])
    for (const y of [y0 - 0.015, y1 + 0.015])
      m.roda(x, y, cz, raio, 0.15, tipo === 'retro' ? 0.62 : 0.5);
  m.bloco(-0.015, y0 + 0.06, 0.08, y1 - 0.06, 9, 12);
  m.bloco(L - 0.08, y0 + 0.06, L + 0.015, y1 - 0.06, 9, 12);

  // Faróis chapados e grade simples, dentro da paleta.
  const farol = plano(visual.paleta.piso.faixa);
  const lanterna = plano(visual.paleta.piso.meioFio);
  const topoFarol = Math.min(Z - 4.65, cz + 8);
  const baseFarol = Math.max(10.3, topoFarol - 3.2);
  for (const yy of [y0 + 0.16, y1 - 0.32])
    m.bloco(L - 0.035, yy, L - 0.015, yy + 0.16, baseFarol, topoFarol, farol);
  m.bloco(
    L - 0.03,
    y0 + W * 0.38,
    L - 0.01,
    y0 + W * 0.62,
    10.6,
    Math.min(13.2, topoFarol),
    RECESSO,
  );
  for (const yy of [y0 + 0.13, y1 - 0.28])
    m.bloco(0.016, yy, 0.037, yy + 0.15, 10.5, Math.min(Z - 4.7, 14.2), lanterna);
  for (const yy of [y0 - 0.02, y1 + 0.02]) {
    m.bloco(e - 0.16, yy - 0.055, e - 0.02, yy + 0.055, Z + 3, Z + 6);
    for (const xx of [c + 0.1, d - 0.16])
      m.bloco(xx, yy - 0.008, xx + 0.12, yy + 0.008, Z - 2, Z - 0.8);
  }
  if (tipo === 'perua') {
    for (const yy of [y0 + 0.14, y1 - 0.14]) m.bloco(c, yy, d, yy + 0.035, teto + 1, teto + 3);
    for (const xx of [c + 0.17, d - 0.2])
      m.bloco(xx, y0 + 0.12, xx + 0.045, y1 - 0.12, teto, teto + 5);
    m.bloco(c + 0.33, y0 + 0.27, d - 0.26, y1 - 0.24, teto + 3, teto + 10);
  }
  if (tipo === 'picape') {
    m.bloco(0.12, y0 + 0.09, 1.24, y1 - 0.09, Z - 0.8, Z + 0.01, RECESSO);
    for (const yy of [y0, y1 - 0.08]) m.bloco(0.1, yy, 1.29, yy + 0.08, Z, 29);
    m.bloco(0.08, y0, 0.16, y1, Z, 29);
    m.bloco(0.13, y0 + 0.07, 1.2, y1 - 0.07, Z - 1, Z, RECESSO);
  }
  if (tipo === 'furgao') {
    const bau = m.parede(0.08, y0 + 0.02, 1.83, y1 - 0.02, 29, Z);
    m.bloco(0.03, y0 - 0.02, 1.88, y1 + 0.02, Z + 29, Z + 31);
    for (const lado of ['+y', '-y'] as const)
      bau.p.decalques.push(
        decalqueNaParede(
          bau.r,
          lado,
          [retanguloDeParede(0.28, 1.58, Z + 8, Z + 20)],
          RECESSO,
          0.012,
        ),
      );
  }
  if (onibus) {
    m.bloco(3.4, y0 + 0.14, 3.79, y1 - 0.14, teto + 1, teto + 5);
    for (const yy of [y0 + 0.04, y1 - 0.04]) m.bloco(0.14, yy, 3.86, yy + 0.025, 19, 21, RECESSO);
    m.bloco(3.6, y1 + 0.015, 3.86, y1 + 0.025, 10, 36, RECESSO);
    m.bloco(3.72, y1 + 0.025, 3.74, y1 + 0.035, 12, 36);
  }
  if (tipo === 'van') {
    m.bloco(0.25, y0 - 0.006, 2.6, y0 + 0.012, 22, 24);
    m.bloco(0.25, y1 - 0.012, 2.6, y1 + 0.006, 22, 24);
    m.bloco(L - 0.02, y0 + W / 2 - 0.02, L + 0.001, y0 + W / 2 + 0.02, 25, 40);
  }
  return m;
}

/** Desloca todos os pontos das partes no plano (centralizar o veículo na vaga). */
function deslocar(partes: Parte[], dx: number, dy: number): void {
  const mover = (f: Face) => {
    f.pts = f.pts.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
  };
  for (const p of partes) {
    p.faces.forEach(mover);
    for (const d of p.decalques) d.faces.forEach(mover);
  }
}

/**
 * Carro estacionado (comprido em x), centrado na vaga de content/modelos.json: sedã, perua,
 * compacto, retrô, picape, van ou furgão.
 */
export function carro(ctx: ContextoModelo, variante = 'sedan'): Modelo {
  const tipo: Veiculo = (VARIANTES_DE_CARRO as readonly string[]).includes(variante)
    ? (variante as Veiculo)
    : 'sedan';
  const m = montarVeiculo(ctx, tipo);
  const modelo = m.modelo('carro');
  const { L, W } = VEICULOS[tipo];
  deslocar(m.partes, (modelo.largura - L) / 2, (modelo.profundidade - (W + 0.2)) / 2);
  return modelo;
}

/** Micro-ônibus: entre-eixos longo, seis janelas e porta lateral. */
export function onibus(ctx: ContextoModelo): Modelo {
  const m = montarVeiculo(ctx, 'onibus');
  const modelo = m.modelo('onibus');
  deslocar(
    m.partes,
    (modelo.largura - VEICULOS.onibus.L) / 2,
    (modelo.profundidade - (VEICULOS.onibus.W + 0.2)) / 2,
  );
  return modelo;
}

// ---------------------------------------------------------------------------------- vida na rua

/** Banca de revistas: balcão, expositor e testeira acesa. */
export function bancaDeRevistas(ctx: ContextoModelo): Modelo {
  const m = new Obra(ctx);
  const w = m.parede(0.12, 0.12, 1.55, 1.9, 46);
  m.bloco(0.02, 0.02, 1.67, 2.01, 46, 51);
  m.vidro(w, '+x', 0.3, 1.72, 23, 41, { panos: 2 });
  m.bloco(1.55, 0.24, 1.82, 1.8, 19, 23);
  m.entrada(w, 0.25, 0.57, 0, false, '+y');
  const expositor = m.parede(1.57, 0.35, 1.61, 1.64, 12, 4);
  for (let i = 0; i < 4; i++)
    m.vitrine(expositor, '+x', 0.4 + i * 0.28, 0.59 + i * 0.28, 6, 14, i !== 2);
  m.letreiro(1.55, 0.4, 1.6, 44, 54);
  return acabar(m, 'banca');
}

/** Carrinho de rua: cobertura em quatro águas, balcão e rodas redondas. */
export function carrinhoDeRua(ctx: ContextoModelo): Modelo {
  const m = new Obra(ctx);
  m.parede(0.15, 0.15, 1.15, 1.45, 23, 5);
  m.bloco(0.1, 0.1, 1.21, 1.51, 28, 31);
  for (const x of [0.22, 1.06])
    for (const y of [0.21, 1.39]) m.bloco(x, y, x + 0.04, y + 0.04, 31, 61);
  m.add(telhadoQuatroAguas(emVolta(ret(0.05, 0.05, 1.3, 1.6), 0.03), 61, 14));
  for (const x of [0.35, 0.97]) for (const y of [0.08, 1.52]) m.roda(x, y, 6, 0.155, 0.09, 0.55);
  m.bloco(1.18, 0.45, 1.48, 0.49, 22, 25);
  m.bloco(1.18, 1.14, 1.48, 1.18, 22, 25);
  m.bloco(1.44, 0.45, 1.48, 1.18, 22, 25);
  for (let y = 0.4; y < 1.3; y += 0.34) m.add(prisma(0.6, y, 0.12, 8, 31, 39));
  return acabar(m, 'carrinho_de_rua');
}

/** Ponto de ônibus: abrigo, banco, painel aceso e placa elevada. */
export function pontoDeOnibus(ctx: ContextoModelo): Modelo {
  const m = new Obra(ctx);
  for (const y of [0.12, 2.5]) m.bloco(0.15, y, 0.23, y + 0.08, 0, 48);
  m.bloco(0.04, 0.02, 1.03, 2.72, 48, 52);
  const painel = m.parede(0.12, 0.42, 0.18, 2.38, 36, 6);
  m.vidro(painel, '+x', 0.56, 1.18, 10, 38);
  m.bloco(0.3, 0.6, 0.65, 2.3, 12, 15);
  for (const y of [0.65, 2.18]) m.bloco(0.4, y, 0.48, y + 0.08, 0, 12);
  m.bloco(0.75, 2.7, 0.8, 2.76, 0, 66);
  m.bloco(0.72, 2.54, 0.84, 2.94, 54, 65);
  return acabar(m, 'ponto_onibus');
}

/** Banco com canteiro: lugar de pausa junto à vegetação. */
export function pracinha(ctx: ContextoModelo): Modelo {
  const m = new Obra(ctx);
  m.floreira(0.1, 0.1, 1.35, 0.75);
  m.bloco(1.1, 0.1, 1.39, 1.5, 10, 13);
  m.bloco(1.1, 0.1, 1.17, 1.5, 13, 26);
  for (const y of [0.2, 1.3]) m.bloco(1.15, y, 1.32, y + 0.08, 0, 10);
  return acabar(m, 'pracinha');
}

// ---------------------------------------------------------------------------------- acabamento

type Eixo = 'x' | 'y';

function ehBrilho(f: Face): boolean {
  return f.material.tipo === 'emissivo';
}

/**
 * Espelha nos fundos (−x, −y) as janelas acesas da frente e do lado (+x, +y) de cada parede alta
 * que ainda não tem janela atrás, sem abrir janela onde já há chaminé, outra ala ou telhado.
 * Não iluminam o chão: só a fachada da frente acende a rua.
 */
function espelharJanelas(partes: Parte[]): void {
  const espelhadas = new Set<Face>();
  for (const p of partes) {
    const caixa = caixaDaParte(p);
    if (caixa.max.z - caixa.min.z < ALTURA_DE_FACHADA) continue;
    const novos: Decalque[] = [];
    for (const d of p.decalques) {
      const eixo: Eixo | null = d.normal.x > 0.99 ? 'x' : d.normal.y > 0.99 ? 'y' : null;
      if (!eixo) continue;
      if (p.decalques.some((q) => q.normal[eixo] < -0.99 && q.faces.some(ehBrilho))) continue;
      const faces = d.faces.filter(ehBrilho).map((f) => {
        const nova: Face = {
          ...f,
          pts: f.pts.map((q) => ({ ...q, [eixo]: caixa.min[eixo] - FOLGA_DO_ESPELHO })),
        };
        espelhadas.add(nova);
        return nova;
      });
      if (faces.length > 0)
        novos.push({ normal: { x: eixo === 'x' ? -1 : 0, y: eixo === 'y' ? -1 : 0, z: 0 }, faces });
    }
    p.decalques.push(...novos);
  }
  for (const p of partes) {
    for (const d of p.decalques) {
      d.faces = d.faces.filter((f) => {
        if (!espelhadas.has(f)) return true;
        const eixo: Eixo = Math.abs(d.normal.x) > 0.9 ? 'x' : 'y';
        const ao: Eixo = eixo === 'x' ? 'y' : 'x';
        const plano = f.pts[0]![eixo];
        const a0 = Math.min(...f.pts.map((q) => q[ao]));
        const a1 = Math.max(...f.pts.map((q) => q[ao]));
        const z0 = Math.min(...f.pts.map((q) => q.z));
        const z1 = Math.max(...f.pts.map((q) => q.z));
        return !partes.some((q) => {
          if (q === p) return false;
          const c = caixaDaParte(q);
          return (
            plano >= c.min[eixo] - 0.02 &&
            plano <= c.max[eixo] + 0.02 &&
            Math.min(a1, c.max[ao]) - Math.max(a0, c.min[ao]) > 0.025 &&
            Math.min(z1, c.max.z) - Math.max(z0, c.min.z) > 0.5
          );
        });
      });
    }
  }
}

/** Recorta a janela acesa pela face da parede que a recebe (não passa da empena nem flutua). */
function recortarNaParede(f: Face, normal: Vec3, p: Parte, iso: Iso): Face {
  if (!ehBrilho(f)) return f;
  const normais = normaisDaParte(p, iso);
  const parede = p.faces.find(
    (_, i) =>
      normais[i]!.x * normal.x + normais[i]!.y * normal.y + normais[i]!.z * normal.z > 0.999,
  );
  if (!parede) return f;
  const [k0, k1] = (
    Math.abs(normal.x) > 0.9 ? ['y', 'z'] : Math.abs(normal.y) > 0.9 ? ['x', 'z'] : ['x', 'y']
  ) as ['x' | 'y', 'y' | 'z'];
  const cruz = (a: Vec3, b: Vec3, c: Vec3) =>
    (b[k0] - a[k0]) * (c[k1] - a[k1]) - (b[k1] - a[k1]) * (c[k0] - a[k0]);
  let area = 0;
  const h = parede.pts;
  for (let i = 0; i < h.length; i++) {
    const a = h[i]!;
    const b = h[(i + 1) % h.length]!;
    area += a[k0] * b[k1] - b[k0] * a[k1];
  }
  const sinal = area >= 0 ? 1 : -1;
  let pts = f.pts;
  for (let i = 0; i < h.length && pts.length >= 3; i++) {
    const a = h[i]!;
    const b = h[(i + 1) % h.length]!;
    const saida: Vec3[] = [];
    for (let j = 0; j < pts.length; j++) {
      const s = pts[j]!;
      const e = pts[(j + 1) % pts.length]!;
      const ds = cruz(a, b, s) * sinal;
      const de = cruz(a, b, e) * sinal;
      const si = ds >= -1e-6;
      if (si) saida.push(s);
      if (si !== de >= -1e-6) {
        const t = ds / (ds - de);
        saida.push({
          x: s.x + (e.x - s.x) * t,
          y: s.y + (e.y - s.y) * t,
          z: s.z + (e.z - s.z) * t,
        });
      }
    }
    pts = saida;
  }
  return { ...f, pts };
}

function acabar(m: Obra, nome: NomeModelo): Modelo {
  espelharJanelas(m.partes);
  for (const p of m.partes)
    for (const d of p.decalques)
      d.faces = d.faces
        .map((f) => recortarNaParede(f, f.normal ?? d.normal, p, m.ctx.iso))
        .filter((f) => f.pts.length >= 3);
  return m.modelo(nome);
}
