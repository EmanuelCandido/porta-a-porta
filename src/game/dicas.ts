import type { Dicas } from '../sim/content/esquemas';
import type { Evento } from '../sim/eventos';
import type { V2 } from '../sim/geometria';

export type PassoDeDica = Dicas['rua']['passos'][number]['id'];

/**
 * As dicas da rua 1-1 da primeira run (GAMEPLAY.md, "Primeira run"): uma por vez, na ordem, cada
 * uma até o jogador fazer a ação (ou passar `porDicaS`), e nenhuma depois de `duracaoS`. Uma ação
 * feita antes da hora dela já conta: a dica é pulada quando chega a vez. Só tela: não muda regra.
 */
export class DicasDaRua {
  private readonly feitos = new Set<PassoDeDica>();
  private indice = 0;
  private inicioS: number | null = null;
  private desdeS: number | null = null;
  private origem: V2 | null = null;
  private acabou = false;
  private atual: PassoDeDica | null = null;

  constructor(private readonly cfg: Dicas['rua']) {}

  /** O passo na tela agora (null: nenhum). */
  get passo(): PassoDeDica | null {
    return this.atual;
  }

  get terminou(): boolean {
    return this.acabou;
  }

  /** Conta as ações que os eventos mostram (atacar, Q, rolar, lanterna, Poste). */
  consumir(eventos: readonly Evento[], jogador: number): void {
    for (const ev of eventos) {
      if ((ev.tipo === 'ataqueAuto' || ev.tipo === 'golpeou') && ev.id === jogador)
        this.feitos.add('atacar');
      else if (ev.tipo === 'dano' && ev.origem === jogador && ev.golpe === 'autoAtaque')
        this.feitos.add('atacar');
      else if (ev.tipo === 'lancou' && ev.id === jogador && ev.tecla === 'Q') this.feitos.add('q');
      else if (ev.tipo === 'rolou' && ev.id === jogador) this.feitos.add('rolar');
      else if (ev.tipo === 'pulsoLanterna') this.feitos.add('lanterna');
      else if (ev.tipo === 'posteCaiu') this.feitos.add('poste');
    }
  }

  /** Avança pelo tempo e pela posição do jogador; devolve o texto da dica do momento. */
  atualizar(agoraS: number, jogador: V2): string | null {
    this.atual = null;
    if (this.acabou) return null;
    if (this.inicioS === null) {
      this.inicioS = agoraS;
      this.origem = { ...jogador };
    }
    const o = this.origem!;
    if (Math.hypot(jogador.x - o.x, jogador.y - o.y) >= this.cfg.andarTiles)
      this.feitos.add('andar');
    const t = agoraS - this.inicioS;
    if (t < this.cfg.esperaInicialS) return null;
    if (t > this.cfg.esperaInicialS + this.cfg.duracaoS) {
      this.acabou = true;
      return null;
    }
    const desde = (this.desdeS ??= agoraS);
    const passos = this.cfg.passos;
    let inicioDoPasso = desde;
    while (this.indice < passos.length) {
      const p = passos[this.indice]!;
      if (!this.feitos.has(p.id) && agoraS - inicioDoPasso <= this.cfg.porDicaS) {
        this.atual = p.id;
        return p.texto;
      }
      this.indice++;
      this.desdeS = inicioDoPasso = agoraS;
    }
    this.acabou = true;
    return null;
  }
}
