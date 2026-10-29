import type { Retangulo, V2 } from './geometria';

/**
 * Grade de caminhar (células de meio tile) e campo de fluxo: a distância de cada célula até o alvo,
 * por Dijkstra com 8 vizinhos. As ondas descem o campo até o jogador; muitos inimigos, custo baixo.
 */
export class Grade {
  readonly colunas: number;
  readonly linhas: number;
  /** 1 = livre. */
  readonly livre: Uint8Array;
  /** Tudo que já bloqueou a grade, com a folga (para liberar só o que ninguém mais cobre). */
  private readonly obstaculos: { r: Retangulo; folga: number }[] = [];

  constructor(
    readonly limites: Retangulo,
    readonly celula: number,
    obstaculos: readonly Retangulo[],
    /** Folga em volta dos obstáculos (raio de um corpo médio). */
    folga: number,
  ) {
    this.colunas = Math.ceil((limites.x1 - limites.x0) / celula);
    this.linhas = Math.ceil((limites.y1 - limites.y0) / celula);
    this.livre = new Uint8Array(this.colunas * this.linhas).fill(1);
    for (const r of obstaculos) this.bloquear(r, folga);
  }

  bloquear(r: Retangulo, folga: number): void {
    this.obstaculos.push({ r, folga });
    const c0 = Math.max(0, Math.floor((r.x0 - folga - this.limites.x0) / this.celula));
    const c1 = Math.min(
      this.colunas - 1,
      Math.floor((r.x1 + folga - this.limites.x0) / this.celula),
    );
    const l0 = Math.max(0, Math.floor((r.y0 - folga - this.limites.y0) / this.celula));
    const l1 = Math.min(
      this.linhas - 1,
      Math.floor((r.y1 + folga - this.limites.y0) / this.celula),
    );
    for (let l = l0; l <= l1; l++) {
      for (let c = c0; c <= c1; c++) {
        // Bloqueia só se o centro da célula cai dentro do retângulo aumentado.
        const cx = this.limites.x0 + (c + 0.5) * this.celula;
        const cy = this.limites.y0 + (l + 0.5) * this.celula;
        if (cx >= r.x0 - folga && cx <= r.x1 + folga && cy >= r.y0 - folga && cy <= r.y1 + folga) {
          this.livre[l * this.colunas + c] = 0;
        }
      }
    }
  }

  /**
   * Tira um obstáculo (a grade do portão, uma rua interditada): solta as células dele e da folga
   * em volta, menos as que outro obstáculo ainda cobre.
   */
  liberar(r: Retangulo): void {
    const i = this.obstaculos.findIndex(
      (o) => o.r.x0 === r.x0 && o.r.y0 === r.y0 && o.r.x1 === r.x1 && o.r.y1 === r.y1,
    );
    const folga = i >= 0 ? this.obstaculos[i]!.folga : 0;
    if (i >= 0) this.obstaculos.splice(i, 1);
    const area = { x0: r.x0 - folga, y0: r.y0 - folga, x1: r.x1 + folga, y1: r.y1 + folga };
    const vizinhos = this.obstaculos.filter(
      (o) =>
        o.r.x0 - o.folga <= area.x1 &&
        o.r.x1 + o.folga >= area.x0 &&
        o.r.y0 - o.folga <= area.y1 &&
        o.r.y1 + o.folga >= area.y0,
    );
    const c0 = Math.max(0, Math.floor((area.x0 - this.limites.x0) / this.celula));
    const c1 = Math.min(this.colunas - 1, Math.floor((area.x1 - this.limites.x0) / this.celula));
    const l0 = Math.max(0, Math.floor((area.y0 - this.limites.y0) / this.celula));
    const l1 = Math.min(this.linhas - 1, Math.floor((area.y1 - this.limites.y0) / this.celula));
    for (let l = l0; l <= l1; l++) {
      for (let c = c0; c <= c1; c++) {
        const cx = this.limites.x0 + (c + 0.5) * this.celula;
        const cy = this.limites.y0 + (l + 0.5) * this.celula;
        if (cx < area.x0 || cx > area.x1 || cy < area.y0 || cy > area.y1) continue;
        const coberta = vizinhos.some(
          (o) =>
            cx >= o.r.x0 - o.folga &&
            cx <= o.r.x1 + o.folga &&
            cy >= o.r.y0 - o.folga &&
            cy <= o.r.y1 + o.folga,
        );
        this.livre[l * this.colunas + c] = coberta ? 0 : 1;
      }
    }
  }

  indice(p: V2): number {
    const c = Math.min(
      this.colunas - 1,
      Math.max(0, Math.floor((p.x - this.limites.x0) / this.celula)),
    );
    const l = Math.min(
      this.linhas - 1,
      Math.max(0, Math.floor((p.y - this.limites.y0) / this.celula)),
    );
    return l * this.colunas + c;
  }

  centro(i: number): V2 {
    const c = i % this.colunas;
    const l = Math.floor(i / this.colunas);
    return {
      x: this.limites.x0 + (c + 0.5) * this.celula,
      y: this.limites.y0 + (l + 0.5) * this.celula,
    };
  }

  ehLivre(p: V2): boolean {
    return this.livre[this.indice(p)] === 1;
  }

  /** Célula livre mais perto de `p` (para alvos encostados numa parede). */
  livreMaisPerto(p: V2): number {
    const i = this.indice(p);
    if (this.livre[i]) return i;
    const c0 = i % this.colunas;
    const l0 = Math.floor(i / this.colunas);
    for (let r = 1; r < Math.max(this.colunas, this.linhas); r++) {
      for (let l = l0 - r; l <= l0 + r; l++) {
        for (let c = c0 - r; c <= c0 + r; c++) {
          if (l < 0 || c < 0 || l >= this.linhas || c >= this.colunas) continue;
          if (Math.max(Math.abs(l - l0), Math.abs(c - c0)) !== r) continue;
          const j = l * this.colunas + c;
          if (this.livre[j]) return j;
        }
      }
    }
    return i;
  }

  /**
   * Caminho de `de` até `para` (A* nas 8 direções, sem cortar quina), encurtado pelos trechos em
   * linha reta livre. Devolve os pontos de passagem depois de `de`, terminando em `para`; null se
   * não há caminho.
   */
  caminho(de: V2, para: V2): V2[] | null {
    const inicio = this.livreMaisPerto(de);
    const fim = this.livreMaisPerto(para);
    const n = this.colunas * this.linhas;
    const custo = new Float64Array(n).fill(Infinity);
    const veioDe = new Int32Array(n).fill(-1);
    const fechado = new Uint8Array(n);
    const fc = fim % this.colunas;
    const fl = Math.floor(fim / this.colunas);
    const estimativa = (i: number) => {
      const dc = Math.abs((i % this.colunas) - fc);
      const dl = Math.abs(Math.floor(i / this.colunas) - fl);
      return Math.max(dc, dl) + (Math.SQRT2 - 1) * Math.min(dc, dl);
    };
    const fila = new FilaDePrioridade();
    custo[inicio] = 0;
    fila.inserir(inicio, estimativa(inicio));
    while (!fila.vazia) {
      const i = fila.retirar();
      if (i === fim) break;
      if (fechado[i]) continue;
      fechado[i] = 1;
      const c = i % this.colunas;
      const l = Math.floor(i / this.colunas);
      for (const [dc, dl, passo] of VIZINHOS) {
        const nc = c + dc;
        const nl = l + dl;
        if (nc < 0 || nl < 0 || nc >= this.colunas || nl >= this.linhas) continue;
        const j = nl * this.colunas + nc;
        if (!this.livre[j] || fechado[j]) continue;
        // Na diagonal, as duas células do lado precisam estar livres (não corta quina).
        if (dc !== 0 && dl !== 0) {
          if (!this.livre[l * this.colunas + nc] || !this.livre[nl * this.colunas + c]) continue;
        }
        const novo = custo[i]! + passo;
        if (novo < custo[j]!) {
          custo[j] = novo;
          veioDe[j] = i;
          fila.inserir(j, novo + estimativa(j));
        }
      }
    }
    if (inicio !== fim && veioDe[fim] === -1) return null;
    const celulas: number[] = [];
    for (let i = fim; i !== -1 && i !== inicio; i = veioDe[i]!) celulas.push(i);
    const pontos = celulas.reverse().map((i) => this.centro(i));
    pontos.push({ ...para });
    // Encurta: de cada ponto, pula direto para o mais longe que ainda se vê em linha reta.
    const curto: V2[] = [];
    let atual = de;
    let k = 0;
    while (k < pontos.length) {
      let mais = k;
      for (let t = pontos.length - 1; t > k; t--) {
        if (this.linhaLivre(atual, pontos[t]!)) {
          mais = t;
          break;
        }
      }
      curto.push(pontos[mais]!);
      atual = pontos[mais]!;
      k = mais + 1;
    }
    return curto;
  }

  /** Linha reta livre entre dois pontos (amostrada a cada meia célula). */
  linhaLivre(a: V2, b: V2): boolean {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const passos = Math.max(1, Math.ceil(d / (this.celula * 0.5)));
    for (let k = 1; k < passos; k++) {
      const t = k / passos;
      if (!this.ehLivre({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
    }
    return true;
  }
}

const VIZINHOS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

export class CampoDeFluxo {
  readonly distancia: Float32Array;
  alvo = -1;

  /** `raio`: até quantas células de distância o campo se espalha (o resto fica sem caminho). */
  constructor(
    readonly grade: Grade,
    private readonly raio = Infinity,
  ) {
    this.distancia = new Float32Array(grade.colunas * grade.linhas).fill(Infinity);
  }

  /** Recalcula as distâncias até `p` (só se o alvo mudou de célula). */
  calcular(p: V2): void {
    const g = this.grade;
    const alvo = g.livreMaisPerto(p);
    if (alvo === this.alvo) return;
    this.alvo = alvo;
    const dist = this.distancia;
    dist.fill(Infinity);
    dist[alvo] = 0;
    // Fila de prioridade simples (heap binário) por distância.
    const heap: number[] = [alvo];
    const push = (i: number) => {
      heap.push(i);
      let k = heap.length - 1;
      while (k > 0) {
        const pai = (k - 1) >> 1;
        if (dist[heap[pai]!]! <= dist[heap[k]!]!) break;
        [heap[pai], heap[k]] = [heap[k]!, heap[pai]!];
        k = pai;
      }
    };
    const pop = (): number => {
      const topo = heap[0]!;
      const ult = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = ult;
        let k = 0;
        for (;;) {
          const a = 2 * k + 1;
          const b = a + 1;
          let m = k;
          if (a < heap.length && dist[heap[a]!]! < dist[heap[m]!]!) m = a;
          if (b < heap.length && dist[heap[b]!]! < dist[heap[m]!]!) m = b;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k]!, heap[m]!];
          k = m;
        }
      }
      return topo;
    };
    const visto = new Uint8Array(dist.length);
    while (heap.length > 0) {
      const i = pop();
      if (visto[i]) continue;
      visto[i] = 1;
      if (dist[i]! > this.raio) break;
      const c = i % g.colunas;
      const l = Math.floor(i / g.colunas);
      for (const [dc, dl, custo] of VIZINHOS) {
        const cc = c + dc;
        const ll = l + dl;
        if (cc < 0 || ll < 0 || cc >= g.colunas || ll >= g.linhas) continue;
        const j = ll * g.colunas + cc;
        if (!g.livre[j]) continue;
        // Na diagonal, não corta quina de parede.
        if (dc !== 0 && dl !== 0 && (!g.livre[l * g.colunas + cc] || !g.livre[ll * g.colunas + c]))
          continue;
        const nd = dist[i]! + custo;
        if (nd < dist[j]!) {
          dist[j] = nd;
          push(j);
        }
      }
    }
  }

  /** Distância (em células) de `p` até o alvo; Infinity se não há caminho. */
  distanciaDe(p: V2): number {
    return this.distancia[this.grade.indice(p)]!;
  }

  /**
   * Direção para seguir de `p`: reto até o alvo se a linha estiver livre; senão, para a célula
   * vizinha mais perto do alvo.
   */
  direcao(p: V2, alvo: V2): V2 {
    const g = this.grade;
    if (g.linhaLivre(p, alvo)) {
      const d = Math.hypot(alvo.x - p.x, alvo.y - p.y);
      return d < 1e-6 ? { x: 0, y: 0 } : { x: (alvo.x - p.x) / d, y: (alvo.y - p.y) / d };
    }
    const i = g.livre[g.indice(p)] ? g.indice(p) : g.livreMaisPerto(p);
    const c = i % g.colunas;
    const l = Math.floor(i / g.colunas);
    let melhor = i;
    let melhorD = this.distancia[i]!;
    for (const [dc, dl] of VIZINHOS) {
      const cc = c + dc;
      const ll = l + dl;
      if (cc < 0 || ll < 0 || cc >= g.colunas || ll >= g.linhas) continue;
      const j = ll * g.colunas + cc;
      if (this.distancia[j]! < melhorD) {
        melhorD = this.distancia[j]!;
        melhor = j;
      }
    }
    if (melhor === i) return { x: 0, y: 0 };
    const alvoCel = g.centro(melhor);
    const d = Math.hypot(alvoCel.x - p.x, alvoCel.y - p.y);
    return d < 1e-6 ? { x: 0, y: 0 } : { x: (alvoCel.x - p.x) / d, y: (alvoCel.y - p.y) / d };
  }
}

/** Heap binária de mínimo (índice de célula, prioridade) para o A*. */
class FilaDePrioridade {
  private readonly itens: number[] = [];
  private readonly prioridades: number[] = [];

  get vazia(): boolean {
    return this.itens.length === 0;
  }

  inserir(item: number, prioridade: number): void {
    this.itens.push(item);
    this.prioridades.push(prioridade);
    let i = this.itens.length - 1;
    while (i > 0) {
      const pai = (i - 1) >> 1;
      if (this.prioridades[pai]! <= this.prioridades[i]!) break;
      this.trocar(i, pai);
      i = pai;
    }
  }

  retirar(): number {
    const topo = this.itens[0]!;
    const ultimoItem = this.itens.pop()!;
    const ultimaPrioridade = this.prioridades.pop()!;
    if (this.itens.length > 0) {
      this.itens[0] = ultimoItem;
      this.prioridades[0] = ultimaPrioridade;
      let i = 0;
      for (;;) {
        const e = 2 * i + 1;
        const d = e + 1;
        let menor = i;
        if (e < this.itens.length && this.prioridades[e]! < this.prioridades[menor]!) menor = e;
        if (d < this.itens.length && this.prioridades[d]! < this.prioridades[menor]!) menor = d;
        if (menor === i) break;
        this.trocar(i, menor);
        i = menor;
      }
    }
    return topo;
  }

  private trocar(a: number, b: number): void {
    [this.itens[a], this.itens[b]] = [this.itens[b]!, this.itens[a]!];
    [this.prioridades[a], this.prioridades[b]] = [this.prioridades[b]!, this.prioridades[a]!];
  }
}
