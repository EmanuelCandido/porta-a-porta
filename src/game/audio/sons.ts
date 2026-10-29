import type { Audio } from '../../sim/content/esquemas';
import type { Evento } from '../../sim/eventos';

/** Um som pedido ao mixer: o nome em `content/audio.json` e quantos semitons acima tocar. */
export interface SomPedido {
  som: string;
  semitons: number;
}

/**
 * Acertos de habilidade seguidos: cada um que vem até `janelaS` depois do anterior sobe um degrau
 * de tom, até `degraus` (GAMEPLAY.md, "Sensação de impacto"); uma pausa maior volta ao começo.
 */
export class SequenciaDeAcertos {
  private ultimoS = Number.NEGATIVE_INFINITY;
  private degrau = 0;

  proximo(agoraS: number, cfg: Audio['acertoSeguido']): number {
    this.degrau = agoraS - this.ultimoS <= cfg.janelaS ? Math.min(cfg.degraus, this.degrau + 1) : 0;
    this.ultimoS = agoraS;
    return this.degrau * cfg.semitonsPorDegrau;
  }
}

export interface ContextoDoSom {
  jogador: number;
  campeao: string;
  agoraS: number;
  /**
   * A família de um ataque anunciado (área, linha, investida, golpe ou chefe), para cada ameaça
   * ter o próprio aviso sonoro (`aviso_<família>`); sem ela, o aviso comum.
   */
  familiaDoAtaque?: (id: number, chave: string) => string | null;
}

/**
 * Os sons de um lote de eventos da simulação. Um golpe que acerta dez inimigos toca um som só, e o
 * crítico toma o lugar do acerto comum. A tabela é pura: o mixer só toca o que ela pede.
 */
export function sonsDosEventos(
  eventos: readonly Evento[],
  ctx: ContextoDoSom,
  sequencia: SequenciaDeAcertos,
  cfg: Audio,
): SomPedido[] {
  const pedidos: SomPedido[] = [];
  const pedir = (som: string, semitons = 0) => {
    if (cfg.sons[som] && !pedidos.some((p) => p.som === som)) pedidos.push({ som, semitons });
  };
  /** O som próprio do campeão (`bruxinha_lancar_Q`), se existir; senão, o comum. */
  const proprio = (nome: string): string | null =>
    cfg.sons[`${ctx.campeao}_${nome}`] ? `${ctx.campeao}_${nome}` : null;
  let acerto = false;
  let critico = false;
  let auto = false;
  for (const ev of eventos) {
    switch (ev.tipo) {
      case 'dano':
        // Num objeto quebrável, o som é o do material (`objetoAtingido`).
        if (ev.valor + ev.absorvido <= 0 || ev.objeto) break;
        if (ev.alvo === ctx.jogador) pedir('danoJogador');
        else if (ev.origem === ctx.jogador) {
          if (ev.critico) critico = true;
          else if (ev.golpe === 'autoAtaque') auto = true;
          else acerto = true;
        }
        break;
      case 'lancou':
        if (ev.id === ctx.jogador && !ev.eco) {
          const som = proprio(`lancar_${ev.tecla}`);
          if (som) pedir(som);
          else pedir(`lancar_${ctx.campeao}`, cfg.semitonsPorTecla[ev.tecla] ?? 0);
        }
        break;
      case 'estouro': {
        const som = ev.dono === ctx.jogador ? proprio(`estouro_${ev.chave}`) : null;
        if (som) pedir(som);
        break;
      }
      case 'pulso': {
        // Cada onda da Chuva de Abóboras (e outras áreas do campeão que tenham som de pulso).
        const som = ev.lado === 'jogador' && !ev.final ? proprio(`pulso_${ev.tecla}`) : null;
        if (som) pedir(som);
        break;
      }
      case 'anunciou': {
        // Ataque forte anunciado no chão: o aviso vermelho também se ouve, um por tipo de ameaça.
        if (ev.id === ctx.jogador) break;
        const familia = ctx.familiaDoAtaque?.(ev.id, ev.chave);
        pedir(familia && cfg.sons[`aviso_${familia}`] ? `aviso_${familia}` : 'aviso');
        break;
      }
      case 'campainha':
        pedir('campainha');
        break;
      case 'pulsoLanterna':
        pedir('lanterna');
        break;
      case 'bauAberto':
        pedir('bauAberto');
        break;
      case 'bauRevelado':
        if (ev.tipoBau === 'raro') pedir('bauRaro');
        else if (ev.tipoBau === 'amaldicoado') pedir('bauAmaldicoado');
        break;
      case 'segredo':
        pedir('segredo');
        break;
      case 'derrotado':
        if (ev.id !== ctx.jogador) pedir('derrotado');
        break;
      case 'interrompeu':
        if (ev.por === ctx.jogador) pedir('interrompeu');
        break;
      case 'onda':
        pedir('onda');
        break;
      case 'faseChefe':
        if (ev.fase > 1) pedir('faseChefe');
        break;
      case 'grito':
        pedir('grito');
        break;
      case 'recusado':
        if (ev.id === ctx.jogador && ev.motivo !== 'posto') pedir('recusado');
        break;
      case 'posteCaiu':
        pedir('posteCaiu');
        break;
      case 'rolou':
        if (ev.id === ctx.jogador) pedir('rolar');
        break;
      case 'golpeou':
        // O último golpe do combo tem um som mais pesado.
        if (ev.id === ctx.jogador) {
          const nome = ev.combo >= cfg.golpeFinalNoCombo ? 'golpeFinal' : 'golpe';
          // O golpe próprio (o "plim" da Bruxinha) sobe de tom a cada golpe do combo.
          const som = proprio(nome);
          if (som) pedir(som, ev.combo * cfg.semitonsPorGolpe);
          else pedir(nome);
        }
        break;
      case 'objetoAtingido':
        pedir(`bater_${ev.material}`);
        break;
      case 'quebrou':
        pedir(`quebrar_${ev.material}`);
        break;
      case 'surpresa':
        pedir('surpresa');
        break;
      case 'escudoBateu':
        pedir('escudo');
        break;
      case 'alarmeCarro':
        pedir('alarme_carro');
        break;
      case 'fioCaiu':
        pedir('fio_caiu');
        break;
      case 'faisca':
        pedir('faisca');
        break;
      case 'jato':
        pedir('jato');
        break;
      case 'avisoExplosao':
        pedir('pavio');
        break;
      case 'explosaoAbobora':
        pedir('explosao');
        break;
      case 'pegouDoce':
      case 'travessuraVencida':
        pedir('doce');
        break;
      case 'frenesi':
        if (ev.ativo) pedir('frenesi');
        break;
      case 'nivel':
        if (ev.id === ctx.jogador) pedir('nivel');
        break;
      case 'portaoAbriu':
        pedir('portao');
        break;
      case 'vela':
        if (ev.acesa) pedir('faisca');
        break;
      case 'desejo':
        pedir('doce');
        break;
      case 'desafioVencido':
        pedir('nivel');
        break;
      default:
        break;
    }
  }
  if (critico || acerto) {
    const semitons = sequencia.proximo(ctx.agoraS, cfg.acertoSeguido);
    pedir(critico ? 'critico' : 'acerto', semitons);
  } else if (auto) pedir('acertoAuto');
  return pedidos;
}
