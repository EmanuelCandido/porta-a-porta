import type { V2 } from './geometria';
import type { MapaDeLuz } from './luz';
import type { Entidade, Mundo } from './mundo';

// Arenas dos chefes (docs/PLANO_MUNDO_VIVO.md, frente 2): o que a arena faz na luta, além do chefe.
// Viúva do Mirante: as velas do jardim. O jogador acende com F, e cada vela acesa é uma ilha de
// luz (as Sombras não entram nela). Quando a noite cai (fase 2), as velas apagam; na fase 3 apagam
// de novo e só uma fica acesa por vez: o jogador escolhe qual.

export interface ConfigVelasDaArena {
  /** Raio da luz de uma vela acesa (tiles) e de onde o F a alcança. */
  raioLuz: number;
  raioInteracao: number;
}

export interface VelaDaArena {
  pos: V2;
  objeto: number;
  acesa: boolean;
  /** A luz dela no mapa de luz (null apagada). */
  luz: number | null;
}

export class VelasDaViuva {
  readonly velas: VelaDaArena[];
  /** A fase do chefe na última olhada (as velas reagem quando ela muda). */
  private fase = 1;

  constructor(
    velas: readonly { pos: V2; objeto: number }[],
    private readonly cfg: ConfigVelasDaArena,
    private readonly luz: MapaDeLuz,
    private readonly chefe: () => Entidade | null,
  ) {
    this.velas = velas.map((v) => ({
      pos: { ...v.pos },
      objeto: v.objeto,
      acesa: false,
      luz: null,
    }));
  }

  /** Só uma vela acesa por vez (fase 3: o jogador escolhe qual). */
  get umaPorVez(): boolean {
    return this.fase >= 3;
  }

  /** A vela apagada ao alcance do F (índice), ou null. */
  pertoDe(p: V2): number | null {
    let melhor: number | null = null;
    let d0 = this.cfg.raioInteracao;
    this.velas.forEach((v, i) => {
      if (v.acesa) return;
      const d = Math.hypot(v.pos.x - p.x, v.pos.y - p.y);
      if (d <= d0) {
        d0 = d;
        melhor = i;
      }
    });
    return melhor;
  }

  /** F perto de uma vela apagada: acende (na fase 3, a que estava acesa apaga). */
  interagir(mundo: Mundo, heroi: Entidade): boolean {
    const i = this.pertoDe(heroi.pos);
    if (i === null) return false;
    if (this.umaPorVez) for (const v of this.velas) if (v.acesa) this.apagar(mundo, v);
    this.acender(mundo, this.velas[i]!);
    return true;
  }

  /** Uma vez por tick: a fase do chefe mudou? A noite (2) e a descida (3) apagam as velas. */
  tick(mundo: Mundo): void {
    const fase = Number(this.chefe()?.ia?.['fase'] ?? 1);
    if (fase <= this.fase) return;
    this.fase = fase;
    let apagou = false;
    for (const v of this.velas)
      if (v.acesa) {
        this.apagar(mundo, v);
        apagou = true;
      }
    mundo.eventos.push({
      tipo: 'aviso',
      texto:
        fase >= 3
          ? 'As velas se apagaram: só uma fica acesa por vez (F).'
          : apagou
            ? 'A noite apagou as velas. Acenda de novo (F): a luz delas espanta as Sombras.'
            : 'A noite caiu. Acenda as velas (F): a luz delas espanta as Sombras.',
    });
  }

  private acender(mundo: Mundo, v: VelaDaArena): void {
    v.acesa = true;
    v.luz = this.luz.adicionar({ tipo: 'poste', ...v.pos, raio: this.cfg.raioLuz, cura: false }).id;
    mundo.eventos.push({ tipo: 'vela', objeto: v.objeto, acesa: true, pos: { ...v.pos } });
  }

  private apagar(mundo: Mundo, v: VelaDaArena): void {
    v.acesa = false;
    if (v.luz !== null) this.luz.remover(v.luz);
    v.luz = null;
    mundo.eventos.push({ tipo: 'vela', objeto: v.objeto, acesa: false, pos: { ...v.pos } });
  }
}
