import type { Material } from './geometria';
import { bau, Montagem, type ContextoModelo, type Modelo } from './modelos';
import { prisma } from './primitivas';

// Surpresas da tarefa G8 (GAMEPLAY.md, "Surpresas e recompensas variáveis"): o baú amaldiçoado,
// a Criança Perdida e o Carrinho de Pipoca. Frente voltada para +x, como os outros modelos.

/**
 * Baú amaldiçoado: o mesmo baú preso por duas correntes escuras e uma fresta vermelha acesa entre a
 * tampa e o corpo, como se algo olhasse de dentro. A tela faz ele tremer.
 */
export function bauAmaldicoado(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.partes.push(...bau(ctx).partes);
  const corrente: Material = { tipo: 'recesso' };
  m.caixa({ x0: 0.18, y0: 0.3, x1: 0.82, y1: 0.35 }, 0, 17.8, corrente);
  m.caixa({ x0: 0.18, y0: 0.65, x1: 0.82, y1: 0.7 }, 0, 17.8, corrente);
  const olhar: Material = { tipo: 'emissivo', cor: ctx.visual.acentos.perigo };
  m.caixa({ x0: 0.79, y0: 0.36, x1: 0.82, y1: 0.64 }, 11.6, 12.6, olhar);
  return m.modelo('bau_amaldicoado');
}

/**
 * Criança Perdida: menorzinha que as pestinhas, de capa de fantasia e balde de abóbora aceso de
 * amarelo (os doces que ela juntou), com os olhos no laranja do jogador: está do lado dele.
 */
export function criancaPerdida(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const c = 0.5;
  // Pernas e capa curta.
  m.caixa({ x0: c - 0.05, y0: c - 0.07, x1: c + 0.03, y1: c - 0.02 }, 0, 5);
  m.caixa({ x0: c - 0.05, y0: c + 0.02, x1: c + 0.03, y1: c + 0.07 }, 0, 5);
  m.add(prisma(c, c, 0.11, 6, 5, 14));
  const rCabeca = { x0: c - 0.07, y0: c - 0.07, x1: c + 0.07, y1: c + 0.07 };
  m.caixa(rCabeca, 14, 21);
  const olhar: Material = { tipo: 'emissivo', cor: ctx.visual.acentos.jogador };
  m.caixa({ x0: c + 0.065, y0: c - 0.05, x1: c + 0.08, y1: c - 0.02 }, 17, 19, olhar);
  m.caixa({ x0: c + 0.065, y0: c + 0.02, x1: c + 0.08, y1: c + 0.05 }, 17, 19, olhar);
  // Orelhinhas da fantasia (gato) em cima da cabeça.
  m.caixa({ x0: c - 0.04, y0: c - 0.07, x1: c + 0.01, y1: c - 0.03 }, 21, 24);
  m.caixa({ x0: c - 0.04, y0: c + 0.03, x1: c + 0.01, y1: c + 0.07 }, 21, 24);
  // Balde de abóbora numa mão, aceso de doces.
  const doce: Material = { tipo: 'emissivo', cor: ctx.visual.acentos.doce };
  m.add(prisma(c + 0.04, c + 0.17, 0.05, 6, 5, 10));
  m.caixa({ x0: c + 0.01, y0: c + 0.14, x1: c + 0.07, y1: c + 0.2 }, 10, 10.6, doce);
  return m.modelo('crianca_perdida');
}

/**
 * Carrinho de Pipoca: carrinho de duas rodas com toldo listrado e a vitrine de pipoca acesa de
 * amarelo (cor dos doces: ali se gasta doce). O vendedor fica atrás, de quepe.
 */
export function carrinhoDePipoca(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const c = 0.5;
  const doce: Material = { tipo: 'emissivo', cor: ctx.visual.acentos.doce };
  const listra: Material = { tipo: 'recesso' };
  // Rodas, chassi e caixa.
  for (const y of [c - 0.42, c + 0.36])
    m.caixa({ x0: c - 0.1, y0: y, x1: c + 0.1, y1: y + 0.06 }, 0, 9);
  m.caixa({ x0: c - 0.3, y0: c - 0.36, x1: c + 0.3, y1: c + 0.36 }, 6, 20);
  // Vitrine de pipoca na frente (+x).
  m.caixa({ x0: c + 0.3, y0: c - 0.28, x1: c + 0.32, y1: c + 0.28 }, 11, 19, doce);
  // Hastes e toldo listrado.
  for (const y of [c - 0.33, c + 0.29])
    m.caixa({ x0: c + 0.22, y0: y, x1: c + 0.26, y1: y + 0.04 }, 20, 34);
  m.caixa({ x0: c - 0.36, y0: c - 0.42, x1: c + 0.36, y1: c + 0.42 }, 34, 36);
  for (const y of [c - 0.3, c - 0.06, c + 0.18])
    m.caixa({ x0: c - 0.37, y0: y, x1: c + 0.37, y1: y + 0.12 }, 35.9, 36.4, listra);
  // Vendedor atrás do carrinho.
  m.add(prisma(c - 0.45, c, 0.11, 6, 0, 22));
  const rCabeca = { x0: c - 0.53, y0: c - 0.08, x1: c - 0.37, y1: c + 0.08 };
  m.caixa(rCabeca, 22, 30);
  m.caixa({ x0: c - 0.55, y0: c - 0.1, x1: c - 0.35, y1: c + 0.1 }, 30, 32);
  return m.modelo('carrinho_pipoca');
}
