import {
  direcaoDaCamera,
  normalizar,
  paraTela,
  produtoEscalar,
  type Iso,
  type Vec2,
  type Vec3,
} from './iso';

export type Material =
  /** Pintado com um dos três tons da paleta, escolhido pela normal da face. */
  | { tipo: 'solido' }
  /** Brilha com cor própria (janela, luminária, olhos) e fica fora da escuridão. */
  | { tipo: 'emissivo'; cor: string }
  /** Porta, garagem: a sombra da paleta pintada por cima da parede. */
  | { tipo: 'recesso' }
  /**
   * Como o sólido, mas com três tons próprios (roupa, lençol, faixa do chapéu; só personagens).
   * Com `facetas`, cada face ganha o tom da sua inclinação em relação à luz, em faixas entre a
   * face direita, a esquerda e o topo: é o que faz as facetas dos personagens aparecerem.
   */
  | { tipo: 'tom'; tons: TresTons; facetas?: Facetas };

export interface Facetas {
  /** Direção da luz (métrica). A face +x fica com o tom da direita, +y da esquerda, o topo claro. */
  luz: Vec3;
  /** Quantos tons distintos entre a face direita e o topo. */
  faixas: number;
}

function hex(c: string): [number, number, number] {
  const n = Number.parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function misturar(a: string, b: string, t: number): string {
  const ca = hex(a);
  const cb = hex(b);
  const c = ca.map((v, i) => Math.round(v + (cb[i]! - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/**
 * Tom de uma faceta: 0 na face que olha para +x (tom da direita), ½ na que olha para +y (tom da
 * esquerda) e 1 no topo, contínuo para as inclinadas e arredondado em `faixas` degraus.
 */
export function tomDaFaceta(n: Vec3, tons: TresTons, f: Facetas): string {
  const l = normalizar(f.luz);
  const t0 = l.x;
  const t1 = l.z;
  const bruto = Math.max(0, Math.min(1, (produtoEscalar(n, l) - t0) / (t1 - t0)));
  const t = Math.round(bruto * (f.faixas - 1)) / (f.faixas - 1);
  return t <= 0.5
    ? misturar(tons.faceDireita, tons.faceEsquerda, t / 0.5)
    : misturar(tons.faceEsquerda, tons.topo, (t - 0.5) / 0.5);
}

export interface TresTons {
  topo: string;
  faceEsquerda: string;
  faceDireita: string;
}

export interface Face {
  pts: Vec3[];
  material: Material;
  /** Normal métrica unitária. Nas faces de uma parte é calculada; nos decalques pode ser dada. */
  normal?: Vec3;
}

/** Detalhes rentes a uma parede (janela, porta, friso). Só aparecem se a parede aparecer. */
export interface Decalque {
  normal: Vec3;
  faces: Face[];
}

/** Sólido convexo: as faces visíveis de um convexo nunca se cobrem entre si. */
export interface Parte {
  faces: Face[];
  decalques: Decalque[];
  /**
   * Camada de empilhamento (chapéu sobre a cabeça): entre duas partes que nenhum eixo separa e
   * que têm camada, a de camada maior é pintada depois. Sem camada, vale a profundidade.
   */
  camada?: number;
  /**
   * Malha (personagem vindo de um GLB): não é convexa, então as faces visíveis são pintadas do
   * fundo para a frente, e cada face traz a própria normal.
   */
  malha?: boolean;
}

export interface Caixa3 {
  min: Vec3;
  max: Vec3;
}

export type Tom = 'topo' | 'faceEsquerda' | 'faceDireita';

export interface PaletaVolumes {
  topo: string;
  faceEsquerda: string;
  faceDireita: string;
  sombra: { cor: string; opacidade: number };
}

/** Polígono pronto para pintar, em coordenadas de tela, na ordem de desenho. */
export interface Poligono {
  pts: Vec2[];
  cor: string;
  alfa: number;
  emissivo: boolean;
  /**
   * Faces de malha: a profundidade de cada vértice (maior = mais perto da câmera), para o raster
   * com z-buffer decidir pixel a pixel o que fica na frente.
   */
  prof?: number[];
}

const EPS = 1e-6;

export function parte(faces: Face[]): Parte {
  return { faces, decalques: [] };
}

function emMetrico(p: Vec3, iso: Iso): Vec3 {
  return { x: p.x, y: p.y, z: p.z / iso.zPorTile };
}

/** Normal de Newell: robusta para qualquer polígono plano, em qualquer ordem de vértices. */
export function normalDeNewell(pts: Vec3[], iso: Iso): Vec3 {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = emMetrico(pts[i]!, iso);
    const b = emMetrico(pts[(i + 1) % pts.length]!, iso);
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  return normalizar({ x: nx, y: ny, z: nz });
}

function centroide(pts: Vec3[]): Vec3 {
  const c = { x: 0, y: 0, z: 0 };
  for (const p of pts) {
    c.x += p.x;
    c.y += p.y;
    c.z += p.z;
  }
  return { x: c.x / pts.length, y: c.y / pts.length, z: c.z / pts.length };
}

/** Calcula as normais métricas das faces de uma parte, apontando para fora do sólido. */
export function normaisDaParte(p: Parte, iso: Iso): Vec3[] {
  const todos = p.faces.flatMap((f) => f.pts);
  const centro = emMetrico(centroide(todos), iso);
  return p.faces.map((f) => {
    if (f.normal) return f.normal;
    const n = normalDeNewell(f.pts, iso);
    const c = emMetrico(centroide(f.pts), iso);
    const paraFora = { x: c.x - centro.x, y: c.y - centro.y, z: c.z - centro.z };
    return produtoEscalar(n, paraFora) < 0 ? { x: -n.x, y: -n.y, z: -n.z } : n;
  });
}

export function visivel(normal: Vec3, iso: Iso): boolean {
  return produtoEscalar(normal, direcaoDaCamera(iso)) > EPS;
}

/** Topo mais claro, face esquerda média e face direita mais escura, sem gradiente. */
export function tomDaNormal(n: Vec3, limiarTopo: number): Tom {
  if (n.z >= limiarTopo) return 'topo';
  return n.y >= n.x ? 'faceEsquerda' : 'faceDireita';
}

export function caixaDaParte(p: Parte): Caixa3 {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const f of p.faces) {
    for (const q of f.pts) {
      min.x = Math.min(min.x, q.x);
      min.y = Math.min(min.y, q.y);
      min.z = Math.min(min.z, q.z);
      max.x = Math.max(max.x, q.x);
      max.y = Math.max(max.y, q.y);
      max.z = Math.max(max.z, q.z);
    }
  }
  return { min, max };
}

interface Retangulo2 {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function retanguloNaTela(p: Parte, iso: Iso): Retangulo2 {
  const r = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const f of p.faces) {
    for (const q of f.pts) {
      const t = paraTela(q, iso);
      r.x0 = Math.min(r.x0, t.x);
      r.y0 = Math.min(r.y0, t.y);
      r.x1 = Math.max(r.x1, t.x);
      r.y1 = Math.max(r.y1, t.y);
    }
  }
  return r;
}

function sobrepoe(a: Retangulo2, b: Retangulo2): boolean {
  return a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.y0 < b.y1 - EPS && b.y0 < a.y1 - EPS;
}

/** `a` fica inteiro atrás de `b` em algum eixo (x e y crescem para a câmera, z sobe para ela). */
function atrasEmAlgumEixo(a: Caixa3, b: Caixa3): boolean {
  return a.max.x <= b.min.x + EPS || a.max.y <= b.min.y + EPS || a.max.z <= b.min.z + EPS;
}

/**
 * Para caixas que se cruzam: o eixo em que uma entra menos na outra (z convertido em tiles) diz
 * quem fica atrás. Uma roda que só encosta na lateral da carroceria entra pouco em y e fica na
 * frente dela, por mais que o centro da roda esteja mais ao fundo. Devolve true se `a` vai antes,
 * ou null se as caixas têm o mesmo centro em todos os eixos.
 */
function aAntesPelaMenorEntrada(a: Caixa3, b: Caixa3, zPorTile: number): boolean | null {
  let melhor = Infinity;
  let resposta: boolean | null = null;
  for (const [eixo, escala] of [
    ['x', 1],
    ['y', 1],
    ['z', 1 / zPorTile],
  ] as const) {
    const entrada =
      (Math.min(a.max[eixo], b.max[eixo]) - Math.max(a.min[eixo], b.min[eixo])) * escala;
    const centroA = a.min[eixo] + a.max[eixo];
    const centroB = b.min[eixo] + b.max[eixo];
    if (Math.abs(centroA - centroB) <= EPS || entrada >= melhor) continue;
    melhor = entrada;
    resposta = centroA < centroB;
  }
  return resposta;
}

function chaveDeProfundidade(c: Caixa3): [number, number] {
  return [(c.min.x + c.max.x + c.min.y + c.max.y) / 2, (c.min.z + c.max.z) / 2];
}

function compararChaves(a: [number, number], b: [number, number]): number {
  if (Math.abs(a[0] - b[0]) > EPS) return a[0] - b[0];
  return a[1] - b[1];
}

/**
 * Ordem de desenho das partes (pintor): ordenação topológica pelos eixos que separam as caixas
 * que se sobrepõem na tela; quando nenhum eixo separa (partes que se cruzam), vale o eixo em que uma
 * entra menos na outra e, empatado, x + y e depois z.
 */
export function ordenarPartes(partes: Parte[], iso: Iso): Parte[] {
  const n = partes.length;
  const caixas = partes.map(caixaDaParte);
  const telas = partes.map((p) => retanguloNaTela(p, iso));
  const chaves = caixas.map(chaveDeProfundidade);
  const depois: number[][] = partes.map(() => []);
  const grau = new Array<number>(n).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!sobrepoe(telas[i]!, telas[j]!)) continue;
      const ij = atrasEmAlgumEixo(caixas[i]!, caixas[j]!);
      const ji = atrasEmAlgumEixo(caixas[j]!, caixas[i]!);
      const ci = partes[i]!.camada;
      const cj = partes[j]!.camada;
      const iPrimeiro =
        ij !== ji
          ? ij
          : ci !== undefined && cj !== undefined && ci !== cj
            ? ci < cj
            : (aAntesPelaMenorEntrada(caixas[i]!, caixas[j]!, iso.zPorTile) ??
              compararChaves(chaves[i]!, chaves[j]!) <= 0);
      const [de, para] = iPrimeiro ? [i, j] : [j, i];
      depois[de]!.push(para);
      grau[para]!++;
    }
  }

  const feitos = new Array<boolean>(n).fill(false);
  const ordem: Parte[] = [];
  for (let passo = 0; passo < n; passo++) {
    let escolhido = -1;
    // Entre as livres, a mais ao fundo; se houver ciclo, a mais ao fundo de todas.
    for (const somenteLivres of [true, false]) {
      for (let k = 0; k < n; k++) {
        if (feitos[k] || (somenteLivres && grau[k]! > 0)) continue;
        if (escolhido < 0 || compararChaves(chaves[k]!, chaves[escolhido]!) < 0) escolhido = k;
      }
      if (escolhido >= 0) break;
    }
    feitos[escolhido] = true;
    ordem.push(partes[escolhido]!);
    for (const m of depois[escolhido]!) grau[m]!--;
  }
  return ordem;
}

function corDoMaterial(
  material: Material,
  normal: Vec3,
  paleta: PaletaVolumes,
  limiarTopo: number,
): { cor: string; alfa: number; emissivo: boolean } {
  switch (material.tipo) {
    case 'solido':
      return { cor: paleta[tomDaNormal(normal, limiarTopo)], alfa: 1, emissivo: false };
    case 'emissivo':
      return { cor: material.cor, alfa: 1, emissivo: true };
    case 'recesso':
      return { cor: paleta.sombra.cor, alfa: paleta.sombra.opacidade, emissivo: false };
    case 'tom':
      return {
        cor: material.facetas
          ? tomDaFaceta(normal, material.tons, material.facetas)
          : material.tons[tomDaNormal(normal, limiarTopo)],
        alfa: 1,
        emissivo: false,
      };
  }
}

/** Converte partes já ordenadas em polígonos de tela, só com as faces voltadas para a câmera. */
export function poligonosDasPartes(
  partesOrdenadas: Parte[],
  iso: Iso,
  paleta: PaletaVolumes,
  limiarTopo: number,
): Poligono[] {
  const saida: Poligono[] = [];
  const empurrar = (f: Face, normal: Vec3, prof?: number[]) => {
    saida.push({
      pts: f.pts.map((q) => paraTela(q, iso)),
      ...corDoMaterial(f.material, normal, paleta, limiarTopo),
      ...(prof ? { prof } : {}),
    });
  };
  const camera = direcaoDaCamera(iso);
  for (const p of partesOrdenadas) {
    const normais = normaisDaParte(p, iso);
    if (p.malha) {
      // Do fundo para a frente: a face cujo centro fica mais longe da câmera vem primeiro. As
      // duas faces aparecem (lençóis e capas são abertos); a de dentro, com a normal invertida.
      p.faces
        .map((f, i) => {
          const n = normais[i]!;
          return {
            f,
            n: visivel(n, iso) ? n : { x: -n.x, y: -n.y, z: -n.z },
            d: produtoEscalar(emMetrico(centroide(f.pts), iso), camera),
          };
        })
        .sort((a, b) => a.d - b.d)
        .forEach((x) =>
          empurrar(
            x.f,
            x.n,
            x.f.pts.map((q) => produtoEscalar(emMetrico(q, iso), camera)),
          ),
        );
      continue;
    }
    p.faces.forEach((f, i) => {
      if (visivel(normais[i]!, iso)) empurrar(f, normais[i]!);
    });
    for (const d of p.decalques) {
      if (!visivel(d.normal, iso)) continue;
      for (const f of d.faces) {
        const normal = f.normal ?? d.normal;
        if (visivel(normal, iso)) empurrar(f, normal);
      }
    }
  }
  return saida;
}

/** Fecho convexo (cadeia monótona de Andrew), no sentido anti-horário. */
export function fechoConvexo(pontos: Vec2[]): Vec2[] {
  const pts = [...pontos].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cruz = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const inferior: Vec2[] = [];
  for (const p of pts) {
    while (inferior.length >= 2 && cruz(inferior.at(-2)!, inferior.at(-1)!, p) <= EPS)
      inferior.pop();
    inferior.push(p);
  }
  const superior: Vec2[] = [];
  for (const p of [...pts].reverse()) {
    while (superior.length >= 2 && cruz(superior.at(-2)!, superior.at(-1)!, p) <= EPS)
      superior.pop();
    superior.push(p);
  }
  return [...inferior.slice(0, -1), ...superior.slice(0, -1)];
}

/**
 * Sombra projetada de cada parte no chão, em coordenadas do mundo (tiles): cada vértice escorrega
 * na direção da luz proporcionalmente à altura, e a sombra é o fecho convexo do resultado.
 */
export function sombrasDasPartes(partes: Parte[], direcao: Vec2, tilesPorPx: number): Vec2[][] {
  const d = Math.hypot(direcao.x, direcao.y);
  const ux = direcao.x / d;
  const uy = direcao.y / d;
  return partes.map((p) =>
    fechoConvexo(
      p.faces.flatMap((f) =>
        f.pts.map((q) => ({ x: q.x + ux * q.z * tilesPorPx, y: q.y + uy * q.z * tilesPorPx })),
      ),
    ),
  );
}

/**
 * Sombra de cada parte vista de uma luz pontual em (`luz.x`, `luz.y`) a `luz.z` px do chão: cada
 * vértice é levado ao chão pela reta que vem da luz, então a sombra cai para longe dela e cresce
 * com a altura. O que fica na altura da luz ou acima vai até `alcance` tiles (onde a luz acaba),
 * e nada passa disso. O fecho convexo de cada parte é a sombra dela, em tiles.
 */
export function sombrasDeLuzPontual(partes: Parte[], luz: Vec3, alcance: number): Vec2[][] {
  const levar = (q: Vec3): Vec2 => {
    const dx = q.x - luz.x;
    const dy = q.y - luz.y;
    const d = Math.hypot(dx, dy);
    if (d < EPS) return { x: q.x, y: q.y };
    // Até onde o vértice cai no chão, a partir da luz (distância no plano).
    const ate = q.z < luz.z - EPS ? (d * luz.z) / (luz.z - q.z) : Infinity;
    const fim = Math.max(d, Math.min(ate, alcance));
    return { x: luz.x + (dx / d) * fim, y: luz.y + (dy / d) * fim };
  };
  return partes
    .map((p) => fechoConvexo(p.faces.flatMap((f) => f.pts.map(levar))))
    .filter((s) => s.length >= 3);
}

/** Aplica uma transformação do plano (giro + translação) a todos os pontos e normais. */
export function transformarParte(
  p: Parte,
  ponto: (q: Vec2) => Vec2,
  direcao: (v: Vec2) => Vec2,
): Parte {
  const tp = (q: Vec3): Vec3 => ({ ...ponto(q), z: q.z });
  const tn = (v: Vec3): Vec3 => ({ ...direcao(v), z: v.z });
  return {
    ...p,
    faces: p.faces.map((f) => ({
      ...f,
      pts: f.pts.map(tp),
      ...(f.normal ? { normal: tn(f.normal) } : {}),
    })),
    decalques: p.decalques.map((d) => ({
      normal: tn(d.normal),
      faces: d.faces.map((f) => ({
        ...f,
        pts: f.pts.map(tp),
        ...(f.normal ? { normal: tn(f.normal) } : {}),
      })),
    })),
  };
}
