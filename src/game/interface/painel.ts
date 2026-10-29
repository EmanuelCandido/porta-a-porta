import { escudoTotal } from '../../sim/combate';
import { combate, tabelaDeEvolucoes } from '../../sim/content';
import { TECLAS } from '../../sim/content/esquemas';
import { nomeDaEvolucao } from '../../sim/evolucoes';
import { postoMaximo } from '../../sim/habilidades';
import type { Ficha } from '../../sim/partida';
import { podeSubirPosto, xpParaSubir } from '../../sim/progressao';

export interface SlotPainel {
  tecla: string;
  /** Id da habilidade (escolhe o ícone) e a forma dela (ícone genérico de reserva). */
  id: string;
  forma: string;
  nome: string;
  descricao: string;
  posto: number;
  postoMax: number;
  recarga: number;
  recargaTotal: number;
  custo: number;
  semEnergia: boolean;
  podeSubir: boolean;
  mirando: boolean;
  lancando: boolean;
  cargas: number;
  cargasMax: number;
  /** Evolução escolhida no posto 3 (id, para o ícone) e o nome dela. */
  evolucao: string | null;
  evolucaoNome: string | null;
  /** O próximo lançamento sai sem custo (Pouso Leve). */
  gratis: boolean;
}

export interface ReguaPainel {
  /** Posição do jogador ao longo da rua, de 0 (entrada) a 1 (saída). */
  jogador: number;
  postes: { pos: number; caido: boolean }[];
  portao: { pos: number; aberto: boolean };
}

export interface PainelHUD {
  campeao: string;
  campeaoId: string;
  /** Nome da rua ou da fase (rastreador de objetivo). */
  rua: string | null;
  /** Onde o jogador está agora (o nome da rua, praça ou beco da rota). */
  lugar: string | null;
  /** Exploração da rota: quanto do mapa foi revelado e o que já foi achado. */
  exploracao: {
    fracao: number;
    segredos: number;
    segredosTotal: number;
    campainhas: number;
    campainhasTotal: number;
  } | null;
  /** Ondas da rua: quantas vieram, o total e em quantos segundos chega a próxima. */
  ondas: { atual: number; total: number; proximaEm: number | null; pontos?: boolean } | null;
  nivel: number;
  xp: number;
  xpProximo: number;
  pontos: number;
  coragem: number;
  coragemMax: number;
  escudo: number;
  energia: number;
  energiaMax: number;
  luz: number;
  luzMax: number;
  slots: SlotPainel[];
  passiva: { nome: string; contagem: number | null; aCada: number | null };
  estados: string[];
  susto: { valor: number; faixa: string; frenesi: number } | null;
  doces: number | null;
  relogio: string | null;
  itens: ({ id: string; nome: string } | null)[] | null;
  consumiveis: { id: string | null; nome: string; qtd: number; tecla: string }[] | null;
  regua: ReguaPainel | null;
  pedido: { texto: string; situacao: 'andamento' | 'cumprido' | 'falhou' } | null;
  /** Condição da noite da rua (com a frase). */
  condicao: string | null;
  tratos: { marca: string; nomes: string[]; proximo: string | null }[] | null;
  chefe: { nome: string; fracao: number; fase: string } | null;
  elites: { nome: string; fracao: number }[];
  dica: string | null;
  titulo: string | null;
  /** Avisos de eventos, os mais novos por último (fila discreta no canto). */
  avisos?: { texto: string; restanteMs: number }[];
  /** O que a tecla de interação faz aqui (linha acima da barra de habilidades). */
  interacao?: string | null;
}

/** Fotografia da ficha do jogador para a interface (só leitura; nada aqui decide regra). */
export function painelDaFicha(
  ficha: Ficha,
  mirando: string | null,
  extras: Partial<PainelHUD> = {},
): PainelHUD {
  const c = ficha.combate;
  const l = ficha.lancador;
  const p = ficha.progresso;
  const niveis = combate.niveis;
  const passiva = l.passiva;
  const slots = TECLAS.map((t): SlotPainel => {
    const s = l.slots[t]!;
    const custo = s.gratis ? 0 : s.def.custo * c.attr.custoHabilidade;
    return {
      tecla: t,
      id: s.def.id,
      forma: s.def.forma.tipo,
      nome: s.def.nome,
      descricao: s.def.descricao,
      posto: s.posto,
      postoMax: postoMaximo(t),
      recarga: s.recarga,
      recargaTotal: s.recargaTotal,
      custo,
      semEnergia: c.energia + 1e-9 < custo,
      podeSubir: podeSubirPosto(l, p, t, niveis),
      mirando: mirando === t,
      lancando: l.lancando?.chave === t,
      cargas: s.cargas,
      cargasMax: s.def.cargas,
      evolucao: s.evolucao,
      evolucaoNome: nomeDaEvolucao(tabelaDeEvolucoes, s.evolucao),
      gratis: s.gratis,
    };
  });
  return {
    campeao: ficha.campeao.nome,
    campeaoId: ficha.campeaoId,
    rua: null,
    lugar: null,
    exploracao: null,
    ondas: null,
    nivel: p.nivel,
    xp: p.xp,
    xpProximo: p.nivel >= niveis.maximo ? 0 : xpParaSubir(p.nivel, niveis),
    pontos: p.pontos,
    coragem: c.coragem,
    coragemMax: c.attr.coragemMax,
    escudo: escudoTotal(c),
    energia: c.energia,
    energiaMax: c.attr.energiaMax,
    luz: c.luz,
    luzMax: c.attr.luzMax,
    slots,
    passiva: {
      nome: ficha.campeao.nomePassiva,
      contagem: passiva?.tipo === 'caldeirao' ? l.contagemPassiva : null,
      aCada: passiva?.tipo === 'caldeirao' ? passiva.aCada : null,
    },
    estados: [...new Set(c.estados.map((s) => s.tipo))],
    susto: null,
    doces: null,
    relogio: null,
    itens: null,
    consumiveis: null,
    regua: null,
    pedido: null,
    condicao: null,
    tratos: null,
    chefe: null,
    elites: [],
    dica: null,
    titulo: null,
    ...extras,
  };
}
