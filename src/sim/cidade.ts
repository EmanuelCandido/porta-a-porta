import type { Gerador, Modelos, NomeModelo, ObjetoRua, Piso } from './content/esquemas';
import { posicionador, type Retangulo, type Rotacao } from './geometria';
import { Rng } from './rng';

// A cidade em volta da área jogável (docs/DESIGN.md, seções 4 e 9): só desenho, sem colisão e sem
// efeito na simulação. Ela contorna o bairro com ruas de fora, continua as vias que saem dele
// (avenida, ruas de trás e travessas) e enche os quarteirões que sobram com lotes virados para as
// ruas, um marco por quarteirão grande, postes, árvores e carros. Um lado pode virar a encosta de
// um morro, com pedras e pinheiros: o limite do bairro passa a ser o relevo, não um muro.

export type LadoDoMundo = 'oeste' | 'leste' | 'norte' | 'sul';

/** Uma via da área que continua na cidade, dos dois lados. */
export interface Continuacao {
  /** 'y': a via corre ao longo de y e continua ao norte e ao sul; 'x': a oeste e a leste. */
  eixo: 'x' | 'y';
  /** Faixa da pista no eixo cruzado (x para uma via em y). */
  a0: number;
  a1: number;
  calcada: number;
}

export interface PlanoDaCidade {
  /** A área jogável, que a cidade contorna (em tiles). */
  area: Retangulo;
  continuacoes: Continuacao[];
  bairro: number;
  /** Lado que vira encosta de morro (sem ruas nem quarteirões), ou null. */
  serra?: LadoDoMundo | null;
}

export interface CidadeGerada {
  cenario: ObjetoRua[];
  piso: Piso[];
  /** O mundo desenhado: a área e o anel de cidade em volta. */
  mundo: Retangulo;
}

type Frente = '+x' | '-x' | '+y' | '-y';
const ROTACAO_DA_FRENTE: Record<Frente, Rotacao> = { '+x': 0, '+y': 90, '-x': 180, '-y': 270 };
/** Quanto um ponto de teste sai da borda do quarteirão para ver se ali é rua. */
const SONDA = 0.3;
/** Profundidade de cada fileira de lotes dentro do quarteirão (o lote mais fundo e o quintal). */
const FAIXA_DE_LOTE = 5.8;
/** Folga mínima entre dois lotes que se encostam, em tiles. */
const FOLGA_MINIMA = 0.25;
/** Passo da grade dos morros da encosta, em tiles (cada morro tem 3 × 3). */
const PASSO_DA_SERRA = 2.4;
const arred = (n: number) => Math.round(n * 1000) / 1000;

function dentro(p: { x: number; y: number }, r: Retangulo): boolean {
  return p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1;
}

function cruzam(a: Retangulo, b: Retangulo, folga = 0): boolean {
  return a.x0 < b.x1 + folga && b.x0 < a.x1 + folga && a.y0 < b.y1 + folga && b.y0 < a.y1 + folga;
}

/** O que sobra de `r` fora da faixa `s` (que atravessa `r` inteira num dos eixos). */
export function foraDaFaixa(r: Retangulo, s: Retangulo): Retangulo[] {
  if (!cruzam(r, s, -1e-9)) return [r];
  const pedacos: Retangulo[] = [];
  if (s.y0 <= r.y0 && s.y1 >= r.y1) {
    if (r.x0 < s.x0) pedacos.push({ ...r, x1: s.x0 });
    if (r.x1 > s.x1) pedacos.push({ ...r, x0: s.x1 });
    return pedacos;
  }
  if (s.x0 <= r.x0 && s.x1 >= r.x1) {
    if (r.y0 < s.y0) pedacos.push({ ...r, y1: s.y0 });
    if (r.y1 > s.y1) pedacos.push({ ...r, y0: s.y1 });
    return pedacos;
  }
  return [r];
}

/** Sorteia uma chave pelos pesos (as que faltam valem 0). */
export function sortearPeso<T extends string>(rng: Rng, pesos: Partial<Record<T, number>>): T {
  const itens = Object.entries(pesos).filter(([, p]) => (p as number) > 0) as [T, number][];
  const total = itens.reduce((s, [, p]) => s + p, 0);
  let r = rng.proximo() * total;
  for (const [k, p] of itens) {
    r -= p;
    if (r <= 0) return k;
  }
  return itens[itens.length - 1]![0];
}

interface Via {
  /** Pista (asfalto). */
  pista: Retangulo;
  /** Calçadas dos dois lados. */
  calcadas: Retangulo[];
  /** Sentido da via: ao longo de x ou de y. */
  eixo: 'x' | 'y';
}

/** Retângulo da encosta do lado dado (do limite da área até a borda do mundo). */
function faixaDaSerra(lado: LadoDoMundo, a: Retangulo, mundo: Retangulo): Retangulo {
  switch (lado) {
    case 'oeste':
      return { x0: mundo.x0, y0: mundo.y0, x1: a.x0, y1: mundo.y1 };
    case 'leste':
      return { x0: a.x1, y0: mundo.y0, x1: mundo.x1, y1: mundo.y1 };
    case 'norte':
      return { x0: mundo.x0, y0: mundo.y0, x1: mundo.x1, y1: a.y0 };
    case 'sul':
      return { x0: mundo.x0, y0: a.y1, x1: mundo.x1, y1: mundo.y1 };
  }
}

/**
 * Gera a cidade em volta de uma área jogável. A mesma semente dá a mesma cidade.
 */
export function gerarCidade(
  semente: number,
  plano: PlanoDaCidade,
  cfg: Gerador,
  modelos: Modelos,
): CidadeGerada {
  const rng = new Rng(semente);
  const c = cfg.cidade;
  const a = plano.area;
  const R = c.anel;
  const mundo = { x0: a.x0 - R, y0: a.y0 - R, x1: a.x1 + R, y1: a.y1 + R };
  const cal = c.calcada;
  const pis = c.pista;
  const larguraVia = 2 * cal + pis;
  const cenario: ObjetoRua[] = [];
  const piso: Piso[] = [];
  const ocupado: Retangulo[] = [];
  const serra = plano.serra ? faixaDaSerra(plano.serra, a, mundo) : null;

  // ------------------------------------------------------------ vias
  let vias: Via[] = [];
  const viaY = (x0: number, y0: number, y1: number): Via => ({
    eixo: 'y',
    pista: { x0: x0 + cal, y0, x1: x0 + cal + pis, y1 },
    calcadas: [
      { x0, y0, x1: x0 + cal, y1 },
      { x0: x0 + cal + pis, y0, x1: x0 + larguraVia, y1 },
    ],
  });
  const viaX = (y0: number, x0: number, x1: number): Via => ({
    eixo: 'x',
    pista: { x0, y0: y0 + cal, x1, y1: y0 + cal + pis },
    calcadas: [
      { x0, y0, x1, y1: y0 + cal },
      { x0, y0: y0 + cal + pis, x1, y1: y0 + larguraVia },
    ],
  });
  // Ruas de fora, coladas na área (atrás dos fundos dos lotes da beira).
  vias.push(viaY(a.x0 - larguraVia, mundo.y0, mundo.y1));
  vias.push(viaY(a.x1, mundo.y0, mundo.y1));
  vias.push(viaX(a.y0 - larguraVia, mundo.x0, mundo.x1));
  vias.push(viaX(a.y1, mundo.x0, mundo.x1));
  // As vias da área continuam até a borda do mundo.
  for (const k of plano.continuacoes) {
    const pedacos: [number, number][] =
      k.eixo === 'y'
        ? [
            [mundo.y0, a.y0],
            [a.y1, mundo.y1],
          ]
        : [
            [mundo.x0, a.x0],
            [a.x1, mundo.x1],
          ];
    for (const [b0, b1] of pedacos) {
      vias.push(
        k.eixo === 'y'
          ? {
              eixo: 'y',
              pista: { x0: k.a0, y0: b0, x1: k.a1, y1: b1 },
              calcadas: [
                { x0: k.a0 - k.calcada, y0: b0, x1: k.a0, y1: b1 },
                { x0: k.a1, y0: b0, x1: k.a1 + k.calcada, y1: b1 },
              ],
            }
          : {
              eixo: 'x',
              pista: { x0: b0, y0: k.a0, x1: b1, y1: k.a1 },
              calcadas: [
                { x0: b0, y0: k.a0 - k.calcada, x1: b1, y1: k.a0 },
                { x0: b0, y0: k.a1, x1: b1, y1: k.a1 + k.calcada },
              ],
            },
      );
    }
  }
  // A encosta come as vias que passariam por ela.
  if (serra) {
    vias = vias.flatMap((v) =>
      foraDaFaixa(v.pista, serra).map((pista) => ({
        eixo: v.eixo,
        pista,
        calcadas: v.calcadas
          .flatMap((k) => foraDaFaixa(k, serra))
          .filter((k) =>
            v.eixo === 'y'
              ? k.y0 < pista.y1 && k.y1 > pista.y0
              : k.x0 < pista.x1 && k.x1 > pista.x0,
          ),
      })),
    );
  }
  // Calçadas primeiro e pistas por cima: os cruzamentos ficam de asfalto.
  for (const v of vias) for (const k of v.calcadas) piso.push({ tipo: 'calcada', ...k });
  for (const v of vias) piso.push({ tipo: 'asfalto', ...v.pista });
  // Faixa central tracejada nas pistas e meio-fio.
  for (const v of vias) {
    const p = v.pista;
    if (v.eixo === 'y') {
      const xm = (p.x0 + p.x1) / 2;
      for (let y = p.y0 + 0.5; y < p.y1 - 1; y += 2)
        piso.push({ tipo: 'faixa', x0: xm - 0.05, y0: y, x1: xm + 0.05, y1: y + 1 });
      piso.push({ tipo: 'meioFio', x0: p.x0 - 0.08, y0: p.y0, x1: p.x0, y1: p.y1 });
      piso.push({ tipo: 'meioFio', x0: p.x1, y0: p.y0, x1: p.x1 + 0.08, y1: p.y1 });
    } else {
      const ym = (p.y0 + p.y1) / 2;
      for (let x = p.x0 + 0.5; x < p.x1 - 1; x += 2)
        piso.push({ tipo: 'faixa', x0: x, y0: ym - 0.05, x1: x + 1, y1: ym + 0.05 });
      piso.push({ tipo: 'meioFio', x0: p.x0, y0: p.y0 - 0.08, x1: p.x1, y1: p.y0 });
      piso.push({ tipo: 'meioFio', x0: p.x0, y0: p.y1, x1: p.x1, y1: p.y1 + 0.08 });
    }
  }
  const pistas = vias.map((v) => v.pista);
  const calcadas = vias.flatMap((v) => v.calcadas);
  const ehVia = (p: { x: number; y: number }) =>
    pistas.some((r) => dentro(p, r)) || calcadas.some((r) => dentro(p, r));
  // Nada de lote em cima de uma via, da área jogável nem da encosta.
  ocupado.push(a, ...pistas, ...calcadas);
  if (serra) ocupado.push(serra);

  // ------------------------------------------------------------ quarteirões
  // Cortes em todas as bordas de via; cada célula que não é via, área nem encosta é quarteirão.
  const cortes = (eixo: 'x' | 'y'): number[] => {
    const v = new Set<number>(
      eixo === 'x' ? [mundo.x0, mundo.x1, a.x0, a.x1] : [mundo.y0, mundo.y1, a.y0, a.y1],
    );
    for (const r of [...pistas, ...calcadas]) {
      v.add(arred(eixo === 'x' ? r.x0 : r.y0));
      v.add(arred(eixo === 'x' ? r.x1 : r.y1));
    }
    return [...v].sort((p, q) => p - q);
  };
  const cx = cortes('x');
  const cy = cortes('y');
  const quarteiroes: Retangulo[] = [];
  for (let i = 0; i < cx.length - 1; i++) {
    for (let j = 0; j < cy.length - 1; j++) {
      const q = { x0: cx[i]!, y0: cy[j]!, x1: cx[i + 1]!, y1: cy[j + 1]! };
      if (q.x1 - q.x0 < 1 || q.y1 - q.y0 < 1) continue;
      const centro = { x: (q.x0 + q.x1) / 2, y: (q.y0 + q.y1) / 2 };
      if (dentro(centro, a) || ehVia(centro) || (serra && dentro(centro, serra))) continue;
      quarteiroes.push(q);
    }
  }

  const add = (o: ObjetoRua): void => {
    cenario.push({ ...o, x: arred(o.x), y: arred(o.y) });
  };

  /** Tenta pôr um modelo com a frente para `frente`, encostado na borda; devolve o retângulo. */
  const colocar = (
    modelo: NomeModelo,
    frente: Frente,
    q: Retangulo,
    ao: number,
    variante?: string,
    recuoExtra = 0,
  ): Retangulo | null => {
    const rot = ROTACAO_DA_FRENTE[frente];
    const { largura: w, profundidade: d } = modelos[modelo].pegada;
    const deitado = rot === 90 || rot === 270;
    const W = deitado ? d : w;
    const D = deitado ? w : d;
    let x: number;
    let y: number;
    const recuo = c.recuo + recuoExtra;
    if (frente === '+x') [x, y] = [q.x1 - recuo - W, ao];
    else if (frente === '-x') [x, y] = [q.x0 + recuo, ao];
    else if (frente === '+y') [x, y] = [ao, q.y1 - recuo - D];
    else [x, y] = [ao, q.y0 + recuo];
    const pegada = posicionador(w, d, x, y, rot).pegada;
    if (pegada.x0 < q.x0 || pegada.y0 < q.y0 || pegada.x1 > q.x1 || pegada.y1 > q.y1) return null;
    if (ocupado.some((o) => cruzam(o, pegada, FOLGA_MINIMA))) return null;
    ocupado.push(pegada);
    const apagada = rng.proximo() < c.chanceDeApagada;
    add({
      modelo,
      x,
      y,
      rot,
      ...(variante ? { variante } : {}),
      ...(apagada ? { apagada } : {}),
    } as ObjetoRua);
    return pegada;
  };

  const variantePara = (modelo: NomeModelo): string | undefined => {
    if (modelo === 'loja') return rng.escolher(['mercadinho', 'padaria', 'farmacia']);
    if (modelo === 'predio') return rng.escolher(['baixo', 'medio', 'alto']);
    return undefined;
  };

  /** Bordas do quarteirão que dão para uma via, com a frente que os lotes ali usam. */
  const bordasComRua = (q: Retangulo): { frente: Frente; de: number; ate: number }[] => {
    const bordas: { frente: Frente; de: number; ate: number }[] = [];
    const meioX = (q.x0 + q.x1) / 2;
    const meioY = (q.y0 + q.y1) / 2;
    if (ehVia({ x: q.x1 + SONDA, y: meioY })) bordas.push({ frente: '+x', de: q.y0, ate: q.y1 });
    if (ehVia({ x: q.x0 - SONDA, y: meioY })) bordas.push({ frente: '-x', de: q.y0, ate: q.y1 });
    if (ehVia({ x: meioX, y: q.y1 + SONDA })) bordas.push({ frente: '+y', de: q.x0, ate: q.x1 });
    if (ehVia({ x: meioX, y: q.y0 - SONDA })) bordas.push({ frente: '-y', de: q.x0, ate: q.x1 });
    return bordas;
  };

  // Marcos: um por quarteirão grande, no meio da borda mais comprida que dá para a rua.
  const grandes = [...quarteiroes].sort(
    (p, q) => (q.x1 - q.x0) * (q.y1 - q.y0) - (p.x1 - p.x0) * (p.y1 - p.y0),
  );
  c.marcos.forEach((marco, i) => {
    const q = grandes[i];
    if (!q) return;
    const bordas = bordasComRua(q).sort((p, r) => r.ate - r.de - (p.ate - p.de));
    for (const b of bordas) {
      const { largura: w, profundidade: d } = modelos[marco].pegada;
      const lado = b.frente === '+x' || b.frente === '-x' ? d : w;
      const ao = (b.de + b.ate) / 2 - lado / 2;
      if (colocar(marco, b.frente, q, ao)) break;
    }
  });

  // Lotes ao longo de cada borda com rua, em fileiras: a primeira de frente para a rua e as de
  // trás (casas de fundos, prédios) até o quarteirão encher.
  for (const q of quarteiroes) piso.push({ tipo: 'grama', ...q });
  for (const q of quarteiroes) {
    for (const b of bordasComRua(q)) {
      const fundo = b.frente === '+x' || b.frente === '-x' ? q.x1 - q.x0 : q.y1 - q.y0;
      for (let fileira = 0; fileira * FAIXA_DE_LOTE + 3 < fundo; fileira++) {
        let cursor = b.de + rng.entre(0.4, 1.2);
        let falhas = 0;
        while (cursor < b.ate - 1 && falhas < 6) {
          const modelo = sortearPeso(rng, c.lotes);
          const { largura: w, profundidade: d } = modelos[modelo].pegada;
          const lado = b.frente === '+x' || b.frente === '-x' ? d : w;
          if (cursor + lado > b.ate - 0.3) {
            falhas++;
            cursor += 0.5;
            continue;
          }
          const p = colocar(
            modelo,
            b.frente,
            q,
            cursor,
            variantePara(modelo),
            fileira * FAIXA_DE_LOTE,
          );
          if (p) {
            cursor += lado + rng.entre(c.folgaEntreLotes[0], c.folgaEntreLotes[1]);
            falhas = 0;
          } else {
            cursor += 0.5;
            falhas++;
          }
        }
      }
    }
  }

  // Miolo dos quarteirões: árvores, arbustos, varais e lápides nos fundos dos lotes.
  const arvores = cfg.bairros[Math.min(plano.bairro, cfg.bairros.length - 1)]!.arvores;
  for (const q of quarteiroes) {
    const area = (q.x1 - q.x0) * (q.y1 - q.y0);
    const tentativas = Math.round(area / 6);
    for (let k = 0; k < tentativas; k++) {
      const x = rng.entre(q.x0 + 0.3, q.x1 - 1.3);
      const y = rng.entre(q.y0 + 0.3, q.y1 - 1.3);
      const sorteio = rng.proximo();
      const modelo: NomeModelo =
        sorteio < 0.55
          ? sortearPeso(rng, arvores)
          : sorteio < 0.75
            ? 'arbusto'
            : sorteio < 0.87
              ? 'varal'
              : sorteio < 0.94
                ? 'lapide'
                : 'cerca_viva';
      const { largura: w, profundidade: d } = modelos[modelo].pegada;
      const r = { x0: x, y0: y, x1: x + w, y1: y + d };
      if (r.x1 > q.x1 || r.y1 > q.y1 || ocupado.some((o) => cruzam(o, r, 0.1))) continue;
      ocupado.push(r);
      add({ modelo, x, y, rot: 0 } as ObjetoRua);
    }
  }

  // ------------------------------------------------------------ mobiliário das vias
  const livre = (r: Retangulo) => !cruzam(r, a, -0.01) && dentroDoMundo(r, mundo);
  const naoNaArea = (x: number, y: number) =>
    !dentro({ x, y }, { x0: a.x0 - 0.2, y0: a.y0 - 0.2, x1: a.x1 + 0.2, y1: a.y1 + 0.2 });
  const outraPista = (p: { x: number; y: number }, propria: Retangulo) =>
    pistas.some(
      (r) => r !== propria && dentro(p, { x0: r.x0 - 1, y0: r.y0 - 1, x1: r.x1 + 1, y1: r.y1 + 1 }),
    );
  for (const v of vias) {
    const p = v.pista;
    const comprimento = v.eixo === 'y' ? p.y1 - p.y0 : p.x1 - p.x0;
    const inicio = v.eixo === 'y' ? p.y0 : p.x0;
    // Postes alternando os lados, a cada `postesACada` tiles.
    let k = 0;
    for (let s = rng.entre(1, c.postesACada); s < comprimento - 1; s += c.postesACada, k++) {
      const pos = inicio + s;
      const ladoA = k % 2 === 0;
      const pt =
        v.eixo === 'y'
          ? { x: ladoA ? p.x0 - 0.35 : p.x1 + 0.35, y: pos }
          : { x: pos, y: ladoA ? p.y0 - 0.35 : p.y1 + 0.35 };
      if (!naoNaArea(pt.x, pt.y) || outraPista(pt, p)) continue;
      add({ modelo: 'poste', estado: 'amigo', x: pt.x - 0.5, y: pt.y - 0.5, rot: 0 });
    }
    // Árvores na beira de fora das calçadas (o tronco fica no meio da pegada 1 × 1).
    const k0 = v.calcadas[0]!;
    const larguraCalcada = v.eixo === 'y' ? k0.x1 - k0.x0 : k0.y1 - k0.y0;
    const recuoTronco = Math.min(0.4, larguraCalcada / 2);
    for (let s = rng.entre(0.5, c.arvoresACada); s < comprimento - 1; s += c.arvoresACada) {
      const pos = inicio + s + rng.entre(-0.6, 0.6);
      const ladoA = rng.proximo() < 0.5;
      const fora = larguraCalcada - recuoTronco;
      const centro =
        v.eixo === 'y'
          ? { x: ladoA ? p.x0 - fora : p.x1 + fora, y: pos }
          : { x: pos, y: ladoA ? p.y0 - fora : p.y1 + fora };
      if (!naoNaArea(centro.x, centro.y) || outraPista(centro, p)) continue;
      add({
        modelo: sortearPeso(rng, arvores),
        x: centro.x - 0.5,
        y: centro.y - 0.5,
        rot: 0,
      } as ObjetoRua);
    }
    // Carros estacionados no meio-fio, alinhados com a via; de vez em quando, o micro-ônibus.
    for (let s = 1.5; s < comprimento - 3; s += 3) {
      if (rng.proximo() > c.chanceDeCarro) continue;
      const pos = inicio + s;
      const ladoA = rng.proximo() < 0.5;
      const modelo = rng.proximo() < c.chanceDeOnibus ? 'onibus' : 'carro';
      const variante = modelo === 'carro' ? sortearPeso(rng, cfg.carros.variantes) : undefined;
      const { largura: comp, profundidade: larg } = modelos[modelo].pegada;
      // O veículo é comprido em x: ao longo de y ele vai girado (rot 90 ou 270).
      const o = (
        v.eixo === 'y'
          ? { modelo, x: ladoA ? p.x0 + 0.1 : p.x1 - larg - 0.1, y: pos, rot: ladoA ? 90 : 270 }
          : { modelo, x: pos, y: ladoA ? p.y0 + 0.1 : p.y1 - larg - 0.1, rot: ladoA ? 0 : 180 }
      ) as ObjetoRua;
      if (variante) Object.assign(o, { variante });
      const r =
        v.eixo === 'y'
          ? { x0: o.x, y0: o.y, x1: o.x + larg, y1: o.y + comp }
          : { x0: o.x, y0: o.y, x1: o.x + comp, y1: o.y + larg };
      if (!livre(r) || outraPista({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 }, p)) continue;
      add(o);
    }
  }

  // ------------------------------------------------------------ a encosta
  if (serra) {
    piso.push({ tipo: 'terra', ...serra });
    const arvoresDaSerra = { pinheiro: 3, arvore_seca: 2, arvore: 1 } as const;
    // Quanto mais longe da área, mais alto o morro: a encosta sobe para fora do bairro.
    const distanciaDaArea = (x: number, y: number) =>
      Math.max(a.x0 - x, x - a.x1, a.y0 - y, y - a.y1, 0);
    for (let y = serra.y0 - 0.5; y < serra.y1 - 2; y += PASSO_DA_SERRA) {
      for (let x = serra.x0 - 0.5; x < serra.x1 - 2; x += PASSO_DA_SERRA) {
        const px = x + rng.entre(-0.4, 0.4);
        const py = y + rng.entre(-0.4, 0.4);
        const d = distanciaDaArea(px + 1.5, py + 1.5);
        if (d < 0.5) continue;
        const sorteio = rng.proximo();
        if (d > 3 && sorteio < 0.6) {
          cenario.push({
            modelo: 'morro',
            variante: d > 7 && rng.proximo() < 0.6 ? 'alto' : 'baixo',
            x: arred(px),
            y: arred(py),
            rot: rng.escolher([0, 90, 180, 270] as const),
          });
        } else if (sorteio < 0.85) {
          cenario.push({
            modelo: sortearPeso(rng, arvoresDaSerra),
            x: arred(px + 1),
            y: arred(py + 1),
            rot: 0,
          } as ObjetoRua);
        } else {
          cenario.push({
            modelo: 'pedra',
            variante: rng.proximo() < 0.5 ? 'grande' : 'pequena',
            x: arred(px + 1),
            y: arred(py + 1),
            rot: 0,
          });
        }
      }
    }
  }

  return { cenario, piso, mundo };
}

function dentroDoMundo(r: Retangulo, m: Retangulo): boolean {
  return r.x0 >= m.x0 && r.y0 >= m.y0 && r.x1 <= m.x1 && r.y1 <= m.y1;
}
