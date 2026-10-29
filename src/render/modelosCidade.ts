import type { Material, Parte } from './geometria';
import type { Vec3 } from './iso';
import {
  AFASTAMENTO_DECALQUE,
  ANEIS_ESFERA,
  FATIAS_ESFERA,
  Montagem,
  type ContextoModelo,
  type Modelo,
} from './modelos';
import {
  arcoDeParede,
  cone,
  decalqueNaParede,
  esfera,
  extrusao,
  frisos,
  prisma,
  retanguloDeParede,
  telhadoDuasAguas,
  telhadoQuatroAguas,
  type Contorno,
  type Lado,
  type Pegada,
} from './primitivas';

// Modelos do passe de design (docs/DESIGN.md): casas novas para a rua, comércio, marcos da cidade,
// mobiliário urbano, limites e decoração. Mesmas regras de arte dos modelos de modelos.ts: medidas
// em tiles no plano e em frações do andar na vertical, frente voltada para +x, três tons pela
// normal e brilho sempre no branco frio da paleta (o cenário não usa cor de acento).
// As chaminés ficam encostadas na parede dos fundos (−x): o telhado esconde a base sem cruzá-la.

const RECESSO: Material = { tipo: 'recesso' };
/** Folga da tampa (chaminé, platibanda) em volta da peça de baixo, em tiles. */
const BEIRAL_TAMPA = 0.04;
const ALTURA_TAMPA = 5;

function ret(x0: number, y0: number, x1: number, y1: number): Pegada {
  return { x0, y0, x1, y1 };
}

function emVolta(r: Pegada, folga: number): Pegada {
  return { x0: r.x0 - folga, y0: r.y0 - folga, x1: r.x1 + folga, y1: r.y1 + folga };
}

/** Lâmpada (lanternas dos arcos e do pórtico): a luz branca dos postes. */
function brilho(ctx: ContextoModelo): Material {
  return ctx.janelasApagadas ? RECESSO : { tipo: 'emissivo', cor: ctx.visual.paleta.luz };
}

/** Vidro aceso e vela (janela do chalé, cara das abóboras): o tom quente das janelas acesas. */
function brilhoQuente(ctx: ContextoModelo): Material {
  return ctx.janelasApagadas
    ? RECESSO
    : { tipo: 'emissivo', cor: ctx.visual.janelasAcesas.cores[0]! };
}

/** Chaminé encostada nos fundos, com tampa. */
function chamine(m: Montagem, r: Pegada, altura: number): void {
  m.caixa(r, 0, altura);
  m.caixa(emVolta(r, BEIRAL_TAMPA), altura, altura + ALTURA_TAMPA);
  m.chamines.push({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, z: altura + ALTURA_TAMPA });
}

/** Recesso (porta, venezianas, faixas) numa parede, sem luz. */
function recessoNaParede(p: Parte, r: Pegada, lado: Lado, contornos: Contorno[][]): void {
  p.decalques.push(decalqueNaParede(r, lado, contornos, RECESSO, AFASTAMENTO_DECALQUE));
}

/** Janela de contorno livre (o triângulo do chalé), acesa como as outras. */
function vidroNaParede(
  ctx: ContextoModelo,
  p: Parte,
  r: Pegada,
  lado: Lado,
  contorno: Contorno[],
): void {
  p.decalques.push(decalqueNaParede(r, lado, [contorno], brilhoQuente(ctx), AFASTAMENTO_DECALQUE));
}

/** Letreiro saliente na fachada (+x): uma placa escura, sem luz (só janelas e postes brilham). */
function letreiro(m: Montagem, r: Pegada, z0: number, z1: number): void {
  m.caixa(r, z0, z1);
}

/** Pequena marquise sobre uma porta (+x), com dois pés finos. */
function marquise(m: Montagem, x: number, y0: number, y1: number, fundo: number, z: number): void {
  m.caixa(ret(x, y0, x + fundo, y1), z, z + 3);
  m.caixa(ret(x + fundo - 0.06, y0, x + fundo, y0 + 0.06), 0, z);
  m.caixa(ret(x + fundo - 0.06, y1 - 0.06, x + fundo, y1), 0, z);
}

// ---------------------------------------------------------------------------------- casas

/** Duas casas geminadas de dois andares: uma de telhado, a outra mais alta com platibanda. */
export function geminado(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const H = m.andar;
  const rA = ret(0.3, 0, 2.6, 2.1);
  const a = m.caixa(rA, 0, 2 * H);
  m.add(telhadoDuasAguas(ret(0.2, 0, 2.7, 2.1), 2 * H, 0.62 * H, 'y'));
  m.porta(a, rA, '+x', 0.75, 1.05, 0);
  m.janela(a, rA, '+x', 1.3, 1.85, m.faixaJanela(0));
  m.janela(a, rA, '+x', 0.3, 0.85, m.faixaJanela(1));
  m.janela(a, rA, '+x', 1.25, 1.85, m.faixaJanela(1), { panos: 2 });
  for (const n of [0, 1]) {
    m.janela(a, rA, '-y', 1.0, 1.5, m.faixaJanela(n));
    m.janela(a, rA, '-x', 0.6, 1.1, m.faixaJanela(n));
  }
  marquise(m, 2.6, 0.62, 1.18, 0.28, 0.8 * H);
  chamine(m, ret(0, 0.55, 0.28, 0.9), 2.8 * H);

  const rB = ret(0.3, 2.1, 2.75, 4.2);
  const topoB = 2.2 * H;
  const b = m.caixa(rB, 0, topoB);
  b.decalques.push(...frisos(rB, H, 3, 0.04));
  m.caixa(emVolta(rB, 0.05), topoB, topoB + 6);
  m.caixa(ret(0.65, 3.0, 1.2, 3.55), topoB + 6, topoB + 26);
  m.porta(b, rB, '+x', 3.2, 3.5, 0);
  m.janela(b, rB, '+x', 2.4, 2.95, m.faixaJanela(0));
  m.janela(b, rB, '+x', 2.4, 2.95, m.faixaJanela(1));
  m.janela(b, rB, '+x', 3.45, 4.0, m.faixaJanela(1));
  for (const n of [0, 1]) {
    m.janela(b, rB, '+y', 0.85, 1.35, m.faixaJanela(n));
    m.janela(b, rB, '+y', 1.8, 2.3, m.faixaJanela(n));
    m.janela(b, rB, '-x', 3.0, 3.5, m.faixaJanela(n));
  }
  marquise(m, 2.75, 3.12, 3.58, 0.25, 0.8 * H);
  return m.modelo('geminado');
}

/** Chalé em A: o telhado começa no chão, com porta, janelas e um janelão triangular na empena. */
export function chale(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const H = m.andar;
  const rTelhado = ret(0.35, 0, 3.0, 2.8);
  const telhado = m.add(telhadoDuasAguas(rTelhado, 0, 2.15 * H, 'x'));
  m.porta(telhado, rTelhado, '+x', 1.22, 1.58, 0);
  m.janela(telhado, rTelhado, '+x', 0.55, 0.9, [10, 30]);
  m.janela(telhado, rTelhado, '+x', 1.9, 2.25, [10, 30]);
  vidroNaParede(ctx, telhado, rTelhado, '+x', [
    { a: 0.95, z: 0.98 * H },
    { a: 1.85, z: 0.98 * H },
    { a: 1.4, z: 1.75 * H },
  ]);
  m.janela(telhado, rTelhado, '-x', 1.2, 1.6, [20, 40]);
  chamine(m, ret(0, 1.6, 0.33, 1.95), 2.45 * H);
  // Deque na frente, com guarda-corpo nas laterais.
  m.caixa(ret(3.0, 0.4, 3.4, 2.4), 0, 5);
  m.caixa(ret(3.0, 0.4, 3.38, 0.45), 5, 16);
  m.caixa(ret(3.0, 2.35, 3.38, 2.4), 5, 16);
  return m.modelo('chale');
}

/** Casa com torreão: corpo de dois andares, ala baixa e a torre octogonal de chapéu de bruxa. */
export function casaTorre(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const H = m.andar;
  const r = ret(0.35, 0, 2.95, 2.6);
  const corpo = m.caixa(r, 0, 2 * H);
  corpo.decalques.push(...frisos(r, H, 3, 0.04));
  m.add(telhadoQuatroAguas(ret(0.23, -0.1, 3.07, 2.7), 2 * H, 0.75 * H));
  m.porta(corpo, r, '+x', 1.0, 1.35, 0);
  m.janela(corpo, r, '+x', 0.35, 0.8, m.faixaJanela(0));
  m.janela(corpo, r, '+x', 1.7, 2.2, m.faixaJanela(0));
  for (const [a0, a1] of [
    [0.35, 0.8],
    [1.0, 1.45],
    [1.7, 2.2],
  ] as const)
    m.janela(corpo, r, '+x', a0, a1, m.faixaJanela(1));
  for (const n of [0, 1]) {
    m.janela(corpo, r, '-y', 1.0, 1.5, m.faixaJanela(n));
    m.janela(corpo, r, '-x', 0.8, 1.3, m.faixaJanela(n));
  }
  marquise(m, 2.95, 0.85, 1.5, 0.35, 0.82 * H);
  chamine(m, ret(0, 1.0, 0.33, 1.35), 3 * H);

  const rAla = ret(0.35, 2.6, 2.25, 3.55);
  const ala = m.caixa(rAla, 0, 1.2 * H);
  m.add(telhadoDuasAguas(ret(0.3, 2.55, 2.3, 3.6), 1.2 * H, 0.5 * H, 'x'));
  m.janela(ala, rAla, '+y', 0.8, 1.3, m.faixaJanela(0));
  m.janela(ala, rAla, '+y', 1.6, 2.05, m.faixaJanela(0));

  // Torreão na quina da frente: prisma de 8 lados, janelas nas faces retas e chapéu alto.
  const cx = 3.15;
  const cy = 2.95;
  const raio = 0.6;
  const torre = m.add(prisma(cx, cy, raio, 8, 0, 2.55 * H));
  const face = raio * Math.cos(Math.PI / 8);
  const rTorre = ret(cx - face, cy - face, cx + face, cy + face);
  for (const n of [0, 1]) {
    m.janela(torre, rTorre, '+x', cy - 0.13, cy + 0.13, m.faixaJanela(n));
    m.janela(torre, rTorre, '+y', cx - 0.13, cx + 0.13, m.faixaJanela(n));
  }
  m.add(cone(cx, cy, 0.72, 8, 2.55 * H, 3.95 * H));
  return m.modelo('casa_torre');
}

/**
 * Casa da Viúva do Mirante: sobrado de três andares com o mirante (torre quadrada com janelas dos
 * quatro lados) no telhado e a sacada do 2º andar saindo 1,4 tile pela frente, apoiada em
 * mãos-francesas; é dela que a Viúva chove as Lágrimas sobre a praça.
 */
export function mirante(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const H = m.andar;
  const r = ret(0, 0, 3.2, 4);
  const corpo = m.caixa(r, 0, 3 * H);
  corpo.decalques.push(...frisos(r, H, 3, 0.04), ...frisos(r, 2 * H, 4, 0.04));
  m.add(telhadoQuatroAguas(ret(-0.1, -0.1, 3.3, 4.1), 3 * H, 0.7 * H));
  m.porta(corpo, r, '+x', 0.55, 1.0, 0, true);
  for (const n of [0, 1]) {
    m.janela(corpo, r, '+x', 1.45, 1.85, m.faixaJanela(n));
    m.janela(corpo, r, '+x', 2.95, 3.45, m.faixaJanela(n));
    m.janela(corpo, r, '-y', 1.2, 1.7, m.faixaJanela(n));
    m.janela(corpo, r, '+y', 1.5, 2.0, m.faixaJanela(n));
  }
  // 2º andar: a porta da sacada e duas janelas estreitas.
  m.janela(corpo, r, '+x', 1.65, 2.35, m.faixaJanela(2));
  m.janela(corpo, r, '+x', 0.5, 0.85, m.faixaJanela(2));
  m.janela(corpo, r, '+x', 3.15, 3.5, m.faixaJanela(2));
  chamine(m, ret(0, 0.6, 0.35, 0.95), 4.2 * H);

  // Sacada: laje, guarda-corpo vazado e mãos-francesas embaixo.
  const piso = 2 * H;
  m.caixa(ret(3.2, 1.2, 4.6, 2.8), piso - 3, piso);
  const alto = piso + 0.45 * H;
  m.caixa(ret(4.52, 1.2, 4.6, 2.8), alto - 2, alto);
  m.caixa(ret(3.2, 1.2, 4.6, 1.28), alto - 2, alto);
  m.caixa(ret(3.2, 2.72, 4.6, 2.8), alto - 2, alto);
  for (let y = 1.2; y <= 2.75; y += 0.26) m.caixa(ret(4.53, y, 4.59, y + 0.05), piso, alto - 2);
  for (const y of [1.3, 2.6]) m.caixa(ret(3.2, y, 3.75, y + 0.1), piso - 0.5 * H, piso - 3);

  // O mirante: torre quadrada no telhado, janelas dos quatro lados e telhado de pirâmide.
  const rTorre = ret(1.0, 1.4, 2.2, 2.6);
  const torre = m.caixa(rTorre, 3 * H, 4.4 * H);
  for (const lado of ['+x', '-x', '+y', '-y'] as const) {
    const [a0, a1] = lado === '+x' || lado === '-x' ? [1.75, 2.25] : [1.35, 1.85];
    m.janela(torre, rTorre, lado, a0, a1, [3.35 * H, 4.05 * H]);
  }
  m.add(telhadoQuatroAguas(ret(0.9, 1.3, 2.3, 2.7), 4.4 * H, 0.9 * H));
  return m.modelo('mirante');
}

/** Loja de esquina com moradia em cima: vitrine acesa, toldo listrado e letreiro. */
export function loja(ctx: ContextoModelo, variante = 'mercadinho'): Modelo {
  const m = new Montagem(ctx);
  const H = m.andar;
  const r = ret(0.3, 0, 3.0, 3.6);
  const corpo = m.caixa(r, 0, 2 * H);
  corpo.decalques.push(...frisos(r, H, 3, 0.04));
  m.caixa(emVolta(r, 0.05), 2 * H, 2 * H + 10);
  // Vitrine (três panos acesos) e porta de vidro: iluminam a calçada.
  for (const [a0, a1] of [
    [0.25, 0.85],
    [0.95, 1.55],
    [1.65, 2.25],
  ] as const)
    m.janela(corpo, r, '+x', a0, a1, [6, 0.72 * H]);
  m.janela(corpo, r, '+x', 2.55, 3.1, [0, 0.78 * H]);
  for (const [a0, a1] of [
    [0.35, 0.85],
    [1.25, 1.75],
    [2.15, 2.65],
  ] as const)
    m.janela(corpo, r, '+x', a0, a1, m.faixaJanela(1));
  for (const n of [0, 1]) {
    m.janela(corpo, r, '+y', 0.8, 1.3, m.faixaJanela(n));
    m.janela(corpo, r, '+y', 1.8, 2.3, m.faixaJanela(n));
    m.janela(corpo, r, '-x', 1.2, 1.7, m.faixaJanela(n));
  }
  // Ar-condicionado na lateral.
  m.caixa(ret(1.0, 3.6, 1.4, 3.74), 1.35 * H, 1.6 * H);

  // Toldo inclinado, com listras de sombra por cima.
  const zAlto = 0.92 * H;
  const zBaixo = 0.7 * H;
  const y0 = 0.15;
  const y1 = 3.45;
  const toldo = m.add(
    extrusao(
      [
        { u: 3.0, z: zAlto },
        { u: 3.55, z: zBaixo },
        { u: 3.55, z: zBaixo - 4 },
        { u: 3.0, z: zAlto - 3 },
      ],
      'y',
      y0,
      y1,
    ),
  );
  const listras = 9;
  const passo = (y1 - y0) / listras;
  const faixas = [];
  for (let k = 0; k < listras; k += 2) {
    const a = y0 + k * passo;
    const b = a + passo;
    const pts: Vec3[] = [
      { x: 3.0, y: a, z: zAlto + 0.6 },
      { x: 3.55, y: a, z: zBaixo + 0.6 },
      { x: 3.55, y: b, z: zBaixo + 0.6 },
      { x: 3.0, y: b, z: zAlto + 0.6 },
    ];
    faixas.push({ pts, material: RECESSO });
  }
  toldo.decalques.push({ normal: { x: 0.44, y: 0, z: 0.9 }, faces: faixas });

  // Letreiro logo acima do toldo: caixa escura com a face da frente acesa (a caixa inteira acesa
  // emendava com as janelas de cima numa silhueta serrilhada).
  if (variante === 'farmacia') {
    letreiro(m, ret(3.0, 0.5, 3.1, 2.9), 0.96 * H, 1.22 * H);
    // Placa saindo da parede, visível de lado (sem luz).
    m.caixa(ret(3.0, 3.38, 3.42, 3.46), 1.0 * H, 1.5 * H);
  } else if (variante === 'padaria') {
    letreiro(m, ret(3.0, 0.9, 3.1, 2.7), 0.96 * H, 1.22 * H);
    chamine(m, ret(0, 2.6, 0.3, 2.95), 2.6 * H);
  } else {
    letreiro(m, ret(3.0, 0.35, 3.1, 3.25), 0.96 * H, 1.22 * H);
  }
  return m.modelo('loja');
}

// ---------------------------------------------------------------------------------- marcos

/** Prédio de apartamentos: varandas na frente, caixa-d'água e antena no topo. */
export function predio(ctx: ContextoModelo, variante = 'medio'): Modelo {
  const m = new Montagem(ctx);
  const H = m.andar;
  const andares = variante === 'baixo' ? 4 : variante === 'alto' ? 6 : 5;
  const topo = andares * H;
  const r = ret(0, 0, 3.6, 5.0);
  const corpo = m.caixa(r, 0, topo);
  for (let k = 1; k < andares; k++) corpo.decalques.push(...frisos(r, k * H, 2, 0.03));
  // Padrão fixo de janelas apagadas, para o prédio não parecer um painel de luz.
  const apagada = (k: number, i: number) => (k * 7 + i * 3) % 5 === 0;
  m.janela(corpo, r, '+x', 0.45, 1.35, [4, 0.8 * H], { panos: 2 });
  m.janela(corpo, r, '+x', 3.6, 4.5, [4, 0.8 * H], { panos: 2 });
  m.janela(corpo, r, '+x', 2.15, 2.85, [0, 0.8 * H]);
  const colunasFrente = [
    [0.55, 0.95],
    [1.75, 2.15],
    [2.85, 3.25],
    [4.05, 4.45],
  ] as const;
  const colunasLado = [
    [0.4, 0.85],
    [1.4, 1.85],
    [2.4, 2.85],
  ] as const;
  for (let k = 1; k < andares; k++) {
    colunasFrente.forEach(([a0, a1], i) =>
      m.janela(corpo, r, '+x', a0, a1, m.faixaJanela(k), { apagada: apagada(k, i) }),
    );
    for (const y0 of [0.5, 3.5]) {
      m.caixa(ret(3.6, y0, 4.1, y0 + 1.0), k * H, k * H + 3);
      m.caixa(ret(4.05, y0, 4.1, y0 + 1.0), k * H + 3, k * H + 14);
    }
  }
  for (let k = 0; k < andares; k++) {
    colunasLado.forEach(([a0, a1], i) => {
      m.janela(corpo, r, '+y', a0, a1, m.faixaJanela(k), { apagada: apagada(k, i + 4) });
      m.janela(corpo, r, '-y', a0, a1, m.faixaJanela(k), { apagada: apagada(k + 1, i) });
    });
    m.janela(corpo, r, '-x', 1.5, 2.0, m.faixaJanela(k), { apagada: apagada(k, 2) });
    m.janela(corpo, r, '-x', 3.0, 3.5, m.faixaJanela(k), { apagada: apagada(k + 2, 1) });
  }
  marquise(m, 3.6, 1.95, 3.05, 0.4, 0.85 * H);
  m.caixa(emVolta(r, 0.05), topo, topo + 8);
  m.caixa(ret(0.6, 1.5, 1.6, 2.6), topo + 8, topo + 36);
  m.caixa(ret(2.4, 3.6, 2.47, 3.67), topo + 8, topo + 62);
  return m.modelo('predio');
}

/** Igreja: nave de duas águas, torre com campanário e agulha, janelas altas em arco. */
export function igreja(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const H = m.andar;
  const rNave = ret(0.3, 0.5, 4.6, 3.5);
  const nave = m.caixa(rNave, 0, 2.3 * H);
  for (const [a0, a1] of [
    [0.8, 1.2],
    [1.8, 2.2],
    [2.8, 3.2],
    [3.8, 4.2],
  ] as const) {
    m.janela(nave, rNave, '+y', a0, a1, [0.5 * H, 1.8 * H], { arco: true });
    m.janela(nave, rNave, '-y', a0, a1, [0.5 * H, 1.8 * H], { arco: true });
  }
  m.add(telhadoDuasAguas(ret(0.2, 0.35, 4.7, 3.65), 2.3 * H, 1.15 * H, 'x'));
  const rTorre = ret(4.6, 1.35, 5.8, 2.65);
  const torre = m.caixa(rTorre, 0, 4.3 * H);
  torre.decalques.push(...frisos(rTorre, 2.3 * H, 4, 0.05), ...frisos(rTorre, 3.4 * H, 4, 0.05));
  recessoNaParede(torre, rTorre, '+x', [
    arcoDeParede(1.75, 2.25, 0, 1.05 * H, ctx.iso, 6),
    arcoDeParede(1.8, 2.2, 3.55 * H, 4.1 * H, ctx.iso, 6),
  ]);
  recessoNaParede(torre, rTorre, '+y', [arcoDeParede(4.95, 5.45, 3.55 * H, 4.1 * H, ctx.iso, 6)]);
  m.janela(torre, rTorre, '+x', 1.85, 2.15, [1.5 * H, 2.1 * H], { arco: true });
  m.add(telhadoQuatroAguas(ret(4.55, 1.3, 5.85, 2.7), 4.3 * H, 2.3 * H));
  m.caixa(ret(5.8, 1.5, 6.0, 2.5), 0, 4);
  return m.modelo('igreja');
}

/** Escola: bloco comprido de dois andares, pórtico de entrada e mastro. */
export function escola(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const H = m.andar;
  const r = ret(0, 0, 3.2, 8.0);
  const corpo = m.caixa(r, 0, 2 * H);
  corpo.decalques.push(...frisos(r, H, 3, 0.04));
  m.add(telhadoQuatroAguas(ret(-0.1, -0.1, 3.3, 8.1), 2 * H, 0.45 * H));
  for (let k = 0; k < 8; k++) {
    const a0 = 0.25 + k * 0.97;
    const a1 = a0 + 0.55;
    const noPortico = a1 > 3.2 && a0 < 4.8;
    if (!noPortico) m.janela(corpo, r, '+x', a0, a1, m.faixaJanela(0), { panos: 2 });
    m.janela(corpo, r, '+x', a0, a1, m.faixaJanela(1), { panos: 2, apagada: k % 3 === 1 });
  }
  for (const n of [0, 1]) {
    m.janela(corpo, r, '+y', 0.5, 1.1, m.faixaJanela(n), { panos: 2 });
    m.janela(corpo, r, '+y', 1.9, 2.5, m.faixaJanela(n), { panos: 2 });
  }
  const rPortico = ret(3.2, 3.3, 3.85, 4.7);
  const portico = m.caixa(rPortico, 0, 1.25 * H);
  recessoNaParede(portico, rPortico, '+x', [retanguloDeParede(3.7, 4.3, 0, 0.85 * H)]);
  m.caixa(emVolta(rPortico, 0.08), 1.25 * H, 1.25 * H + 5);
  m.caixa(ret(3.75, 0.6, 3.81, 0.66), 0, 2.8 * H);
  m.caixa(ret(3.77, 0.66, 3.79, 1.1), 2.4 * H, 2.75 * H);
  return m.modelo('escola');
}

/** Galpão de telhado em serra, com as faces de vidro acesas, portão grande e plataforma. */
export function galpao(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const H = m.andar;
  const r = ret(0.2, 0, 4.8, 4.2);
  const paredes = m.caixa(r, 0, 1.5 * H);
  recessoNaParede(paredes, r, '+x', [retanguloDeParede(0.8, 3.4, 0, 1.15 * H)]);
  m.janela(paredes, r, '+y', 0.6, 1.6, [0.95 * H, 1.3 * H], { panos: 2 });
  m.janela(paredes, r, '+y', 2.0, 3.0, [0.95 * H, 1.3 * H], { panos: 2 });
  m.janela(paredes, r, '+y', 3.4, 4.4, [0.95 * H, 1.3 * H], { panos: 2 });
  const dentes = 3;
  const passo = (r.x1 - r.x0) / dentes;
  for (let k = 0; k < dentes; k++) {
    const xa = r.x0 + k * passo;
    const xb = xa + passo;
    const dente = m.add(
      extrusao(
        [
          { u: xa, z: 1.5 * H },
          { u: xb, z: 1.5 * H },
          { u: xb, z: 2.05 * H },
        ],
        'y',
        r.y0,
        r.y1,
      ),
    );
    m.janela(dente, ret(xa, r.y0, xb, r.y1), '+x', 0.3, 3.9, [1.55 * H, 1.98 * H], {
      apagada: k === 1,
    });
  }
  m.caixa(ret(4.8, 0.6, 5.0, 3.6), 0, 8);
  return m.modelo('galpao');
}

/** Caixa-d'água do bairro: quatro pernas travadas, tanque octogonal e escada. */
export function caixaDagua(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const H = m.andar;
  const alto = 2.6 * H;
  for (const x of [0.4, 1.85])
    for (const y of [0.4, 1.85]) m.caixa(ret(x, y, x + 0.15, y + 0.15), 0, alto);
  for (const z of [0.9 * H, 1.8 * H]) {
    m.caixa(ret(0.47, 0.44, 1.93, 0.5), z, z + 3);
    m.caixa(ret(0.47, 1.89, 1.93, 1.95), z, z + 3);
    m.caixa(ret(0.44, 0.47, 0.5, 1.93), z, z + 3);
    m.caixa(ret(1.89, 0.47, 1.95, 1.93), z, z + 3);
  }
  m.add(prisma(1.2, 1.2, 0.85, 8, alto, 3.7 * H));
  m.add(cone(1.2, 1.2, 0.95, 8, 3.7 * H, 4.2 * H));
  m.caixa(ret(2.0, 1.15, 2.04, 1.25), 0, alto);
  return m.modelo('caixa_dagua');
}

// ---------------------------------------------------------------------------------- praça

/** Chafariz: bacia octogonal com água escura, coluna e taça. */
export function chafariz(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const c = 1.5;
  m.add(prisma(c, c, 1.3, 8, 0, 10));
  m.add(prisma(c, c, 1.12, 8, 10, 10.4, RECESSO));
  m.add(prisma(c, c, 0.14, 6, 10.4, 34));
  m.add(prisma(c, c, 0.5, 8, 34, 38));
  m.add(prisma(c, c, 0.42, 8, 38, 38.4, RECESSO));
  m.add(prisma(c, c, 0.1, 6, 38.4, 46));
  return m.modelo('chafariz');
}

/** Balanço de parquinho com dois assentos (comprido em y). */
export function balanco(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  for (const y of [0.05, 2.05]) {
    m.caixa(ret(0.55, y, 0.65, y + 0.1), 0, 40);
    m.caixa(ret(0.2, y, 1.0, y + 0.1), 0, 3);
  }
  m.caixa(ret(0.56, 0.05, 0.64, 2.15), 38, 41);
  for (const y0 of [0.55, 1.25]) {
    m.caixa(ret(0.59, y0 + 0.04, 0.61, y0 + 0.06), 13, 38);
    m.caixa(ret(0.59, y0 + 0.44, 0.61, y0 + 0.46), 13, 38);
    m.caixa(ret(0.45, y0, 0.75, y0 + 0.5), 11, 13);
  }
  return m.modelo('balanco');
}

/** Escorregador: escada, plataforma e a rampa descendo para +y. */
export function escorregador(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa(ret(0.3, 0.1, 0.38, 0.18), 0, 34);
  m.caixa(ret(0.62, 0.1, 0.7, 0.18), 0, 34);
  for (const z of [8, 16, 24]) m.caixa(ret(0.38, 0.12, 0.62, 0.16), z, z + 2);
  m.caixa(ret(0.3, 0.2, 0.7, 0.6), 30, 33);
  m.add(
    extrusao(
      [
        { u: 0.6, z: 30 },
        { u: 2.5, z: 2 },
        { u: 2.5, z: 5 },
        { u: 0.6, z: 33 },
      ],
      'x',
      0.32,
      0.68,
    ),
  );
  return m.modelo('escorregador');
}

/** Floreira de alvenaria com três moitas. */
export function floreira(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa(ret(0.05, 0.05, 1.15, 0.55), 0, 9);
  for (const [x, z] of [
    [0.3, 13],
    [0.6, 15],
    [0.9, 13],
  ] as const)
    m.add(esfera(x, 0.3, z, 0.2, ctx.iso, FATIAS_ESFERA, ANEIS_ESFERA));
  return m.modelo('floreira');
}

export function arbusto(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.add(esfera(0.42, 0.56, 9, 0.3, ctx.iso, FATIAS_ESFERA, ANEIS_ESFERA));
  m.add(esfera(0.62, 0.4, 11, 0.26, ctx.iso, FATIAS_ESFERA, ANEIS_ESFERA));
  return m.modelo('arbusto');
}

/** Pinheiro: tronco curto e três cones empilhados. */
export function pinheiro(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa(ret(0.45, 0.45, 0.55, 0.55), 0, 14);
  m.add(cone(0.5, 0.5, 0.42, 8, 12, 40));
  m.add(cone(0.5, 0.5, 0.33, 8, 30, 56));
  m.add(cone(0.5, 0.5, 0.22, 8, 46, 74));
  return m.modelo('pinheiro');
}

/** Árvore seca de galhos em degrau: o toque assombrado do bairro. */
export function arvoreSeca(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa(ret(0.45, 0.45, 0.55, 0.55), 0, 44);
  // Galhos inclinados: paralelogramos puxados ao longo de um eixo fino.
  const galho = (eixo: 'x' | 'y', u0: number, z0: number, u1: number, z1: number, grosso = 0.04) =>
    m.add(
      extrusao(
        [
          { u: u0, z: z0 },
          { u: u0 + grosso, z: z0 },
          { u: u1 + grosso, z: z1 },
          { u: u1, z: z1 },
        ],
        eixo,
        0.475,
        0.525,
      ),
    );
  galho('y', 0.53, 26, 0.86, 48);
  galho('y', 0.8, 44, 0.9, 58, 0.03);
  galho('y', 0.43, 34, 0.14, 56);
  galho('y', 0.18, 52, 0.1, 64, 0.03);
  galho('x', 0.53, 20, 0.84, 40);
  galho('x', 0.43, 38, 0.2, 60);
  galho('x', 0.47, 42, 0.56, 70, 0.03);
  return m.modelo('arvore_seca');
}

// ---------------------------------------------------------------------------------- rua

export function hidrante(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.add(prisma(0.5, 0.5, 0.1, 8, 0, 12));
  m.add(prisma(0.5, 0.5, 0.12, 8, 12, 14));
  m.add(cone(0.5, 0.5, 0.08, 8, 14, 18));
  m.caixa(ret(0.38, 0.47, 0.62, 0.53), 7, 10);
  return m.modelo('hidrante');
}

export function caixaCorreio(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa(ret(0.47, 0.47, 0.53, 0.53), 0, 16);
  const r = ret(0.38, 0.4, 0.66, 0.6);
  const caixa = m.caixa(r, 16, 24);
  recessoNaParede(caixa, r, '+x', [retanguloDeParede(0.44, 0.56, 20, 21.5)]);
  return m.modelo('caixa_correio');
}

/** Orelhão: poste, aparelho e a concha arredondada. */
export function orelhao(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa(ret(0.46, 0.46, 0.54, 0.54), 0, 30);
  m.caixa(ret(0.42, 0.45, 0.58, 0.6), 24, 32);
  m.add(esfera(0.5, 0.55, 36, 0.3, ctx.iso, FATIAS_ESFERA, ANEIS_ESFERA));
  return m.modelo('orelhao');
}

/** Caçamba de entulho. */
export function cacamba(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa(ret(0.1, 0.1, 1.7, 0.9), 0, 16);
  m.caixa(ret(0.05, 0.05, 1.75, 0.95), 16, 18);
  m.caixa(ret(0.3, 0.3, 0.9, 0.7), 18, 22);
  m.caixa(ret(1.0, 0.25, 1.4, 0.6), 18, 21);
  return m.modelo('cacamba');
}

/** Semáforo de pedestres: só o branco frio aceso (o cenário não usa cor de acento). */
export function semaforo(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa(ret(0.46, 0.46, 0.54, 0.54), 0, 64);
  m.caixa(ret(0.54, 0.47, 0.95, 0.53), 60, 63);
  const r = ret(0.85, 0.42, 0.97, 0.58);
  const caixa = m.caixa(r, 42, 62);
  recessoNaParede(caixa, r, '+x', [
    retanguloDeParede(0.45, 0.55, 46, 50),
    retanguloDeParede(0.45, 0.55, 52, 56),
    retanguloDeParede(0.45, 0.55, 57, 61),
  ]);
  return m.modelo('semaforo');
}

export function placaRua(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa(ret(0.47, 0.47, 0.53, 0.53), 0, 40);
  m.caixa(ret(0.5, 0.2, 0.54, 0.8), 36, 44);
  m.caixa(ret(0.2, 0.5, 0.8, 0.54), 29, 37);
  return m.modelo('placa_rua');
}

// ---------------------------------------------------------------------------------- limites

/** Muro alto (1 tile ao longo de x), com capa. */
export function muro(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const H = m.andar;
  m.caixa(ret(0, 0.02, 1, 0.28), 0, 1.1 * H);
  m.caixa(ret(0, 0, 1, 0.3), 1.1 * H, 1.1 * H + 3);
  return m.modelo('muro');
}

/** Tapume de obra (1 tile ao longo de x), com as emendas escuras. */
export function tapume(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const H = m.andar;
  const r = ret(0, 0.05, 1, 0.15);
  const placa = m.caixa(r, 0, 1.25 * H);
  const emendas = [
    retanguloDeParede(0.48, 0.52, 0, 1.25 * H),
    retanguloDeParede(0, 1, 0.55 * H, 0.6 * H),
  ];
  recessoNaParede(placa, r, '+y', emendas);
  recessoNaParede(placa, r, '-y', emendas);
  return m.modelo('tapume');
}

/** Cavalete de obra listrado, com a lâmpada de alerta acesa em cima. */
export function cavalete(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa(ret(0.1, 0.15, 0.16, 0.25), 0, 16);
  m.caixa(ret(1.04, 0.15, 1.1, 0.25), 0, 16);
  const r = ret(0, 0.17, 1.2, 0.23);
  const tabua = m.caixa(r, 10, 18);
  const listras = [
    retanguloDeParede(0, 0.2, 10, 18),
    retanguloDeParede(0.4, 0.6, 10, 18),
    retanguloDeParede(0.8, 1.0, 10, 18),
  ];
  recessoNaParede(tabua, r, '+y', listras);
  recessoNaParede(tabua, r, '-y', listras);
  return m.modelo('cavalete');
}

export function coneDeObra(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa(ret(0.36, 0.36, 0.64, 0.64), 0, 2);
  m.add(cone(0.5, 0.5, 0.12, 6, 2, 16));
  return m.modelo('cone');
}

/**
 * Pórtico do bairro (atravessa a rua: comprido em y, posto com rot 90): dois pilares com
 * lanternas acesas, a viga e a placa (sem luz).
 */
export function portico(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const H = m.andar;
  const alto = 2.7 * H;
  for (const [y0, y1] of [
    [0, 0.7],
    [10.5, 11.2],
  ] as const) {
    const r = ret(0.05, y0, 0.75, y1);
    m.caixa(r, 0, alto);
    m.caixa(emVolta(r, 0.05), alto, alto + 6);
    m.caixa(ret(0.25, y0 + 0.2, 0.55, y1 - 0.2), alto + 6, alto + 16, brilho(ctx));
    if (!ctx.janelasApagadas) m.luzes.push({ tipo: 'poste', x: 0.4, y: (y0 + y1) / 2 });
  }
  m.caixa(ret(0.15, 0.7, 0.65, 10.5), 2.25 * H, 2.55 * H);
  m.caixa(ret(0.12, 3.8, 0.68, 7.4), 2.55 * H, 3.15 * H);
  return m.modelo('portico');
}

/**
 * Arco do ramal da Encruzilhada (atravessa o ramal: comprido em y, posto com rot 90): dois pilares
 * de pedra com lanternas acesas e uma viga com a placa, sem luz.
 */
export function arco(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const H = m.andar;
  const alto = 2.2 * H;
  for (const [y0, y1] of [
    [0, 0.6],
    [6.4, 7],
  ] as const) {
    const r = ret(0.1, y0, 0.7, y1);
    m.caixa(r, 0, alto);
    m.caixa(emVolta(r, 0.05), alto, alto + 5);
    m.caixa(ret(0.28, y0 + 0.18, 0.52, y1 - 0.18), alto + 5, alto + 13, brilho(ctx));
    if (!ctx.janelasApagadas) m.luzes.push({ tipo: 'poste', x: 0.4, y: (y0 + y1) / 2 });
  }
  m.caixa(ret(0.2, 0.6, 0.6, 6.4), 1.85 * H, 2.05 * H);
  m.caixa(ret(0.16, 2.2, 0.64, 4.8), 2.05 * H, 2.45 * H);
  return m.modelo('arco');
}

/**
 * Pilha de tijolos que o Dono do Bairro jogou (fica no chão como cobertura contra o feixe): três
 * fiadas desencontradas, nos cinzas do cenário.
 */
export function pilhaDeTijolos(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa(ret(0.12, 0.15, 0.52, 0.85), 0, 6);
  m.caixa(ret(0.52, 0.15, 0.88, 0.85), 0, 6);
  m.caixa(ret(0.22, 0.2, 0.62, 0.8), 6, 12);
  m.caixa(ret(0.62, 0.25, 0.82, 0.75), 6, 11);
  m.caixa(ret(0.35, 0.3, 0.7, 0.7), 12, 17);
  return m.modelo('pilha_tijolos');
}

/**
 * Patamar de pedra do jardim do mirante (o jardim em duas alturas): um piso elevado comprido em y,
 * com dois degraus na frente (+x) e a borda marcada.
 */
export function patamar(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa(ret(0, 0, 2.6, 7), 0, 10);
  m.caixa(ret(2.6, 0.6, 2.9, 6.4), 0, 6.5);
  m.caixa(ret(2.9, 0.6, 3.2, 6.4), 0, 3);
  m.caixa(ret(0, 0, 2.6, 0.18), 10, 12);
  m.caixa(ret(0, 6.82, 2.6, 7), 10, 12);
  return m.modelo('patamar');
}

/**
 * Espelho do corredor da Moradora (comprido em y, de frente para +x): moldura alta de madeira com
 * pés e o vidro claro (sem luz: só o tom mais claro do cenário).
 */
export function espelho(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa(ret(0.4, 0.15, 0.6, 0.3), 0, 6);
  m.caixa(ret(0.4, 0.9, 0.6, 1.05), 0, 6);
  const moldura = m.caixa(ret(0.42, 0.1, 0.58, 1.1), 6, 46);
  recessoNaParede(moldura, ret(0.42, 0.1, 0.58, 1.1), '+x', [retanguloDeParede(0.2, 1.0, 9, 43)]);
  m.caixa(ret(0.58, 0.2, 0.6, 1.0), 9, 43, {
    tipo: 'tom',
    tons: { topo: ctx.visual.paleta.luz, faceEsquerda: '#B8BBC6', faceDireita: '#9EA1AC' },
  });
  return m.modelo('espelho');
}

// ---------------------------------------------------------------------------------- Halloween

/**
 * Aldrava da Casa Desconfiada: a argola de ferro pregada na porta (o modelo fica encostado na
 * fachada, com a frente para a rua) e o capacho torto no chão. Só tons do cenário (regra 5).
 */
export function aldrava(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const ferro: Material = { tipo: 'recesso' };
  // O capacho, um pouco de lado.
  m.caixa(ret(0.5, 0.3, 0.86, 0.72), 0, 1.5, ferro);
  // A chapa na porta e a argola pendurada (três lados de um quadrado).
  m.caixa(ret(0.42, 0.45, 0.47, 0.55), 18, 24, ferro);
  m.caixa(ret(0.46, 0.41, 0.5, 0.44), 13, 20, ferro);
  m.caixa(ret(0.46, 0.56, 0.5, 0.59), 13, 20, ferro);
  m.caixa(ret(0.46, 0.41, 0.5, 0.59), 12, 14, ferro);
  return m.modelo('aldrava');
}

/** Abóbora de jardim com a cara recortada acesa (vela por dentro). */
export function aboboraDecor(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const corpo = m.add(esfera(0.5, 0.5, 7, 0.17, ctx.iso, FATIAS_ESFERA, ANEIS_ESFERA));
  m.caixa(ret(0.48, 0.48, 0.52, 0.52), 13, 17);
  const x = 0.5 + 0.17;
  const pts = (cs: [number, number][]): Vec3[] => cs.map(([y, z]) => ({ x, y, z }));
  corpo.decalques.push({
    normal: { x: 1, y: 0, z: 0 },
    faces: [
      {
        pts: pts([
          [0.4, 8],
          [0.47, 8],
          [0.435, 11],
        ]),
        material: brilhoQuente(ctx),
      },
      {
        pts: pts([
          [0.53, 8],
          [0.6, 8],
          [0.565, 11],
        ]),
        material: brilhoQuente(ctx),
      },
      {
        pts: pts([
          [0.4, 5],
          [0.6, 5],
          [0.55, 3],
          [0.45, 3],
        ]),
        material: brilhoQuente(ctx),
      },
    ],
  });
  return m.modelo('abobora_decor');
}

/**
 * Abóbora gigante de vitrine (arma do cenário): quebra e explode. Bem maior que a de enfeite, com
 * rosto aceso e um cabo grosso; a única abóbora do cenário que dá para quebrar com efeito.
 */
export function aboboraGigante(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const raio = 0.36;
  const centro = 16;
  const corpo = m.add(esfera(0.5, 0.5, centro, raio, ctx.iso, FATIAS_ESFERA, ANEIS_ESFERA));
  m.caixa(ret(0.46, 0.46, 0.54, 0.54), centro + 13, centro + 21);
  const x = 0.5 + raio;
  const pts = (cs: [number, number][]): Vec3[] => cs.map(([y, z]) => ({ x, y, z }));
  corpo.decalques.push({
    normal: { x: 1, y: 0, z: 0 },
    faces: [
      {
        pts: pts([
          [0.36, centro + 2],
          [0.46, centro + 2],
          [0.41, centro + 8],
        ]),
        material: brilhoQuente(ctx),
      },
      {
        pts: pts([
          [0.54, centro + 2],
          [0.64, centro + 2],
          [0.59, centro + 8],
        ]),
        material: brilhoQuente(ctx),
      },
      {
        pts: pts([
          [0.34, centro - 4],
          [0.66, centro - 4],
          [0.58, centro - 9],
          [0.5, centro - 6],
          [0.42, centro - 9],
        ]),
        material: brilhoQuente(ctx),
      },
    ],
  });
  return m.modelo('abobora_gigante');
}

/** Lápide de jardim (decoração), com o topo em arco. */
export function lapide(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa(ret(0.4, 0.25, 0.6, 0.75), 0, 2);
  m.caixa(ret(0.45, 0.3, 0.55, 0.7), 2, 14);
  m.add(
    extrusao(
      [
        { u: 0.3, z: 14 },
        { u: 0.7, z: 14 },
        { u: 0.64, z: 18 },
        { u: 0.5, z: 20 },
        { u: 0.36, z: 18 },
      ],
      'x',
      0.45,
      0.55,
    ),
  );
  return m.modelo('lapide');
}

/** Varal com dois lençóis brancos (comprido em y): parecem fantasmas no escuro. */
export function varal(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa(ret(0.17, 0.05, 0.23, 0.11), 0, 36);
  m.caixa(ret(0.17, 2.09, 0.23, 2.15), 0, 36);
  m.caixa(ret(0.19, 0.08, 0.21, 2.12), 34, 35);
  m.caixa(ret(0.18, 0.35, 0.22, 0.95), 14, 34);
  m.caixa(ret(0.18, 1.25, 0.22, 1.85), 18, 34);
  return m.modelo('varal');
}

/** Cerca viva (1 tile ao longo de x). */
export function cercaViva(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa(ret(0, 0.05, 1, 0.45), 0, 13);
  m.caixa(ret(0.05, 0.1, 0.95, 0.4), 13, 16);
  return m.modelo('cerca_viva');
}

// ------------------------------------------------------------ limites discretos (passe E)
// O fim do bairro não é muro: é morro, deslizamento de pedras, buraco na pista ou rua interditada.

/** Pedra solta: bloco baixo com o topo lapidado (variantes pequena e grande). */
export function pedra(ctx: ContextoModelo, variante = 'pequena'): Modelo {
  const m = new Montagem(ctx);
  const grande = variante === 'grande';
  const r = grande ? 0.4 : 0.28;
  const h = grande ? 12 : 7;
  m.add(prisma(0.5, 0.52, r, 5, 0, h));
  m.add(
    telhadoQuatroAguas(ret(0.5 - r * 0.8, 0.52 - r * 0.7, 0.5 + r * 0.7, 0.52 + r * 0.8), h, h),
  );
  if (grande) m.add(prisma(0.24, 0.3, 0.14, 5, 0, 6));
  return m.modelo('pedra');
}

/**
 * Morro de terra e pedra (3 × 3): patamares irregulares que sobem para o meio, com pedras na
 * base. Na variante alta, o topo passa da altura de um sobrado e esconde o que fica atrás.
 */
export function morro(ctx: ContextoModelo, variante = 'baixo'): Modelo {
  const m = new Montagem(ctx);
  const alto = variante === 'alto';
  const k = alto ? 1.8 : 1;
  m.add(prisma(1.5, 1.5, 1.42, 7, 0, 12 * k));
  m.add(prisma(1.38, 1.62, 1.05, 7, 12 * k, 26 * k));
  m.add(prisma(1.62, 1.38, 0.72, 6, 26 * k, 38 * k));
  m.add(telhadoQuatroAguas(ret(1.1, 1.0, 2.0, 1.9), 38 * k, 14 * k));
  for (const [x, y, rr] of [
    [0.3, 2.45, 0.2],
    [2.55, 0.5, 0.17],
    [2.6, 2.2, 0.22],
  ] as const)
    m.add(prisma(x, y, rr, 5, 0, 6));
  return m.modelo('morro');
}

/** Barreira de concreto (2 tiles ao longo de x), com faixas escuras nas duas faces. */
export function barreira(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const corpo = m.add(
    extrusao(
      [
        { u: 0.06, z: 0 },
        { u: 0.54, z: 0 },
        { u: 0.48, z: 6 },
        { u: 0.38, z: 18 },
        { u: 0.22, z: 18 },
        { u: 0.12, z: 6 },
      ],
      'x',
      0.02,
      1.98,
    ),
  );
  const faixas = [0.2, 0.75, 1.3].map((a) => retanguloDeParede(a, a + 0.3, 8, 15));
  // As faixas ficam no meio da rampa das duas faces.
  const r = ret(0.02, 0.17, 1.98, 0.43);
  recessoNaParede(corpo, r, '+y', faixas);
  recessoNaParede(corpo, r, '-y', faixas);
  return m.modelo('barreira');
}

/** Buraco na pista (2 × 2): o fundo escuro e lascas de asfalto em volta da borda. */
export function buraco(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.add(prisma(1, 1, 0.78, 9, 0, 0.6, RECESSO));
  m.add(prisma(1.1, 0.92, 0.42, 7, 0.6, 0.9, RECESSO));
  const lascas: [number, number, number][] = [
    [0.18, 0.7, 3],
    [0.35, 1.55, 2],
    [0.95, 1.82, 4],
    [1.6, 1.5, 2.5],
    [1.82, 0.85, 3.5],
    [1.4, 0.2, 2],
    [0.7, 0.18, 3],
  ];
  for (const [x, y, h] of lascas) m.add(prisma(x, y, 0.12, 5, 0, h));
  return m.modelo('buraco');
}

/** Placa de rua interditada (frente para +x): dois pés, painel listrado e a luz de aviso. */
export function placaObra(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa(ret(0.46, 0.14, 0.54, 0.22), 0, 26);
  m.caixa(ret(0.46, 0.78, 0.54, 0.86), 0, 26);
  const r = ret(0.44, 0.08, 0.56, 0.92);
  const painel = m.caixa(r, 18, 36);
  const listras = [0.1, 0.34, 0.58].map((a) => retanguloDeParede(a + 0.02, a + 0.14, 20, 34));
  recessoNaParede(painel, r, '+x', listras);
  recessoNaParede(painel, r, '-x', listras);
  return m.modelo('placa_obra');
}
