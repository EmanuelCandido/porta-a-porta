import { gerarCidade, sortearPeso, type Continuacao, type LadoDoMundo } from './cidade';
import {
  MODELOS_DE_CASA,
  type Gerador,
  type Luz,
  type Modelos,
  type NomeModelo,
  type ObjetoRua,
  type Piso,
  type Rua,
} from './content/esquemas';
import {
  girar,
  posicionador,
  voltadaParaACamera,
  type Retangulo,
  type Rotacao,
  type V2,
} from './geometria';
import { alcanceDoFeixe, feixeDeJanela, type Feixe } from './luz';
import { Rng } from './rng';

export interface Quintal {
  area: Retangulo;
  /** Ponto logo antes de entrar no quintal (na boca do beco). */
  boca: V2;
  selvagem: V2;
  bau: V2;
  lado: 'oeste' | 'leste';
}

export interface FonteDeLuzRua {
  tipo: 'poste' | 'janela';
  x: number;
  y: number;
  raio: number;
  /** Índice do objeto na rua (para apagar o poste ou a casa). */
  objeto: number;
  /** Janelas: o feixe que sai dela (`raio` é só o alcance). */
  feixe?: Feixe;
}

/** Que tipo de lugar é uma zona com nome (o rastreador diz onde o jogador está). */
export type TipoDeZona =
  | 'rua'
  | 'beco'
  | 'largo'
  | 'cruzamento'
  | 'praca'
  | 'escola'
  | 'estacionamento'
  | 'obras'
  | 'cemiterio'
  | 'quintal'
  | 'mirante';

export interface ZonaNomeada {
  nome: string;
  tipo: TipoDeZona;
  area: Retangulo;
}

/** Um ponto de exploração: onde o jogador interage e o objeto do cenário ligado a ele. */
export interface PontoDeExploracao {
  x: number;
  y: number;
  /** Índice do objeto na rua (abóbora da campainha, poste apagado, caixa-d'água). */
  objeto: number;
}

/** O que a rota esconde para quem explora (docs/DESIGN.md, seção 10). */
export interface ExploracaoGerada {
  /** Casas com a abóbora acesa na porta: tocar a campainha. */
  campainhas: PontoDeExploracao[];
  /** Casas Desconfiadas (aldrava, janelas apagadas): F bate e abre o minijogo; `objeto` é a casa. */
  desconfiadas?: PontoDeExploracao[];
  /** Abóboras Douradas escondidas em becos e cantos escuros. */
  segredos: V2[];
  /** Postes apagados que o jogador pode religar. */
  postes: PontoDeExploracao[];
  /** A caixa-d'água que serve de mirante (revela o mapa). */
  mirante: PontoDeExploracao | null;
}

export function exploracaoVazia(): ExploracaoGerada {
  return { campainhas: [], segredos: [], postes: [], mirante: null };
}

/** Rua interditada no meio da rota que só abre quando caem tantos Postes Corrompidos. */
export interface Bloqueio {
  grupo: string;
  area: Retangulo;
  postes: number;
}

/** Portão do beco de um quintal: fecha o caminho até alguém abrir no golpe forte. */
export interface PortaoDeQuintal {
  grupo: string;
  area: Retangulo;
}

/** Um grupo de pestinhas dormindo pelo caminho. */
export interface Encontro {
  pos: V2;
  n: number;
}

export interface RuaGerada {
  rua: Rua;
  /** Faixa da pista que passa pelo portão de saída (x) e onde ficam a entrada e a saída (y). */
  ruaX: [number, number];
  yEntrada: number;
  ySaida: number;
  /** Passando daqui com o portão aberto, a rua acaba. */
  saida: Retangulo;
  /** Obstáculo da grade do portão de saída (sai quando o portão abre). */
  grade: Retangulo;
  /** As grades de cada ramal da Encruzilhada (a primeira é `grade`); todas saem juntas. */
  grades?: Retangulo[];
  /** A saída de cada rota (um ramal da Encruzilhada por portão), do oeste para o leste. */
  saidas?: Retangulo[];
  /** Bueiros das ondas, ao longo da rota (a onda sai dos mais perto do jogador). */
  bueiros: V2[];
  /** Bueiro de flanco (na obra): entra nas ondas a partir de `flancoDesdeOnda`. */
  bueirosFlanco: V2[];
  postesCorrompidos: V2[];
  quintais: Quintal[];
  luzes: FonteDeLuzRua[];
  /** Ponto da calçada diante da porta de cada casa (baús da Chave Mestra, pedidos). */
  portas: { x: number; y: number; lado: 'oeste' | 'leste' }[];
  /** Centro da praça, onde a elite aparece (null onde não há praça). */
  praca: V2 | null;
  /** Ruas e lugares com nome, dos mais específicos para os mais gerais. */
  zonas: ZonaNomeada[];
  exploracao: ExploracaoGerada;
  /** O caminho da rota, da entrada à saída (para a régua de progresso). */
  rota: V2[];
  /** Fora do caminho ninguém anda: estes retângulos fecham tudo que não é rua, sala ou beco. */
  bloqueado: Retangulo[];
  bloqueios: Bloqueio[];
  /** Portões dos becos dos quintais (só o golpe forte abre). */
  portoes?: PortaoDeQuintal[];
  /** O atalho escuro pelo quarteirão (o anel da rota): as duas pontas e onde fica o baú. */
  atalho?: { a: V2; b: V2; bau: V2 };
  /** Fins de beco com desafio (poço, velas, casa assombrada). */
  fins?: FimDeBecoGerado[];
  encontros: Encontro[];
  /** Velas da arena da Viúva: onde ficam e o objeto de cada uma (o jogador acende com F). */
  velasDaArena?: { pos: V2; objeto: number }[];
  /** Praça de um chefe que fica numa casa: onde ele nasce e a casa dele (índice em `objetos`). */
  lugarDoChefe?: { pos: V2; casa: number | null };
}

/** Quanto o ponto da porta fica à frente da fachada, em tiles. */
const AFASTAMENTO_DA_PORTA = 0.6;
const VARIANTES_DE_LOJA = ['mercadinho', 'padaria', 'farmacia'] as const;
/** Distância do meio do estacionamento ao fundo das vagas, e o vão entre dois carros (tiles). */
const FUNDO_DAS_VAGAS = 6.1;
const VAO_ENTRE_VAGAS = 0.15;
/** Folga mínima entre objetos de calçada e de sala, para sobrar caminho entre eles. */
const FOLGA_DE_OBJETO = 0.15;
/** Tentativas da busca da rota antes de usar o caminho de reserva. */
const TENTATIVAS_DA_ROTA = 4000;
/** Vãos entre casas menores que isso já não deixam passar; maiores ganham sebe. */
const VAO_COM_SEBE = 0.75;
/** Fundo do quintal atrás de cada casa, em tiles. */
const PROFUNDIDADE_DO_QUINTAL = 3.4;
/** Chances de cada tipo de lote ao longo das ruas. */
const LOTES = { baldio: 0.07, comercioNaEsquina: 0.45 };

export interface OpcoesGerador {
  /** Bairro (0, 1 ou 2): muda as casas, as árvores e a quantidade de postes amigos. */
  bairro: number;
  /** Postes amigos que nascem apagados (preço Poste Apagado, condições da noite). */
  postesApagados?: number;
  /** Fração dos postes amigos (fora os de religar) que nasce apagada (curva dos bairros). */
  fracaoApagados?: number;
  /** Rua Sem Luz: nenhum poste nem janela (os postes apagados ainda podem ser religados). */
  semLuz?: boolean;
  /** Fração das janelas apagadas (Apagão Parcial). */
  janelasApagadas?: number;
  /** Portões de saída lado a lado (rotas): pilares dividem a saída em partes iguais. */
  saidas?: number;
  nome?: string;
}

type ModeloCasa = (typeof MODELOS_DE_CASA)[number];
type Ponta = 'obra' | 'buraco' | 'barreira' | 'deslizamento';
type TipoDeRamo = 'quintal' | 'cemiterio' | 'mirante' | 'segredo' | FimDeBeco;

/** Fins de beco com desafio (docs/PLANO_MUNDO_VIVO.md, frente 1). */
export type FimDeBeco = 'poco' | 'velas' | 'assombrada';

/** Um fim de beco com desafio: o tipo, o centro da sala, a área e os objetos dele (as velas). */
export interface FimDeBecoGerado {
  tipo: FimDeBeco;
  centro: V2;
  area: Retangulo;
  objetos: number[];
}
type TipoDeSala = 'largoEntrada' | 'largoSaida' | 'poste' | 'praca' | 'obras' | 'patio';
/** Como cada pedaço do caminho fecha a borda: casas, cerca, sebe, tapume ou uma ponta. */
type Borda = 'casas' | 'cerca' | 'sebe' | 'tapume' | `ponta:${Ponta}`;
const CASAS: ReadonlySet<string> = new Set(MODELOS_DE_CASA);
const DIRECOES: readonly V2[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
];

export function ehCasa(o: ObjetoRua): boolean {
  return CASAS.has(o.modelo);
}

/** O feixe que cada janela acesa de uma casa (ou loja) joga no chão, na frente dela. */
export function luzesDasJanelas(
  o: ObjetoRua,
  indice: number,
  modelos: Modelos,
  luz: Luz,
): FonteDeLuzRua[] {
  if ('apagada' in o && o.apagada) return [];
  if (!luz.janela.iluminaChao) return [];
  const { pegada, janelas } = modelos[o.modelo];
  if (janelas.length === 0) return [];
  const { ponto } = posicionador(pegada.largura, pegada.profundidade, o.x, o.y, o.rot);
  // Só a janela que a câmera vê joga luz no chão: luz sem fonte à vista parece erro.
  return janelas.flatMap((j): FonteDeLuzRua[] => {
    const n = girar({ x: j.nx, y: j.ny }, o.rot);
    if (!voltadaParaACamera(n)) return [];
    const pe = ponto({ x: j.x, y: j.y });
    const feixe = feixeDeJanela(
      { nx: n.x, ny: n.y, largura: j.largura, andar: j.andar },
      luz.janela,
    );
    return [
      { tipo: 'janela', x: pe.x, y: pe.y, raio: alcanceDoFeixe(feixe), objeto: indice, feixe },
    ];
  });
}

/** Sorteia uma chave pelos pesos (as que faltam valem 0). */
export function escolherPeso<T extends string>(rng: Rng, pesos: Partial<Record<T, number>>): T {
  return sortearPeso(rng, pesos);
}

const arred = (n: number) => Math.round(n * 1000) / 1000;

function cruzam(a: Retangulo, b: Retangulo, folga = 0): boolean {
  return a.x0 < b.x1 + folga && b.x0 < a.x1 + folga && a.y0 < b.y1 + folga && b.y0 < a.y1 + folga;
}

function dentroDe(p: V2, r: Retangulo): boolean {
  return p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1;
}

function embaralhar<T>(rng: Rng, lista: T[]): T[] {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = rng.inteiro(0, i);
    [lista[i], lista[j]] = [lista[j]!, lista[i]!];
  }
  return lista;
}

function quadrado(c: V2, h: number): Retangulo {
  return { x0: c.x - h, y0: c.y - h, x1: c.x + h, y1: c.y + h };
}

/** Retângulo de largura 2·meia em volta do segmento a→b (horizontal ou vertical). */
function faixaEntre(a: V2, b: V2, meia: number): Retangulo {
  return {
    x0: Math.min(a.x, b.x) - (a.x === b.x ? meia : 0),
    y0: Math.min(a.y, b.y) - (a.y === b.y ? meia : 0),
    x1: Math.max(a.x, b.x) + (a.x === b.x ? meia : 0),
    y1: Math.max(a.y, b.y) + (a.y === b.y ? meia : 0),
  };
}

/** A porta fica na calçada, um pouco fora da faixa da rua: até isso (tiles) ainda conta como dela. */
const FOLGA_DA_PORTA_NA_RUA = 1.5;
/** Rua sem casas próprias (curta, só de passagem): vale uma porta da esquina até esta folga. */
const FOLGA_DA_PORTA_NA_ESQUINA = 5;

/** Como `faixaEntre`, mas cobrindo também o quadrado de cada ponta (os cruzamentos). */
function faixaComPontas(a: V2, b: V2, meia: number): Retangulo {
  return {
    x0: Math.min(a.x, b.x) - meia,
    y0: Math.min(a.y, b.y) - meia,
    x1: Math.max(a.x, b.x) + meia,
    y1: Math.max(a.y, b.y) + meia,
  };
}

/** Retângulos reservados com um índice em baldes, para perguntar "encosta em algo?" rápido. */
class Reservas {
  private readonly baldes = new Map<number, Retangulo[]>();
  private static readonly LADO = 4;

  private chaves(r: Retangulo, folga: number, f: (k: number) => void): void {
    const L = Reservas.LADO;
    const i0 = Math.floor((r.x0 - folga) / L);
    const i1 = Math.floor((r.x1 + folga) / L);
    const j0 = Math.floor((r.y0 - folga) / L);
    const j1 = Math.floor((r.y1 + folga) / L);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) f(j * 4096 + i);
  }

  add(r: Retangulo): void {
    this.chaves(r, 0, (k) => {
      const b = this.baldes.get(k);
      if (b) b.push(r);
      else this.baldes.set(k, [r]);
    });
  }

  some(r: Retangulo, folga: number): boolean {
    let achou = false;
    this.chaves(r, folga, (k) => {
      if (achou) return;
      const b = this.baldes.get(k);
      if (b?.some((o) => cruzam(o, r, folga))) achou = true;
    });
    return achou;
  }
}

interface Celula {
  i: number;
  j: number;
}

/** Um pedaço do caminho: retângulo e como a borda dele fecha. */
interface Pedaco {
  r: Retangulo;
  borda: Borda;
  prioridade: number;
}

/** Trecho reto da borda do caminho: a linha, o eixo, as pontas e para que lado fica o caminho. */
interface TrechoDeBorda {
  eixo: 'x' | 'y';
  p: number;
  a0: number;
  a1: number;
  /** +1: o caminho fica para +y (eixo x) ou +x (eixo y). */
  dentro: 1 | -1;
  borda: Borda;
}

/** Uma via da rota: segmento entre dois pontos, com a largura da pista e da calçada. */
interface Via {
  a: V2;
  b: V2;
  pista: number;
  calcada: number;
  beco: boolean;
  /** O atalho escuro: sem postes. */
  escuro?: boolean;
}

interface Sala {
  tipo: TipoDeSala;
  centro: V2;
  h: number;
  no: number;
}

interface Ramo {
  no: number;
  dir: V2;
  tipo: TipoDeRamo;
  /** Centro da sala do fim do beco (ou a ponta, no esconderijo). */
  fim: V2;
}

/**
 * Busca a rota na grade grande: um caminho que não encosta em si mesmo (sempre um quarteirão
 * entre duas passagens), da linha de baixo à de cima, com `alvo` nós.
 */
function buscarRota(
  rng: Rng,
  colunas: number,
  linhas: number,
  alvo: number,
  reta: number,
): Celula[] {
  const visitado = new Set<string>();
  const chave = (c: Celula) => `${c.i},${c.j}`;
  const caminho: Celula[] = [{ i: rng.inteiro(1, colunas - 2), j: linhas - 1 }];
  visitado.add(chave(caminho[0]!));
  let passos = 0;
  const encosta = (c: Celula, anterior: Celula) =>
    DIRECOES.some((d) => {
      const v = { i: c.i + d.x, j: c.j + d.y };
      return (v.i !== anterior.i || v.j !== anterior.j) && visitado.has(chave(v));
    });
  const buscar = (): boolean => {
    if (++passos > TENTATIVAS_DA_ROTA) return false;
    const atual = caminho[caminho.length - 1]!;
    if (caminho.length === alvo) return atual.j === 0;
    const faltam = alvo - caminho.length;
    if (atual.j > faltam) return false;
    const anterior = caminho[caminho.length - 2];
    const dirAnterior = anterior
      ? { x: atual.i - anterior.i, y: atual.j - anterior.j }
      : { x: 0, y: -1 };
    // Ordem das tentativas: seguir reto (com chance), subir, os lados e, por último, descer.
    const lados = embaralhar(rng, [DIRECOES[1]!, DIRECOES[2]!]);
    let ordem = [DIRECOES[0]!, ...lados, DIRECOES[3]!];
    if (rng.proximo() < reta)
      ordem = [dirAnterior, ...ordem.filter((d) => d.x !== dirAnterior.x || d.y !== dirAnterior.y)];
    else if (rng.proximo() < 0.5) ordem = [...lados, DIRECOES[0]!, DIRECOES[3]!];
    for (const d of ordem) {
      const n = { i: atual.i + d.x, j: atual.j + d.y };
      if (n.i < 0 || n.j < 0 || n.i >= colunas || n.j >= linhas) continue;
      if (visitado.has(chave(n)) || encosta(n, atual)) continue;
      if (n.j === 0 && caminho.length + 1 < alvo) continue;
      if (d.y === 1 && rng.proximo() < 0.7) continue;
      caminho.push(n);
      visitado.add(chave(n));
      if (buscar()) return true;
      caminho.pop();
      visitado.delete(chave(n));
    }
    return false;
  };
  if (buscar()) return caminho;
  // Reserva: sobe em zigue-zague até a linha de cima.
  const i0 = caminho[0]!.i;
  const lado = i0 < colunas / 2 ? 1 : -1;
  const reserva: Celula[] = [];
  for (let j = linhas - 1; j >= 0; j--) {
    const i = Math.floor((linhas - 1 - j) / 3) % 2 === 0 ? i0 : i0 + lado;
    if (reserva.length > 0 && reserva[reserva.length - 1]!.i !== i)
      reserva.push({ i, j: reserva[reserva.length - 1]!.j });
    reserva.push({ i, j });
  }
  return reserva;
}

/** `n` itens da lista espalhados pela ordem dela, sem sortear (a rua continua a mesma). */
function espalhados<T>(lista: readonly T[], n: number): Set<T> {
  const saida = new Set<T>();
  for (let k = 0; k < n; k++) saida.add(lista[Math.floor(((k + 0.5) * lista.length) / n)]!);
  return saida;
}

/**
 * Curva dos bairros: apaga uma fração dos postes amigos acesos (ruas, praças e salas), espalhados
 * pela ordem em que nasceram e sem sortear, para a rua continuar a mesma.
 */
function apagarFracao(
  luzes: FonteDeLuzRua[],
  objetos: ObjetoRua[],
  fracao: number,
): FonteDeLuzRua[] {
  const postes = luzes.filter((l) => l.tipo === 'poste');
  const fora = espalhados(postes, Math.round(fracao * postes.length));
  for (const l of fora) (objetos[l.objeto] as { estado?: string }).estado = 'apagado';
  return luzes.filter((l) => !fora.has(l));
}

/** Peças de borda do cenário: cortadas onde entram numa casa, num carro ou numa árvore. */
const PECAS_DE_BORDA: ReadonlySet<string> = new Set(['cerca', 'cerca_viva', 'muro', 'tapume']);
/** Coisas rentes ao chão, que uma cerca pode cruzar sem parecer erro. */
const RENTES_AO_CHAO: ReadonlySet<string> = new Set(['bueiro', 'buraco', 'cone']);
const ARVORES: ReadonlySet<string> = new Set(['arvore', 'arvore_seca', 'pinheiro']);
/** Uma peça de borda só sai se a sobreposição cobrir quase toda a espessura dela... */
const FRACAO_DA_ESPESSURA = 0.9;
/** ...e mais que isso ao longo dela (tiles): encostar na parede não conta. */
const SOBREPOSICAO_MINIMA = 0.4;
/** Um poste com o centro mais perto que isso do de uma árvore fica escondido na copa. */
const POSTE_NA_COPA = 0.9;

/**
 * Cenário sem nada atravessando nada: tira as peças de cerca, sebe, muro e tapume que entram num
 * modelo com volume (casas, carros, árvores, de qualquer trecho) e os postes enfiados numa copa
 * (a poça de luz deles pareceria não ter fonte). Os objetos da rua (com colisão) ficam como estão.
 */
function semAtravessar(cenario: ObjetoRua[], objetos: ObjetoRua[], modelos: Modelos): ObjetoRua[] {
  const pegadaDe = (o: ObjetoRua) => {
    const { largura, profundidade } = modelos[o.modelo].pegada;
    return posicionador(largura, profundidade, o.x, o.y, o.rot).pegada;
  };
  const todos = [...objetos, ...cenario].map((o) => ({ o, p: pegadaDe(o) }));
  // Grade de baldes de 4 tiles, para não comparar tudo com tudo.
  const BALDE = 4;
  const baldes = new Map<string, number[]>();
  todos.forEach(({ p }, i) => {
    for (let bx = Math.floor(p.x0 / BALDE); bx <= Math.floor(p.x1 / BALDE); bx++)
      for (let by = Math.floor(p.y0 / BALDE); by <= Math.floor(p.y1 / BALDE); by++) {
        const k = `${bx},${by}`;
        const l = baldes.get(k);
        if (l) l.push(i);
        else baldes.set(k, [i]);
      }
  });
  const vizinhos = (p: Retangulo): Set<number> => {
    const v = new Set<number>();
    for (let bx = Math.floor(p.x0 / BALDE); bx <= Math.floor(p.x1 / BALDE); bx++)
      for (let by = Math.floor(p.y0 / BALDE); by <= Math.floor(p.y1 / BALDE); by++)
        for (const i of baldes.get(`${bx},${by}`) ?? []) v.add(i);
    return v;
  };
  const fora = new Set<ObjetoRua>();
  for (const { o, p } of todos.slice(objetos.length)) {
    const borda = PECAS_DE_BORDA.has(o.modelo);
    if (!borda && o.modelo !== 'poste') continue;
    const espessura = Math.min(p.x1 - p.x0, p.y1 - p.y0);
    for (const i of vizinhos(p)) {
      const b = todos[i]!;
      if (b.o === o || fora.has(b.o)) continue;
      if (borda) {
        if (PECAS_DE_BORDA.has(b.o.modelo) || RENTES_AO_CHAO.has(b.o.modelo)) continue;
        const iw = Math.min(p.x1, b.p.x1) - Math.max(p.x0, b.p.x0);
        const ih = Math.min(p.y1, b.p.y1) - Math.max(p.y0, b.p.y0);
        if (
          Math.min(iw, ih) >= espessura * FRACAO_DA_ESPESSURA &&
          Math.max(iw, ih) > SOBREPOSICAO_MINIMA
        ) {
          fora.add(o);
          break;
        }
      } else if (ARVORES.has(b.o.modelo)) {
        const d = Math.hypot(
          (p.x0 + p.x1 - b.p.x0 - b.p.x1) / 2,
          (p.y0 + p.y1 - b.p.y0 - b.p.y1) / 2,
        );
        if (d < POSTE_NA_COPA) {
          fora.add(o);
          break;
        }
      }
    }
  }
  return fora.size === 0 ? cenario : cenario.filter((o) => !fora.has(o));
}

/** A mesma fração dos postes da cidade em volta (só cenário) apaga junto: a rua escura é escura. */
function apagarCenario(cenario: ObjetoRua[], fracao: number): ObjetoRua[] {
  const postes = cenario.filter((o) => o.modelo === 'poste' && o.estado !== 'apagado');
  for (const o of espalhados(postes, Math.round(fracao * postes.length)))
    (o as { estado?: string }).estado = 'apagado';
  return cenario;
}

/**
 * Gera a rota de uma rua de luta a partir de uma semente (docs/DESIGN.md, seção 9): um caminho
 * linear, como as fases de um dungeon crawler, que serpenteia por uma grade de quarteirões da
 * entrada (sul) ao portão de saída (norte). Pelo caminho há salas — o largo da entrada, o
 * cruzamento do 1º Poste Corrompido (e uma rua interditada que só abre quando ele cai), a praça
 * da elite, a obra com o bueiro de flanco, o pátio do 2º Poste e o largo do portão — e becos sem
 * saída com quintais, o cemitério, o mirante e esconderijos. Casas olham para o caminho; fora
 * dele, a cidade é só cenário, com morros e limites discretos. Em volta, mais cidade.
 */
export function gerarRua(
  semente: number,
  cfg: Gerador,
  modelos: Modelos,
  luz: Luz,
  opcoes: OpcoesGerador,
): RuaGerada {
  const rng = new Rng(semente);
  /** Sorteios das armas do cenário: um gerador separado, para a rua de sempre não mudar. */
  const rngArmas = new Rng((semente ^ 0x5bd1e995) >>> 0);
  const bairro = cfg.bairros[Math.min(opcoes.bairro, cfg.bairros.length - 1)]!;
  const R = cfg.rota;
  const S = R.celula;
  const mg = R.margem;
  const E = R.encruzilhada;
  /** A faixa do norte é maior: os ramais da Encruzilhada saem do largo final por ela. */
  const mgN = Math.max(mg, E.margemNorte);
  const J = cfg.rua.jardim;
  const meiaRua = R.rua.pista / 2 + R.rua.calcada;
  const meiaBeco = R.beco.pista / 2 + R.beco.calcada;
  const sorteio = (f: [number, number]) => rng.inteiro(f[0], f[1]);

  // ------------------------------------------------------------ a rota na grade grande
  const celulas = buscarRota(rng, R.colunas, R.linhas, sorteio(R.nos), R.chanceDeReta);
  const K = celulas.length;
  const ocupadaGrande = new Set(celulas.map((c) => `${c.i},${c.j}`));
  // Becos laterais: para uma célula livre que só encosta no nó de onde sai.
  const escolhidos: { k: number; d: V2; tipo: TipoDeRamo; c: Celula }[] = [];
  {
    const nRamos = sorteio(R.ramos);
    const tiposObrigatorios: TipoDeRamo[] = ['mirante', 'quintal', 'segredo'];
    const candidatos = embaralhar(
      rng,
      celulas.flatMap((c, k) => (k === 0 || k === K - 1 ? [] : DIRECOES.map((d) => ({ k, c, d })))),
    );
    for (const { k, c, d } of candidatos) {
      if (escolhidos.length >= nRamos) break;
      const n = { i: c.i + d.x, j: c.j + d.y };
      if (n.i < 0 || n.j < 0 || n.i >= R.colunas || n.j >= R.linhas) continue;
      if (ocupadaGrande.has(`${n.i},${n.j}`)) continue;
      const vizinhos = DIRECOES.filter((e) => ocupadaGrande.has(`${n.i + e.x},${n.j + e.y}`));
      if (vizinhos.length > 1) continue;
      if (escolhidos.some((r) => r.k === k)) continue;
      let tipo: TipoDeRamo =
        tiposObrigatorios[escolhidos.length] ?? sortearPeso(rng, R.tiposDeRamo);
      if (tipo === 'cemiterio' && escolhidos.some((r) => r.tipo === 'cemiterio')) tipo = 'quintal';
      if (tipo === 'mirante' && escolhidos.some((r) => r.tipo === 'mirante')) tipo = 'segredo';
      // Cada desafio no máximo uma vez por rua.
      if (
        (tipo === 'poco' || tipo === 'velas' || tipo === 'assombrada') &&
        escolhidos.some((r) => r.tipo === tipo)
      )
        tipo = 'quintal';
      ocupadaGrande.add(`${n.i},${n.j}`);
      escolhidos.push({ k, d, tipo, c: n });
    }
  }
  // O mundo é recortado nas colunas que a rota e os becos usam: nada de cidade sobrando.
  const colunasUsadas = [...celulas, ...escolhidos.map((r) => r.c)].map((c) => c.i);
  const iMin = Math.min(...colunasUsadas);
  const iMax = Math.max(...colunasUsadas);
  const largura = Math.ceil((iMax - iMin + 1) * S + 2 * mg);
  const profundidade = Math.ceil(R.linhas * S + mg + mgN);
  const centro = (c: Celula): V2 => ({
    x: mg + (c.i - iMin + 0.5) * S,
    y: mgN + (c.j + 0.5) * S,
  });
  const nos = celulas.map(centro);
  const posicao = (f: number) => Math.min(K - 2, Math.max(1, Math.round(f * (K - 1))));
  const salaNo = new Map<number, TipoDeSala>();
  salaNo.set(0, 'largoEntrada');
  salaNo.set(K - 1, 'largoSaida');
  salaNo.set(K - 2, 'patio');
  const reservarSala = (f: number, tipo: TipoDeSala) => {
    let k = posicao(f);
    while (salaNo.has(k) && k < K - 2) k++;
    while (salaNo.has(k) && k > 1) k--;
    if (!salaNo.has(k)) salaNo.set(k, tipo);
  };
  reservarSala(R.posicoes.poste, 'poste');
  reservarSala(R.posicoes.praca, 'praca');
  reservarSala(R.posicoes.obras, 'obras');
  const meiaSala: Record<TipoDeSala, number> = {
    largoEntrada: R.salas.largo,
    largoSaida: R.salas.largo,
    poste: R.salas.poste,
    praca: R.salas.praca,
    obras: R.salas.obras,
    patio: R.salas.patio,
  };
  const salas: Sala[] = [...salaNo].map(([no, tipo]) => ({
    tipo,
    centro: nos[no]!,
    h: meiaSala[tipo],
    no,
  }));
  const salaDo = (no: number) => salas.find((s) => s.no === no);
  // Atalho escuro: a célula livre entre dois trechos da rota que ficam a uma célula um do outro
  // (a rota nunca encosta em si mesma); fica o par que mais encurta o caminho.
  let atalho: { k1: number; k2: number; c: Celula } | null = null;
  if (R.atalho.ativo) {
    const noDoPoste = [...salaNo].find(([, t]) => t === 'poste')?.[0] ?? -1;
    const indice = new Map(celulas.map((c, k) => [`${c.i},${c.j}`, k]));
    for (let k1 = 1; k1 < K - 1; k1++) {
      for (const d of DIRECOES) {
        const c = { i: celulas[k1]!.i + d.x, j: celulas[k1]!.j + d.y };
        const k2 = indice.get(`${c.i + d.x},${c.j + d.y}`);
        if (k2 === undefined || k2 < k1 + R.atalho.ganhoMinimo || k2 >= K - 1) continue;
        // Nunca por cima da rua interditada do 1º Poste (ela só abre quando ele cai).
        if (k1 <= noDoPoste && k2 > noDoPoste) continue;
        if (ocupadaGrande.has(`${c.i},${c.j}`)) continue;
        if (!atalho || k2 - k1 > atalho.k2 - atalho.k1) atalho = { k1, k2, c };
      }
    }
    if (atalho) ocupadaGrande.add(`${atalho.c.i},${atalho.c.j}`);
  }

  const ramos: Ramo[] = escolhidos.map(({ k, d, tipo }) => {
    const no = nos[k]!;
    return { no: k, dir: d, tipo, fim: { x: no.x + d.x * S * 0.62, y: no.y + d.y * S * 0.62 } };
  });

  // ------------------------------------------------------------ o caminho (retângulos)
  const pedacos: Pedaco[] = [];
  const vias: Via[] = [];
  const pedaco = (r: Retangulo, borda: Borda, prioridade: number) =>
    pedacos.push({ r, borda, prioridade });
  for (let k = 0; k < K; k++) pedaco(quadrado(nos[k]!, meiaRua + J), 'casas', 1);
  for (let k = 0; k + 1 < K; k++) {
    pedaco(faixaEntre(nos[k]!, nos[k + 1]!, meiaRua + J), 'casas', 1);
    vias.push({
      a: nos[k]!,
      b: nos[k + 1]!,
      pista: R.rua.pista,
      calcada: R.rua.calcada,
      beco: false,
    });
  }
  // Entrada: a rua continua para o sul até a interdição (barreiras atrás do jogador).
  const n0 = nos[0]!;
  const yEntrada = mgN + (celulas[0]!.j + 1) * S - 1;
  pedaco(faixaEntre(n0, { x: n0.x, y: yEntrada + 0.6 }, meiaRua + J), 'casas', 1);
  vias.push({
    a: n0,
    b: { x: n0.x, y: profundidade },
    pista: R.rua.pista,
    calcada: R.rua.calcada,
    beco: false,
  });
  pedaco(
    { x0: n0.x - meiaRua - J, y0: yEntrada + 0.6, x1: n0.x + meiaRua + J, y1: yEntrada + 1 },
    'ponta:barreira',
    3,
  );
  // Saída: a Encruzilhada. Uma rua de ligação corre no alto do largo final e dela sai um ramal
  // para o norte por rota, cada um com o seu portão e o seu arco, até a borda do mundo.
  const nF = nos[K - 1]!;
  const nSaidas = Math.max(1, opcoes.saidas ?? 1);
  const meiaRamal = E.pista / 2 + E.calcada;
  const yLigacao = nF.y - R.salas.largo;
  const ySaida = yLigacao - meiaRamal - E.recuoPortao;
  const xsRamais = (() => {
    const xs = Array.from({ length: nSaidas }, (_, k) => nF.x + (k - (nSaidas - 1) / 2) * E.espaco);
    // Os ramais ficam dentro do mundo (no canto, o leque inteiro se desloca).
    const folga = meiaRamal + J + 1;
    const desvio =
      Math.max(0, folga - xs[0]!) - Math.max(0, xs[xs.length - 1]! - (largura - folga));
    return xs.map((x) => x + desvio);
  })();
  if (xsRamais.some((x) => Math.abs(x - nF.x) > 0.01)) {
    const a = { x: Math.min(xsRamais[0]!, nF.x), y: yLigacao };
    const b = { x: Math.max(xsRamais[nSaidas - 1]!, nF.x), y: yLigacao };
    pedaco(faixaComPontas(a, b, meiaRamal + J), 'casas', 1);
    vias.push({ a, b, pista: E.pista, calcada: E.calcada, beco: false });
  }
  for (const x of xsRamais) {
    pedaco(faixaEntre({ x, y: yLigacao }, { x, y: 0 }, meiaRamal + J), 'casas', 1);
    vias.push({
      a: { x, y: yLigacao },
      b: { x, y: 0 },
      pista: E.pista,
      calcada: E.calcada,
      beco: false,
    });
  }
  // Salas por cima das ruas.
  const bordaDaSala: Record<TipoDeSala, Borda> = {
    largoEntrada: 'casas',
    largoSaida: 'casas',
    poste: 'casas',
    praca: 'casas',
    obras: 'tapume',
    patio: 'cerca',
  };
  for (const s of salas) pedaco(quadrado(s.centro, s.h), bordaDaSala[s.tipo], 2);
  // Becos: rua estreita do nó até a sala do fim (ou até a ponta, no esconderijo).
  const meiaRamo: Record<TipoDeRamo, number> = {
    quintal: R.salas.quintal,
    cemiterio: R.salas.cemiterio,
    mirante: R.salas.mirante,
    segredo: 0,
    poco: R.salas.poco,
    velas: R.salas.velas,
    assombrada: R.salas.assombrada,
  };
  const areaDoRamo = (rm: Ramo): Retangulo => {
    const h = meiaRamo[rm.tipo];
    const extra = rm.tipo === 'cemiterio' ? 1 : 0;
    return {
      x0: rm.fim.x - h - (rm.dir.x !== 0 ? extra : 0),
      y0: rm.fim.y - h - (rm.dir.y !== 0 ? extra : 0),
      x1: rm.fim.x + h + (rm.dir.x !== 0 ? extra : 0),
      y1: rm.fim.y + h + (rm.dir.y !== 0 ? extra : 0),
    };
  };
  for (const rm of ramos) {
    const no = nos[rm.no]!;
    const h = meiaRamo[rm.tipo];
    const fimBeco =
      rm.tipo === 'segredo'
        ? rm.fim
        : { x: rm.fim.x - rm.dir.x * (h - 0.5), y: rm.fim.y - rm.dir.y * (h - 0.5) };
    pedaco(faixaEntre(no, fimBeco, meiaBeco + J), 'casas', 1);
    vias.push({ a: no, b: fimBeco, pista: R.beco.pista, calcada: R.beco.calcada, beco: true });
    if (rm.tipo === 'segredo') {
      const meia = meiaBeco + J;
      const f = rm.fim;
      const e = { x: f.x + rm.dir.x * 0.4, y: f.y + rm.dir.y * 0.4 };
      const tampa =
        rm.dir.x !== 0
          ? { x0: Math.min(f.x, e.x), y0: f.y - meia, x1: Math.max(f.x, e.x), y1: f.y + meia }
          : { x0: f.x - meia, y0: Math.min(f.y, e.y), x1: f.x + meia, y1: Math.max(f.y, e.y) };
      pedaco(tampa, `ponta:${sortearPeso(rng, R.pontas)}`, 3);
    } else
      pedaco(areaDoRamo(rm), rm.tipo === 'mirante' || rm.tipo === 'poco' ? 'sebe' : 'cerca', 2);
  }
  if (atalho) {
    pedaco(faixaEntre(nos[atalho.k1]!, nos[atalho.k2]!, meiaBeco + J), 'casas', 1);
    vias.push({
      a: nos[atalho.k1]!,
      b: nos[atalho.k2]!,
      pista: R.beco.pista,
      calcada: R.beco.calcada,
      beco: true,
      escuro: true,
    });
  }

  // ------------------------------------------------------------ ruas transversais (cenário)
  // A cidade é uma grade de ruas: as que a rota não usa continuam como ruas de verdade (só
  // cenário), com casas viradas para elas, e fecham com uma interdição onde encostam no caminho.
  const chaveCelula = (c: Celula) => `${c.i},${c.j}`;
  const par = (a: Celula, b: Celula) => [chaveCelula(a), chaveCelula(b)].sort().join('|');
  const noDaCelula = new Map(celulas.map((c, k) => [chaveCelula(c), k]));
  const celulasDeRamo = new Set(escolhidos.map((r) => chaveCelula(r.c)));
  const ligadas = new Set(celulas.slice(1).map((c, k) => par(celulas[k]!, c)));
  if (atalho) {
    // O atalho ocupa a célula do meio: nenhuma rua de fora passa por ela.
    celulasDeRamo.add(chaveCelula(atalho.c));
    ligadas.add(par(celulas[atalho.k1]!, atalho.c));
    ligadas.add(par(atalho.c, celulas[atalho.k2]!));
  }
  const ehMorro = new Set<string>();
  for (let i = iMin; i <= iMax; i++)
    for (let j = 0; j < R.linhas; j++)
      if (!ocupadaGrande.has(`${i},${j}`) && rng.proximo() < R.chanceDeMorro)
        ehMorro.add(`${i},${j}`);
  // Segmentos da rota (para medir a distância do cenário até onde o jogador anda).
  const segmentosDaRota: [V2, V2][] = [
    ...nos.slice(1).map((n, k): [V2, V2] => [nos[k]!, n]),
    [n0, { x: n0.x, y: yEntrada }],
    ...xsRamais.map((x): [V2, V2] => [
      { x, y: yLigacao },
      { x, y: 0 },
    ]),
    ...ramos.map((rm): [V2, V2] => [nos[rm.no]!, rm.fim]),
    ...(atalho ? [[nos[atalho.k1]!, nos[atalho.k2]!] as [V2, V2]] : []),
  ];
  const distanciaDaRota = (p: V2) =>
    Math.min(
      ...segmentosDaRota.map(([a, b]) => {
        const comp2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
        const t =
          comp2 < 1e-9
            ? 0
            : Math.max(
                0,
                Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / comp2),
              );
        return Math.hypot(p.x - (a.x + (b.x - a.x) * t), p.y - (a.y + (b.y - a.y) * t));
      }),
    );
  const fora = R.ruaDeFora;
  const meiaFora = fora.pista / 2 + fora.calcada;
  const viasDeFora: Via[] = [];
  const cruzamentosDeFora = new Set<string>();
  for (let i = iMin; i <= iMax; i++) {
    for (let j = 0; j < R.linhas; j++) {
      for (const d of [DIRECOES[1]!, DIRECOES[3]!]) {
        const a = { i, j };
        const b = { i: i + d.x, j: j + d.y };
        if (b.i > iMax || b.j >= R.linhas) continue;
        if (ligadas.has(par(a, b))) continue;
        if ([a, b].some((c) => celulasDeRamo.has(chaveCelula(c)) || ehMorro.has(chaveCelula(c))))
          continue;
        const pa = centro(a);
        const pb = centro(b);
        const meio = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
        if (distanciaDaRota(meio) > R.alcanceDaCamera + S / 2) continue;
        viasDeFora.push({ a: pa, b: pb, pista: fora.pista, calcada: fora.calcada, beco: false });
        // Onde encosta na rota, a rua de fora termina numa interdição.
        for (const [c, p, q] of [
          [a, pa, pb],
          [b, pb, pa],
        ] as const) {
          const k = noDaCelula.get(chaveCelula(c));
          if (k === undefined) {
            cruzamentosDeFora.add(chaveCelula(c));
            continue;
          }
          const h = salaDo(k)?.h ?? meiaRua + J;
          const dir = { x: Math.sign(q.x - p.x), y: Math.sign(q.y - p.y) };
          const ini = { x: p.x + dir.x * h, y: p.y + dir.y * h };
          const fim = { x: p.x + dir.x * (h + 0.4), y: p.y + dir.y * (h + 0.4) };
          const tampa =
            dir.x !== 0
              ? {
                  x0: Math.min(ini.x, fim.x),
                  y0: p.y - meiaFora,
                  x1: Math.max(ini.x, fim.x),
                  y1: p.y + meiaFora,
                }
              : {
                  x0: p.x - meiaFora,
                  y0: Math.min(ini.y, fim.y),
                  x1: p.x + meiaFora,
                  y1: Math.max(ini.y, fim.y),
                };
          pedaco(tampa, `ponta:${sortearPeso(rng, R.juncoes)}`, 3);
        }
      }
    }
  }

  // ------------------------------------------------------------ a grade fina do caminho
  // Os cortes de todos os retângulos formam uma grade: cada célula está dentro ou fora.
  const cortes = (pegar: (r: Retangulo) => number[], limite: number) =>
    [...new Set([0, limite, ...pedacos.flatMap((p) => pegar(p.r)).map(arred)])]
      .filter((v) => v >= 0 && v <= limite)
      .sort((a, b) => a - b);
  const cx = cortes((r) => [r.x0, r.x1], largura);
  const cy = cortes((r) => [r.y0, r.y1], profundidade);
  const nx = cx.length - 1;
  const ny = cy.length - 1;
  const dono = new Int16Array(nx * ny).fill(-1);
  const indiceEm = (cortesEixo: number[], n: number, v: number): number => {
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (cortesEixo[m]! <= v) lo = m;
      else hi = m - 1;
    }
    return lo;
  };
  // Cada pedaço marca as células que cobre; os de prioridade maior por cima.
  const ordenados = pedacos
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.prioridade - b.p.prioridade);
  for (const { p, i: k } of ordenados) {
    const i0 = indiceEm(cx, nx, Math.max(0, arred(p.r.x0)));
    const i1 = indiceEm(cx, nx, Math.min(largura, arred(p.r.x1)) - 1e-6);
    const j0 = indiceEm(cy, ny, Math.max(0, arred(p.r.y0)));
    const j1 = indiceEm(cy, ny, Math.min(profundidade, arred(p.r.y1)) - 1e-6);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) dono[j * nx + i] = k;
  }
  const noCaminho = (p: V2): boolean => {
    if (p.x < 0 || p.y < 0 || p.x >= largura || p.y >= profundidade) return false;
    return dono[indiceEm(cy, ny, p.y) * nx + indiceEm(cx, nx, p.x)]! >= 0;
  };
  /**
   * Distância (tiles) de um ponto até o caminho, numa grade grossa: o cenário só existe até onde a
   * câmera alcança andando pelo caminho; o resto do mundo nunca aparece e não custa nada.
   */
  const distanciaAoCaminho = (() => {
    const passo = 2;
    const borda = cfg.cidade.anel + 2;
    const gx = Math.ceil((largura + 2 * borda) / passo);
    const gy = Math.ceil((profundidade + 2 * borda) / passo);
    const dist = new Float32Array(gx * gy);
    for (let j = 0; j < gy; j++) {
      for (let i = 0; i < gx; i++) {
        const x = -borda + (i + 0.5) * passo;
        const y = -borda + (j + 0.5) * passo;
        let d = Infinity;
        for (const p of pedacos) {
          const dx = Math.max(p.r.x0 - x, 0, x - p.r.x1);
          const dy = Math.max(p.r.y0 - y, 0, y - p.r.y1);
          d = Math.min(d, Math.hypot(dx, dy));
        }
        dist[j * gx + i] = d;
      }
    }
    return (x: number, y: number): number => {
      const i = Math.floor((x + borda) / passo);
      const j = Math.floor((y + borda) / passo);
      if (i < 0 || j < 0 || i >= gx || j >= gy) return Infinity;
      return dist[j * gx + i]!;
    };
  })();
  /** O retângulo encosta em algum pedaço do caminho. */
  const tocaCaminho = (r: Retangulo): boolean => pedacos.some((p) => cruzam(p.r, r, -0.02));

  // Fora do caminho: retângulos de bloqueio, juntando as células por linha e depois por coluna.
  const bloqueado: Retangulo[] = [];
  {
    let abertos = new Map<string, Retangulo>();
    for (let j = 0; j < ny; j++) {
      const proximos = new Map<string, Retangulo>();
      for (let i = 0; i < nx;) {
        if (dono[j * nx + i]! >= 0) {
          i++;
          continue;
        }
        let f = i;
        while (f < nx && dono[j * nx + f]! < 0) f++;
        const k = `${i},${f}`;
        const r = abertos.get(k);
        if (r) {
          r.y1 = cy[j + 1]!;
          proximos.set(k, r);
          abertos.delete(k);
        } else proximos.set(k, { x0: cx[i]!, y0: cy[j]!, x1: cx[f]!, y1: cy[j + 1]! });
        i = f;
      }
      bloqueado.push(...abertos.values());
      abertos = proximos;
    }
    bloqueado.push(...abertos.values());
  }

  // Trechos da borda do caminho, com o tipo de borda do pedaço de dentro.
  const trechos: TrechoDeBorda[] = [];
  {
    type Seg = { a0: number; a1: number; dentro: 1 | -1; borda: Borda };
    const juntar = (eixo: 'x' | 'y', p: number, lista: Seg[]) => {
      let atual: TrechoDeBorda | null = null;
      for (const s of lista) {
        if (atual && atual.a1 === s.a0 && atual.dentro === s.dentro && atual.borda === s.borda)
          atual.a1 = s.a1;
        else {
          if (atual) trechos.push(atual);
          atual = { eixo, p, ...s };
        }
      }
      if (atual) trechos.push(atual);
    };
    const borda = (k: number) => pedacos[k]!.borda;
    for (let j = 0; j <= ny; j++) {
      const lista: Seg[] = [];
      for (let i = 0; i < nx; i++) {
        const cima = j > 0 ? dono[(j - 1) * nx + i]! : -1;
        const baixo = j < ny ? dono[j * nx + i]! : -1;
        if (cima >= 0 === baixo >= 0) continue;
        const k = baixo >= 0 ? baixo : cima;
        lista.push({ a0: cx[i]!, a1: cx[i + 1]!, dentro: baixo >= 0 ? 1 : -1, borda: borda(k) });
      }
      juntar('x', cy[j]!, lista);
    }
    for (let i = 0; i <= nx; i++) {
      const lista: Seg[] = [];
      for (let j = 0; j < ny; j++) {
        const esq = i > 0 ? dono[j * nx + i - 1]! : -1;
        const dir = i < nx ? dono[j * nx + i]! : -1;
        if (esq >= 0 === dir >= 0) continue;
        const k = dir >= 0 ? dir : esq;
        lista.push({ a0: cy[j]!, a1: cy[j + 1]!, dentro: dir >= 0 ? 1 : -1, borda: borda(k) });
      }
      juntar('y', cx[i]!, lista);
    }
  }

  // ------------------------------------------------------------ saída
  const objetos: ObjetoRua[] = [];
  const cenario: ObjetoRua[] = [];
  const piso: Piso[] = [];
  const luzes: FonteDeLuzRua[] = [];
  const ocupados = new Reservas();
  const add = (o: ObjetoRua): number => {
    objetos.push({ ...o, x: arred(o.x), y: arred(o.y) } as ObjetoRua);
    return objetos.length - 1;
  };
  const enfeite = (o: ObjetoRua): void => {
    cenario.push({ ...o, x: arred(o.x), y: arred(o.y) } as ObjetoRua);
  };
  const chao = (tipo: Piso['tipo'], x0: number, y0: number, x1: number, y1: number) =>
    piso.push({
      tipo,
      x0: Math.min(x0, x1),
      y0: Math.min(y0, y1),
      x1: Math.max(x0, x1),
      y1: Math.max(y0, y1),
    });
  const chaoR = (tipo: Piso['tipo'], r: Retangulo) => chao(tipo, r.x0, r.y0, r.x1, r.y1);
  const pegada = (modelo: NomeModelo, x: number, y: number, rot: Rotacao): Retangulo => {
    const { largura: w, profundidade: d } = modelos[modelo].pegada;
    return posicionador(w, d, x, y, rot).pegada;
  };
  const reservar = (r: Retangulo) => ocupados.add(r);
  const reservarEm = (p: V2, h: number) => reservar(quadrado(p, h));
  /** Põe um objeto dentro do caminho, se a pegada não encostar em nada já reservado. */
  const tentar = (o: ObjetoRua, folga = FOLGA_DE_OBJETO): number | null => {
    const p = pegada(o.modelo, o.x, o.y, o.rot);
    if (p.x0 < 0 || p.y0 < 0 || p.x1 > largura || p.y1 > profundidade) return null;
    if (ocupados.some(p, folga)) return null;
    if (!noCaminho({ x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2 })) return null;
    reservar(p);
    return add(o);
  };
  /** Objeto com a pegada (já girada) centrada no ponto. */
  const noPonto = (modelo: NomeModelo, x: number, y: number, rot: Rotacao = 0): ObjetoRua => {
    const r = pegada(modelo, 0, 0, rot);
    return { modelo, x: x - (r.x1 - r.x0) / 2, y: y - (r.y1 - r.y0) / 2, rot } as ObjetoRua;
  };
  const posteEm = (p: V2, folga = 0.1): number | null =>
    tentar({ ...noPonto('poste', p.x, p.y), estado: 'amigo' } as ObjetoRua, folga);
  const luzDoPoste = (p: V2, i: number) =>
    luzes.push({ tipo: 'poste', x: p.x, y: p.y, raio: luz.poste.raio, objeto: i });
  const posteAceso = (p: V2, folga = 0.1) => {
    if (opcoes.semLuz) return;
    const i = posteEm(p, folga);
    if (i !== null) luzDoPoste(p, i);
  };
  const segredosPossiveis: { tipo: string; p: V2 }[] = [];
  const quintais: Quintal[] = [];
  const portoes: PortaoDeQuintal[] = [];
  const zonas: ZonaNomeada[] = [];
  const bueiros: V2[] = [];
  const bueirosFlanco: V2[] = [];
  const usados = new Set<string>();
  const nome = (lista: readonly string[]): string => {
    const livres = lista.filter((n) => !usados.has(n));
    const n = rng.escolher(livres.length > 0 ? livres : lista);
    usados.add(n);
    return n;
  };
  const N = cfg.nomes;
  const ladoDe = (p: V2): 'oeste' | 'leste' => (p.x < largura / 2 ? 'oeste' : 'leste');

  // O jogador começa um pouco antes da interdição; nada fica em cima dele.
  const entrada = { x: n0.x, y: yEntrada - 3.5 };
  reservarEm(entrada, 1.3);

  // ------------------------------------------------------------ chão: grama, calçadas, pistas
  chao('grama', 0, 0, largura, profundidade);
  for (const v of viasDeFora) chaoR('calcada', faixaEntre(v.a, v.b, meiaFora));
  for (const c of cruzamentosDeFora) {
    const [i, j] = c.split(',').map(Number) as [number, number];
    chaoR('calcada', quadrado(centro({ i, j }), meiaFora));
  }
  for (const v of viasDeFora) chaoR('asfalto', faixaEntre(v.a, v.b, fora.pista / 2));
  for (const c of cruzamentosDeFora) {
    const [i, j] = c.split(',').map(Number) as [number, number];
    chaoR('asfalto', quadrado(centro({ i, j }), fora.pista / 2));
  }
  for (const v of vias) chaoR('calcada', faixaEntre(v.a, v.b, v.pista / 2 + v.calcada));
  for (let k = 0; k < K; k++) chaoR('calcada', quadrado(nos[k]!, meiaRua));
  for (const v of vias) chaoR('asfalto', faixaEntre(v.a, v.b, v.pista / 2));
  for (let k = 0; k < K; k++) chaoR('asfalto', quadrado(nos[k]!, R.rua.pista / 2));

  // ------------------------------------------------------------ Postes Corrompidos e bueiros
  const zonaDoPoste2 = rng.escolher(cfg.postesCorrompidos.segundoEm);
  const salaPoste = salas.find((s) => s.tipo === 'poste')!;
  const p1 = {
    x: salaPoste.centro.x - cfg.postesCorrompidos.afastamentoDoMeio,
    y: salaPoste.centro.y,
  };
  reservarEm(p1, 0.9);
  const salaPatio = salas.find((s) => s.tipo === 'patio')!;
  const p2 = { ...salaPatio.centro };
  reservarEm(p2, 1.1);
  // Bueiros: no meio de cada rua da rota (as ondas saem dos mais perto do jogador).
  for (let k = 1; k + 1 < K; k++) {
    const a = nos[k]!;
    const b = nos[k + 1]!;
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const s = rng.proximo() < 0.5 ? -1.4 : 1.4;
    bueiros.push(a.x === b.x ? { x: m.x + s, y: m.y } : { x: m.x, y: m.y + s });
  }
  // Dois bueiros no largo da saída, um de cada lado da pista.
  const salaSaida = salaDo(K - 1)!;
  for (const s of [-1, 1])
    bueiros.push({ x: nF.x + s * cfg.bueiros.afastamentoDoMeio, y: salaSaida.centro.y - 2 });
  for (const b of bueiros) {
    add(noPonto('bueiro', b.x, b.y));
    reservarEm(b, 0.8);
  }

  // ------------------------------------------------------------ salas
  const portico = (x: number, y: number) =>
    enfeite({ modelo: 'portico', x: x - meiaRua - 0.2, y, rot: 90 } as ObjetoRua);
  let praca: V2 | null = null;
  for (const s of salas) {
    const c = s.centro;
    const r = quadrado(c, s.h);
    switch (s.tipo) {
      case 'largoEntrada': {
        chaoR('praca', r);
        zonas.push({ nome: N.largos[0]!, tipo: 'largo', area: r });
        tentar({ modelo: 'ponto_onibus', x: r.x0 + 0.6, y: c.y - 1.2, rot: 0 }, 0.1);
        tentar(noPonto('orelhao', r.x1 - 1.2, c.y - 3, 180), 0.1);
        tentar(noPonto('banco', r.x1 - 1.2, c.y + 2, 180), 0.1);
        tentar(noPonto('banca', r.x1 - 1.3, c.y + 3.9, 180), 0.1);
        posteAceso({ x: r.x0 + 1, y: r.y1 - 1 });
        posteAceso({ x: r.x1 - 1, y: r.y0 + 1 });
        portico(n0.x, yEntrada + 1.6);
        break;
      }
      case 'largoSaida': {
        chaoR('praca', r);
        zonas.push({ nome: N.largos[1]!, tipo: 'largo', area: r });
        tentar(noPonto('banco', r.x0 + 1.2, c.y + 1.5, 0), 0.1);
        tentar(noPonto('carrinho_de_rua', r.x1 - 1.3, c.y - 2.4, 180), 0.1);
        tentar(noPonto('pracinha', r.x0 + 1.3, c.y - 2.4, 0), 0.1);
        // A placa da Encruzilhada no meio, de frente para quem chega.
        tentar(noPonto('placa_rua', c.x, r.y0 + 1.6), 0.1);
        posteAceso({ x: r.x0 + 1, y: r.y1 - 1 });
        posteAceso({ x: r.x1 - 1, y: r.y1 - 1 });
        break;
      }
      case 'poste': {
        chaoR('calcada', r);
        chaoR('asfalto', quadrado(c, s.h - 1.4));
        zonas.push({ nome: 'Cruzamento do Poste', tipo: 'cruzamento', area: r });
        // Carros parados em volta do Poste: a primeira luta com cobertura.
        const vagas: [number, number, Rotacao][] = [
          [-5.4, -4.6, 0],
          [3, 3.4, 180],
          [3.8, -6, 90],
          [-6.4, 2.6, 270],
        ];
        for (const [dx, dy, rot] of vagas)
          tentar(
            {
              modelo: 'carro',
              variante: sortearPeso(rng, cfg.carros.variantes),
              x: c.x + dx,
              y: c.y + dy,
              rot,
            } as ObjetoRua,
            0.2,
          );
        posteAceso({ x: r.x0 + 0.9, y: r.y0 + 0.9 });
        posteAceso({ x: r.x1 - 0.9, y: r.y1 - 0.9 });
        // Faixas de pedestres nas quatro bocas.
        for (const d of DIRECOES) {
          const m = { x: c.x + d.x * (s.h - 2.2), y: c.y + d.y * (s.h - 2.2) };
          for (let t = -2.6; t < 2.6; t += 0.75) {
            if (d.x === 0) chao('faixa', m.x + t, m.y - 0.45, m.x + t + 0.4, m.y + 0.45);
            else chao('faixa', m.x - 0.45, m.y + t, m.x + 0.45, m.y + t + 0.4);
          }
        }
        break;
      }
      case 'praca': {
        chaoR('praca', r);
        praca = { ...c };
        zonas.push({ nome: nome(N.pracas), tipo: 'praca', area: r });
        const canteiro = 2.4;
        for (const [ax, ay] of [
          [r.x0 + 0.8, r.y0 + 0.8],
          [r.x1 - 0.8 - canteiro, r.y0 + 0.8],
          [r.x0 + 0.8, r.y1 - 0.8 - canteiro],
          [r.x1 - 0.8 - canteiro, r.y1 - 0.8 - canteiro],
        ] as const) {
          chao('grama', ax, ay, ax + canteiro, ay + canteiro);
          tentar(
            noPonto(sortearPeso(rng, bairro.arvores), ax + canteiro / 2, ay + canteiro / 2),
            0,
          );
        }
        const meio = sortearPeso(rng, cfg.praca.centro);
        if (meio === 'chafariz') tentar({ modelo: 'chafariz', x: c.x - 1.5, y: c.y - 1.5, rot: 0 });
        else if (meio === 'coreto') {
          const i = tentar({
            modelo: 'coreto',
            x: c.x - 1.8,
            y: c.y - 1.8,
            rot: 0,
            ...(opcoes.semLuz ? { apagada: true } : {}),
          } as ObjetoRua);
          // A lâmpada do coreto fica escondida sob o telhado: sem poça de luz (a praça tem postes).
          void i;
        } else {
          chao('terra', c.x - 2.8, c.y - 1.8, c.x + 2.8, c.y + 1.8);
          tentar({ modelo: 'balanco', x: c.x - 2.4, y: c.y - 1.1, rot: 0 });
          tentar({ modelo: 'escorregador', x: c.x + 0.6, y: c.y - 1.3, rot: 0 });
        }
        tentar({ modelo: 'banco', x: c.x - 4.6, y: c.y - 0.7, rot: 0 });
        tentar({ modelo: 'banco', x: c.x + 3.6, y: c.y - 0.7, rot: 180 });
        tentar({ modelo: 'floreira', x: c.x - 0.6, y: r.y0 + 0.5, rot: 0 });
        tentar({ modelo: 'floreira', x: c.x - 0.6, y: r.y1 - 1.1, rot: 0 });
        tentar(noPonto('pracinha', c.x - 3.4, c.y + 2.9, 0), 0.1);
        tentar(noPonto('carrinho_de_rua', c.x + 3.4, c.y + 2.9, 180), 0.1);
        tentar(noPonto('lixeira', c.x + 3.4, r.y0 + 1.4));
        for (let k = 0; k < cfg.praca.postes; k++)
          posteAceso(
            k % 2 === 0 ? { x: r.x0 + 3.6, y: r.y1 - 3.6 } : { x: r.x1 - 3.6, y: r.y0 + 3.6 },
          );
        break;
      }
      case 'obras': {
        chaoR('terra', r);
        zonas.push({ nome: nome(N.obras), tipo: 'obras', area: r });
        const bf = { x: c.x + rng.entre(-2, 2), y: c.y + rng.entre(-2, 2) };
        bueirosFlanco.push(bf);
        add(noPonto('bueiro', bf.x, bf.y));
        reservarEm(bf, 1.3);
        // A rota atravessa a obra: o corredor entre as bocas fica livre.
        for (const d of DIRECOES)
          reservar(faixaEntre(c, { x: c.x + d.x * s.h, y: c.y + d.y * s.h }, 1.4));
        const cantos = embaralhar(rng, [
          { x: r.x0 + 1.3, y: r.y0 + 1.3 },
          { x: r.x1 - 1.3, y: r.y0 + 1.3 },
          { x: r.x0 + 1.3, y: r.y1 - 1.3 },
          { x: r.x1 - 1.3, y: r.y1 - 1.3 },
        ]);
        segredosPossiveis.push({ tipo: 'obras', p: cantos[0]! });
        reservarEm(cantos[0]!, 0.9);
        const gp = pegada('galpao', 0, 0, 0);
        const g0 = cantos[1]!;
        tentar(
          {
            modelo: 'galpao',
            x: g0.x < c.x ? r.x0 + 0.4 : r.x1 - 0.4 - (gp.x1 - gp.x0),
            y: g0.y < c.y ? r.y0 + 0.4 : r.y1 - 0.4 - (gp.y1 - gp.y0),
            rot: g0.x < c.x ? 0 : 180,
          },
          0.1,
        );
        const solto = (modelo: NomeModelo, extra: Partial<ObjetoRua> = {}) => {
          for (let t = 0; t < 10; t++) {
            const o = {
              ...noPonto(
                modelo,
                rng.entre(r.x0 + 1.5, r.x1 - 1.5),
                rng.entre(r.y0 + 1.5, r.y1 - 1.5),
              ),
              ...extra,
            } as ObjetoRua;
            if (tentar(o, 0.7) !== null) return;
          }
        };
        solto('buraco');
        solto('cacamba');
        solto('cacamba');
        for (let k = 0; k < 6; k++)
          solto('pedra', {
            variante: rng.proximo() < 0.5 ? 'grande' : 'pequena',
          } as Partial<ObjetoRua>);
        solto('cavalete');
        solto('cavalete');
        for (let k = 0; k < 4; k++)
          enfeite(noPonto('cone', rng.entre(r.x0 + 1, r.x1 - 1), rng.entre(r.y0 + 1, r.y1 - 1)));
        break;
      }
      case 'patio': {
        if (zonaDoPoste2 === 'escola') {
          chaoR('praca', r);
          zonas.push({ nome: nome(N.escolas), tipo: 'escola', area: r });
          // O prédio encosta num lado sem rua, de frente para o pátio; a quadra fica no meio.
          const lados = embaralhar(rng, [...DIRECOES]).filter(
            (d) => !noCaminho({ x: c.x + d.x * (s.h + 1), y: c.y + d.y * (s.h + 1) }),
          );
          const d = lados[0] ?? DIRECOES[0]!;
          const rot: Rotacao = d.x === 1 ? 180 : d.x === -1 ? 0 : d.y === 1 ? 270 : 90;
          const pg = pegada('escola', 0, 0, rot);
          const W = pg.x1 - pg.x0;
          const D = pg.y1 - pg.y0;
          const ex = d.x === 1 ? r.x1 - W - 0.2 : d.x === -1 ? r.x0 + 0.2 : c.x - W / 2;
          const ey = d.y === 1 ? r.y1 - D - 0.2 : d.y === -1 ? r.y0 + 0.2 : c.y - D / 2;
          const i = add({ modelo: 'escola', x: ex, y: ey, rot });
          reservar(pegada('escola', ex, ey, rot));
          if (!opcoes.semLuz) luzes.push(...luzesDasJanelas(objetos[i]!, i, modelos, luz));
          const [lw, lh] = d.y !== 0 ? [9, 7] : [7, 9];
          const linha = 0.06;
          chao('faixa', c.x - lw / 2, c.y - lh / 2, c.x + lw / 2, c.y - lh / 2 + linha);
          chao('faixa', c.x - lw / 2, c.y + lh / 2 - linha, c.x + lw / 2, c.y + lh / 2);
          chao('faixa', c.x - lw / 2, c.y - lh / 2, c.x - lw / 2 + linha, c.y + lh / 2);
          chao('faixa', c.x + lw / 2 - linha, c.y - lh / 2, c.x + lw / 2, c.y + lh / 2);
          for (const sx of [-1, 1]) {
            tentar(
              noPonto(sortearPeso(rng, bairro.arvores), c.x + sx * (lw / 2 + 1), c.y - lh / 2 + 1),
              0.3,
            );
            tentar(noPonto('banco', c.x + sx * (lw / 2 + 1), c.y + 2, sx === 1 ? 180 : 0), 0.3);
          }
          const canto = {
            x: d.x === -1 ? r.x1 - 1.2 : r.x0 + 1.2,
            y: d.y === -1 ? r.y1 - 1.2 : r.y0 + 1.2,
          };
          reservarEm(canto, 0.8);
          segredosPossiveis.push({ tipo: 'escola', p: canto });
          posteAceso({
            x: canto.x < c.x ? r.x1 - 1 : r.x0 + 1,
            y: canto.y < c.y ? r.y1 - 1 : r.y0 + 1,
          });
        } else {
          chaoR('asfalto', r);
          zonas.push({ nome: nome(N.estacionamentos), tipo: 'estacionamento', area: r });
          // Vagas em duas fileiras dos dois lados do corredor do meio.
          const aoLongoDeX = rng.proximo() < 0.5;
          // Cada vaga do tamanho do carro (content/modelos.json), com o fundo sempre no mesmo lugar.
          const { largura: compVaga, profundidade: largVaga } = modelos.carro.pegada;
          const meia = compVaga / 2;
          for (const lado of [-1, 1]) {
            for (let t = -s.h + 1; t < s.h - 1.6; t += largVaga + VAO_ENTRE_VAGAS) {
              const base = lado * (FUNDO_DAS_VAGAS - meia);
              const o = aoLongoDeX
                ? { x: c.x + t, y: c.y + base - meia, rot: (lado === 1 ? 90 : 270) as Rotacao }
                : { x: c.x + base - meia, y: c.y + t, rot: (lado === 1 ? 0 : 180) as Rotacao };
              if (aoLongoDeX)
                chao('faixa', o.x - 0.18, c.y + base - meia, o.x - 0.12, c.y + base + meia);
              else chao('faixa', c.x + base - meia, o.y - 0.18, c.x + base + meia, o.y - 0.12);
              if (rng.proximo() < 0.6)
                tentar(
                  {
                    modelo: 'carro',
                    variante: sortearPeso(rng, cfg.carros.variantes),
                    ...o,
                  } as ObjetoRua,
                  0.05,
                );
            }
          }
          const canto = { x: r.x0 + 1.1, y: r.y1 - 1.1 };
          reservarEm(canto, 0.8);
          segredosPossiveis.push({ tipo: 'estacionamento', p: canto });
          posteAceso({ x: r.x1 - 1, y: r.y0 + 1 });
          tentar({ modelo: 'galpao', x: r.x1 - 5.4, y: r.y1 - 4.6, rot: 180 }, 0.1);
        }
        break;
      }
    }
  }

  // Rua interditada depois do 1º Poste: só abre quando ele cai.
  const bloqueios: Bloqueio[] = [];
  {
    const k = salaPoste.no;
    const a = nos[k]!;
    const b = nos[k + 1]!;
    const d = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
    const p = { x: a.x + d.x * (salaPoste.h + 1.2), y: a.y + d.y * (salaPoste.h + 1.2) };
    const meia = meiaRua + J;
    const area =
      d.x !== 0
        ? { x0: p.x - 0.3, y0: p.y - meia, x1: p.x + 0.3, y1: p.y + meia }
        : { x0: p.x - meia, y0: p.y - 0.3, x1: p.x + meia, y1: p.y + 0.3 };
    const grupo = 'bloqueio:0';
    bloqueios.push({ grupo, area, postes: 1 });
    for (let t = -meia + 0.6; t < meia - 0.3; t += 1.3) {
      const q = d.x !== 0 ? { x: p.x, y: p.y + t } : { x: p.x + t, y: p.y };
      add({ ...noPonto('cavalete', q.x, q.y, d.x !== 0 ? 90 : 0), grupo });
    }
    const rotPlaca: Rotacao = d.x === 1 ? 180 : d.x === -1 ? 0 : d.y === 1 ? 270 : 90;
    const placa = {
      x: p.x - d.x * 1.2 + (d.y !== 0 ? 1.2 : 0),
      y: p.y - d.y * 1.2 + (d.x !== 0 ? 1.2 : 0),
    };
    add({ ...noPonto('placa_obra', placa.x, placa.y, rotPlaca), grupo });
    reservar({ x0: area.x0 - 1.6, y0: area.y0 - 1.6, x1: area.x1 + 1.6, y1: area.y1 + 1.6 });
  }

  // Portão de cada ramal: pilares nas pontas da pista, a grade atravessando e sebe nas calçadas;
  // o arco com lanternas logo antes, do lado do largo.
  const ruaX: [number, number] = [nF.x - E.pista / 2, nF.x + E.pista / 2];
  const grades: Retangulo[] = [];
  const saidasDasRotas: Retangulo[] = [];
  for (const x of xsRamais) {
    const p0 = x - E.pista / 2;
    const p1 = x + E.pista / 2;
    add({ modelo: 'pilar', x: p0 - 0.5, y: ySaida - 0.5, rot: 0 });
    add({ modelo: 'pilar', x: p1 - 0.5, y: ySaida - 0.5, rot: 0 });
    for (let gx = p0; gx < p1 - 1e-6; gx += 1)
      add({ modelo: 'grade', x: Math.min(gx, p1 - 1), y: ySaida - 0.15, rot: 90, grupo: 'portao' });
    for (const [x0, x1] of [
      [x - meiaRamal - J, p0 - 0.5],
      [p1 + 0.5, x + meiaRamal + J],
    ] as const)
      for (let cx = x0; cx < x1 - 1e-6; cx += 1)
        add({ modelo: 'cerca_viva', x: Math.min(cx, x1 - 1), y: ySaida - 0.25, rot: 0 });
    const g = {
      x0: x - meiaRamal - J,
      y0: ySaida - 0.15,
      x1: x + meiaRamal + J,
      y1: ySaida + 0.15,
    };
    grades.push(g);
    saidasDasRotas.push({ x0: p0, y0: 0, x1: p1, y1: ySaida - E.alemDoPortao });
    const arcoPg = pegada('arco', 0, 0, 90);
    const ax = x - (arcoPg.x1 - arcoPg.x0) / 2;
    const ay = ySaida + 1.4;
    add({ modelo: 'arco', x: ax, y: ay, rot: 90 });
    reservar({ x0: g.x0, y0: 0, x1: g.x1, y1: ay + (arcoPg.y1 - arcoPg.y0) + 0.4 });
  }
  const grade = grades[0]!;

  // ------------------------------------------------------------ becos e salas do fim deles
  let mirantePonto: PontoDeExploracao | null = null;
  const fins: FimDeBecoGerado[] = [];
  /** Rotação de quem fica no fundo da sala olhando de volta para o beco. */
  const rotDeVolta = (d: V2): Rotacao => (d.x === 1 ? 180 : d.x === -1 ? 0 : d.y === 1 ? 270 : 90);
  /**
   * Fins de beco com desafio, cada um com um chamariz que se vê da rota: o poço tem um poste aceso
   * ao lado, as velas têm abóboras acesas na entrada e a casa assombrada, as janelas acesas.
   */
  const fimDeBeco = (
    rm: Ramo,
    tipo: FimDeBeco,
    area: Retangulo,
    boca: V2,
    fundo: V2,
    lateral: V2,
    h: number,
  ): FimDeBecoGerado => {
    const c = rm.fim;
    const objetosDoFim: number[] = [];
    reservar(faixaEntre(boca, c, 1.2));
    if (tipo === 'poco') {
      chaoR('praca', area);
      zonas.push({ nome: 'Poço dos Desejos', tipo: 'quintal', area });
      objetosDoFim.push(add(noPonto('poco', c.x, c.y)));
      reservarEm(c, 1.1);
      posteAceso({ x: fundo.x + lateral.x * 2.4, y: fundo.y + lateral.y * 2.4 });
      tentar(noPonto('banco', fundo.x - lateral.x * 2.4, fundo.y - lateral.y * 2.4, 0), 0.1);
    } else if (tipo === 'velas') {
      chaoR('terra', area);
      zonas.push({ nome: 'Quintal das Velas', tipo: 'quintal', area });
      // Três velas em triângulo, a ponta voltada para o fundo.
      for (let k = 0; k < 3; k++) {
        const ang = (k / 3) * Math.PI * 2;
        const u = Math.cos(ang) * 2.6;
        const v = Math.sin(ang) * 2.6;
        const q = {
          x: c.x + rm.dir.x * u + lateral.x * v,
          y: c.y + rm.dir.y * u + lateral.y * v,
        };
        objetosDoFim.push(add({ ...noPonto('vela', q.x, q.y), apagada: true } as ObjetoRua));
        reservarEm(q, 0.6);
      }
      const entrada = { x: c.x - rm.dir.x * (h - 1), y: c.y - rm.dir.y * (h - 1) };
      for (const s of [-1, 1])
        enfeite(
          noPonto(
            'abobora_decor',
            entrada.x + lateral.x * s * 1.8,
            entrada.y + lateral.y * s * 1.8,
            rotDeVolta(rm.dir),
          ),
        );
      tentar(
        noPonto('arvore_seca', fundo.x + lateral.x * (h - 1.5), fundo.y + lateral.y * (h - 1.5)),
        0.3,
      );
    } else {
      chaoR('terra', area);
      zonas.push({ nome: 'Casa Assombrada', tipo: 'quintal', area });
      // A casa no fundo, de frente para o beco; as janelas acesas chamam de longe.
      const rot = rotDeVolta(rm.dir);
      const pg = pegada('sobrado', 0, 0, rot);
      const w = pg.x1 - pg.x0;
      const d = pg.y1 - pg.y0;
      const ix = rm.dir.x === 1 ? area.x1 - w - 0.3 : rm.dir.x === -1 ? area.x0 + 0.3 : c.x - w / 2;
      const iy = rm.dir.y === 1 ? area.y1 - d - 0.3 : rm.dir.y === -1 ? area.y0 + 0.3 : c.y - d / 2;
      const ri = { x0: ix, y0: iy, x1: ix + w, y1: iy + d };
      if (!ocupados.some(ri, 0)) {
        add({ modelo: 'sobrado', x: ix, y: iy, rot });
        reservar(ri);
      }
      reservarEm(c, 0.9);
      for (const s of [-1, 1]) {
        const q = { x: c.x + lateral.x * s * (h - 1.6), y: c.y + lateral.y * s * (h - 1.6) };
        tentar(noPonto(s === 1 ? 'arvore_seca' : 'lapide', q.x, q.y, rot), 0.3);
      }
    }
    return { tipo, centro: { ...c }, area, objetos: objetosDoFim };
  };
  for (const rm of ramos) {
    const h = meiaRamo[rm.tipo];
    const no = nos[rm.no]!;
    const boca = {
      x: no.x + rm.dir.x * (meiaRua + J + 1),
      y: no.y + rm.dir.y * (meiaRua + J + 1),
    };
    zonas.push({
      nome: nome(N.becos),
      tipo: 'beco',
      area: faixaComPontas(no, rm.fim, meiaBeco + J),
    });
    if (rm.tipo === 'segredo') {
      // Longe do fecho da ponta (buraco, morro ou barreira ocupam os últimos tiles).
      const p = { x: rm.fim.x - rm.dir.x * 5.5, y: rm.fim.y - rm.dir.y * 5.5 };
      segredosPossiveis.push({ tipo: 'beco', p });
      reservarEm(p, 0.9);
      continue;
    }
    const area = areaDoRamo(rm);
    const fundo = { x: rm.fim.x + rm.dir.x * (h - 1.2), y: rm.fim.y + rm.dir.y * (h - 1.2) };
    const lateral = { x: rm.dir.y, y: rm.dir.x };
    if (rm.tipo === 'mirante') {
      chaoR('praca', area);
      zonas.push({ nome: "Caixa-d'água do Morro", tipo: 'mirante', area });
      const i = add(noPonto('caixa_dagua', rm.fim.x, rm.fim.y));
      reservarEm(rm.fim, 1.5);
      const ponto = { x: rm.fim.x - rm.dir.x * 2, y: rm.fim.y - rm.dir.y * 2 };
      mirantePonto = { x: ponto.x, y: ponto.y, objeto: i };
      reservarEm(ponto, 0.7);
      tentar(
        noPonto(
          'banco',
          fundo.x + lateral.x * 2.5,
          fundo.y + lateral.y * 2.5,
          rm.dir.x === 1 ? 180 : 0,
        ),
        0.1,
      );
      const canto = { x: fundo.x - lateral.x * 3, y: fundo.y - lateral.y * 3 };
      segredosPossiveis.push({ tipo: 'mirante', p: canto });
      reservarEm(canto, 0.8);
      continue;
    }
    if (rm.tipo === 'poco' || rm.tipo === 'velas' || rm.tipo === 'assombrada') {
      fins.push(fimDeBeco(rm, rm.tipo, area, boca, fundo, lateral, h));
      continue;
    }
    // Quintal grande ou cemitério: selvagem no meio e baú no fundo.
    zonas.push({
      nome: rm.tipo === 'cemiterio' ? nome(N.cemiterios) : 'Quintal',
      tipo: rm.tipo === 'cemiterio' ? 'cemiterio' : 'quintal',
      area,
    });
    const bau = { x: fundo.x + lateral.x * (h - 2), y: fundo.y + lateral.y * (h - 2) };
    reservarEm(bau, 0.8);
    const canto = { x: fundo.x - lateral.x * (h - 1.6), y: fundo.y - lateral.y * (h - 1.6) };
    reservarEm(canto, 0.8);
    segredosPossiveis.push({ tipo: rm.tipo, p: canto });
    reservar(faixaEntre(boca, rm.fim, 1.2));
    quintais.push({ area, boca, selvagem: { ...rm.fim }, bau, lado: ladoDe(rm.fim) });
    {
      // Portão de madeira atravessando o beco, logo depois da boca: o quintal é recompensa.
      const pg = { x: boca.x + rm.dir.x * 1.5, y: boca.y + rm.dir.y * 1.5 };
      const meiaP = meiaBeco + J;
      const grupo = `portaoQuintal:${quintais.length - 1}`;
      portoes.push({
        grupo,
        area:
          rm.dir.x !== 0
            ? { x0: pg.x - 0.15, y0: pg.y - meiaP, x1: pg.x + 0.15, y1: pg.y + meiaP }
            : { x0: pg.x - meiaP, y0: pg.y - 0.15, x1: pg.x + meiaP, y1: pg.y + 0.15 },
      });
      for (let t = -meiaP + 0.5; t < meiaP - 0.2; t += 1) {
        const q = rm.dir.x !== 0 ? { x: pg.x, y: pg.y + t } : { x: pg.x + t, y: pg.y };
        add({ ...noPonto('cerca', q.x, q.y, rm.dir.x !== 0 ? 90 : 0), grupo });
      }
    }
    if (rm.tipo === 'cemiterio') {
      // A capela no fundo, de frente para o beco, e as covas em fileiras dos dois lados.
      const rot: Rotacao = rm.dir.x === 1 ? 180 : rm.dir.x === -1 ? 0 : rm.dir.y === 1 ? 270 : 90;
      const pg = pegada('igreja', 0, 0, rot);
      const w = pg.x1 - pg.x0;
      const d = pg.y1 - pg.y0;
      const ix =
        rm.dir.x === 1 ? area.x1 - w - 0.3 : rm.dir.x === -1 ? area.x0 + 0.3 : rm.fim.x - w / 2;
      const iy =
        rm.dir.y === 1 ? area.y1 - d - 0.3 : rm.dir.y === -1 ? area.y0 + 0.3 : rm.fim.y - d / 2;
      const ri = { x0: ix, y0: iy, x1: ix + w, y1: iy + d };
      if (!ocupados.some(ri, 0)) {
        add({ modelo: 'igreja', x: ix, y: iy, rot });
        reservar(ri);
      }
      for (let u = -h + 0.8; u < h - 0.8; u += 1.3) {
        for (let v = -h - 0.2; v < h; v += 1.4) {
          if (Math.abs(u) < 1.6) continue;
          const q = {
            x: rm.fim.x + lateral.x * u + rm.dir.x * v,
            y: rm.fim.y + lateral.y * u + rm.dir.y * v,
          };
          const r1 = { x0: q.x - 0.4, y0: q.y - 0.4, x1: q.x + 0.4, y1: q.y + 0.4 };
          if (!dentroDe(q, area) || ocupados.some(r1, 0)) continue;
          enfeite({ modelo: 'lapide', x: q.x - 0.5, y: q.y - 0.5, rot });
        }
      }
      for (let n = 0; n < 3; n++)
        tentar(
          noPonto(
            'arvore_seca',
            rng.entre(area.x0 + 1, area.x1 - 1),
            rng.entre(area.y0 + 1, area.y1 - 1),
          ),
          0.4,
        );
    } else {
      chao('terra', boca.x - 0.6, boca.y - 0.6, rm.fim.x + 0.6, rm.fim.y + 0.6);
      for (let n = 0; n < 2; n++)
        tentar(
          noPonto(
            sortearPeso(rng, bairro.arvores),
            rng.entre(area.x0 + 1, area.x1 - 1),
            rng.entre(area.y0 + 1, area.y1 - 1),
          ),
          0.5,
        );
      tentar(
        {
          ...noPonto('varal', fundo.x - lateral.x * 1.5, fundo.y - lateral.y * 1.5),
          rot: rm.dir.x !== 0 ? 0 : 90,
        } as ObjetoRua,
        0.3,
      );
    }
  }

  // Atalho escuro: um beco sem postes pelo meio do quarteirão, com lixeiras e um baú no meio.
  let atalhoGerado: RuaGerada['atalho'];
  if (atalho) {
    const a = nos[atalho.k1]!;
    const b = nos[atalho.k2]!;
    const meio = centro(atalho.c);
    const comp = Math.hypot(b.x - a.x, b.y - a.y);
    const dir = { x: (b.x - a.x) / comp, y: (b.y - a.y) / comp };
    const lado = { x: -dir.y, y: dir.x };
    zonas.push({ nome: 'Atalho Escuro', tipo: 'beco', area: faixaEntre(a, b, meiaBeco + J) });
    const bau = {
      x: meio.x + lado.x * (meiaBeco - 0.6),
      y: meio.y + lado.y * (meiaBeco - 0.6),
    };
    reservarEm(bau, 0.8);
    atalhoGerado = { a: { ...a }, b: { ...b }, bau };
    // Lixeiras espalhadas pelo trecho do meio (fora dos cruzamentos), alternando o lado.
    const ini = meiaRua + 1.5;
    const fim = comp - meiaRua - 1.5;
    for (let k = 0; k < R.atalho.lixeiras; k++) {
      const s = ini + ((k + 0.5) * (fim - ini)) / R.atalho.lixeiras;
      const sinal = k % 2 === 0 ? -1 : 1;
      const off = meiaBeco - 0.5;
      tentar(
        noPonto(
          'lixeira',
          a.x + dir.x * s + lado.x * sinal * off,
          a.y + dir.y * s + lado.y * sinal * off,
        ),
        0.1,
      );
    }
  }

  // ------------------------------------------------------------ a borda: casas, cercas e pontas
  const casasColocadas: { indice: number; porta: V2 }[] = [];
  const portas: RuaGerada['portas'] = [];
  /** Quão longe da entrada (0 a 1) fica um ponto, pelo nó mais perto. */
  const fracaoDe = (p: V2): number => {
    let melhor = 0;
    let d0 = Infinity;
    nos.forEach((n, k) => {
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d < d0) {
        d0 = d;
        melhor = k / Math.max(1, K - 1);
      }
    });
    return melhor;
  };
  /** Peças iguais ao longo de um trecho, logo do lado de fora da linha. */
  const linhaDe = (
    t: TrechoDeBorda,
    modelo: NomeModelo,
    espessura: number,
    a0 = t.a0,
    a1 = t.a1,
    soCenario = false,
    /** Pula as peças que cairiam em algo já posto (as sebes dos vãos entre casas). */
    soNoLivre = false,
  ) => {
    const comp = modelos[modelo].pegada.largura;
    const lado = t.dentro === 1 ? t.p - espessura : t.p;
    for (let a = a0; a < a1 - 1e-6; a += comp) {
      const b = Math.min(a, a1 - comp);
      const o =
        t.eixo === 'x'
          ? ({ modelo, x: b, y: lado, rot: 0 } as ObjetoRua)
          : ({ modelo, x: lado, y: b, rot: 90 } as ObjetoRua);
      if (soNoLivre && ocupados.some(pegada(modelo, o.x, o.y, o.rot), -0.1)) continue;
      if (soCenario) enfeite(o);
      else {
        // A cerca da rota guarda o lugar: as casas postas depois não a atravessam.
        add(o);
        reservar(pegada(modelo, o.x, o.y, o.rot));
      }
    }
  };
  /**
   * O quintal dos fundos de uma casa: a cerca do fundo do lote e uma coisa no meio (árvore,
   * varal, arbusto ou lápide de Halloween). Os lotes de uma quadra se encostam pelos fundos.
   */
  const quintalDosFundos = (t: TrechoDeBorda, a0: number, a1: number, fundoCasa: number) => {
    const fundo = fundoCasa - t.dentro * PROFUNDIDADE_DO_QUINTAL;
    const r =
      t.eixo === 'x'
        ? { x0: a0, y0: Math.min(fundo, fundoCasa), x1: a1, y1: Math.max(fundo, fundoCasa) }
        : { x0: Math.min(fundo, fundoCasa), y0: a0, x1: Math.max(fundo, fundoCasa), y1: a1 };
    if (tocaCaminho(r) || ocupados.some(r, -0.02)) return;
    reservar(r);
    const larg = posicionador(1, 0.3, 0, 0, 90).pegada;
    for (let a = a0; a < a1 - 0.3; a += 1) {
      const b = Math.min(a, a1 - 1);
      enfeite(
        t.eixo === 'x'
          ? ({ modelo: 'cerca', x: b, y: fundo - 0.15, rot: 0 } as ObjetoRua)
          : ({ modelo: 'cerca', x: fundo - (larg.x1 - larg.x0) / 2, y: b, rot: 90 } as ObjetoRua),
      );
    }
    const meio = (a0 + a1) / 2;
    const prof = (fundo + fundoCasa) / 2;
    const c = t.eixo === 'x' ? { x: meio, y: prof } : { x: prof, y: meio };
    const s = rng.proximo();
    const modelo: NomeModelo =
      s < 0.45
        ? sortearPeso(rng, bairro.arvores)
        : s < 0.7
          ? 'varal'
          : s < 0.9
            ? 'arbusto'
            : 'lapide';
    const rot: Rotacao = modelo === 'varal' ? (t.eixo === 'x' ? 90 : 0) : 0;
    enfeite(noPonto(modelo, c.x, c.y, rot));
  };
  const fecharPonta = (t: TrechoDeBorda, tipo: Ponta) => {
    // As peças ficam por dentro da linha (no fim da rua), viradas para o caminho.
    const pt = (ao: number, cr: number): V2 =>
      t.eixo === 'x' ? { x: cr, y: ao } : { x: ao, y: cr };
    const p = t.p + t.dentro * 0.5;
    const rotFrente: Rotacao =
      t.eixo === 'x' ? (t.dentro === 1 ? 90 : 270) : t.dentro === 1 ? 0 : 180;
    const faixaDaPonta = (ate: number): Retangulo =>
      t.eixo === 'x'
        ? {
            x0: t.a0,
            y0: Math.min(p - 0.5, p + t.dentro * ate),
            x1: t.a1,
            y1: Math.max(p - 0.5, p + t.dentro * ate),
          }
        : {
            x0: Math.min(p - 0.5, p + t.dentro * ate),
            y0: t.a0,
            x1: Math.max(p - 0.5, p + t.dentro * ate),
            y1: t.a1,
          };
    const cones = (afastamento: number) => {
      for (const f of [0.18, 0.5, 0.82]) {
        const c = pt(p + t.dentro * afastamento, t.a0 + (t.a1 - t.a0) * f + rng.entre(-0.3, 0.3));
        tentar(noPonto('cone', c.x, c.y), 0);
      }
    };
    if (tipo === 'barreira' || tipo === 'obra') {
      const modelo: NomeModelo = tipo === 'barreira' ? 'barreira' : 'tapume';
      const comp = modelos[modelo].pegada.largura;
      const esp = modelos[modelo].pegada.profundidade;
      for (let a = t.a0; a < t.a1 - 1e-6; a += comp) {
        const b = Math.min(a, t.a1 - comp);
        add(
          t.eixo === 'x'
            ? ({ modelo, x: b, y: p - esp / 2, rot: 0 } as ObjetoRua)
            : ({ modelo, x: p - esp / 2, y: b, rot: 90 } as ObjetoRua),
        );
      }
      reservar(faixaDaPonta(0.4));
      if (tipo === 'obra')
        for (const f of [0.3, 0.7]) {
          const c = pt(p + t.dentro * 1.0, t.a0 + (t.a1 - t.a0) * f);
          tentar(noPonto('cavalete', c.x, c.y, t.eixo === 'x' ? 0 : 90), 0);
        }
      cones(tipo === 'obra' ? 1.9 : 1.1);
      const c = pt(p + t.dentro * 2.2, (t.a0 + t.a1) / 2 + rng.entre(-1, 1));
      tentar(noPonto('placa_obra', c.x, c.y, rotFrente), 0.05);
    } else if (tipo === 'buraco') {
      for (let a = t.a0 - 0.2; a < t.a1 - 0.6; a += 1.6) {
        const c = pt(p + t.dentro * 0.6, Math.min(a + 1, t.a1 - 0.8));
        add(noPonto('buraco', c.x, c.y));
      }
      reservar(faixaDaPonta(1.8));
      cones(2.0);
    } else {
      for (let a = t.a0 - 0.6; a < t.a1 - 0.8; a += 2.2) {
        const c = pt(p + t.dentro * 0.9, Math.min(a + 1.5, t.a1 - 1.1));
        add({
          ...noPonto('morro', c.x, c.y),
          variante: 'baixo',
          rot: rng.escolher([0, 90, 180, 270] as const),
        } as ObjetoRua);
      }
      reservar(faixaDaPonta(2.6));
      for (let k = 0; k < 3; k++) {
        const c = pt(p + t.dentro * rng.entre(2.6, 3.0), rng.entre(t.a0 + 0.5, t.a1 - 0.5));
        tentar(
          {
            ...noPonto('pedra', c.x, c.y),
            variante: rng.proximo() < 0.4 ? 'grande' : 'pequena',
          } as ObjetoRua,
          0,
        );
      }
      const t0 = pt(p - t.dentro * 1, t.a0);
      const t1 = pt(p + t.dentro * 3.2, t.a1);
      chao('terra', t0.x, t0.y, t1.x, t1.y);
    }
  };
  /**
   * Lotes virados para uma rua ao longo de um trecho: casas (sem repetir o modelo ao lado), comércio
   * nas esquinas e um terreno baldio de vez em quando, cada lote com o quintal nos fundos. Vãos
   * maiores ganham sebe. `soCenario`: a rua é de fora da rota (tudo vira só desenho).
   */
  const casasNoTrecho = (t: TrechoDeBorda, soCenario = false) => {
    const cobertos: [number, number][] = [];
    let cursor = t.a0 + rng.entre(0.05, 0.3);
    let anterior: string | null = null;
    const rot: Rotacao = t.eixo === 'x' ? (t.dentro === 1 ? 90 : 270) : t.dentro === 1 ? 0 : 180;
    while (cursor < t.a1 - 2.5) {
      const meio =
        t.eixo === 'x' ? { x: cursor, y: t.p + t.dentro } : { x: t.p + t.dentro, y: cursor };
      const resto = t.a1 - 0.05 - cursor;
      // Terreno baldio: mato e entulho atrás da sebe.
      if (resto > 6 && cursor - t.a0 > 3 && rng.proximo() < LOTES.baldio) {
        const fim = cursor + 3.2;
        const r =
          t.eixo === 'x'
            ? {
                x0: cursor,
                y0: Math.min(t.p, t.p - t.dentro * 3.4),
                x1: fim,
                y1: Math.max(t.p, t.p - t.dentro * 3.4),
              }
            : {
                x0: Math.min(t.p, t.p - t.dentro * 3.4),
                y0: cursor,
                x1: Math.max(t.p, t.p - t.dentro * 3.4),
                y1: fim,
              };
        if (
          !tocaCaminho({ x0: r.x0 + 0.05, y0: r.y0 + 0.05, x1: r.x1 - 0.05, y1: r.y1 - 0.05 }) &&
          !ocupados.some(r, 0)
        ) {
          reservar(r);
          for (let k = 0; k < 3; k++) {
            const q = {
              x: rng.entre(r.x0 + 0.6, r.x1 - 0.6),
              y: rng.entre(r.y0 + 0.6, r.y1 - 0.6),
            };
            const m: NomeModelo = k === 0 ? 'arbusto' : rng.proximo() < 0.5 ? 'pedra' : 'arbusto';
            enfeite({
              ...noPonto(m, q.x, q.y),
              ...(m === 'pedra' ? { variante: 'pequena' } : {}),
            } as ObjetoRua);
          }
          cursor = fim + rng.entre(cfg.folgaEntreCasas[0], cfg.folgaEntreCasas[1]);
          anterior = null;
          continue;
        }
      }
      // Esquinas costumam ser comércio.
      const esquina = cursor - t.a0 < 1.2 || resto < 5;
      const pesos: Partial<Record<ModeloCasa, number>> =
        fracaoDe(meio) >= R.comercioDesde || (esquina && rng.proximo() < LOTES.comercioNaEsquina)
          ? bairro.comercio
          : bairro.casas;
      const cabemTodos = Object.entries(pesos).filter(
        ([m, p]) => (p as number) > 0 && modelos[m as ModeloCasa].pegada.profundidade <= resto,
      );
      // O mesmo modelo não se repete lado a lado.
      const semRepetir = cabemTodos.filter(([m]) => m !== anterior);
      const cabem = Object.fromEntries(semRepetir.length > 0 ? semRepetir : cabemTodos) as Partial<
        Record<ModeloCasa, number>
      >;
      if (Object.keys(cabem).length === 0) break;
      const modelo = sortearPeso<ModeloCasa>(rng, cabem);
      const { largura: w, profundidade: d } = modelos[modelo].pegada;
      const x = t.eixo === 'x' ? cursor : t.dentro === 1 ? t.p - w : t.p;
      const y = t.eixo === 'x' ? (t.dentro === 1 ? t.p - w : t.p) : cursor;
      const pg = pegada(modelo, x, y, rot);
      const encolhida = { x0: pg.x0 + 0.05, y0: pg.y0 + 0.05, x1: pg.x1 - 0.05, y1: pg.y1 - 0.05 };
      const portaAqui =
        t.eixo === 'x'
          ? { x: cursor + d / 2, y: t.p + t.dentro * AFASTAMENTO_DA_PORTA }
          : { x: t.p + t.dentro * AFASTAMENTO_DA_PORTA, y: cursor + d / 2 };
      const cabe =
        !ocupados.some(quadrado(portaAqui, 0.45), 0) &&
        pg.x0 >= 0 &&
        pg.y0 >= 0 &&
        pg.x1 <= largura &&
        pg.y1 <= profundidade &&
        !tocaCaminho(encolhida) &&
        !ocupados.some(pg, 0.02);
      if (!cabe) {
        cursor += 0.5;
        continue;
      }
      const variante = modelo === 'loja' ? rng.escolher(VARIANTES_DE_LOJA) : undefined;
      const casa = { modelo, x, y, rot, ...(variante ? { variante } : {}) } as ObjetoRua;
      anterior = modelo;
      reservar(pg);
      cobertos.push([cursor, cursor + d]);
      quintalDosFundos(t, cursor, cursor + d, t.p - t.dentro * w);
      const porta =
        t.eixo === 'x'
          ? { x: cursor + d / 2, y: t.p + t.dentro * AFASTAMENTO_DA_PORTA }
          : { x: t.p + t.dentro * AFASTAMENTO_DA_PORTA, y: cursor + d / 2 };
      if (soCenario) {
        enfeite({ ...casa, ...(rng.proximo() < 0.3 ? { apagada: true } : {}) } as ObjetoRua);
        cursor += d + rng.entre(cfg.folgaEntreCasas[0], cfg.folgaEntreCasas[1]);
        continue;
      }
      const indice = add(casa);
      casasColocadas.push({ indice, porta });
      portas.push({ ...porta, lado: ladoDe(porta) });
      // Jardim: caixa de correio e abóbora acesa junto à fachada.
      const e = cfg.enfeites;
      const lateral = rng.proximo() < 0.5 ? -1.05 : 1.05;
      if (rng.proximo() < e.caixaDeCorreio && d >= 2.6) {
        const q =
          t.eixo === 'x'
            ? { x: porta.x + lateral, y: t.p + t.dentro * 0.4 }
            : { x: t.p + t.dentro * 0.4, y: porta.y + lateral };
        tentar(noPonto('caixa_correio', q.x, q.y, rot), 0);
      }
      if (rng.proximo() < e.abobora) {
        const q =
          t.eixo === 'x'
            ? { x: porta.x - lateral, y: t.p + t.dentro * 0.35 }
            : { x: t.p + t.dentro * 0.35, y: porta.y - lateral };
        enfeite(noPonto('abobora_decor', q.x, q.y, rot));
      }
      cursor += d + rng.entre(cfg.folgaEntreCasas[0], cfg.folgaEntreCasas[1]);
    }
    // Sebe nos vãos maiores (a borda fica fechada à vista).
    let ini = t.a0;
    for (const [c0, c1] of [...cobertos, [t.a1, t.a1] as [number, number]]) {
      if (c0 - ini >= VAO_COM_SEBE) {
        if (c0 - ini < 1)
          linhaDe(
            t,
            'cerca_viva',
            0.5,
            (ini + c0) / 2 - 0.5,
            (ini + c0) / 2 + 0.5,
            soCenario,
            true,
          );
        else linhaDe(t, 'cerca_viva', 0.5, ini, c0, soCenario, true);
      }
      ini = Math.max(ini, c1);
    }
  };
  // Primeiro as pontas e cercas (que reservam espaço), depois as casas.
  const naBordaDoMundo = (t: TrechoDeBorda) =>
    t.p <= 0 || (t.eixo === 'x' ? t.p >= profundidade : t.p >= largura);
  for (const t of trechos) {
    if (naBordaDoMundo(t)) continue;
    if (t.borda.startsWith('ponta:')) {
      if (t.a1 - t.a0 > 1) fecharPonta(t, t.borda.slice('ponta:'.length) as Ponta);
    } else if (t.borda === 'cerca') linhaDe(t, 'cerca', 0.3);
    else if (t.borda === 'sebe') linhaDe(t, 'cerca_viva', 0.5);
    else if (t.borda === 'tapume') linhaDe(t, 'tapume', 0.2);
  }
  for (const t of trechos) if (t.borda === 'casas' && !naBordaDoMundo(t)) casasNoTrecho(t);
  // As ruas de fora: lotes dos dois lados (depois dos da rota, que têm prioridade), postes acesos
  // e carros parados. Tudo só desenho.
  for (const v of viasDeFora) {
    const emX = v.a.y === v.b.y;
    const a0 = Math.min(emX ? v.a.x : v.a.y, emX ? v.b.x : v.b.y) + meiaFora + J;
    const a1 = Math.max(emX ? v.a.x : v.a.y, emX ? v.b.x : v.b.y) - meiaFora - J;
    const linha = emX ? v.a.y : v.a.x;
    for (const dentro of [1, -1] as const) {
      const t: TrechoDeBorda = {
        eixo: emX ? 'x' : 'y',
        p: linha - dentro * (meiaFora + J),
        a0,
        a1,
        dentro,
        borda: 'casas',
      };
      casasNoTrecho(t, true);
    }
    const comp = Math.hypot(v.b.x - v.a.x, v.b.y - v.a.y);
    const dir = { x: (v.b.x - v.a.x) / comp, y: (v.b.y - v.a.y) / comp };
    const lateral = { x: -dir.y, y: dir.x };
    let k = 0;
    for (let s = meiaFora + 2; s < comp - meiaFora - 1; s += R.postesNasRuas, k++) {
      const sinal = k % 2 === 0 ? 1 : -1;
      const p = {
        x: v.a.x + dir.x * s + lateral.x * sinal * (fora.pista / 2 + 0.35),
        y: v.a.y + dir.y * s + lateral.y * sinal * (fora.pista / 2 + 0.35),
      };
      const r = quadrado(p, 0.5);
      if (tocaCaminho(r) || ocupados.some(r, 0)) continue;
      reservar(r);
      enfeite({
        ...noPonto('poste', p.x, p.y),
        estado: opcoes.semLuz ? 'apagado' : 'amigo',
      } as ObjetoRua);
    }
    for (let s = meiaFora + 2; s < comp - meiaFora - 3; s += 3) {
      if (rng.proximo() > R.chanceDeCarroNasRuas) continue;
      const sinal = rng.proximo() < 0.5 ? 1 : -1;
      const p = {
        x: v.a.x + dir.x * (s + 1.1) + lateral.x * sinal * (fora.pista / 2 - 0.65),
        y: v.a.y + dir.y * (s + 1.1) + lateral.y * sinal * (fora.pista / 2 - 0.65),
      };
      const o = {
        ...noPonto('carro', p.x, p.y, dir.x !== 0 ? 0 : 90),
        variante: sortearPeso(rng, cfg.carros.variantes),
      } as ObjetoRua;
      const r = pegada('carro', o.x, o.y, o.rot);
      if (tocaCaminho(r) || ocupados.some(r, 0.1)) continue;
      reservar(r);
      enfeite(o);
    }
  }

  // ------------------------------------------------------------ mobiliário das ruas
  const viasDaRota = vias.filter((v) => !v.beco);
  const postesNasRuas: { p: V2; interacao: V2 }[] = [];
  for (const v of vias) {
    const comp = Math.hypot(v.b.x - v.a.x, v.b.y - v.a.y);
    const dir = { x: (v.b.x - v.a.x) / comp, y: (v.b.y - v.a.y) / comp };
    const lado = { x: -dir.y, y: dir.x };
    // O atalho é escuro de propósito: sem postes (a rua iluminada é o caminho longo).
    if (v.escuro) continue;
    const passo = v.beco ? R.postesNasRuas * 0.8 : R.postesNasRuas;
    let k = 0;
    for (let s = meiaRua + 2 + rng.entre(0, 2); s < comp - meiaRua - 1.5; s += passo, k++) {
      const sinal = k % 2 === 0 ? 1 : -1;
      const off = v.pista / 2 + 0.35;
      const p = {
        x: v.a.x + dir.x * s + lado.x * sinal * off,
        y: v.a.y + dir.y * s + lado.y * sinal * off,
      };
      const interacao = { x: p.x - lado.x * sinal * 1.0, y: p.y - lado.y * sinal * 1.0 };
      if (salas.some((sl) => dentroDe(p, quadrado(sl.centro, sl.h + 0.5)))) continue;
      postesNasRuas.push({ p, interacao });
    }
  }
  const colocados: { p: V2; interacao: V2; idx: number }[] = [];
  for (const q of postesNasRuas) {
    const idx = posteEm(q.p, 0.05);
    if (idx !== null) colocados.push({ ...q, idx });
  }
  const nReligar = opcoes.semLuz
    ? colocados.length
    : Math.min(colocados.length, sorteio(cfg.exploracao.postesParaReligar));
  const religaveis = new Set(embaralhar(rng, [...colocados]).slice(0, nReligar));
  // Os postes apagados pelos preços (Poste Apagado) não religam.
  let apagadosPorPreco = opcoes.postesApagados ?? 0;
  const postesExploracao: PontoDeExploracao[] = [];
  for (const c of colocados) {
    if (religaveis.has(c)) {
      (objetos[c.idx] as { estado: string }).estado = 'apagado';
      postesExploracao.push({ x: c.interacao.x, y: c.interacao.y, objeto: c.idx });
    } else if (apagadosPorPreco > 0) {
      apagadosPorPreco--;
      (objetos[c.idx] as { estado: string }).estado = 'apagado';
    } else luzDoPoste(c.p, c.idx);
  }
  // Árvores, lixeiras e hidrantes nas calçadas; carros parados e buracos nas pistas.
  const naCalcadaCom = (r: Rng, v: Via, modelo: NomeModelo, meioFio = false) => {
    const comp = Math.hypot(v.b.x - v.a.x, v.b.y - v.a.y);
    const dir = { x: (v.b.x - v.a.x) / comp, y: (v.b.y - v.a.y) / comp };
    const lado = { x: -dir.y, y: dir.x };
    for (let t = 0; t < 8; t++) {
      const s = r.entre(meiaRua + 1.5, comp - meiaRua - 1.5);
      const sinal = r.proximo() < 0.5 ? 1 : -1;
      const off = meioFio ? v.pista / 2 + 0.35 : v.pista / 2 + v.calcada - 0.45;
      const p = {
        x: v.a.x + dir.x * s + lado.x * sinal * off,
        y: v.a.y + dir.y * s + lado.y * sinal * off,
      };
      if (tentar(noPonto(modelo, p.x, p.y), 0.25) !== null) return;
    }
  };
  const naCalcada = (v: Via, modelo: NomeModelo, meioFio: boolean) =>
    naCalcadaCom(rng, v, modelo, meioFio);
  for (const v of viasDaRota) {
    naCalcada(v, sortearPeso(rng, bairro.arvores), false);
    if (rng.proximo() < 0.6) naCalcada(v, sortearPeso(rng, bairro.arvores), false);
    if (rng.proximo() < 0.5) naCalcada(v, 'lixeira', true);
    if (rng.proximo() < 0.35) naCalcada(v, 'hidrante', true);
    // Abóbora gigante (explode quando quebra): sorteio à parte, para não mexer no resto da rua.
    if (rngArmas.proximo() < R.chanceDeAboboraGigante) naCalcadaCom(rngArmas, v, 'abobora_gigante');
    // Carros estacionados no meio-fio (cobertura no caminho).
    const comp = Math.hypot(v.b.x - v.a.x, v.b.y - v.a.y);
    const dir = { x: (v.b.x - v.a.x) / comp, y: (v.b.y - v.a.y) / comp };
    for (let s = meiaRua + 2; s < comp - meiaRua - 3; s += 3) {
      if (rng.proximo() > R.chanceDeCarroNasRuas) continue;
      const sinal = rng.proximo() < 0.5 ? 1 : -1;
      const p = {
        x: v.a.x + dir.x * (s + 1.1) - dir.y * sinal * (v.pista / 2 - 0.65),
        y: v.a.y + dir.y * (s + 1.1) + dir.x * sinal * (v.pista / 2 - 0.65),
      };
      const rot: Rotacao = dir.x !== 0 ? 0 : 90;
      tentar(
        {
          ...noPonto('carro', p.x, p.y, rot),
          variante: sortearPeso(rng, cfg.carros.variantes),
        } as ObjetoRua,
        0.1,
      );
    }
  }
  for (let k = sorteio(R.buracos); k > 0; k--) {
    for (let t = 0; t < 12; t++) {
      const v = rng.escolher(viasDaRota);
      const comp = Math.hypot(v.b.x - v.a.x, v.b.y - v.a.y);
      if (comp < 2 * meiaRua + 6) continue;
      const dir = { x: (v.b.x - v.a.x) / comp, y: (v.b.y - v.a.y) / comp };
      const s = rng.entre(meiaRua + 3, comp - meiaRua - 3);
      const sinal = rng.proximo() < 0.5 ? 1 : -1;
      const p = {
        x: v.a.x + dir.x * s - dir.y * sinal * (v.pista / 2 - 1.2),
        y: v.a.y + dir.y * s + dir.x * sinal * (v.pista / 2 - 1.2),
      };
      if (salas.some((sl) => dentroDe(p, quadrado(sl.centro, sl.h + 1)))) continue;
      if (tentar(noPonto('buraco', p.x, p.y), 0.4) === null) continue;
      enfeite(noPonto('cone', p.x + dir.x * 1.4, p.y + dir.y * 1.4));
      break;
    }
  }

  // ------------------------------------------------------------ encontros pelo caminho
  const encontros: Encontro[] = [];
  {
    const total = Math.round(R.encontros.porNo * K);
    const livres = embaralhar(
      rng,
      // O começo da rota fica calmo: o jogador aprende a rua antes do primeiro grupo.
      nos
        .map((n, k) => ({ n, k }))
        .filter(({ k }) => !salaNo.has(k) && k >= R.encontros.desdeFracao * K),
    );
    for (const { n } of livres.slice(0, total))
      encontros.push({ pos: { ...n }, n: sorteio(R.encontros.tamanho) });
    for (const s of salas)
      if ((s.tipo === 'obras' || s.tipo === 'praca') && encontros.length < total)
        encontros.push({
          pos: { x: s.centro.x + 2, y: s.centro.y + 2 },
          n: sorteio(R.encontros.tamanho),
        });
  }

  // ------------------------------------------------------------ ruas com nome (os trechos)
  // Trechos retos seguidos (na mesma direção) são a mesma rua; mais a avenida da entrada e os
  // ramais da Encruzilhada. São as ruas com nome no mapa.
  const ruasComNome: { area: Retangulo; tipo: 'rua' | 'avenida' | 'ramal' }[] = [];
  {
    let ini = 0;
    for (let k = 1; k <= K - 1; k++) {
      const d0 = {
        x: Math.sign(nos[k]!.x - nos[k - 1]!.x),
        y: Math.sign(nos[k]!.y - nos[k - 1]!.y),
      };
      const prox = nos[k + 1];
      const d1 = prox
        ? { x: Math.sign(prox.x - nos[k]!.x), y: Math.sign(prox.y - nos[k]!.y) }
        : null;
      if (d1 && d1.x === d0.x && d1.y === d0.y) continue;
      ruasComNome.push({ tipo: 'rua', area: faixaComPontas(nos[ini]!, nos[k]!, meiaRua + J) });
      ini = k;
    }
    ruasComNome.push({
      tipo: 'avenida',
      area: faixaEntre(n0, { x: n0.x, y: profundidade }, meiaRua + J),
    });
    for (const x of xsRamais)
      ruasComNome.push({
        tipo: 'ramal',
        area: faixaEntre({ x, y: yLigacao }, { x, y: 0 }, meiaRamal + J),
      });
  }

  // ------------------------------------------------------------ exploração
  const casasDaCampainha = new Set<number>();
  const foraDasSalas = (c: { porta: V2 }) =>
    !salas.some((s) => dentroDe(c.porta, quadrado(s.centro, s.h + 0.1)));
  /** A sala do 1º Poste é arena (fecha os portões): nenhuma porta com interação nela. */
  const foraDoPoste = (c: { porta: V2 }) =>
    !salas.some((s) => s.tipo === 'poste' && dentroDe(c.porta, quadrado(s.centro, s.h + 0.1)));
  const campainhas: PontoDeExploracao[] = [];
  const novaCampainha = (c: { indice: number; porta: V2 }): void => {
    casasDaCampainha.add(c.indice);
    const o = objetos[c.indice]!;
    const frente = girar({ x: 1, y: 0 }, o.rot);
    const objeto = add({
      modelo: 'abobora_decor',
      x: c.porta.x - 0.5 - frente.y * 0.6 - frente.x * 0.2,
      y: c.porta.y - 0.5 + frente.x * 0.6 - frente.y * 0.2,
      rot: o.rot,
      grupo: `campainha:${campainhas.length}`,
    });
    campainhas.push({ x: arred(c.porta.x), y: arred(c.porta.y), objeto });
  };
  embaralhar(rng, casasColocadas.filter(foraDasSalas))
    .slice(0, sorteio(cfg.exploracao.campainhas))
    .forEach(novaCampainha);
  // Casas Desconfiadas: num gerador à parte (derivado do estado deste, sem gastar sorteio), para as
  // ruas de sempre continuarem iguais. Casas com janelas apagadas e a aldrava na porta.
  const desconfiadas: PontoDeExploracao[] = [];
  {
    const d = cfg.exploracao.desconfiadas;
    const rngCasas = new Rng((rng.semente ^ 0x5bd1e995) >>> 0);
    const faixa = d.porBairro[Math.min(opcoes.bairro, d.porBairro.length - 1)]!;
    const n = rngCasas.inteiro(faixa[0], faixa[1]);
    const longeDaSaida = (p: V2) =>
      p.y > ySaida + d.longeDaSaida ||
      saidasDasRotas.every(
        (s) =>
          Math.hypot(Math.max(s.x0 - p.x, 0, p.x - s.x1), Math.max(s.y0 - p.y, 0, p.y - s.y1)) >=
          d.longeDaSaida,
      );
    const candidatas = embaralhar(
      rngCasas,
      casasColocadas.filter(
        (c) =>
          !casasDaCampainha.has(c.indice) &&
          (d.modelos as readonly string[]).includes(objetos[c.indice]!.modelo) &&
          !salas.some((s) => dentroDe(c.porta, quadrado(s.centro, s.h + 0.1))) &&
          longeDaSaida(c.porta),
      ),
    );
    for (const c of candidatas) {
      if (desconfiadas.length >= n) break;
      if (desconfiadas.some((q) => Math.hypot(q.x - c.porta.x, q.y - c.porta.y) < d.distanciaEntre))
        continue;
      const o = objetos[c.indice]!;
      // O lote vira casa térrea (a casa que acorda é a do Elenco v7), com a fachada no mesmo lugar.
      if (o.modelo !== 'casa_terrea') {
        const antiga = modelos[o.modelo].pegada;
        const nova = modelos.casa_terrea.pegada;
        const frenteAntiga = posicionador(
          antiga.largura,
          antiga.profundidade,
          o.x,
          o.y,
          o.rot,
        ).ponto({
          x: antiga.largura,
          y: antiga.profundidade / 2,
        });
        const deitado = o.rot === 90 || o.rot === 270;
        const g = girar({ x: nova.largura / 2, y: 0 }, o.rot);
        objetos[c.indice] = {
          modelo: 'casa_terrea',
          rot: o.rot,
          x: arred(frenteAntiga.x - (deitado ? nova.profundidade : nova.largura) / 2 - g.x),
          y: arred(frenteAntiga.y - (deitado ? nova.largura : nova.profundidade) / 2 - g.y),
        } as ObjetoRua;
      }
      (objetos[c.indice] as { apagada?: boolean }).apagada = true;
      const frente = girar({ x: 1, y: 0 }, o.rot);
      add({
        modelo: 'aldrava',
        x: c.porta.x - 0.5 - frente.x * (AFASTAMENTO_DA_PORTA - 0.05),
        y: c.porta.y - 0.5 - frente.y * (AFASTAMENTO_DA_PORTA - 0.05),
        rot: o.rot,
        grupo: `desconfiada:${desconfiadas.length}`,
      } as ObjetoRua);
      desconfiadas.push({ x: arred(c.porta.x), y: arred(c.porta.y), objeto: c.indice });
    }
  }
  // Toda rua da rota tem pelo menos `casasPorRua` portas com interação (campainhas ou Casas
  // Desconfiadas): as que faltam viram campainhas, com um gerador à parte (as ruas de antes
  // continuam iguais no resto). A avenida da entrada e os ramais da saída não têm lotes.
  {
    const minimo = cfg.exploracao.casasPorRua;
    const rngRuas = new Rng((rng.semente ^ 0x27d4eb2f) >>> 0);
    const naRua = (a: Retangulo, p: V2, folga: number) =>
      p.x >= a.x0 - folga && p.x <= a.x1 + folga && p.y >= a.y0 - folga && p.y <= a.y1 + folga;
    const usadas = new Set([...casasDaCampainha, ...desconfiadas.map((d) => d.objeto)]);
    for (const { area, tipo } of ruasComNome) {
      if (tipo !== 'rua') continue;
      let tem = [...campainhas, ...desconfiadas].filter((q) =>
        naRua(area, q, FOLGA_DA_PORTA_NA_RUA),
      ).length;
      // Primeiro as casas da própria rua; numa rua curta, sem lotes que bastem, as da esquina; e,
      // se ainda faltar (a rua entre dois largos), as que dão para o largo, menos o do 1º Poste.
      const etapas = [
        { folga: FOLGA_DA_PORTA_NA_RUA, podeLargo: false },
        { folga: FOLGA_DA_PORTA_NA_ESQUINA, podeLargo: false },
        { folga: FOLGA_DA_PORTA_NA_ESQUINA, podeLargo: true },
      ];
      for (const { folga, podeLargo } of etapas) {
        if (tem >= minimo) break;
        const livres = embaralhar(
          rngRuas,
          casasColocadas.filter(
            (c) =>
              !usadas.has(c.indice) &&
              (podeLargo ? foraDoPoste(c) : foraDasSalas(c)) &&
              naRua(area, c.porta, folga),
          ),
        );
        for (const c of livres) {
          if (tem >= minimo) break;
          novaCampainha(c);
          usadas.add(c.indice);
          tem++;
        }
      }
    }
  }
  const segredos: V2[] = [];
  {
    const tiposUsados = new Set<string>();
    const candidatos = embaralhar(rng, [...segredosPossiveis]);
    for (const exigirTipoNovo of [true, false]) {
      for (const c of candidatos) {
        if (segredos.length >= cfg.exploracao.segredos) break;
        if (exigirTipoNovo && tiposUsados.has(c.tipo)) continue;
        if (!noCaminho(c.p) || segredos.some((s) => s.x === arred(c.p.x) && s.y === arred(c.p.y)))
          continue;
        const longe = segredos.every(
          (s) => Math.hypot(s.x - c.p.x, s.y - c.p.y) >= cfg.exploracao.distanciaEntreSegredos,
        );
        if (!longe) continue;
        segredos.push({ x: arred(c.p.x), y: arred(c.p.y) });
        tiposUsados.add(c.tipo);
      }
    }
  }

  // ------------------------------------------------------------ morros e miolos de quadra
  // Quarteirões de morro inteiros (mais alto no meio, pinheiros e pedras em volta) e, no miolo das
  // quadras que sobrou entre os quintais, algumas árvores. Nada além do alcance da câmera.
  {
    const livre = (r: Retangulo, folga: number) =>
      !tocaCaminho({ x0: r.x0 - 0.3, y0: r.y0 - 0.3, x1: r.x1 + 0.3, y1: r.y1 + 0.3 }) &&
      !ocupados.some(r, folga);
    for (const k of ehMorro) {
      const [i, j] = k.split(',').map(Number) as [number, number];
      const c = centro({ i, j });
      if (distanciaDaRota(c) > R.alcanceDaCamera + S / 2) continue;
      for (let y = c.y - S / 2 + 1; y < c.y + S / 2 - 2; y += 2.5) {
        for (let x = c.x - S / 2 + 1; x < c.x + S / 2 - 2; x += 2.5) {
          const px = x + rng.entre(-0.4, 0.4);
          const py = y + rng.entre(-0.4, 0.4);
          const meio = Math.hypot(px + 1.5 - c.x, py + 1.5 - c.y) / (S / 2);
          const r = { x0: px, y0: py, x1: px + 3, y1: py + 3 };
          if (meio < 0.85 && livre(r, 0.05)) {
            reservar(r);
            enfeite({
              modelo: 'morro',
              variante: meio < 0.45 ? 'alto' : 'baixo',
              x: px,
              y: py,
              rot: rng.escolher([0, 90, 180, 270] as const),
            });
            continue;
          }
          const q = { x0: px + 1, y0: py + 1, x1: px + 2, y1: py + 2 };
          if (!livre(q, 0.2)) continue;
          reservar(q);
          const pedra = rng.proximo() < 0.3;
          enfeite({
            modelo: pedra ? 'pedra' : 'pinheiro',
            x: px + 1,
            y: py + 1,
            rot: 0,
            ...(pedra ? { variante: rng.proximo() < 0.5 ? 'grande' : 'pequena' } : {}),
          } as ObjetoRua);
        }
      }
    }
    for (let y = 1; y < profundidade - 1; y += 3.2) {
      for (let x = 1; x < largura - 1; x += 3.2) {
        const px = x + rng.entre(-0.8, 0.8);
        const py = y + rng.entre(-0.8, 0.8);
        if (distanciaAoCaminho(px, py) > R.alcanceDaCamera) continue;
        const r = { x0: px, y0: py, x1: px + 1, y1: py + 1 };
        if (!livre(r, 0.7) || rng.proximo() > 0.4) continue;
        reservar(r);
        enfeite({
          modelo: rng.proximo() < 0.75 ? sortearPeso(rng, bairro.arvores) : 'arbusto',
          x: px,
          y: py,
          rot: 0,
        } as ObjetoRua);
      }
    }
  }

  // ------------------------------------------------------------ janelas
  {
    const fracao = opcoes.janelasApagadas ?? 0;
    objetos.forEach((o, i) => {
      if (!ehCasa(o)) return;
      if (opcoes.semLuz || (fracao > 0 && rng.proximo() < fracao)) {
        (o as { apagada?: boolean }).apagada = true;
        return;
      }
      luzes.push(...luzesDasJanelas(o, i, modelos, luz));
    });
  }

  // ------------------------------------------------------------ marcas no chão
  for (const v of vias) {
    const comp = Math.hypot(v.b.x - v.a.x, v.b.y - v.a.y);
    const dir = { x: (v.b.x - v.a.x) / comp, y: (v.b.y - v.a.y) / comp };
    for (let s = meiaRua + 0.8; s < comp - meiaRua - 1; s += 2) {
      const p = { x: v.a.x + dir.x * s, y: v.a.y + dir.y * s };
      if (salas.some((sl) => dentroDe(p, quadrado(sl.centro, sl.h)))) continue;
      if (dir.x !== 0) chao('faixa', p.x, p.y - 0.05, p.x + dir.x, p.y + 0.05);
      else chao('faixa', p.x - 0.05, p.y, p.x + 0.05, p.y + dir.y);
    }
  }
  // Faixas de pedestres junto a cada portão e à entrada.
  for (const [xc, yf, pista] of [
    ...xsRamais.map((x) => [x, ySaida + 0.5, E.pista] as const),
    [n0.x, yEntrada - 1.6, R.rua.pista] as const,
  ])
    for (let x = xc - pista / 2 + 0.25; x < xc + pista / 2 - 0.3; x += 0.75)
      chao('faixa', x, yf, x + 0.4, yf + 0.9);

  // ------------------------------------------------------------ nomes das ruas da rota
  for (const r of ruasComNome)
    zonas.push({
      nome: nome(r.tipo === 'avenida' ? N.avenidas : N.ruas),
      tipo: 'rua',
      area: r.area,
    });

  // ------------------------------------------------------------ a cidade em volta
  const continuacoes: Continuacao[] = [
    { eixo: 'y', a0: n0.x - R.rua.pista / 2, a1: n0.x + R.rua.pista / 2, calcada: R.rua.calcada },
  ];
  for (const x of xsRamais)
    if (Math.abs(x - n0.x) > 1)
      continuacoes.push({
        eixo: 'y',
        a0: x - E.pista / 2,
        a1: x + E.pista / 2,
        calcada: E.calcada,
      });
  const serra: LadoDoMundo | null =
    rng.proximo() < R.chanceDeSerra ? (rng.proximo() < 0.5 ? 'oeste' : 'leste') : null;
  const cidade = gerarCidade(
    semente * 7919 + 13,
    {
      area: { x0: 0, y0: 0, x1: largura, y1: profundidade },
      continuacoes,
      bairro: opcoes.bairro,
      serra,
    },
    cfg,
    modelos,
  );

  const rota: V2[] = [{ x: n0.x, y: yEntrada }, ...nos, { x: nF.x, y: ySaida }];
  const rua: Rua = {
    id: `rua_${semente}`,
    nome: opcoes.nome ?? 'Rua',
    largura,
    profundidade,
    entrada,
    objetos,
    figurantes: [],
    bonecos: [],
    piso: [...cidade.piso, ...piso],
    // A cidade em volta também só até onde a câmera alcança a partir do caminho.
    cenario: apagarCenario(
      semAtravessar(
        [
          ...cidade.cenario.filter(
            (o) => distanciaAoCaminho(o.x + 0.5, o.y + 0.5) <= R.alcanceDaCamera,
          ),
          ...cenario.filter((o) => distanciaAoCaminho(o.x + 0.5, o.y + 0.5) <= R.alcanceDaCamera),
        ],
        objetos,
        modelos,
      ),
      opcoes.fracaoApagados ?? 0,
    ),
    mundo: cidade.mundo,
  };
  return {
    rua,
    ruaX,
    yEntrada,
    ySaida,
    saida: {
      x0: saidasDasRotas[0]!.x0,
      y0: 0,
      x1: saidasDasRotas[saidasDasRotas.length - 1]!.x1,
      y1: ySaida - E.alemDoPortao,
    },
    grade,
    grades,
    saidas: saidasDasRotas,
    bueiros,
    bueirosFlanco,
    postesCorrompidos: [p1, p2],
    quintais,
    luzes: apagarFracao(luzes, objetos, opcoes.fracaoApagados ?? 0),
    portas,
    praca,
    zonas,
    exploracao: {
      campainhas,
      desconfiadas,
      segredos,
      postes: postesExploracao,
      mirante: mirantePonto,
    },
    rota,
    bloqueado: bloqueado.map((r) => ({
      x0: arred(r.x0),
      y0: arred(r.y0),
      x1: arred(r.x1),
      y1: arred(r.y1),
    })),
    bloqueios,
    portoes,
    ...(atalhoGerado ? { atalho: atalhoGerado } : {}),
    fins,
    encontros,
  };
}
