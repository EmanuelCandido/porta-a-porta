import {
  criarSistemaAutoAtaque,
  estadoAtaque,
  prioridadePorEspecie,
} from '../../../src/sim/autoataque';
import {
  combatenteBoneco,
  combatenteDoCampeao,
  criarSistemaCombate,
} from '../../../src/sim/combate';
import { afterEach, beforeEach } from 'vitest';
import { campeoes, combate, habilidades, ondas, simulacao } from '../../../src/sim/content';
import type { Evento } from '../../../src/sim/eventos';
import type { V2 } from '../../../src/sim/geometria';
import { criarLancador, Executor, type EstadoHabilidades } from '../../../src/sim/habilidades';
import {
  adicionarEntidade,
  criarMundo,
  enfileirar,
  passo,
  type Entidade,
  type Mundo,
  type Sistema,
} from '../../../src/sim/mundo';
import { eventosDo } from '../../../src/sim/partida';

export const TPS = simulacao.ticksPorSegundo;
export const BRUXINHA = campeoes['bruxinha']!;
export const RES_BONECO = combate.bonecoTreino.resistencia;
export const CORAGEM_BONECO = combate.bonecoTreino.coragem;

export function habilidadeDe(campeao: string, tecla: 'Q' | 'W' | 'E' | 'R') {
  const id = campeoes[campeao]!.habilidades[tecla];
  return habilidades.find((h) => h.id === id)!;
}

export interface Cena {
  mundo: Mundo;
  heroi: Entidade;
  hab: EstadoHabilidades;
  executor: Executor;
}

export function novoExecutor(): Executor {
  return new Executor({
    pressaMaxima: combate.pressaMaxima,
    comandoGuardadoS: combate.comandoGuardadoS,
    fracaoRecargaInterrompida: combate.fracaoRecargaInterrompida,
    raioBuscaAlvo: combate.raioBuscaAlvo,
    quaseAcertoTiles: combate.quaseAcertoTiles,
    estados: combate.estados,
  });
}

/** Um campo de 30 × 30 com o campeão em (5, 15), todas as habilidades no posto dado. */
export function cena(
  obstaculos: { x0: number; y0: number; x1: number; y1: number }[] = [],
  opcoes: {
    posto?: number;
    autoAtaque?: boolean;
    /** Ataque manual do jogador (botão esquerdo) no lugar do automático. */
    manual?: boolean;
    campeao?: string;
    extras?: Sistema[];
  } = {},
): Cena {
  const executor = novoExecutor();
  const sistemas: Sistema[] = [criarSistemaCombate(combate), executor.sistema];
  if (opcoes.autoAtaque) {
    sistemas.push(
      criarSistemaAutoAtaque(executor, {
        aquisicaoTiles: combate.aquisicaoTiles,
        prioridade: prioridadePorEspecie({}),
        manual: opcoes.manual ? combate.ataqueManual : undefined,
      }),
    );
  }
  sistemas.push(...(opcoes.extras ?? []));
  const mundo = criarMundo(
    { limites: { x0: 0, y0: 0, x1: 30, y1: 30 }, obstaculos, semente: 1 },
    simulacao,
    sistemas,
  );
  const id = opcoes.campeao ?? 'bruxinha';
  const c = campeoes[id]!;
  const heroi = adicionarEntidade(mundo, {
    tipo: 'jogador',
    especie: id,
    pos: { x: 5, y: 15 },
    raio: 0.4,
    velocidade: 3.5,
    combate: combatenteDoCampeao(c, combate),
    lancador: criarLancador(c, new Map(habilidades.map((h) => [h.id, h])), opcoes.posto ?? 1),
    ataque: opcoes.autoAtaque ? estadoAtaque(c.autoAtaque, true) : undefined,
  });
  return { mundo, heroi, hab: executor.estado, executor };
}

export function boneco(c: Cena, pos: V2, velocidade = 0, coragem?: number): Entidade {
  const b = adicionarEntidade(c.mundo, {
    tipo: 'inimigo',
    especie: 'boneco',
    pos,
    raio: combate.bonecoTreino.raio,
    velocidade,
    combate: { ...combatenteBoneco(combate.bonecoTreino, combate), renascerS: null },
  });
  if (coragem !== undefined) {
    b.combate!.base.coragemMax = coragem;
    b.combate!.attr.coragemMax = coragem;
    b.combate!.coragem = coragem;
  }
  return b;
}

export function rodar(m: Mundo, segundos: number): void {
  const ticks = Math.round(segundos * TPS);
  for (let i = 0; i < ticks; i++) passo(m);
}

export function lancar(c: Cena, tecla: string, alvo: V2): void {
  enfileirar(c.mundo, { tipo: 'lancar', id: c.heroi.id, tecla, alvo });
}

export const perdida = (e: Entidade) => e.combate!.attr.coragemMax - e.combate!.coragem;

export function eventos<T extends Evento['tipo']>(m: Mundo, tipo: T) {
  return eventosDo(m.eventos, tipo);
}

/**
 * Os testes das ondas por tempo (uma a cada `intervalo`), o modo de antes dos pontos nos bueiros:
 * chamado dentro de um `describe`, vale para os testes dele.
 */
export function ondasPorTempo(): void {
  const antes = ondas.modo;
  beforeEach(() => {
    ondas.modo = 'tempo';
  });
  afterEach(() => {
    ondas.modo = antes;
  });
}
