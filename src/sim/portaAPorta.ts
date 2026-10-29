import { vivo } from './combate';
import { gerarCidade } from './cidade';
import type { Gerador, Luz, Modelos, ObjetoRua, Piso, Rua } from './content/esquemas';
import { escolherPeso, luzesDasJanelas, type FonteDeLuzRua } from './gerador';
import { posicionador, type Retangulo, type V2 } from './geometria';
import { MapaDeLuz } from './luz';
import type { Entidade, Mundo, Sistema } from './mundo';
import { montarPartida, type Conteudo, type Ficha, type Partida } from './partida';
import { Rng } from './rng';

export interface CasaDaPorta {
  /** Índice do objeto da casa na rua. */
  objeto: number;
  /** Ponto do jardim diante da porta, onde o jogador bate. */
  porta: V2;
  /** Janela acesa: a casa oferece um trato. */
  acesa: boolean;
  /** Topo da casa (onde a tela mostra o trato oferecido). */
  topo: V2;
}

export interface PortaGerada {
  rua: Rua;
  casas: CasaDaPorta[];
  /** O banco (loja e cura), se o preço Banco Quebrado não o tirou. */
  banco: V2 | null;
  saida: Retangulo;
  luzes: FonteDeLuzRua[];
  yEntrada: number;
  ySaida: number;
}

export interface OpcoesPorta {
  bairro: number;
  /** Quantas casas têm a janela acesa (Janelas Fechadas tira uma). */
  acesas: number;
  banco: boolean;
}

const arred = (n: number) => Math.round(n * 1000) / 1000;

/**
 * A fase Porta a Porta (GDD): uma calçada calma, sem inimigos, com 3 casas de um lado (as de janela
 * acesa oferecem tratos), o banco e postes amigos do outro, e o portão aberto ao norte para a
 * próxima rua.
 */
export function gerarPortaAPorta(
  semente: number,
  cfg: Gerador,
  modelos: Modelos,
  luz: Luz,
  opcoes: OpcoesPorta,
): PortaGerada {
  const rng = new Rng(semente);
  const pp = cfg.portaAPorta;
  const bairro = cfg.bairros[Math.min(opcoes.bairro, cfg.bairros.length - 1)]!;
  const m = cfg.rua.margem;
  const xCercaO = m + pp.faixaDosFundos;
  const xFrenteO = xCercaO + cfg.faixaDasCasas;
  const ruaX0 = xFrenteO + cfg.rua.calcada;
  const ruaX1 = ruaX0 + pp.larguraDaRua;
  const xBanco = ruaX1 + cfg.rua.calcada;
  const xCercaL = xBanco + pp.faixaDoBanco;
  const largura = Math.ceil(xCercaL + m);
  // Uma casa acesa a mais (pedido, portão) alonga a calçada.
  const nCasas = Math.max(pp.casas, opcoes.acesas);
  const comprimento = pp.comprimento + (nCasas - pp.casas) * (pp.espacoEntreCasas + 4);
  const ySaida = m;
  const yEntrada = m + comprimento;
  const profundidade = Math.ceil(yEntrada + m);
  const meio = (ruaX0 + ruaX1) / 2;

  const objetos: ObjetoRua[] = [];
  const add = (o: ObjetoRua): number => {
    objetos.push({ ...o, x: arred(o.x), y: arred(o.y) });
    return objetos.length - 1;
  };

  // ------------------------------------------------------------ casas (de sul para norte)
  // Quais casas acendem: as primeiras de uma ordem sorteada.
  const ordem = Array.from({ length: nCasas }, (_, i) => i);
  for (let i = ordem.length - 1; i > 0; i--) {
    const k = rng.inteiro(0, i);
    [ordem[i], ordem[k]] = [ordem[k]!, ordem[i]!];
  }
  const acesas = new Set(ordem.slice(0, Math.max(0, Math.min(nCasas, opcoes.acesas))));
  const casas: CasaDaPorta[] = [];
  let cursor = yEntrada - pp.inicioDasCasas;
  for (let k = 0; k < nCasas; k++) {
    const modelo = escolherPeso(rng, bairro.casas);
    const { largura: w, profundidade: d } = modelos[modelo].pegada;
    const y = cursor - d;
    if (y < ySaida + 0.5) break;
    const acesa = acesas.has(k);
    const objeto = add({ modelo, x: xCercaO, y, rot: 0, apagada: !acesa });
    casas.push({
      objeto,
      porta: { x: xCercaO + w + pp.afastamentoDaPorta, y: y + d / 2 },
      acesa,
      topo: { x: xCercaO + w / 2, y: y + d / 2 },
    });
    cursor = y - pp.espacoEntreCasas;
  }

  // ------------------------------------------------------------ cercas e portões
  const seg = cfg.cerca.segmento;
  const cercaEmY = (x: number, y0: number, y1: number) => {
    const r = posicionador(1, 0.3, 0, 0, 90).pegada;
    for (let y = y0; y < y1 - 1e-6; y += seg) {
      const b = Math.min(y + seg, y1);
      add({ modelo: 'cerca', x: x - (r.x1 - r.x0) / 2, y: b - seg, rot: 90 });
    }
  };
  const cercaEmX = (y: number, x0: number, x1: number) => {
    for (let x = x0; x < x1 - 1e-6; x += seg)
      add({ modelo: 'cerca', x: Math.min(x, x1 - seg), y: y - 0.15, rot: 0 });
  };
  cercaEmY(xCercaO - 0.15, 0, profundidade);
  cercaEmY(xCercaL + 0.15, 0, profundidade);
  for (const y of [ySaida, yEntrada]) {
    cercaEmX(y, xCercaO, ruaX0);
    cercaEmX(y, ruaX1, xCercaL);
    add({ modelo: 'pilar', x: ruaX0 - 0.5, y: y - 0.5, rot: 0 });
    add({ modelo: 'pilar', x: ruaX1 - 0.5, y: y - 0.5, rot: 0 });
  }
  // A entrada fica fechada atrás do jogador; a saída, ao norte, está aberta.
  for (let x = ruaX0; x < ruaX1 - 1e-6; x += 1)
    add({ modelo: 'grade', x, y: yEntrada - 0.15, rot: 90 });

  // ------------------------------------------------------------ banco, postes e árvores
  const yMeio = (ySaida + yEntrada) / 2;
  const luzes: FonteDeLuzRua[] = [];
  let banco: V2 | null = null;
  if (opcoes.banco) {
    // Banco virado para a rua (frente para −x).
    add({ modelo: 'banco', x: xBanco + 0.3, y: yMeio - 0.7, rot: 180 });
    banco = { x: xBanco - 0.2, y: yMeio };
  }
  for (let k = 0; k < pp.postes; k++) {
    const y = ySaida + 2 + ((k + 0.5) * (comprimento - 3)) / pp.postes;
    const x = k % 2 === 0 ? ruaX1 + 0.35 : ruaX0 - 0.35;
    const i = add({ modelo: 'poste', estado: 'amigo', x: x - 0.5, y: y - 0.5, rot: 0 });
    luzes.push({ tipo: 'poste', x, y, raio: luz.poste.raio, objeto: i });
  }
  for (let k = 0; k < pp.arvores; k++) {
    const y = k === 0 ? ySaida + 1.2 : yEntrada - 2.2;
    add({ modelo: 'arvore', x: xBanco + 1, y, rot: 0 });
  }

  // ------------------------------------------------------------ janelas das casas acesas
  for (const c of casas) {
    if (c.acesa) luzes.push(...luzesDasJanelas(objetos[c.objeto]!, c.objeto, modelos, luz));
  }

  // ------------------------------------------------------------ chão, enfeites e cidade em volta
  const cal = cfg.rua.calcada;
  const piso: Piso[] = [
    { tipo: 'grama', x0: 0, y0: 0, x1: ruaX0 - cal, y1: profundidade },
    { tipo: 'calcada', x0: ruaX0 - cal, y0: 0, x1: ruaX0, y1: profundidade },
    { tipo: 'asfalto', x0: ruaX0, y0: 0, x1: ruaX1, y1: profundidade },
    { tipo: 'calcada', x0: ruaX1, y0: 0, x1: ruaX1 + cal, y1: profundidade },
    { tipo: 'praca', x0: ruaX1 + cal, y0: 0, x1: largura, y1: profundidade },
  ];
  for (let y = 0.5; y < profundidade - 1; y += 2)
    piso.push({ tipo: 'faixa', x0: meio - 0.05, y0: y, x1: meio + 0.05, y1: y + 1 });
  const cenario: ObjetoRua[] = [];
  // Abóboras acesas nas portas das casas que oferecem trato: o convite para bater.
  for (const c of casas) {
    if (!c.acesa) continue;
    cenario.push({
      modelo: 'abobora_decor',
      x: arred(c.porta.x - 0.95),
      y: arred(c.porta.y - 1.2),
      rot: 0,
    });
    cenario.push({
      modelo: 'abobora_decor',
      x: arred(c.porta.x - 0.95),
      y: arred(c.porta.y + 0.2),
      rot: 0,
    });
  }
  const cidade = gerarCidade(
    semente * 7919 + 17,
    {
      area: { x0: 0, y0: 0, x1: largura, y1: profundidade },
      continuacoes: [{ eixo: 'y', a0: ruaX0, a1: ruaX1, calcada: cal }],
      bairro: opcoes.bairro,
    },
    cfg,
    modelos,
  );

  const rua: Rua = {
    id: `porta_${semente}`,
    nome: 'Porta a Porta',
    largura,
    profundidade,
    entrada: { x: meio, y: yEntrada - 2 },
    objetos,
    figurantes: [],
    bonecos: [],
    piso: [...cidade.piso, ...piso],
    cenario: [...cidade.cenario, ...cenario],
    mundo: cidade.mundo,
  };
  return {
    rua,
    casas,
    banco,
    saida: { x0: ruaX0, y0: 0, x1: ruaX1, y1: ySaida - 0.4 },
    luzes,
    yEntrada,
    ySaida,
  };
}

/** Onde o jogador está encostado: uma casa acesa, o banco ou nada. */
export type PontoDaPorta = { tipo: 'casa'; casa: number } | { tipo: 'banco' } | null;

export interface PortaDeLuta extends Partida {
  gerada: PortaGerada;
  luz: MapaDeLuz;
  regras: RegrasDaPorta;
}

/**
 * Regras da calçada calma: os postes curam e recarregam a Luz como na rua, e passar pelo portão
 * do norte encerra a fase. Bater nas portas e usar o banco são decisões da run (src/sim/run.ts).
 */
export class RegrasDaPorta {
  saiu = false;
  readonly sistema: Sistema;
  heroi!: Entidade;

  constructor(
    readonly gerada: PortaGerada,
    private readonly luz: MapaDeLuz,
    private readonly conteudo: Conteudo,
    private readonly raioInteracao: number,
  ) {
    this.sistema = {
      antesDeMover: (mundo) => this.antesDeMover(mundo),
      depoisDoTick: () => this.depoisDoTick(),
    };
  }

  private antesDeMover(mundo: Mundo): void {
    this.luz.atualizar(mundo.tick, (id) => mundo.entidades.find((e) => e.id === id)?.pos ?? null);
    const j = this.heroi;
    const c = j.combate;
    if (!c || !vivo(j)) return;
    if (this.luz.postesQueCuram(j.pos) > 0 && c.coragem < c.attr.coragemMax) {
      const cura = this.conteudo.luz!.cura.postePorS;
      c.coragem = Math.min(
        c.attr.coragemMax,
        c.coragem + c.attr.coragemMax * cura * mundo.dt * c.attr.cura,
      );
    }
    if (this.luz.pertoDePoste(j.pos)) {
      c.luz = Math.min(
        c.attr.luzMax,
        c.luz + this.conteudo.combate.luz.recargaPorS * c.attr.recargaLuz * mundo.dt,
      );
    }
  }

  private depoisDoTick(): void {
    const s = this.gerada.saida;
    const p = this.heroi.pos;
    if (!this.saiu && p.y <= s.y1 && p.x >= s.x0 && p.x <= s.x1) this.saiu = true;
  }

  /** A casa acesa ou o banco que o jogador alcança agora. */
  perto(p: V2): PontoDaPorta {
    let melhor: PontoDaPorta = null;
    let melhorD = this.raioInteracao;
    this.gerada.casas.forEach((c, i) => {
      if (!c.acesa) return;
      const d = Math.hypot(c.porta.x - p.x, c.porta.y - p.y);
      if (d <= melhorD) {
        melhorD = d;
        melhor = { tipo: 'casa', casa: i };
      }
    });
    const b = this.gerada.banco;
    if (b && Math.hypot(b.x - p.x, b.y - p.y) <= melhorD) melhor = { tipo: 'banco' };
    return melhor;
  }
}

/** Monta o mundo da fase Porta a Porta, sem inimigos. */
export function montarPortaAPorta(
  gerada: PortaGerada,
  ficha: Ficha,
  conteudo: Conteudo,
  semente: number,
  raioInteracao: number,
  extras: Sistema[] = [],
): PortaDeLuta {
  const luz = new MapaDeLuz();
  for (const l of gerada.luzes) {
    luz.adicionar({
      tipo: l.tipo,
      x: l.x,
      y: l.y,
      raio: l.raio,
      cura: l.tipo === 'poste',
      ...(l.feixe ? { feixe: l.feixe } : {}),
    });
  }
  const regras = new RegrasDaPorta(gerada, luz, conteudo, raioInteracao);
  const partida = montarPartida(gerada.rua, ficha, conteudo, semente, {
    sistemas: [regras.sistema, ...extras],
  });
  partida.mundo.luz = luz;
  regras.heroi = partida.jogador;
  return { ...partida, gerada, luz, regras };
}
