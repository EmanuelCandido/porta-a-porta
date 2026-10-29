import type { V2 } from './geometria';

/** Lado dos baldes do índice de luzes, em tiles. */
const BALDE = 4;

export interface FonteDeLuz {
  id: number;
  tipo: 'poste' | 'janela' | 'pulso' | 'explosao';
  x: number;
  y: number;
  raio: number;
  /** Postes amigos curam quem está na luz deles. */
  cura: boolean;
  /** Tick em que a luz apaga sozinha (pulso, explosão), ou null. */
  ate: number | null;
  /** Segue uma entidade (o pulso da lanterna acompanha o jogador). */
  segue: number | null;
  /** Desligada temporariamente (Ventania apaga um poste por 20 s). */
  desligadaAte: number | null;
  /** Objeto da rua que acende esta luz (poste ou casa), quando há um. */
  objeto?: number;
  /**
   * Luz que sai de uma abertura (janela, abóbora da porta) e vai para um lado só: (`x`, `y`) é o pé
   * da abertura e `raio` só o alcance dela (para o índice). Sem feixe, a luz é o círculo do poste.
   */
  feixe?: Feixe;
}

/**
 * Feixe de uma abertura no chão: sai da parede para onde ela olha (`nx`, `ny`), com a largura da
 * abertura, e abre um pouco enquanto anda. A luz de um andar de cima cai mais longe da parede
 * (`inicio`).
 */
export interface Feixe {
  nx: number;
  ny: number;
  largura: number;
  /** Andar da abertura (0 = térreo): a tela desenha mais fraca a luz que vem de cima. */
  andar: number;
  /** Onde a luz começa no chão e quanto anda, em tiles a partir da parede. */
  inicio: number;
  comprimento: number;
  /** Quanto cada lado abre por tile andado. */
  abertura: number;
}

/**
 * Onde o ponto a (`dx`, `dy`) do pé da abertura cai no feixe: `ao` longo dele (0 no começo da luz,
 * 1 no fim) e `lado` (0 no meio, 1 na borda).
 */
export function posicaoNoFeixe(f: Feixe, dx: number, dy: number): { ao: number; lado: number } {
  const frente = dx * f.nx + dy * f.ny;
  const deLado = Math.abs(dy * f.nx - dx * f.ny);
  const meia = f.largura / 2 + Math.max(0, frente) * f.abertura;
  return { ao: (frente - f.inicio) / f.comprimento, lado: deLado / meia };
}

export function noFeixe(f: Feixe, dx: number, dy: number): boolean {
  const p = posicaoNoFeixe(f, dx, dy);
  return p.ao >= 0 && p.ao <= 1 && p.lado <= 1;
}

/** Até onde o feixe chega do pé da abertura, em tiles (o raio do círculo que o contém). */
export function alcanceDoFeixe(f: Feixe): number {
  const fim = f.inicio + f.comprimento;
  return Math.hypot(fim, f.largura / 2 + fim * f.abertura);
}

/** Feixe de uma janela de `largura` tiles no andar `andar`, olhando para (`nx`, `ny`). */
export function feixeDeJanela(
  j: { nx: number; ny: number; largura: number; andar: number },
  cfg: { comprimento: number; abertura: number; inicioPorAndar: number },
): Feixe {
  return {
    nx: j.nx,
    ny: j.ny,
    largura: j.largura,
    andar: j.andar,
    inicio: j.andar * cfg.inicioPorAndar,
    comprimento: cfg.comprimento,
    abertura: cfg.abertura,
  };
}

export interface ZonaDeSombra {
  x: number;
  y: number;
  raio: number;
  ate: number | null;
  /** Segue a área de uma habilidade (Névoa) pelo id. */
  id: number;
}

/**
 * Mapa de luz da rua (GDD, "A regra da luz"): cada ponto está iluminado (perto de um poste amigo,
 * de uma janela acesa ou do pulso da lanterna) ou na sombra. Consultado pelas regras: cura, vigias e
 * torres, criaturas da sombra, invisibilidade.
 */
export class MapaDeLuz {
  fontes: FonteDeLuz[] = [];
  sombras: ZonaDeSombra[] = [];
  private proximoId = 1;
  /** Muda a cada luz que acende ou apaga (a tela redesenha a escuridão só quando muda). */
  versao = 0;
  /** Índice em baldes das luzes paradas (refeito quando a lista de fontes é trocada). */
  private indexadas: FonteDeLuz[] | null = null;
  private readonly baldes = new Map<number, FonteDeLuz[]>();
  private moveis: FonteDeLuz[] = [];

  adicionar(
    f: Omit<FonteDeLuz, 'id' | 'ate' | 'segue' | 'desligadaAte'> & Partial<FonteDeLuz>,
  ): FonteDeLuz {
    const nova: FonteDeLuz = {
      ate: null,
      segue: null,
      desligadaAte: null,
      ...f,
      id: this.proximoId++,
    };
    // Lista nova a cada mudança: o índice percebe pela referência.
    this.fontes = [...this.fontes, nova];
    this.versao++;
    return nova;
  }

  remover(id: number): void {
    this.fontes = this.fontes.filter((f) => f.id !== id);
    this.versao++;
  }

  adicionarSombra(z: Omit<ZonaDeSombra, 'id'> & { id?: number }): ZonaDeSombra {
    const nova = { ...z, id: z.id ?? this.proximoId++ };
    this.sombras.push(nova);
    this.versao++;
    return nova;
  }

  private acesa(f: FonteDeLuz, tick: number): boolean {
    return f.desligadaAte === null || f.desligadaAte <= tick;
  }

  /** Atualiza luzes que seguem alguém, acabam ou religam. */
  atualizar(tick: number, posDe: (id: number) => V2 | null): void {
    let mudou = false;
    for (const f of this.fontes) {
      if (f.segue !== null) {
        const p = posDe(f.segue);
        if (p && (p.x !== f.x || p.y !== f.y)) {
          f.x = p.x;
          f.y = p.y;
        }
      }
      if (f.desligadaAte !== null && f.desligadaAte <= tick) {
        f.desligadaAte = null;
        mudou = true;
      }
    }
    const antes = this.fontes.length + this.sombras.length;
    // Só troca a lista quando alguma luz acabou (a troca refaz o índice).
    if (this.fontes.some((f) => f.ate !== null && f.ate <= tick))
      this.fontes = this.fontes.filter((f) => f.ate === null || f.ate > tick);
    this.sombras = this.sombras.filter((s) => s.ate === null || s.ate > tick);
    if (mudou || antes !== this.fontes.length + this.sombras.length) this.versao++;
    this.tick = tick;
  }

  private tick = 0;

  emSombraForcada(p: V2): boolean {
    return this.sombras.some((s) => Math.hypot(p.x - s.x, p.y - s.y) <= s.raio);
  }

  private chave(i: number, j: number): number {
    return j * 65536 + i;
  }

  /** Refaz os baldes se a lista de fontes mudou; luzes que andam ou acabam ficam de fora. */
  private indexar(): void {
    if (this.indexadas === this.fontes) return;
    this.indexadas = this.fontes;
    this.baldes.clear();
    this.moveis = [];
    for (const f of this.fontes) {
      if (f.segue !== null || f.ate !== null) {
        this.moveis.push(f);
        continue;
      }
      const i0 = Math.floor((f.x - f.raio) / BALDE);
      const i1 = Math.floor((f.x + f.raio) / BALDE);
      const j0 = Math.floor((f.y - f.raio) / BALDE);
      const j1 = Math.floor((f.y + f.raio) / BALDE);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const k = this.chave(i, j);
          const b = this.baldes.get(k);
          if (b) b.push(f);
          else this.baldes.set(k, [f]);
        }
      }
    }
  }

  /** As luzes que podem cobrir o ponto: as do balde dele e as que andam. */
  private perto(p: V2, f: (l: FonteDeLuz) => boolean): boolean {
    this.indexar();
    const b = this.baldes.get(this.chave(Math.floor(p.x / BALDE), Math.floor(p.y / BALDE)));
    if (b) for (const l of b) if (f(l)) return true;
    for (const l of this.moveis) if (f(l)) return true;
    return false;
  }

  private cobre(l: FonteDeLuz, p: V2): boolean {
    if (!this.acesa(l, this.tick)) return false;
    if (l.feixe) return noFeixe(l.feixe, p.x - l.x, p.y - l.y);
    return Math.hypot(p.x - l.x, p.y - l.y) <= l.raio;
  }

  iluminado(p: V2): boolean {
    if (this.emSombraForcada(p)) return false;
    return this.perto(p, (l) => this.cobre(l, p));
  }

  /** Quantos postes amigos acesos cobrem o ponto (cada um cura). */
  postesQueCuram(p: V2): number {
    if (this.emSombraForcada(p)) return 0;
    let n = 0;
    this.perto(p, (l) => {
      if (l.cura && this.cobre(l, p)) n++;
      return false;
    });
    return n;
  }

  /** Perto de alguma luz de poste (recarrega a Luz da lanterna). */
  pertoDePoste(p: V2): boolean {
    return this.perto(p, (l) => l.tipo === 'poste' && this.cobre(l, p));
  }

  /** Luzes acesas agora (para a tela recortar a escuridão). */
  acesas(): FonteDeLuz[] {
    return this.fontes.filter((f) => this.acesa(f, this.tick));
  }
}
