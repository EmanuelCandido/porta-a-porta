import { definirModificadores, removerModificadores, type Combatente } from './combate';
import type { ConfigSusto } from './content/esquemas';
import type { Evento } from './eventos';
import type { IdEntidade, Mundo } from './mundo';

export interface EstadoSusto {
  valor: number;
  /** Segundos de Frenesi que faltam (0 = sem Frenesi). */
  frenesi: number;
  /** Segundos desde o último acerto. */
  semAcertar: number;
  /** Frenesis nesta rua (métrica dos ganchos e pedido). */
  frenesisNaRua: number;
  /** Segundos com o Susto em 50 ou mais nesta rua (métrica). */
  tempoEmPavor: number;
  /** Mods extras (tratos lendários: Frenesi em dobro, não esvazia sozinho). */
  duracaoFrenesiMult: number;
  naoEsvazia: boolean;
}

export function novoSusto(): EstadoSusto {
  return {
    valor: 0,
    frenesi: 0,
    semAcertar: 0,
    frenesisNaRua: 0,
    tempoEmPavor: 0,
    duracaoFrenesiMult: 1,
    naoEsvazia: false,
  };
}

export function faixaDoSusto(s: EstadoSusto, cfg: ConfigSusto): ConfigSusto['faixas'][number] {
  let f = cfg.faixas[0]!;
  for (const x of cfg.faixas) if (s.valor >= x.desde) f = x;
  return f;
}

/** Multiplicador de doces agora (faixa ou Frenesi). */
export function multDoces(s: EstadoSusto, cfg: ConfigSusto): number {
  return s.frenesi > 0 ? cfg.frenesi.doces : faixaDoSusto(s, cfg).doces;
}

/**
 * Medidor de Susto (GAMEPLAY.md): enche quando o jogador acerta sem ser acertado e transborda em
 * Frenesi (recargas 50% mais rápidas, habilidades sem custo, doces ×2). O dano sem aviso (golpe
 * das pestinhas) não tira Susto: o medidor só pune o erro de desvio.
 */
export class Susto {
  constructor(
    readonly estado: EstadoSusto,
    private readonly cfg: ConfigSusto,
    private readonly heroi: IdEntidade,
    private readonly combatente: Combatente,
    /** Inimigo é elite? (vale +20 ao cair). */
    private readonly ehElite: (id: IdEntidade) => boolean,
  ) {
    this.aplicarBonus();
  }

  private somar(mundo: Mundo, delta: number, motivo: string): void {
    const s = this.estado;
    if (s.frenesi > 0 || delta === 0) return;
    s.valor = Math.max(0, Math.min(this.cfg.maximo, s.valor + delta));
    mundo.eventos.push({ tipo: 'susto', delta, motivo });
    if (s.valor >= this.cfg.maximo) {
      s.frenesi = this.cfg.frenesi.duracao * s.duracaoFrenesiMult;
      s.frenesisNaRua++;
      mundo.eventos.push({ tipo: 'frenesi', ativo: true });
    }
    this.aplicarBonus();
  }

  /** Enche (ou esvazia) o Susto por fora dos eventos (Colheita: cada explosão de abóbora). */
  encher(mundo: Mundo, delta: number, motivo: string): void {
    this.somar(mundo, delta, motivo);
  }

  /** Atributos da faixa e do Frenesi (velocidade, recargas, custo). */
  private aplicarBonus(): void {
    const s = this.estado;
    const c = this.combatente;
    if (s.frenesi > 0) {
      definirModificadores(c, 'susto', [
        {
          origem: 'susto',
          atributo: 'velocidadeRecarga',
          mult: this.cfg.frenesi.velocidadeRecarga,
        },
        { origem: 'susto', atributo: 'custoHabilidade', mult: -1 },
        {
          origem: 'susto',
          atributo: 'velocidade',
          mult: faixaDoSusto({ ...s, valor: 99 }, this.cfg).velocidade,
        },
      ]);
      return;
    }
    const v = faixaDoSusto(s, this.cfg).velocidade;
    if (v > 0)
      definirModificadores(c, 'susto', [{ origem: 'susto', atributo: 'velocidade', mult: v }]);
    else removerModificadores(c, 'susto');
  }

  /** Lê os eventos de um tick e passa o tempo. */
  tick(mundo: Mundo, eventos: readonly Evento[]): void {
    const s = this.estado;
    const ev = this.cfg.eventos;
    let acertou = false;
    for (const e of eventos) {
      switch (e.tipo) {
        case 'acerto':
          if (e.dono === this.heroi && e.n <= ev.acertosPorLancamento) {
            this.somar(mundo, ev.acertoHabilidade, 'acerto');
            acertou = true;
          }
          break;
        case 'acertoAuto':
          if (e.dono === this.heroi) {
            this.somar(mundo, ev.acertoAuto, 'auto');
            acertou = true;
          }
          break;
        case 'derrotado': {
          const caido = mundo.entidades.find((x) => x.id === e.id);
          if (caido?.tipo === 'inimigo') {
            this.somar(mundo, this.ehElite(e.id) ? ev.derrotaElite : ev.derrota, 'derrota');
          }
          break;
        }
        case 'interrompeu':
          if (e.por === this.heroi) this.somar(mundo, ev.interromper, 'interromper');
          break;
        case 'quaseAcerto':
          if (e.id === this.heroi) this.somar(mundo, ev.quaseAcerto, 'desvio');
          break;
        case 'dano':
          if (e.alvo === this.heroi && e.comAviso && e.valor + e.absorvido > 0 && s.frenesi <= 0) {
            const perda = -s.valor * this.cfg.fracaoPerdidaAoSerAtingido;
            this.somar(mundo, perda, 'atingido');
          }
          break;
        default:
          break;
      }
    }
    const dt = mundo.dt;
    if (acertou) s.semAcertar = 0;
    else s.semAcertar += dt;
    if (s.frenesi > 0) {
      s.frenesi -= dt;
      if (s.frenesi <= 0) {
        s.frenesi = 0;
        s.valor = 0;
        mundo.eventos.push({ tipo: 'frenesi', ativo: false });
        this.aplicarBonus();
      }
    } else if (s.semAcertar >= this.cfg.esvaziaDepoisDe && s.valor > 0 && !s.naoEsvazia) {
      const antes = faixaDoSusto(s, this.cfg).nome;
      s.valor = Math.max(0, s.valor - this.cfg.esvaziaPorS * dt);
      if (faixaDoSusto(s, this.cfg).nome !== antes) this.aplicarBonus();
    }
    if (s.valor >= 50 || s.frenesi > 0) s.tempoEmPavor += dt;
  }
}
