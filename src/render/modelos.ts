import { modelos } from '../sim/content';
import type { NomeModelo, Visual } from '../sim/content/esquemas';
import { girar, posicionador, type Rotacao } from '../sim/geometria';
import { transformarParte, type Material, type Parte } from './geometria';
import type { Iso, Vec2, Vec3 } from './iso';
import {
  arcoDeParede,
  caixa,
  decalqueNaParede,
  esfera,
  frisos,
  NORMAL_DO_LADO,
  prisma,
  retanguloDeParede,
  telhadoDuasAguas,
  telhadoQuatroAguas,
  type Lado,
  type Pegada,
} from './primitivas';

// Os modelos são arte desenhada por código (regra 4): medidas em tiles no plano e em frações do
// andar na vertical, com a frente voltada para +x (baixo-direita, como na imagem de referência).

/** Distância dos decalques à parede, para não brigarem com ela. */
export const AFASTAMENTO_DECALQUE = 0.01;
/** Vão entre as duas folhas de uma janela dupla, em tiles. */
const VAO_JANELA = 0.05;
/** Peitoril e verga da janela, em frações da altura do andar. */
const PEITORIL = 0.3;
const VERGA = 0.82;
/** Altura das portas, em frações do andar. */
const ALTURA_PORTA = 0.75;
const SEGMENTOS_ARCO = 6;
export const FATIAS_ESFERA = 8;
export const ANEIS_ESFERA = 4;

export type TipoLuz = 'poste' | 'janela' | 'posteCorrompido';

/**
 * O tom de cada janela, fixo pela posição dela (sem sorteio): a casa não fica uniforme. Uma
 * fração delas fica apagada (null), como numa rua de verdade à noite.
 */
export function tomDaJanela(
  cores: readonly string[],
  lado: string,
  a0: number,
  z0: number,
  fracaoApagadas = 0,
): string | null {
  let h =
    Math.round(a0 * 100) * 73856093 + Math.round(z0) * 19349663 + lado.charCodeAt(1) * 83492791;
  h = (h ^ (h >>> 13)) >>> 0;
  if (((h >>> 9) % 1000) / 1000 < fracaoApagadas) return null;
  return cores[h % cores.length]!;
}

export interface FonteDeLuz {
  tipo: TipoLuz;
  x: number;
  y: number;
  /** Para janelas: para onde a parede olha (a luz cai no chão à frente dela). */
  normal?: Vec2;
  /** Para janelas: a largura da abertura (tiles) e o andar (0 = térreo). */
  largura?: number;
  andar?: number;
}

export interface Modelo {
  /** Tamanho da pegada em tiles (eixo x e eixo y), antes de girar. */
  largura: number;
  profundidade: number;
  partes: Parte[];
  luzes: FonteDeLuz[];
  /** Boca de cada chaminé (tiles no plano, z em px): de onde a fumaça sai. */
  chamines?: Vec3[];
}

export interface ContextoModelo {
  iso: Iso;
  visual: Visual;
  /** Casa de janelas apagadas (Rua Sem Luz, Janelas Fechadas): sem brilho e sem luz no chão. */
  janelasApagadas?: boolean;
}

export type EstadoPoste = 'amigo' | 'apagado' | 'corrompido';

export class Montagem {
  readonly partes: Parte[] = [];
  readonly luzes: FonteDeLuz[] = [];
  readonly chamines: Vec3[] = [];

  constructor(readonly ctx: ContextoModelo) {}

  get andar(): number {
    return this.ctx.visual.alturaAndarPx;
  }

  /** Faixa vertical das janelas do andar `n` (0 = térreo) a partir da base `z0`. */
  faixaJanela(n: number, z0 = 0): [number, number] {
    const base = z0 + n * this.andar;
    return [base + PEITORIL * this.andar, base + VERGA * this.andar];
  }

  add<T extends Parte>(p: T): T {
    this.partes.push(p);
    return p;
  }

  caixa(r: Pegada, z0: number, z1: number, material?: Material): Parte {
    return this.add(caixa(r, z0, z1, material));
  }

  janela(
    p: Parte,
    r: Pegada,
    lado: Lado,
    a0: number,
    a1: number,
    [z0, z1]: [number, number],
    opcoes: { panos?: 1 | 2; arco?: boolean; apagada?: boolean } = {},
  ): void {
    const { iso, visual } = this.ctx;
    const cfg = visual.janelasAcesas;
    let contornos;
    if (opcoes.arco) contornos = [arcoDeParede(a0, a1, z0, z1, iso, SEGMENTOS_ARCO)];
    else {
      // Vidraças: duas colunas (janela dupla ou larga) e uma travessa; o caixilho é a parede.
      const colunas: [number, number][] =
        opcoes.panos === 2 || a1 - a0 >= cfg.larguraParaDividir
          ? [
              [a0, (a0 + a1) / 2 - VAO_JANELA / 2],
              [(a0 + a1) / 2 + VAO_JANELA / 2, a1],
            ]
          : [[a0, a1]];
      const zt = z0 + (z1 - z0) * cfg.travessa;
      const meia = cfg.caixilhoPx / 2;
      const linhas: [number, number][] =
        cfg.caixilhoPx > 0
          ? [
              [z0, zt - meia],
              [zt + meia, z1],
            ]
          : [[z0, z1]];
      contornos = colunas.flatMap(([c0, c1]) =>
        linhas.map(([l0, l1]) => retanguloDeParede(c0, c1, l0, l1)),
      );
    }
    const tom = tomDaJanela(cfg.cores, lado, a0, z0, cfg.fracaoApagadas);
    const apagada = (this.ctx.janelasApagadas ?? false) || (opcoes.apagada ?? false);
    const material: Material =
      apagada || !tom ? { tipo: 'recesso' } : { tipo: 'emissivo', cor: tom };
    p.decalques.push(decalqueNaParede(r, lado, contornos, material, AFASTAMENTO_DECALQUE));
    // A janela apagada pela fração continua na lista (a simulação conhece todas as janelas da casa).
    if (apagada) return;

    // Toda janela acesa joga o próprio feixe no chão, com a largura dela; quem decide se ele
    // aparece é a câmera (a janela de costas fica escondida, e a luz dela também).
    const meio = (a0 + a1) / 2;
    const n = NORMAL_DO_LADO[lado];
    const pe =
      lado === '+x' || lado === '-x'
        ? { x: lado === '+x' ? r.x1 : r.x0, y: meio }
        : { x: meio, y: lado === '+y' ? r.y1 : r.y0 };
    this.luzes.push({
      tipo: 'janela',
      ...pe,
      normal: { x: n.x, y: n.y },
      largura: a1 - a0,
      andar: Math.max(0, Math.floor(z0 / this.andar)),
    });
  }

  porta(p: Parte, r: Pegada, lado: Lado, a0: number, a1: number, z0: number, arco = false): void {
    const z1 = z0 + ALTURA_PORTA * this.andar;
    const contorno = arco
      ? arcoDeParede(a0, a1, z0, z1, this.ctx.iso, SEGMENTOS_ARCO)
      : retanguloDeParede(a0, a1, z0, z1);
    p.decalques.push(
      decalqueNaParede(r, lado, [contorno], { tipo: 'recesso' }, AFASTAMENTO_DECALQUE),
    );
  }

  /** Portão de garagem: recesso mais largo e mais baixo que uma porta. */
  portao(p: Parte, r: Pegada, lado: Lado, a0: number, a1: number, altura: number): void {
    p.decalques.push(
      decalqueNaParede(
        r,
        lado,
        [retanguloDeParede(a0, a1, 0, altura)],
        { tipo: 'recesso' },
        AFASTAMENTO_DECALQUE,
      ),
    );
  }

  /** A pegada vem de content/modelos.json, a mesma que a simulação usa para a colisão. */
  modelo(nome: NomeModelo): Modelo {
    const { largura, profundidade } = modelos[nome].pegada;
    return {
      largura,
      profundidade,
      partes: this.partes,
      luzes: this.luzes,
      ...(this.chamines.length > 0 ? { chamines: this.chamines } : {}),
    };
  }
}

/** Casa térrea com garagem: telhado alto de duas águas, garagem baixa à direita, janela saliente. */
export function casaTerrea(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const H = m.andar;
  const peDireito = 1.1 * H;

  const rGar = { x0: 0.35, y0: 0, x1: 2.55, y1: 1.45 };
  const gar = m.caixa(rGar, 0, 0.8 * H);
  m.portao(gar, rGar, '+x', 0.2, 1.25, 0.65 * H);
  m.janela(gar, rGar, '-y', 1.0, 1.5, m.faixaJanela(0));
  m.add(telhadoDuasAguas({ x0: 0.25, y0: -0.08, x1: 2.65, y1: 1.53 }, 0.8 * H, 0.42 * H, 'x'));

  const rCorpo = { x0: 0, y0: 1.45, x1: 2.55, y1: 3.75 };
  const corpo = m.caixa(rCorpo, 0, peDireito);
  m.porta(corpo, rCorpo, '+x', 1.52, 1.8, 0);
  m.janela(corpo, rCorpo, '+x', 3.15, 3.55, m.faixaJanela(0));
  m.janela(corpo, rCorpo, '+y', 0.45, 0.95, m.faixaJanela(0), { panos: 2 });
  m.janela(corpo, rCorpo, '+y', 1.55, 2.05, m.faixaJanela(0));
  m.janela(corpo, rCorpo, '-x', 2.0, 2.45, m.faixaJanela(0));
  m.janela(corpo, rCorpo, '-x', 2.95, 3.4, m.faixaJanela(0));

  const rTelhado = { x0: -0.1, y0: 1.3, x1: 2.67, y1: 3.9 };
  const telhado = m.add(telhadoDuasAguas(rTelhado, peDireito, 0.85 * H, 'x'));
  m.janela(telhado, rTelhado, '+x', 2.45, 2.75, [peDireito + 0.15 * H, peDireito + 0.5 * H]);

  const rSaliente = { x0: 2.55, y0: 1.85, x1: 2.95, y1: 3.0 };
  const saliente = m.caixa(rSaliente, 0, 0.85 * H);
  m.janela(saliente, rSaliente, '+x', 1.95, 2.9, m.faixaJanela(0), { panos: 2 });
  m.janela(saliente, rSaliente, '+y', 2.62, 2.88, m.faixaJanela(0));
  m.caixa({ x0: 2.5, y0: 1.8, x1: 3.02, y1: 3.05 }, 0.85 * H, 0.85 * H + 4);

  return m.modelo('casa_terrea');
}

/** Sobrado de três andares com escada lateral e janela saliente. */
export function sobrado(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const H = m.andar;
  const topo = 3 * H;

  const r = { x0: 0, y0: 0, x1: 2.2, y1: 2.6 };
  const corpo = m.caixa(r, 0, topo);
  corpo.decalques.push(...frisos(r, H, 4, 0.05), ...frisos(r, 2 * H, 4, 0.05));
  m.porta(corpo, r, '+x', 0.2, 0.55, H);
  m.porta(corpo, r, '+x', 1.6, 1.95, 0);
  m.janela(corpo, r, '+x', 0.85, 1.2, m.faixaJanela(0));
  m.janela(corpo, r, '+x', 0.22, 0.55, m.faixaJanela(2));
  for (let n = 0; n < 3; n++) {
    m.janela(corpo, r, '+y', 0.35, 0.75, m.faixaJanela(n));
    m.janela(corpo, r, '+y', 1.35, 1.75, m.faixaJanela(n));
    m.janela(corpo, r, '-x', 0.6, 1.0, m.faixaJanela(n));
    m.janela(corpo, r, '-x', 1.6, 2.0, m.faixaJanela(n));
    m.janela(corpo, r, '-y', 0.7, 1.1, m.faixaJanela(n));
  }

  const rBeiral = { x0: -0.12, y0: -0.12, x1: 2.32, y1: 2.72 };
  m.caixa(rBeiral, topo, topo + 8);
  m.add(telhadoQuatroAguas(rBeiral, topo + 8, 0.45 * H));

  const rSaliente = { x0: 2.2, y0: 1.35, x1: 2.6, y1: 2.3 };
  const saliente = m.caixa(rSaliente, H + 4, topo - 8);
  for (const n of [1, 2]) {
    m.janela(saliente, rSaliente, '+x', 1.48, 2.17, m.faixaJanela(n), { panos: 2 });
    m.janela(saliente, rSaliente, '+y', 2.28, 2.52, m.faixaJanela(n));
    m.janela(saliente, rSaliente, '-y', 2.28, 2.52, m.faixaJanela(n));
  }
  m.caixa({ x0: 2.17, y0: 1.3, x1: 2.65, y1: 2.35 }, topo - 8, topo - 4);

  // Escada lateral: patamar na altura do primeiro andar e degraus descendo para +y.
  m.caixa({ x0: 2.2, y0: 0.12, x1: 2.75, y1: 0.6 }, 0, H);
  const degraus = 5;
  for (let k = 0; k < degraus; k++) {
    const y0 = 0.6 + k * 0.15;
    m.caixa({ x0: 2.2, y0, x1: 2.75, y1: y0 + 0.15 }, 0, H - ((k + 1) * H) / (degraus + 1));
  }

  return m.modelo('sobrado');
}

/** Casa grande com vários telhados, chaminé, ala da frente com porta em arco e garagem. */
export function casaGrande(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const H = m.andar;
  const peDireito = 1.15 * H;

  const rGar = { x0: 0.3, y0: 0, x1: 2.7, y1: 1.4 };
  const gar = m.caixa(rGar, 0, 0.8 * H);
  m.portao(gar, rGar, '+x', 0.2, 1.2, 0.62 * H);
  m.janela(gar, rGar, '-y', 1.1, 1.6, m.faixaJanela(0));
  m.add(telhadoDuasAguas({ x0: 0.2, y0: -0.1, x1: 2.8, y1: 1.5 }, 0.8 * H, 0.45 * H, 'x'));

  const rCorpo = { x0: 0, y0: 1.4, x1: 2.6, y1: 4.2 };
  const corpo = m.caixa(rCorpo, 0, peDireito);
  m.janela(corpo, rCorpo, '+x', 1.6, 2.05, m.faixaJanela(0));
  m.janela(corpo, rCorpo, '+x', 3.55, 4.0, m.faixaJanela(0));
  m.janela(corpo, rCorpo, '+y', 1.0, 1.45, m.faixaJanela(0));
  m.janela(corpo, rCorpo, '+y', 1.85, 2.3, m.faixaJanela(0));
  m.janela(corpo, rCorpo, '-x', 2.0, 2.45, m.faixaJanela(0));
  m.janela(corpo, rCorpo, '-x', 3.2, 3.65, m.faixaJanela(0));
  const rTelhado = { x0: -0.15, y0: 1.4, x1: 2.75, y1: 4.2 };
  const telhado = m.add(telhadoDuasAguas(rTelhado, peDireito, 0.95 * H, 'y'));
  m.janela(telhado, rTelhado, '+y', 1.12, 1.48, [peDireito + 0.15 * H, peDireito + 0.5 * H]);

  const rAla = { x0: 2.6, y0: 2.2, x1: 3.8, y1: 3.4 };
  const ala = m.caixa(rAla, 0, H);
  m.porta(ala, rAla, '+x', 2.6, 3.0, 0, true);
  m.janela(ala, rAla, '+x', 3.08, 3.3, m.faixaJanela(0));
  m.janela(ala, rAla, '+y', 2.95, 3.45, m.faixaJanela(0), { panos: 2 });
  const rTelhadoAla = { x0: 2.6, y0: 2.08, x1: 3.85, y1: 3.52 };
  const telhadoAla = m.add(telhadoDuasAguas(rTelhadoAla, H, 0.75 * H, 'x'));
  m.janela(telhadoAla, rTelhadoAla, '+x', 2.66, 2.94, [1.15 * H, 1.5 * H], { arco: true });

  const alturaChamine = 2.35 * H;
  // Encostada na parede dos fundos: o telhado esconde a base e só o topo passa da cumeeira.
  m.caixa({ x0: -0.38, y0: 2.6, x1: 0, y1: 3.0 }, 0, alturaChamine);
  m.caixa({ x0: -0.43, y0: 2.55, x1: 0.05, y1: 3.05 }, alturaChamine, alturaChamine + 5);

  return m.modelo('casa_grande');
}

/** Poste com luminária: branco frio (amigo), cinza sem luz (apagado) ou roxo (corrompido). */
export function poste(ctx: ContextoModelo, estado: EstadoPoste): Modelo {
  const m = new Montagem(ctx);
  const c = 0.5;
  const ao = (r: number): Pegada => ({ x0: c - r, y0: c - r, x1: c + r, y1: c + r });
  const cores: Record<EstadoPoste, Material> = {
    amigo: { tipo: 'emissivo', cor: ctx.visual.paleta.luz },
    apagado: { tipo: 'solido' },
    corrompido: { tipo: 'emissivo', cor: ctx.visual.acentos.magia },
  };
  m.caixa(ao(0.11), 0, 4);
  m.caixa(ao(0.04), 4, 60);
  m.caixa(ao(0.1), 60, 74, cores[estado]);
  m.add(telhadoQuatroAguas(ao(0.14), 74, 8));
  if (estado === 'amigo') m.luzes.push({ tipo: 'poste', x: c, y: c });
  if (estado === 'corrompido') m.luzes.push({ tipo: 'posteCorrompido', x: c, y: c });
  return m.modelo('poste');
}

export function lixeira(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.add(prisma(0.5, 0.5, 0.17, 8, 0, 17));
  m.add(prisma(0.5, 0.5, 0.19, 8, 17, 20));
  return m.modelo('lixeira');
}

/** Árvore de copa redonda feita de 3 esferas. */
export function arvore(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const { iso } = ctx;
  m.caixa({ x0: 0.44, y0: 0.44, x1: 0.56, y1: 0.56 }, 0, 40);
  m.add(esfera(0.42, 0.62, 46, 0.32, iso, FATIAS_ESFERA, ANEIS_ESFERA));
  m.add(esfera(0.64, 0.38, 50, 0.3, iso, FATIAS_ESFERA, ANEIS_ESFERA));
  m.add(esfera(0.5, 0.5, 66, 0.34, iso, FATIAS_ESFERA, ANEIS_ESFERA));
  return m.modelo('arvore');
}

/** Banco de praça comprido em y, com o encosto atrás (−x). */
export function banco(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa({ x0: 0.4, y0: 0.1, x1: 0.62, y1: 0.18 }, 0, 10);
  m.caixa({ x0: 0.4, y0: 1.22, x1: 0.62, y1: 1.3 }, 0, 10);
  m.caixa({ x0: 0.38, y0: 0.08, x1: 0.66, y1: 1.32 }, 10, 13);
  m.caixa({ x0: 0.36, y0: 0.08, x1: 0.42, y1: 1.32 }, 13, 26);
  m.caixa({ x0: 0.42, y0: 0.08, x1: 0.64, y1: 0.14 }, 13, 19);
  m.caixa({ x0: 0.42, y0: 1.26, x1: 0.64, y1: 1.32 }, 13, 19);
  return m.modelo('banco');
}

function olhos(
  p: Parte,
  r: Pegada,
  lado: Lado,
  centro: number,
  z0: number,
  z1: number,
  cor: string,
): void {
  const meio = 0.025;
  const largura = 0.04;
  p.decalques.push(
    decalqueNaParede(
      r,
      lado,
      [
        retanguloDeParede(centro - meio - largura, centro - meio, z0, z1),
        retanguloDeParede(centro + meio, centro + meio + largura, z0, z1),
      ],
      { tipo: 'emissivo', cor },
      AFASTAMENTO_DECALQUE,
    ),
  );
}

/** Segmento de cerca baixa (1 tile ao longo de x): dois mourões e duas ripas. */
export function cerca(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa({ x0: 0.02, y0: 0.09, x1: 0.12, y1: 0.21 }, 0, 18);
  m.caixa({ x0: 0.88, y0: 0.09, x1: 0.98, y1: 0.21 }, 0, 18);
  m.caixa({ x0: 0, y0: 0.12, x1: 1, y1: 0.18 }, 6, 9);
  m.caixa({ x0: 0, y0: 0.12, x1: 1, y1: 0.18 }, 12, 15);
  return m.modelo('cerca');
}

/** Bueiro: tampa rente ao chão, com a grelha escura. As pestinhas nascem dele. */
export function bueiro(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa({ x0: 0.12, y0: 0.12, x1: 0.88, y1: 0.88 }, 0, 1.5);
  for (let i = 0; i < 4; i++) {
    const y0 = 0.2 + i * 0.17;
    m.caixa({ x0: 0.2, y0, x1: 0.8, y1: y0 + 0.09 }, 1.5, 2, { tipo: 'recesso' });
  }
  return m.modelo('bueiro');
}

/** Pilar de portão. */
export function pilar(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa({ x0: 0.24, y0: 0.24, x1: 0.76, y1: 0.76 }, 0, 44);
  m.add(telhadoQuatroAguas({ x0: 0.18, y0: 0.18, x1: 0.82, y1: 0.82 }, 44, 8));
  return m.modelo('pilar');
}

/** Guarita do condomínio: cabine de 1,6 × 1,6 com janelas para o pátio, porta e laje. */
export function guarita(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const r = { x0: 0.1, y0: 0.1, x1: 1.5, y1: 1.5 };
  const corpo = m.caixa(r, 0, 40);
  m.janela(corpo, r, '+x', 0.3, 1.3, m.faixaJanela(0));
  m.porta(corpo, r, '+y', 0.5, 1.1, 0);
  m.caixa({ x0: 0, y0: 0, x1: 1.6, y1: 1.6 }, 40, 44);
  return m.modelo('guarita');
}

/** Canteiro do condomínio: caixa baixa de madeira com três moitas (quebra e tira o Regulamento). */
export function canteiro(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa({ x0: 0.08, y0: 0.08, x1: 1.52, y1: 0.72 }, 0, 9);
  for (const x of [0.35, 0.8, 1.25])
    m.add(esfera(x, 0.4, 14, 0.22, ctx.iso, FATIAS_ESFERA, ANEIS_ESFERA));
  return m.modelo('canteiro');
}

/**
 * Cancela do portão do condomínio: pilar com a caixa do motor e o braço com as juntas marcadas
 * atravessando os 4 tiles do portão.
 */
export function cancela(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa({ x0: 0, y0: 0.05, x1: 0.35, y1: 0.35 }, 0, 22);
  // O braço do motor até a ponta (4 tiles), com as juntas marcadas (sem luz).
  const passo = (4 - 0.35) / 8;
  for (let k = 0; k < 8; k++) {
    const x0 = 0.35 + k * passo;
    m.caixa({ x0, y0: 0.15, x1: x0 + passo, y1: 0.25 }, k % 2 === 0 ? 15 : 15.5, 19);
  }
  return m.modelo('cancela');
}

/** Poço dos Desejos: mureta redonda de pedra, dois esteios e um telhadinho de duas águas. */
export function poco(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.add(prisma(0.7, 0.7, 0.5, 10, 0, 10));
  m.add(prisma(0.7, 0.7, 0.36, 10, 10, 11, { tipo: 'recesso' }));
  m.caixa({ x0: 0.62, y0: 0.18, x1: 0.78, y1: 0.28 }, 10, 34);
  m.caixa({ x0: 0.62, y0: 1.12, x1: 0.78, y1: 1.22 }, 10, 34);
  m.caixa({ x0: 0.4, y0: 0.12, x1: 1.0, y1: 1.28 }, 34, 37);
  return m.modelo('poco');
}

/** Vela do desafio: toco de vela num pires; acesa, a chama brilha (apagada, só o pavio). */
export function vela(ctx: ContextoModelo, apagada: boolean): Modelo {
  const m = new Montagem(ctx);
  m.add(prisma(0.5, 0.5, 0.3, 8, 0, 3));
  m.add(prisma(0.5, 0.5, 0.12, 8, 3, 28));
  const chama: Material = apagada
    ? { tipo: 'recesso' }
    : { tipo: 'emissivo', cor: ctx.visual.janelasAcesas.cores[2]! };
  m.caixa({ x0: 0.45, y0: 0.45, x1: 0.55, y1: 0.55 }, 28, apagada ? 31 : 38, chama);
  return m.modelo('vela');
}

/** Grade do portão fechado (1 tile ao longo de y): barras finas e travessa. */
export function grade(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  for (let i = 0; i < 4; i++) {
    const y0 = 0.06 + i * 0.25;
    m.caixa({ x0: 0.1, y0, x1: 0.2, y1: y0 + 0.07 }, 0, 34);
  }
  m.caixa({ x0: 0.08, y0: 0, x1: 0.22, y1: 1 }, 30, 34);
  m.caixa({ x0: 0.08, y0: 0, x1: 0.22, y1: 1 }, 6, 9);
  return m.modelo('grade');
}

/** Poste Corrompido como inimigo (a mesma luminária roxa do kit). */
export function posteCorrompido(ctx: ContextoModelo): Modelo {
  return { ...poste(ctx, 'corrompido'), ...pegadaDe('poste_corrompido') };
}

/** Poste derrubado: apagado e torto. */
export function posteCaido(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  m.caixa({ x0: 0.39, y0: 0.39, x1: 0.61, y1: 0.61 }, 0, 4);
  m.caixa({ x0: 0.46, y0: 0.46, x1: 0.54, y1: 0.54 }, 4, 30);
  // O resto da haste caído no chão.
  m.caixa({ x0: 0.5, y0: 0.44, x1: 1.15, y1: 0.52 }, 0, 3);
  m.caixa({ x0: 1.1, y0: 0.4, x1: 1.3, y1: 0.58 }, 0, 6);
  return m.modelo('poste_caido');
}

/** Doce caído no chão: bala embrulhada (amarelo dos doces). */
export function doce(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const amarelo: Material = { tipo: 'emissivo', cor: ctx.visual.acentos.doce };
  const c = 0.5;
  m.caixa({ x0: c - 0.06, y0: c - 0.06, x1: c + 0.06, y1: c + 0.06 }, 2, 8, amarelo);
  m.caixa({ x0: c - 0.03, y0: c - 0.13, x1: c + 0.03, y1: c - 0.06 }, 3, 7, amarelo);
  m.caixa({ x0: c - 0.03, y0: c + 0.06, x1: c + 0.03, y1: c + 0.13 }, 3, 7, amarelo);
  return m.modelo('doce');
}

/**
 * Abóbora Dourada (segredo do bairro): abobrinha que brilha na cor dos doces, com olhos escuros
 * entalhados. Só aparece de perto ou na luz (docs/DESIGN.md, passe E).
 */
export function aboboraDourada(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const c = 0.5;
  const ouro: Material = { tipo: 'emissivo', cor: ctx.visual.acentos.doce };
  const { iso } = ctx;
  m.add(esfera(c, c - 0.09, 7, 0.13, iso, 8, 4));
  m.add(esfera(c, c + 0.09, 7, 0.13, iso, 8, 4));
  const corpo = m.add(esfera(c, c, 8, 0.17, iso, 10, 4));
  for (const f of [...corpo.faces, ...m.partes[0]!.faces, ...m.partes[1]!.faces]) f.material = ouro;
  m.caixa({ x0: c - 0.02, y0: c - 0.02, x1: c + 0.02, y1: c + 0.02 }, 14, 18);
  olhos(
    corpo,
    { x0: c - 0.16, y0: c - 0.16, x1: c + 0.16, y1: c + 0.16 },
    '+x',
    c,
    8,
    11,
    ctx.visual.paleta.faceDireita,
  );
  return m.modelo('abobora_dourada');
}

/** Doce-isca: pirulito grande espetado no chão. */
export function doceIsca(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const c = 0.5;
  m.caixa({ x0: c - 0.02, y0: c - 0.02, x1: c + 0.02, y1: c + 0.02 }, 0, 22);
  m.add(prisma(c, c, 0.14, 8, 22, 30, { tipo: 'emissivo', cor: ctx.visual.acentos.doce }));
  m.add(prisma(c, c, 0.07, 8, 30, 31, { tipo: 'emissivo', cor: ctx.visual.acentos.jogador }));
  return m.modelo('doce_isca');
}

/**
 * Baú (Chave Mestra; quintais): caixa de madeira nos cinzas do cenário, cintas escuras e um cadeado
 * na cor dos doces, para o jogador ver que ali tem recompensa.
 */
export function bau(ctx: ContextoModelo, aberto = false): Modelo {
  const m = new Montagem(ctx);
  const corpo = { x0: 0.22, y0: 0.28, x1: 0.78, y1: 0.72 };
  m.caixa(corpo, 0, 12);
  // Cintas laterais.
  m.caixa({ x0: 0.2, y0: 0.36, x1: 0.8, y1: 0.4 }, 0, 12.5, { tipo: 'recesso' });
  m.caixa({ x0: 0.2, y0: 0.6, x1: 0.8, y1: 0.64 }, 0, 12.5, { tipo: 'recesso' });
  const doce: Material = { tipo: 'emissivo', cor: ctx.visual.acentos.doce };
  if (aberto) {
    // Tampa em pé no fundo e os doces brilhando dentro.
    m.caixa({ x0: 0.2, y0: 0.26, x1: 0.28, y1: 0.74 }, 12, 26);
    m.caixa({ x0: 0.3, y0: 0.34, x1: 0.72, y1: 0.66 }, 12, 13, doce);
  } else {
    m.caixa({ x0: 0.2, y0: 0.26, x1: 0.8, y1: 0.74 }, 12, 17);
    // Cadeado na frente (+x).
    m.caixa({ x0: 0.78, y0: 0.45, x1: 0.84, y1: 0.55 }, 7, 13, doce);
  }
  return m.modelo(aberto ? 'bau_aberto' : 'bau');
}

/** Baú raro: o mesmo baú com uma fita roxa na tampa (GAMEPLAY.md, "Baús"). */
export function bauRaro(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const base = bau(ctx);
  m.partes.push(...base.partes);
  const fita: Material = { tipo: 'emissivo', cor: ctx.visual.acentos.magia };
  m.caixa({ x0: 0.46, y0: 0.24, x1: 0.54, y1: 0.76 }, 12, 17.6, fita);
  return m.modelo('bau_raro');
}

/** Corvo da Árvore: pássaro pequeno no chão, de asas fechadas e olhos acesos. */
export function corvo(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const { iso } = ctx;
  const c = 0.5;
  m.caixa({ x0: c - 0.02, y0: c - 0.06, x1: c + 0.02, y1: c - 0.03 }, 0, 5);
  m.caixa({ x0: c - 0.02, y0: c + 0.03, x1: c + 0.02, y1: c + 0.06 }, 0, 5);
  m.add(esfera(c - 0.03, c, 10, 0.11, iso, 8, 4));
  m.caixa({ x0: c - 0.24, y0: c - 0.04, x1: c - 0.1, y1: c + 0.04 }, 9, 12);
  const rCabeca = { x0: c + 0.02, y0: c - 0.06, x1: c + 0.14, y1: c + 0.06 };
  const cabeca = m.caixa(rCabeca, 15, 22);
  olhos(cabeca, rCabeca, '+x', c, 18, 20, ctx.visual.acentos.perigo);
  m.caixa({ x0: c + 0.14, y0: c - 0.02, x1: c + 0.22, y1: c + 0.02 }, 17, 19);
  return m.modelo('corvo');
}

/** Gato Preto: corpo baixo, orelhas pontudas, rabo em pé e olhos cor de doce. */
export function gatoPreto(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const c = 0.5;
  const escuro: Material = { tipo: 'recesso' };
  m.caixa({ x0: 0.3, y0: c - 0.08, x1: 0.68, y1: c + 0.08 }, 3, 11, escuro);
  for (const x of [0.32, 0.6]) {
    m.caixa({ x0: x, y0: c - 0.07, x1: x + 0.05, y1: c - 0.02 }, 0, 3, escuro);
    m.caixa({ x0: x, y0: c + 0.02, x1: x + 0.05, y1: c + 0.07 }, 0, 3, escuro);
  }
  const rCabeca = { x0: 0.62, y0: c - 0.09, x1: 0.8, y1: c + 0.09 };
  const cabeca = m.caixa(rCabeca, 9, 18, escuro);
  olhos(cabeca, rCabeca, '+x', c, 13, 15.5, ctx.visual.acentos.doce);
  m.caixa({ x0: 0.66, y0: c - 0.08, x1: 0.71, y1: c - 0.04 }, 18, 21, escuro);
  m.caixa({ x0: 0.66, y0: c + 0.04, x1: 0.71, y1: c + 0.08 }, 18, 21, escuro);
  m.caixa({ x0: 0.26, y0: c - 0.02, x1: 0.31, y1: c + 0.02 }, 9, 22, escuro);
  return m.modelo('gato_preto');
}

/** Vizinho Curioso: de boné, com um binóculo na frente dos olhos. */
export function vizinhoCurioso(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const c = 0.5;
  m.add(prisma(c, c, 0.13, 8, 0, 17));
  const rCabeca = { x0: c - 0.1, y0: c - 0.1, x1: c + 0.1, y1: c + 0.1 };
  const cabeca = m.caixa(rCabeca, 17, 27);
  olhos(cabeca, rCabeca, '+x', c, 21, 24, ctx.visual.acentos.perigo);
  m.caixa({ x0: c - 0.11, y0: c - 0.11, x1: c + 0.11, y1: c + 0.11 }, 27, 30);
  m.caixa({ x0: c + 0.08, y0: c - 0.1, x1: c + 0.2, y1: c + 0.1 }, 27, 28);
  m.add(prisma(c + 0.14, c - 0.05, 0.035, 6, 20.5, 24.5));
  m.add(prisma(c + 0.14, c + 0.05, 0.035, 6, 20.5, 24.5));
  return m.modelo('vizinho_curioso');
}

/** Sombra Rasteira: uma mancha escura no chão com uma corcova e olhos. */
export function sombraRasteira(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const c = 0.5;
  const escuro: Material = { tipo: 'recesso' };
  m.caixa({ x0: 0.12, y0: 0.26, x1: 0.88, y1: 0.74 }, 0, 2, escuro);
  m.caixa({ x0: 0.22, y0: 0.18, x1: 0.78, y1: 0.82 }, 0, 1, escuro);
  m.add(prisma(c, c, 0.18, 8, 0, 9, escuro));
  const rCabeca = { x0: c + 0.06, y0: c - 0.1, x1: c + 0.2, y1: c + 0.1 };
  const cabeca = m.caixa(rCabeca, 4, 11, escuro);
  olhos(cabeca, rCabeca, '+x', c, 7, 9.5, ctx.visual.acentos.perigo);
  return m.modelo('sombra_rasteira');
}

/** Guarda de Condomínio: quepe e cassetete. */
export function guarda(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  const c = 0.5;
  m.caixa({ x0: c - 0.13, y0: c - 0.12, x1: c + 0.13, y1: c + 0.12 }, 0, 17);
  const rCabeca = { x0: c - 0.1, y0: c - 0.1, x1: c + 0.1, y1: c + 0.1 };
  const cabeca = m.caixa(rCabeca, 17, 26);
  olhos(cabeca, rCabeca, '+x', c, 20, 23, ctx.visual.acentos.perigo);
  m.caixa({ x0: c - 0.11, y0: c - 0.11, x1: c + 0.11, y1: c + 0.11 }, 26, 30);
  m.caixa({ x0: c + 0.05, y0: c - 0.1, x1: c + 0.18, y1: c + 0.1 }, 26, 27);
  m.caixa({ x0: c + 0.06, y0: c + 0.13, x1: c + 0.1, y1: c + 0.17 }, 6, 20);
  return m.modelo('guarda_condominio');
}

/** Grade do Portão do Síndico (1 tile ao longo de y), que sobe do chão e some depois. */
export function gradeMovel(ctx: ContextoModelo): Modelo {
  const m = new Montagem(ctx);
  for (let i = 0; i < 4; i++) {
    const y0 = 0.06 + i * 0.25;
    m.caixa({ x0: 0.45, y0, x1: 0.55, y1: y0 + 0.07 }, 0, 34);
  }
  m.caixa({ x0: 0.43, y0: 0, x1: 0.57, y1: 1 }, 30, 34);
  m.caixa({ x0: 0.43, y0: 0, x1: 0.57, y1: 1 }, 6, 9);
  return m.modelo('grade_movel');
}

function pegadaDe(nome: NomeModelo): { largura: number; profundidade: number } {
  const { largura, profundidade } = modelos[nome].pegada;
  return { largura, profundidade };
}

export type { Rotacao };

export interface Instancia {
  partes: Parte[];
  luzes: FonteDeLuz[];
  /** Boca das chaminés no mundo (para a fumaça). */
  chamines: Vec3[];
  /** Pegada no mundo depois de girar e posicionar. */
  pegada: Pegada;
}

/** Gira o modelo em volta do centro da pegada e põe o canto mínimo dela em (x, y). */
export function instanciar(modelo: Modelo, x: number, y: number, rot: Rotacao): Instancia {
  const { ponto, pegada } = posicionador(modelo.largura, modelo.profundidade, x, y, rot);
  const direcao = (v: Vec2) => girar(v, rot);
  return {
    partes: modelo.partes.map((p) => transformarParte(p, ponto, direcao)),
    luzes: modelo.luzes.map((l) => ({
      ...l,
      ...ponto(l),
      ...(l.normal ? { normal: direcao(l.normal) } : {}),
    })),
    chamines: (modelo.chamines ?? []).map((c) => ({ ...ponto(c), z: c.z })),
    pegada,
  };
}
