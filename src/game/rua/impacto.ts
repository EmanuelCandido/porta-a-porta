import type { Visual } from '../../sim/content/esquemas';
import type { Evento } from '../../sim/eventos';

type ConfigImpacto = Visual['combateNaTela'];

/** Decide a resposta visual de um lote de eventos, sem somar pausas por alvo de uma área. */
export function respostaDeImpacto(eventos: readonly Evento[], jogador: number, cfg: ConfigImpacto) {
  let pausaS = 0;
  let tremorPx = 0;
  let posteCaiu = false;
  for (const ev of eventos) {
    if (
      ev.tipo === 'dano' &&
      ev.origem === jogador &&
      ev.alvo !== jogador &&
      ev.valor + ev.absorvido > 0
    ) {
      pausaS = Math.max(
        pausaS,
        ev.critico ? cfg.pausa.critico : ev.golpe === 'habilidade' ? cfg.pausa.acerto : 0,
      );
    } else if (ev.tipo === 'posteCaiu') {
      posteCaiu = true;
      pausaS = Math.max(pausaS, cfg.pausa.poste);
      tremorPx = Math.max(tremorPx, cfg.tremor.postePx);
    } else if (ev.tipo === 'tremor') {
      tremorPx = Math.max(
        tremorPx,
        ev.motivo === 'poste' ? cfg.tremor.postePx : cfg.tremor.chefePx,
      );
    } else if (ev.tipo === 'estouro' && ev.dono === jogador) {
      // Estouro da Vassoura e pouso do Salto: um soco curto na tela.
      pausaS = Math.max(pausaS, cfg.pausa.estouro);
      tremorPx = Math.max(tremorPx, cfg.tremor.estouroPx);
    } else if (ev.tipo === 'golpeou' && ev.id === jogador && ev.acertos > 0 && ev.final) {
      pausaS = Math.max(pausaS, cfg.pausa.golpeFinal);
    } else if (ev.tipo === 'explosaoCaldeirao' || ev.tipo === 'explosaoAbobora') {
      tremorPx = Math.max(tremorPx, cfg.tremor.explosaoPx);
    } else if (ev.tipo === 'pulso' && ev.lado === 'jogador' && ev.tecla === 'R') {
      tremorPx = Math.max(tremorPx, cfg.tremor.rPx);
    }
  }
  return { pausaS, tremorPx, posteCaiu };
}

/** Relógio da tela: o tempo parado é descartado, nunca vira ticks atrasados da simulação. */
export class PausaDeImpacto {
  restanteMs = 0;

  iniciar(segundos: number): void {
    this.restanteMs = Math.max(this.restanteMs, segundos * 1000);
  }

  tempoJogavel(deltaMs: number): number {
    const parado = Math.min(this.restanteMs, deltaMs);
    this.restanteMs -= parado;
    return deltaMs - parado;
  }
}

/**
 * No Phaser 4, Shake.update multiplica pelo zoom e Camera.preRender aplica esse deslocamento
 * na matriz já escalada. Compensamos os dois fatores para manter a amplitude em pixels da tela.
 */
export function intensidadeEmPixels(px: number, largura: number, altura: number, zoom: number) {
  return { x: px / (largura * zoom * zoom), y: px / (altura * zoom * zoom) };
}
