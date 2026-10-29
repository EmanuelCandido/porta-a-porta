import { CampoDeFluxo, Grade } from './campoDeFluxo';
import { comportamentosDosChefes } from './chefes';
import { comportamentosDaRua } from './elites';
import type { RuaGerada } from './gerador';
import { criarSistemaIA, type ContextoIA } from './ia';
import { MapaDeLuz } from './luz';
import type { Mundo, Sistema } from './mundo';
import { montarPartida, novoExecutor, type Conteudo, type Ficha, type Partida } from './partida';
import { RegrasDaRua, type Bolso, type OpcoesRua } from './regrasDaRua';
import { obstaculosDaRua } from './rua';

export interface RuaDeLuta extends Partida {
  gerada: RuaGerada;
  regras: RegrasDaRua;
  luz: MapaDeLuz;
  campo: CampoDeFluxo;
  ia: ContextoIA;
}

/** Célula da grade de caminhar e folga em volta dos obstáculos, em tiles. */
const CELULA = 0.5;
const FOLGA = 0.25;
/** Até onde (em células) o campo de fluxo das ondas se espalha a partir do jogador. */
const RAIO_DO_CAMPO = 110;

/**
 * Monta uma rua de luta: o mundo com a rua gerada, o mapa de luz (postes amigos e janelas), a
 * grade e o campo de fluxo das ondas, a IA dos inimigos e as regras da rua.
 */
export function montarRua(
  gerada: RuaGerada,
  ficha: Ficha,
  conteudo: Conteudo,
  semente: number,
  bolso: Bolso,
  opcoes: OpcoesRua,
  /** Sistemas da run (tratos, relógio), depois das regras da rua. */
  extras: Sistema[] = [],
): RuaDeLuta {
  const luz = new MapaDeLuz();
  for (const l of gerada.luzes) {
    // Janela Aberta: janelas acesas também curam como postes.
    const cura = l.tipo === 'poste' || (l.tipo === 'janela' && !!opcoes.janelasCuram);
    luz.adicionar({
      tipo: l.tipo,
      x: l.x,
      y: l.y,
      raio: l.raio,
      cura,
      objeto: l.objeto,
      ...(l.feixe ? { feixe: l.feixe } : {}),
    });
  }
  const { rua } = gerada;
  const limites = { x0: 0, y0: 0, x1: rua.largura, y1: rua.profundidade };
  // Fora do caminho da rota ninguém anda (os retângulos de `bloqueado`).
  const campo = new CampoDeFluxo(
    new Grade(
      limites,
      CELULA,
      [...obstaculosDaRua(rua, conteudo.modelos), ...gerada.bloqueado],
      FOLGA,
    ),
    RAIO_DO_CAMPO,
  );
  const executor = novoExecutor(conteudo.combate);
  const ctxIA: ContextoIA = {
    executor,
    campo,
    luz,
    defs: conteudo.inimigos!.inimigos,
    raioIsca: conteudo.inimigos!.doceIsca.raio,
    reacoes: conteudo.inimigos!.reacoes,
  };
  let mundo: Mundo | null = null;
  const regras = new RegrasDaRua(
    () => mundo!,
    gerada,
    conteudo,
    executor,
    luz,
    campo,
    bolso,
    opcoes,
  );
  // Selvagens, elites e chefes usam as regras da rua (invocar, alarme, portas, sombra).
  const servicos = regras.servicos();
  ctxIA.extras = {
    ...comportamentosDaRua(servicos),
    ...comportamentosDosChefes(servicos),
    ...ctxIA.extras,
  };
  const partida = montarPartida(
    rua,
    ficha,
    conteudo,
    semente,
    {
      antes: [criarSistemaIA(ctxIA)],
      sistemas: [regras.sistema, ...extras],
      obstaculos: gerada.bloqueado,
    },
    executor,
  );
  mundo = partida.mundo;
  mundo.luz = luz;
  regras.iniciar(partida.jogador);
  return { ...partida, gerada, regras, luz, campo, ia: ctxIA };
}
