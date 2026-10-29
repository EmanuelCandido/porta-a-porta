import { ArmasDoCenario } from './armasDoCenario';
import { criarQuebraveis, ehQuebravel, quebrar, retirarObjeto } from './quebraveis';
import { estadoAtaque } from './autoataque';
import {
  aplicarEstado,
  causarDano,
  combatenteInimigo,
  definirModificadores,
  recalcular,
  temEstado,
  vivo,
} from './combate';
import type { Conteudo } from './partida';
import type { CampoDeFluxo } from './campoDeFluxo';
import type { DefInimigo, DefPedido } from './content/esquemas';
import type { Evento } from './eventos';
import type { RuaGerada } from './gerador';
import { distanciaNaLinha, type V2 } from './geometria';
import { lancadorDeAtaques, type Executor } from './habilidades';
import { ehIsca, heroiDe } from './ia';
import type { MapaDeLuz } from './luz';
import {
  adicionarEntidade,
  adicionarObstaculo,
  forcarMovimento,
  removerEntidade,
  removerObstaculo,
  type Acao,
  type Entidade,
  type Mundo,
  type Sistema,
} from './mundo';
import { espelharCampeao, type EcoDaCobranca, type ServicosDosChefes } from './chefes';
import { faixaDoSusto, multDoces, Susto, type EstadoSusto } from './susto';
import { Exploracao } from './exploracao';
import { devolverLote, esvaziarLote, levantar, meioDoLote, type LoteVazio } from './casaDesperta';
import { FinsDeBeco } from './finsDeBeco';
import { VelasDaViuva } from './arenaDosChefes';
import { EncontrosDaRua, type EncontroDaRua } from './encontros';

/** Um espaço de consumível: um tipo e quantos cabem empilhados (teclas 1 e 2). */
export interface EspacoConsumivel {
  id: string;
  qtd: number;
}

/** O que a run guarda e a rua usa (doces, consumíveis, Susto); muda durante a rua. */
export interface Bolso {
  doces: number;
  consumiveis: EspacoConsumivel[];
  susto: EstadoSusto;
}

/** Quantos consumíveis de um tipo o bolso tem. */
export function quantos(bolso: Bolso, id: string): number {
  return bolso.consumiveis.find((c) => c.id === id)?.qtd ?? 0;
}

/** O que um baú guarda. */
export interface ConteudoBau {
  pos: V2;
  tipo: 'comum' | 'raro' | 'amaldicoado';
  doces: number;
  item: string | null;
  /** Rerolls de preço (baú raro). */
  rerolls: number;
  /** Baú amaldiçoado: o trato forte e o preço dele, aceitos ou recusados na hora. */
  trato?: string;
  precos?: string[];
}

/** Um baú na rua (Chave Mestra, quintais, recompensa de portão). */
export interface Bau extends Omit<ConteudoBau, 'pos'> {
  entidade: Entidade;
  aberto: boolean;
  /** O tipo só aparece quando o jogador chega perto. */
  revelado: boolean;
}

/** O que a rua dá para a run guardar (itens, rerolls, o trato do Gato Preto). */
export type Recompensa =
  | { tipo: 'item'; id: string }
  | { tipo: 'reroll'; n: number }
  | { tipo: 'tratoGratis' }
  /** Baú amaldiçoado aberto: a run pergunta na hora se o trato é aceito. */
  | { tipo: 'ofertaDoBau'; trato: string; precos: string[] }
  /** Criança Perdida levada ao portão: Medalhas de Bom Vizinho (os doces já caíram na rua). */
  | { tipo: 'medalhas'; n: number }
  /** F no Carrinho de Pipoca: a run abre a loja dele. */
  | { tipo: 'carrinho' }
  /** O Morador Ofendido caiu: o trato dele, sem preço. */
  | { tipo: 'tratoDoMorador'; trato: string };

export interface EliteDaRua {
  especie: string;
  reforcado: boolean;
}

export interface OpcoesRua {
  /** Sem inimigos encantados (testes que contam com os números de sempre). */
  semEncantos?: boolean;
  bairro: number;
  /** Ondas Famintas: intervalo menor entre ondas. */
  intervaloOndas?: number;
  /** Festa no Quarteirão: pestinhas a mais por onda. */
  extraPorOnda?: number;
  /** Multiplicadores de dano e Coragem dos inimigos (Lua Vermelha, Meia-Noite, Lua Cheia). */
  multDanoInimigo?: number;
  multCoragemInimigo?: number;
  /** Lua Cheia 10: Coragem a mais dos chefes. */
  multCoragemChefe?: number;
  /** Lua Cheia 2: Postes Corrompidos recarregam mais rápido (velocidade de recarga). */
  multRecargaPostes?: number;
  /** Multiplicador de doces (Lua Vermelha). */
  multDoces?: number;
  /** Multiplicador de XP (Festa no Quarteirão). */
  multXp?: number;
  /** Cura dos postes amigos multiplicada (Conjunto Luz, Apagão Parcial). */
  multCuraPostes?: number;
  /** Relógio da Meia-Noite: multiplicador de Coragem e dano de quem nasce agora. */
  multMeiaNoite?: () => number;
  /** Doces a mais por inimigo derrotado (Cofre de Porquinho). */
  docesPorInimigo?: number;
  /** Doce-iscas de graça nesta rua (Pote sem Fundo). */
  iscasGratis?: number;
  /** Janela Aberta: janelas acesas curam como postes. */
  janelasCuram?: boolean;
  /** Baús a colocar na rua (Chave Mestra, quintais, recompensa de portão). */
  baus?: ConteudoBau[];
  /** Selvagem de cada quintal (na ordem de `gerada.quintais`), ou null. */
  selvagens?: (string | null)[];
  /** Elites da rua: nascem quando o 1º Poste cai (ou aos 90 s). */
  elites?: EliteDaRua[];
  /** Elites dos preços (Casa Perseguidora, Vizinho Curioso, Cobrador): nascem logo. */
  elitesExtras?: string[];
  /** Silêncio: corvos dormem e vigias enxergam metade. */
  silencio?: boolean;
  /** Tratos aceitos na run (o dano do Cobrador cresce com eles). */
  tratosAceitos?: number;
  /** Doces a mais do Cobrador derrotado (Dívida Antiga). */
  docesDoCobrador?: number;
  /** A run guarda o que a rua dá. */
  aoGanhar?: (r: Recompensa) => void;
  /** Casa Desconfiada: "Minijogos com folga" (janelas e tempos maiores). */
  folgaMinijogos?: boolean;
  /** O primeiro erro da run é perdoado: true uma vez (a run marca), depois false. */
  perdoarDesconfiada?: () => boolean;
  /** Um item comum que a run ainda não tem (a Casa Desperta derrotada pode dar). */
  itemDaCasaDesperta?: () => string | null;
  /** Praça do chefe: o chefe nasce no meio e o portão só abre quando ele cai. */
  chefe?: string;
  /** Mistura das pestinhas de cada onda, quando a curva da posição muda a do bairro. */
  composicaoOndas?: Record<string, number>;
  /** O encontro raro desta rua (no máximo um; o Gato Preto vai pelos selvagens). */
  encontro?: EncontroDaRua;
  /** Os preços pagos na run, para a Cobrança do Dono do Bairro. */
  ecos?: EcoDaCobranca[];
  /** Portões de saída lado a lado (rotas); o jogador escolhe passando por um deles. */
  portoes?: number;
  /** Ventania: graus por segundo de curva dos projéteis inimigos e o poste que apaga. */
  curvaProjeteis?: number;
  ventania?: { aCadaS: number; apagadoS: number };
  /** Pedido do morador desta rua. */
  pedido?: { id: string; def: DefPedido };
  /** Susto que a rua já começa (recompensa de pedido). */
  sustoInicial?: number;
  /** O morador que você recusou vezes demais: nasce como elite e dá o trato dele ao cair. */
  ofendido?: { trato: string; especie: string; fala: string };
  /** O baú que aparece quando todas as Abóboras Douradas da rua são achadas. */
  bauDosSegredos?: Omit<ConteudoBau, 'pos'>;
}

export type SituacaoPedido = 'andamento' | 'cumprido' | 'falhou';

export interface EstadoRua {
  tempo: number;
  ondasLancadas: number;
  /** Modo `pontos`: os bueiros que soltam um grupo quando o jogador chega perto (e se já soltaram). */
  pontosDeOnda: { pos: V2; acordado: boolean }[] | null;
  /** Modo `pontos`: enxames de morceguinhos já sorteados (um sorteio a cada `intervalo`). */
  enxamesSorteados: number;
  /** Inimigos ainda por nascer na onda atual. */
  filaDeNascimento: { especie: string; pos: V2; em: number }[];
  postes: Entidade[];
  postesCaidos: number;
  /** Tick em que cada Poste caiu (pedido "Poste 2 em até 20 s"). */
  quedas: number[];
  portaoAberto: boolean;
  venceu: boolean;
  derrota: boolean;
  docesNaRua: number;
  /** Doces soltos nesta rua, por fonte (inimigos, campainha, desconfiada, baús...). */
  docesPorFonte: Record<string, number>;
  derrotados: number;
  /** Dano que o jogador causou nesta rua. */
  danoCausado: number;
  /** Espécies de inimigo que apareceram nesta rua (Diário do Bairro). */
  especiesVistas: string[];
  coragemMinima: number;
  usouLanterna: boolean;
  maiorAbatePorHabilidade: number;
  iscasGratis: number;
  /** Curas ao longo do tempo (Pirulito): Coragem por segundo e segundos que faltam. */
  curas: { porS: number; restante: number }[];
  baus: Bau[];
  /** Elites ainda por nascer e as que já estão na rua. */
  elitesPendentes: EliteDaRua[];
  extrasPendentes: string[];
  elites: Entidade[];
  selvagensDerrotados: number;
  interrupcoes: number;
  chefe: Entidade | null;
  /** Grades do Portão do Síndico e o tick em que somem. */
  grades: { entidade: Entidade; ate: number }[];
  /** Por qual portão o jogador saiu (0 = o mais a oeste). */
  portaoEscolhido: number;
  pedido: SituacaoPedido;
  proximaVentania: number;
  /** Ruas interditadas que já abriram (índices de `gerada.bloqueios`). */
  bloqueiosAbertos: number[];
}

const COMPORTAMENTOS_DA_RUA = new Set(['onda', 'arremessador', 'canhao']);

/**
 * Regras de uma rua de luta (GDD e GAMEPLAY.md): ondas a cada 25 s saindo dos bueiros, os dois
 * Postes Corrompidos, o portão que abre quando os dois caem, doces que caem dos inimigos, cura na
 * luz dos postes amigos, lanterna, Doce-isca, recuo dos inimigos pequenos e o Susto.
 */
export class RegrasDaRua {
  readonly estado: EstadoRua;
  readonly sistema: Sistema;
  susto!: Susto;
  heroi!: Entidade;
  /** Névoa, campainhas, segredos, postes apagados e mirante (null fora da rota). */
  exploracao: Exploracao | null = null;
  /** Poço dos Desejos, Quintal das Velas e Casa Assombrada (null onde não há nenhum). */
  fins: FinsDeBeco | null = null;
  /** As velas do jardim da Viúva (null fora da arena dela). */
  velasDaViuva: VelasDaViuva | null = null;
  private armas: ArmasDoCenario | null = null;
  /** Explosões dos inimigos Explosivos que caíram, esperando o fim do aviso. */
  private explosoesInimigas: { centro: V2; origem: number; em: number }[] = [];
  /** Até qual tick o Síndico fica sem o Regulamento (um canteiro quebrou). */
  private desprotegidoAte = 0;
  /** Criando os aliados de um Chamador (eles nascem sem encanto). */
  private chamando = false;
  /** O encontro raro da rua, quando há um (Criança, Festa ou Carrinho). */
  encontros: EncontrosDaRua | null = null;
  /** Casas que saíram do lote e viraram inimigo (id da entidade → o que foi tirado do lote). */
  private readonly lotesVazios = new Map<number, LoteVazio>();

  constructor(
    private readonly mundoRef: () => Mundo,
    readonly gerada: RuaGerada,
    private readonly conteudo: Conteudo,
    readonly executor: Executor,
    readonly luz: MapaDeLuz,
    private readonly campo: CampoDeFluxo,
    readonly bolso: Bolso,
    readonly opcoes: OpcoesRua,
  ) {
    this.estado = {
      tempo: 0,
      ondasLancadas: 0,
      filaDeNascimento: [],
      pontosDeOnda: null,
      enxamesSorteados: 0,
      postes: [],
      postesCaidos: 0,
      quedas: [],
      portaoAberto: false,
      venceu: false,
      derrota: false,
      docesNaRua: 0,
      docesPorFonte: {},
      derrotados: 0,
      danoCausado: 0,
      especiesVistas: [],
      coragemMinima: 1,
      usouLanterna: false,
      maiorAbatePorHabilidade: 0,
      iscasGratis: opcoes.iscasGratis ?? 0,
      curas: [],
      baus: [],
      elitesPendentes: [...(opcoes.elites ?? [])],
      extrasPendentes: [
        ...(opcoes.elitesExtras ?? []),
        ...(opcoes.ofendido ? [opcoes.ofendido.especie] : []),
      ],
      elites: [],
      selvagensDerrotados: 0,
      interrupcoes: 0,
      chefe: null,
      grades: [],
      portaoEscolhido: 0,
      pedido: 'andamento',
      proximaVentania: opcoes.ventania?.aCadaS ?? Infinity,
      bloqueiosAbertos: [],
    };
    this.sistema = {
      antesDeMover: (mundo, acoes) => this.antesDeMover(mundo, acoes),
      depoisDoTick: (mundo, eventos) => this.depoisDoTick(mundo, eventos),
    };
  }

  /** Coloca o jogador, os Postes e a grade; chamado logo depois de montar o mundo. */
  iniciar(heroi: Entidade): void {
    const mundo = this.mundoRef();
    this.heroi = heroi;
    this.susto = new Susto(
      this.bolso.susto,
      this.conteudo.susto!,
      heroi.id,
      heroi.combate!,
      (id) => !!mundo.entidades.find((e) => e.id === id)?.marcas?.elite,
    );
    this.bolso.susto.frenesisNaRua = 0;
    this.bolso.susto.tempoEmPavor = 0;
    if (this.opcoes.sustoInicial) this.susto.encher(mundo, this.opcoes.sustoInicial, 'pedido');
    this.executor.curvaInimigos = this.opcoes.curvaProjeteis ?? 0;
    for (const g of this.gerada.grades ?? [this.gerada.grade]) {
      adicionarObstaculo(mundo, g);
      this.campo.grade.bloquear(g, 0.25);
    }
    for (const b of this.gerada.bloqueios) {
      adicionarObstaculo(mundo, b.area);
      this.campo.grade.bloquear(b.area, 0.25);
    }
    this.gerada.postesCorrompidos.forEach((p, i) => {
      const poste = this.criarInimigo(mundo, 'poste_corrompido', p);
      poste.marcas = { ...poste.marcas, indice: i, permanece: true };
      this.estado.postes.push(poste);
    });
    for (const b of this.opcoes.baus ?? []) this.adicionarBau(mundo, b);
    if (this.opcoes.encontro) this.iniciarEncontro(mundo, this.opcoes.encontro);
    if (this.opcoes.chefe) {
      const g = this.gerada;
      const chefe = this.criarInimigo(
        mundo,
        this.opcoes.chefe,
        g.lugarDoChefe?.pos ?? {
          x: (g.ruaX[0] + g.ruaX[1]) / 2,
          y: (g.yEntrada + g.ySaida) / 2 - 2,
        },
      );
      this.estado.chefe = chefe;
      // A Moradora do 13 copia as 4 habilidades do campeão, num duelo espelhado.
      const def = this.def(chefe.especie);
      if (def.comportamento === 'moradora')
        espelharCampeao(chefe, this.heroi, def, this.conteudo.combate);
      mundo.eventos.push({ tipo: 'faseChefe', fase: 1, nome: def.nome });
      const velas = this.gerada.velasDaArena;
      if (velas?.length)
        this.velasDaViuva = new VelasDaViuva(
          velas,
          {
            raioLuz: def.param['raioLuzVela'] ?? 2.8,
            raioInteracao: def.param['raioAcenderVela'] ?? 1.5,
          },
          this.luz,
          () => this.estado.chefe,
        );
    }
    // Grupos dormindo pela rota: pestinhas da composição do bairro, espalhadas em volta do ponto.
    const cfgOndas = this.conteudo.ondas;
    if (cfgOndas) {
      const b = Math.min(this.opcoes.bairro, cfgOndas.composicao.length - 1);
      for (const enc of this.gerada.encontros) {
        for (let k = 0; k < enc.n; k++) {
          const ang = (k / enc.n) * Math.PI * 2;
          const r = cfgOndas.encontros.espalhar;
          const alvo = { x: enc.pos.x + Math.cos(ang) * r, y: enc.pos.y + Math.sin(ang) * r };
          const grade = this.campo.grade;
          const pos = grade.ehLivre(alvo) ? alvo : grade.centro(grade.livreMaisPerto(alvo));
          const e = this.criarInimigo(mundo, sortear(mundo, cfgOndas.composicao[b]!), pos);
          e.marcas = { ...e.marcas, adormecido: true };
        }
      }
    }
    if (this.conteudo.exploracao) this.iniciarExploracao(mundo, heroi);
    if (this.conteudo.exploracao && this.gerada.fins?.length) this.iniciarFins();
    // Lixeiras, caixas de correio, abóboras de jardim...: quebram e soltam doces.
    const qb = this.conteudo.exploracao?.quebraveis;
    if (qb) {
      const objs = criarQuebraveis(
        mundo,
        this.gerada.rua,
        this.conteudo.modelos,
        qb,
        this.conteudo.combate,
      );
      this.esconderSacos(mundo, heroi, objs);
    }
    // Carro com alarme, fio do poste, hidrante, abóbora gigante e portão dos quintais.
    const armas = this.conteudo.exploracao?.armas;
    if (armas) {
      this.armas = new ArmasDoCenario(
        armas,
        this.conteudo.combate,
        this.conteudo.combate.estados,
        () => this.heroi,
        {
          bloquearCaminho: (area, fechado) => {
            if (fechado) this.campo.grade.bloquear(area, 0.25);
            else this.campo.grade.liberar(area);
            this.campo.alvo = -1;
          },
        },
      );
      this.armas.iniciar(mundo, this.gerada.rua, this.conteudo.modelos, this.gerada.portoes ?? []);
    }
    // Um selvagem por quintal; ele não sai de lá.
    (this.opcoes.selvagens ?? []).forEach((especie, i) => {
      const q = this.gerada.quintais[i];
      if (!especie || !q) return;
      const e = this.criarInimigo(mundo, especie, { ...q.selvagem });
      const ia = e.ia as Record<string, unknown>;
      ia['area'] = { ...q.area };
      ia['casa'] = { ...q.selvagem };
    });
    this.espantalhos(mundo);
  }

  /**
   * Espantalhos de Quintal (`ondas.json` → `espantalhos`): com a chance do bairro, `n` deles num
   * quintal da rua, espalhados pelos cantos (trocam de lugar entre si quando apanham).
   */
  private espantalhos(mundo: Mundo): void {
    const cfg = this.conteudo.ondas?.espantalhos;
    const quintais = this.gerada.quintais;
    if (!cfg || quintais.length === 0 || this.opcoes.chefe) return;
    const chance =
      cfg.chancePorBairro[Math.min(this.opcoes.bairro, cfg.chancePorBairro.length - 1)];
    if (mundo.rng.proximo() >= (chance ?? 0)) return;
    const q = quintais[mundo.rng.inteiro(0, quintais.length - 1)]!;
    const grade = this.campo.grade;
    const meio = { x: (q.area.x0 + q.area.x1) / 2, y: (q.area.y0 + q.area.y1) / 2 };
    const r = Math.min(q.area.x1 - q.area.x0, q.area.y1 - q.area.y0) / 2 - 1.5;
    for (let k = 0; k < cfg.n; k++) {
      const ang = (k / cfg.n + 0.125) * Math.PI * 2;
      const alvo = { x: meio.x + Math.cos(ang) * r, y: meio.y + Math.sin(ang) * r };
      const pos = grade.ehLivre(alvo) ? alvo : grade.centro(grade.livreMaisPerto(alvo));
      this.criarInimigo(mundo, cfg.especie, pos);
    }
  }

  /**
   * Pestinha de Vela: carrega uma luz e, enquanto estiver de pé, os aliados a até `raioAura`
   * batem `danoAura` mais forte (marca `iluminado`, que a tela mostra).
   */
  private auraDasVelas(mundo: Mundo): void {
    const velas: { e: Entidade; raio: number; bonus: number }[] = [];
    for (const e of mundo.entidades) {
      if (e.tipo !== 'inimigo') continue;
      const def = this.conteudo.inimigos?.inimigos[e.especie];
      if (def?.comportamento !== 'vela') continue;
      const luz = Number(e.marcas?.luzDaVela ?? -1);
      if (!vivo(e)) {
        if (luz >= 0) {
          this.luz.remover(luz);
          e.marcas = { ...e.marcas, luzDaVela: -1 };
        }
        continue;
      }
      if (luz < 0) {
        const f = this.luz.adicionar({
          tipo: 'janela',
          x: e.pos.x,
          y: e.pos.y,
          raio: def.param['raioLuz'] ?? 1.6,
          cura: false,
          segue: e.id,
        });
        e.marcas = { ...e.marcas, luzDaVela: f.id };
      }
      velas.push({ e, raio: def.param['raioAura'] ?? 3, bonus: def.param['danoAura'] ?? 0 });
    }
    // Luzes de velas que já saíram do mundo.
    for (const f of this.luz.fontes)
      if (f.segue !== null && f.tipo === 'janela' && !mundo.entidades.some((e) => e.id === f.segue))
        this.luz.remover(f.id);
    for (const o of mundo.entidades) {
      if (o.tipo !== 'inimigo' || !o.combate || !vivo(o)) continue;
      const v = velas.find(
        (x) => x.e !== o && Math.hypot(x.e.pos.x - o.pos.x, x.e.pos.y - o.pos.y) <= x.raio,
      );
      if (!!o.marcas?.iluminado === !!v) continue;
      o.marcas = { ...o.marcas, iluminado: !!v };
      definirModificadores(
        o.combate,
        'vela',
        v ? [{ origem: 'vela', atributo: 'dano', mult: v.bonus }] : [],
      );
      recalcular(o.combate);
    }
  }

  private iniciarFins(): void {
    const grade = this.campo.grade;
    const cfg = this.conteudo.exploracao!;
    this.fins = new FinsDeBeco(this.gerada.rua, this.gerada.fins ?? [], cfg.fins, {
      soltarDoces: (m, pos, base) => this.soltarDoces(m, pos, base, false, false, 'exploracao'),
      darConsumivel: (id) => this.darConsumivel(id),
      nascerPestinha: (m, pos) => {
        const e = this.criarInimigo(m, 'pestinha_lencol', pos);
        m.eventos.push({ tipo: 'invocou', id: e.id, especie: e.especie, pos: { ...e.pos } });
        return e.id;
      },
      adicionarBau: (m, pos, doces) =>
        this.adicionarBau(m, { pos, tipo: 'comum', doces, item: null, rerolls: 0 }),
      livreMaisPerto: (q) => (grade.ehLivre(q) ? q : grade.centro(grade.livreMaisPerto(q))),
      doces: () => this.bolso.doces,
      pagar: (valor) => {
        this.bolso.doces -= valor;
      },
      itens: cfg.campainha.itens,
    });
  }

  private iniciarExploracao(mundo: Mundo, heroi: Entidade): void {
    const g = this.gerada.exploracao;
    if (g.campainhas.length + g.segredos.length + g.postes.length === 0 && g.mirante === null)
      return;
    const grade = this.campo.grade;
    this.exploracao = new Exploracao(
      mundo,
      this.gerada.rua,
      g,
      this.conteudo.exploracao!,
      this.luz,
      this.conteudo.luz?.poste.raio ?? 3,
      {
        soltarDoces: (m, pos, base, semFrenesi, fonte) =>
          this.soltarDoces(m, pos, base, false, semFrenesi, fonte),
        darConsumivel: (id) => this.darConsumivel(id),
        encherSusto: (m, valor) => this.susto.encher(m, valor, 'segredo'),
        nascerPestinha: (m, pos) => {
          const e = this.criarInimigo(m, 'pestinha_lencol', pos);
          m.eventos.push({ tipo: 'invocou', id: e.id, especie: e.especie, pos: { ...e.pos } });
          return e.id;
        },
        bauDosSegredos: (m, pos) => {
          const c = this.opcoes.bauDosSegredos;
          m.eventos.push({ tipo: 'aviso', texto: 'Todas as Abóboras Douradas! Um baú apareceu.' });
          if (!c) return;
          const livre = grade.ehLivre({ x: pos.x + 1, y: pos.y })
            ? { x: pos.x + 1, y: pos.y }
            : grade.centro(grade.livreMaisPerto(pos));
          this.adicionarBau(m, { ...c, pos: livre });
        },
        livreMaisPerto: (q) => (grade.ehLivre(q) ? q : grade.centro(grade.livreMaisPerto(q))),
        andavel: (q) => grade.ehLivre(q),
        opcoesDoMinijogo: () => ({
          bairro: this.opcoes.bairro,
          folga: this.opcoes.folgaMinijogos ? this.conteudo.exploracao!.desconfiada.folga : 1,
          fantasia: heroi.especie,
          fantasias: Object.keys(this.conteudo.campeoes),
        }),
        inimigoPerto: (m, p, raio) =>
          m.entidades.some(
            (e) =>
              e.tipo === 'inimigo' &&
              vivo(e) &&
              !e.marcas?.disfarcado &&
              Math.hypot(e.pos.x - p.x, e.pos.y - p.y) <= raio,
          ),
        perdoarErro: () => this.opcoes.perdoarDesconfiada?.() ?? false,
        acordarCasa: (m, objeto, desconfiada) => {
          const especie = this.conteudo.exploracao!.desconfiada.especie;
          const e = this.acordarCasa(m, especie, objeto);
          e.marcas = { ...e.marcas, desconfiada };
          this.estado.elites.push(e);
          m.eventos.push({ tipo: 'invocou', id: e.id, especie, pos: { ...e.pos } });
        },
      },
    );
    this.exploracao.revelar(heroi.pos, this.conteudo.exploracao!.nevoa.raio);
  }

  /**
   * Inimigo comum encantado (inimigos.json → encantos): Apressado, Encouraçado, Explosivo ou
   * Chamador, com o nome e a aura na tela.
   */
  private encantar(mundo: Mundo, e: Entidade, def: DefInimigo): void {
    const enc = this.conteudo.inimigos?.encantos;
    if (!enc || def.elite || def.chefe || !enc.comportamentos.includes(def.comportamento)) return;
    // Quem foi chamado por um Chamador nasce comum (senão a chamada viraria uma cadeia sem fim).
    if (this.opcoes.semEncantos || this.chamando || mundo.rng.proximo() >= enc.chance) return;
    const tipo = sortear(mundo, enc.pesos);
    e.marcas = { ...e.marcas, encanto: tipo };
    if (tipo === 'apressado' && e.combate) {
      definirModificadores(e.combate, 'encanto', [
        { origem: 'encanto', atributo: 'velocidade', mult: enc.apressado.velocidade },
      ]);
      recalcular(e.combate);
    }
    if (tipo === 'encouracado') e.marcas = { ...e.marcas, escudoGolpes: enc.encouracado.golpes };
  }

  /** O Explosivo caiu: aviso vermelho no chão e, no fim dele, a explosão machuca o jogador perto. */
  private armarExplosao(mundo: Mundo, e: Entidade): void {
    const cfg = this.conteudo.inimigos?.encantos.explosivo;
    if (!cfg) return;
    this.explosoesInimigas.push({
      centro: { ...e.pos },
      origem: e.id,
      em: mundo.tick + Math.round(cfg.avisoS / mundo.dt),
    });
    mundo.eventos.push({
      tipo: 'avisoExplosao',
      centro: { ...e.pos },
      raio: cfg.raio,
      segundos: cfg.avisoS,
      lado: 'inimigo',
    });
  }

  /** Explosões dos Explosivos que chegaram na hora, e os Chamadores que viram o jogador. */
  private encantosNoTick(mundo: Mundo): void {
    const enc = this.conteudo.inimigos?.encantos;
    if (!enc) return;
    const j = this.heroi;
    const prontas = this.explosoesInimigas.filter((x) => x.em <= mundo.tick);
    this.explosoesInimigas = this.explosoesInimigas.filter((x) => x.em > mundo.tick);
    for (const x of prontas) {
      mundo.eventos.push({
        tipo: 'explosaoAbobora',
        centro: { ...x.centro },
        raio: enc.explosivo.raio,
      });
      if (
        vivo(j) &&
        Math.hypot(j.pos.x - x.centro.x, j.pos.y - x.centro.y) <= enc.explosivo.raio + j.raio
      )
        causarDano(mundo, j, {
          origem: x.origem,
          bruto: enc.explosivo.dano,
          tipo: 'ataque',
          comAviso: true,
        });
    }
    const ch = enc.chamador;
    for (const e of [...mundo.entidades]) {
      if (e.marcas?.encanto !== 'chamador' || e.marcas.chamou || !vivo(e)) continue;
      if (Math.hypot(e.pos.x - j.pos.x, e.pos.y - j.pos.y) > ch.raioVer) continue;
      e.marcas = { ...e.marcas, chamou: true };
      mundo.eventos.push({ tipo: 'grito', id: e.id, texto: 'Ajuda!', pos: { ...e.pos } });
      this.chamando = true;
      for (let k = 0; k < ch.n; k++) {
        const a = (k / ch.n) * Math.PI * 2;
        const p = { x: e.pos.x + Math.cos(a) * 0.8, y: e.pos.y + Math.sin(a) * 0.8 };
        const livre = this.campo.grade.ehLivre(p) ? p : { ...e.pos };
        const novo = this.criarInimigo(mundo, ch.especie, livre, {});
        mundo.eventos.push({
          tipo: 'invocou',
          id: novo.id,
          especie: novo.especie,
          pos: { ...novo.pos },
        });
      }
      this.chamando = false;
    }
  }

  /**
   * Algumas lixeiras da rua são um Saco-Surpresa (inimigos.json → sacosPorRua): a lixeira sai e o
   * saco fica no lugar, disfarçado. Nunca perto da entrada.
   */
  private esconderSacos(mundo: Mundo, heroi: Entidade, objs: Entidade[]): void {
    const faixa = this.conteudo.inimigos?.sacosPorRua;
    if (!faixa || !this.conteudo.inimigos?.inimigos['saco_surpresa']) return;
    const lixeiras = objs.filter(
      (o) =>
        o.especie === 'lixeira' && Math.hypot(o.pos.x - heroi.pos.x, o.pos.y - heroi.pos.y) > 15,
    );
    let n = Math.min(lixeiras.length, mundo.rng.inteiro(faixa[0], faixa[1]));
    while (n-- > 0) {
      const o = lixeiras.splice(mundo.rng.inteiro(0, lixeiras.length - 1), 1)[0]!;
      const pos = { ...o.pos };
      retirarObjeto(mundo, o, this.gerada.rua, this.conteudo.modelos);
      const saco = this.criarInimigo(mundo, 'saco_surpresa', pos);
      saco.marcas = { ...saco.marcas, visual: 'lixeira', disfarcado: true };
    }
  }

  /**
   * Regulamento do Síndico (pátio do condomínio): enquanto houver canteiro de pé, ele leva menos
   * dano (`param.protecao`); cada canteiro quebrado tira a proteção por `desprotegidoS` e o deixa
   * atordoado um instante. Sem canteiros, a proteção acaba de vez.
   */
  private regulamento(mundo: Mundo): void {
    const chefe = this.estado.chefe;
    if (!chefe?.combate || !vivo(chefe)) return;
    const p = this.def(chefe.especie).param;
    const protecao = p['protecao'] ?? 0;
    if (protecao <= 0) return;
    const canteiros = mundo.entidades.some((e) => e.especie === 'canteiro' && e.marcas?.quebravel);
    const protegido = canteiros && mundo.tick >= this.desprotegidoAte;
    if (!!chefe.marcas?.protegido === protegido) return;
    chefe.marcas = { ...chefe.marcas, protegido };
    definirModificadores(
      chefe.combate,
      'regulamento',
      protegido ? [{ origem: 'regulamento', atributo: 'danoRecebido', mult: -protecao }] : [],
    );
    recalcular(chefe.combate);
  }

  private canteiroQuebrou(mundo: Mundo): void {
    const chefe = this.estado.chefe;
    if (!chefe?.combate || !vivo(chefe)) return;
    const p = this.def(chefe.especie).param;
    this.desprotegidoAte = mundo.tick + Math.round((p['desprotegidoS'] ?? 4) / mundo.dt);
    aplicarEstado(
      chefe,
      { tipo: 'atordoado', restante: p['atordoaCanteiroS'] ?? 0.8 },
      this.conteudo.combate.estados,
    );
    mundo.eventos.push({
      tipo: 'grito',
      id: chefe.id,
      texto: 'Meu canteiro!',
      pos: { ...chefe.pos },
    });
    mundo.eventos.push({ tipo: 'aviso', texto: 'O Síndico perdeu o Regulamento!' });
  }

  /**
   * Espelho do corredor da Moradora quebrado: ela tropeça um instante e, quando o último cai, não
   * copia mais o jogador (o Reflexo partido acaba; ver `moradora` em src/sim/chefes.ts).
   */
  private espelhoQuebrou(mundo: Mundo, quebrado: Entidade): void {
    const chefe = this.estado.chefe;
    if (!chefe?.combate || !vivo(chefe)) return;
    const p = this.def(chefe.especie).param;
    aplicarEstado(
      chefe,
      { tipo: 'atordoado', restante: p['atordoaEspelhoS'] ?? 0.8 },
      this.conteudo.combate.estados,
    );
    const restam = mundo.entidades.filter(
      (x) => x !== quebrado && x.especie === 'espelho' && x.marcas?.quebravel,
    ).length;
    mundo.eventos.push({
      tipo: 'grito',
      id: chefe.id,
      texto: restam > 0 ? 'Meu reflexo!' : 'Não! Eu não sou mais você!',
      pos: { ...chefe.pos },
    });
    mundo.eventos.push({
      tipo: 'aviso',
      texto:
        restam > 0
          ? `Espelho quebrado! Faltam ${restam}.`
          : 'O último espelho caiu: ela não copia mais você.',
    });
  }

  /**
   * O tijolo do Dono caiu: fica no chão uma pilha que é cobertura contra o feixe (o golpe em linha
   * dos inimigos para nela) e quebra em `coberturaGolpes` golpes. No máximo `coberturasMax`.
   */
  private criarCobertura(mundo: Mundo, centro: V2): void {
    const chefe = this.estado.chefe;
    const p = chefe ? this.def(chefe.especie).param : {};
    const max = p['coberturasMax'] ?? 6;
    const pilhas = mundo.entidades.filter((e) => e.marcas?.cobertura);
    if (pilhas.length >= max) return;
    if (pilhas.some((e) => Math.hypot(e.pos.x - centro.x, e.pos.y - centro.y) < 1.2)) return;
    if (!this.campo.grade.ehLivre(centro)) return;
    const golpes = p['coberturaGolpes'] ?? 3;
    adicionarEntidade(mundo, {
      tipo: 'neutro',
      especie: 'pilha_tijolos',
      pos: { ...centro },
      raio: p['coberturaRaio'] ?? 0.45,
      velocidade: 0,
      solido: true,
      combate: combatenteInimigo({ coragem: golpes, resistencia: 0 }, this.conteudo.combate),
      marcas: {
        quebravel: true,
        dinamico: true,
        porGolpe: true,
        cobertura: true,
        objeto: -1,
        material: 'madeira',
      },
    });
  }

  /** O ponto é chão livre para andar (fora de casas, objetos e portões fechados)? */
  chaoLivre(p: V2): boolean {
    return this.campo.grade.ehLivre(p);
  }

  /** Um aliado caiu: os inimigos comuns perto hesitam um instante (janela para o jogador). */
  private hesitarPerto(mundo: Mundo, caido: Entidade): void {
    const cfg = this.conteudo.inimigos?.reacoes.aliadoCaiu;
    if (!cfg) return;
    const ate = mundo.tick + Math.round(cfg.segundos / mundo.dt);
    for (const o of mundo.entidades) {
      if (o === caido || o.tipo !== 'inimigo' || !vivo(o) || !o.combate?.recuo || !o.ia) continue;
      if (Math.hypot(o.pos.x - caido.pos.x, o.pos.y - caido.pos.y) > cfg.raio) continue;
      (o.ia as Record<string, unknown>)['hesitaAte'] = ate;
    }
  }

  /**
   * O golpe do jogador no preparo de um inimigo pequeno corta o ataque dele (o recuo do golpe já
   * cancela o preparo; aqui ele ganha a recarga, para não recomeçar na hora).
   */
  private cortarPreparos(mundo: Mundo): void {
    const cfg = this.conteudo.inimigos?.reacoes.interromperPreparo;
    for (const e of mundo.entidades) {
      const a = e.ataque;
      if (!a?.cortado) continue;
      a.cortado = false;
      if (!cfg || e.tipo !== 'inimigo' || !e.combate?.recuo || !vivo(e)) continue;
      a.preparo = null;
      a.recarga = Math.max(a.recarga, cfg.recargaS);
      mundo.eventos.push({ tipo: 'preparoCortado', id: e.id, pos: { ...e.pos } });
    }
  }

  /** Um objeto quebrável caiu: doces, às vezes um consumível ou uma pestinha escondida. */
  private quebrarObjeto(mundo: Mundo, e: Entidade): void {
    const cfg = this.conteudo.exploracao;
    if (!cfg) return;
    const efeito = cfg.quebraveis.modelos[e.especie]?.efeito;
    if (efeito === 'canteiro') this.canteiroQuebrou(mundo);
    if (efeito === 'espelho') this.espelhoQuebrou(mundo, e);
    // As armas leem o objeto antes de ele sair do mundo (posição, grupo do portão).
    this.armas?.quebrou(mundo, e, efeito);
    quebrar(mundo, e, this.gerada.rua, this.conteudo.modelos, cfg.quebraveis, {
      soltarDoces: (m, pos, base) => this.soltarDoces(m, pos, base, false, false, 'quebraveis'),
      darConsumivel: (id) => this.darConsumivel(id),
      nascerPestinha: (m, pos) => {
        const p = this.criarInimigo(m, 'pestinha_lencol', pos);
        m.eventos.push({ tipo: 'invocou', id: p.id, especie: p.especie, pos: { ...p.pos } });
        return p.id;
      },
      itens: cfg.campainha.itens,
    });
  }

  /** Põe um consumível no bolso, se couber na pilha ou num espaço livre. */
  private darConsumivel(id: string): boolean {
    const itens = this.conteudo.itens;
    if (!itens?.itens[id]) return false;
    const espaco = this.bolso.consumiveis.find((e) => e.id === id);
    if (espaco) {
      if (espaco.qtd >= itens.pilhaMaxima) return false;
      espaco.qtd++;
      return true;
    }
    if (this.bolso.consumiveis.length >= itens.maxConsumiveis) return false;
    this.bolso.consumiveis.push({ id, qtd: 1 });
    return true;
  }

  /** Acorda os grupos dormindo quando o jogador chega perto (ou quando levam dano). */
  private acordar(mundo: Mundo): void {
    const raio = this.conteudo.ondas?.encontros.raioDespertar ?? 8;
    const j = this.heroi;
    const acordados: V2[] = [];
    for (const e of mundo.entidades) {
      if (!e.marcas?.adormecido || !vivo(e)) continue;
      const ferido = e.combate ? e.combate.coragem < e.combate.attr.coragemMax : false;
      if (ferido || Math.hypot(e.pos.x - j.pos.x, e.pos.y - j.pos.y) <= raio) acordados.push(e.pos);
    }
    if (acordados.length === 0) return;
    // Acorda o grupo inteiro de quem acordou (todos a até 4 tiles).
    for (const e of mundo.entidades) {
      if (!e.marcas?.adormecido) continue;
      if (acordados.some((p) => Math.hypot(p.x - e.pos.x, p.y - e.pos.y) <= 4)) {
        const resto = { ...e.marcas };
        delete resto['adormecido'];
        e.marcas = resto;
      }
    }
  }

  /** Ruas interditadas que abrem quando caem Postes suficientes. */
  private abrirBloqueios(mundo: Mundo): void {
    this.gerada.bloqueios.forEach((b, i) => {
      if (this.estado.bloqueiosAbertos.includes(i) || this.estado.postesCaidos < b.postes) return;
      this.estado.bloqueiosAbertos.push(i);
      removerObstaculo(mundo, b.area);
      this.campo.grade.liberar(b.area);
      this.campo.alvo = -1;
      mundo.eventos.push({
        tipo: 'portaoAbriu',
        pos: { x: (b.area.x0 + b.area.x1) / 2, y: (b.area.y0 + b.area.y1) / 2 },
        grupo: b.grupo,
      });
      mundo.eventos.push({ tipo: 'aviso', texto: 'A rua interditada abriu! Siga em frente.' });
    });
  }

  /**
   * Põe um baú fechado na rua; o jogador abre com F (interagir) encostado nele. Todo baú nasce com
   * a cara de comum: o tipo aparece quando o jogador chega perto (`revelarBaus`).
   */
  adicionarBau(mundo: Mundo, c: ConteudoBau): Bau {
    const entidade = adicionarEntidade(mundo, {
      tipo: 'neutro',
      especie: 'bau',
      pos: { ...c.pos },
      raio: 0.35,
      velocidade: 0,
      solido: true,
      marcas: { bau: true },
    });
    const bau: Bau = {
      entidade,
      tipo: c.tipo,
      doces: c.doces,
      item: c.item,
      rerolls: c.rerolls,
      trato: c.trato,
      precos: c.precos,
      aberto: false,
      revelado: false,
    };
    this.estado.baus.push(bau);
    return bau;
  }

  /** De perto, o baú mostra o que é: o raro ganha a fita roxa e o amaldiçoado treme. */
  private revelarBaus(mundo: Mundo): void {
    const raio = this.conteudo.run?.baus.raioRevelar;
    const j = this.heroi;
    if (raio === undefined || !vivo(j)) return;
    for (const b of this.estado.baus) {
      if (b.revelado || b.aberto) continue;
      const p = b.entidade.pos;
      if (Math.hypot(p.x - j.pos.x, p.y - j.pos.y) > raio) continue;
      b.revelado = true;
      if (b.tipo === 'raro') b.entidade.especie = 'bau_raro';
      else if (b.tipo === 'amaldicoado') b.entidade.especie = 'bau_amaldicoado';
      mundo.eventos.push({
        tipo: 'bauRevelado',
        id: b.entidade.id,
        tipoBau: b.tipo,
        pos: { ...p },
      });
    }
  }

  /** Põe o encontro raro na rua (no começo dela; os testes também chamam). */
  iniciarEncontro(mundo: Mundo, encontro: EncontroDaRua): void {
    const cfg = this.conteudo.run?.encontros;
    if (!cfg) return;
    this.encontros = new EncontrosDaRua(encontro, cfg, {
      heroi: () => this.heroi,
      campo: this.campo,
      combate: this.conteudo.combate,
      criarInimigo: (m, especie, pos) => this.criarInimigo(m, especie, pos),
      salvarCrianca: (m, doces, medalhas) => {
        this.soltarDoces(m, this.heroi.pos, doces, true, false, 'encontros');
        this.opcoes.aoGanhar?.({ tipo: 'medalhas', n: medalhas });
      },
      abrirCarrinho: () => this.opcoes.aoGanhar?.({ tipo: 'carrinho' }),
    });
    this.encontros.iniciar(mundo);
  }

  /** O que os selvagens, as elites e o chefe pedem às regras (ver src/sim/elites.ts). */
  servicos(): ServicosDosChefes {
    const g = this.gerada;
    return {
      apagarLuzes: (mundo, exceto) => {
        const objetos = new Set<number>();
        for (const f of this.luz.fontes) {
          if ((f.tipo !== 'poste' && f.tipo !== 'janela') || f.objeto === exceto) continue;
          f.desligadaAte = Infinity;
          if (f.objeto !== undefined) objetos.add(f.objeto);
        }
        this.luz.versao++;
        mundo.eventos.push({ tipo: 'luzesApagadas', objetos: [...objetos] });
        mundo.eventos.push({ tipo: 'aviso', texto: 'As luzes da praça se apagaram!' });
      },
      apagarUmPoste: (mundo) => {
        const j = this.heroi.pos;
        const acesos = this.luz.fontes
          .filter((f) => f.tipo === 'poste' && f.desligadaAte === null)
          .sort((a, b) => Math.hypot(a.x - j.x, a.y - j.y) - Math.hypot(b.x - j.x, b.y - j.y));
        const f = acesos[0];
        if (!f) return false;
        f.desligadaAte = Infinity;
        this.luz.versao++;
        if (f.objeto !== undefined)
          mundo.eventos.push({ tipo: 'luzesApagadas', objetos: [f.objeto] });
        return true;
      },
      areaEscura: (mundo, pos, raio, segundos) => {
        this.luz.adicionarSombra({
          x: pos.x,
          y: pos.y,
          raio,
          ate: mundo.tick + Math.round(segundos / mundo.dt),
        });
      },
      lugarDoChefe: g.lugarDoChefe ?? null,
      ecosDaCobranca: this.opcoes.ecos ?? [],
      cobranca: this.conteudo.inimigos?.cobranca,
      invocar: (mundo, especie, pos) => {
        const grade = this.campo.grade;
        const livre = grade.ehLivre(pos) ? pos : grade.centro(grade.livreMaisPerto(pos));
        const e = this.criarInimigo(mundo, especie, livre);
        mundo.eventos.push({ tipo: 'invocou', id: e.id, especie, pos: { ...e.pos } });
        return e;
      },
      alarme: (mundo, de, raio, n) => {
        mundo.eventos.push({ tipo: 'alarme', pos: { ...de.pos }, raio });
        if (g.bueiros.length === 0) return;
        const b = [...g.bueiros].sort(
          (a, c) =>
            Math.hypot(a.x - de.pos.x, a.y - de.pos.y) - Math.hypot(c.x - de.pos.x, c.y - de.pos.y),
        )[0]!;
        for (let k = 0; k < n; k++) {
          const e = this.criarInimigo(mundo, 'pestinha_lencol', {
            x: b.x + mundo.rng.entre(-0.3, 0.3),
            y: b.y + 0.3,
          });
          mundo.eventos.push({ tipo: 'invocou', id: e.id, especie: e.especie, pos: { ...e.pos } });
        }
      },
      bonusPestinhas: (mundo, mult, segundos) => {
        for (const e of mundo.entidades) {
          if (e.tipo !== 'inimigo' || !vivo(e) || !e.combate) continue;
          if (!COMPORTAMENTOS_DA_RUA.has(this.def(e.especie).comportamento)) continue;
          e.combate.mods.push({ origem: 'alerta', atributo: 'dano', mult, restante: segundos });
        }
      },
      sumir: (mundo, e, texto) => {
        removerEntidade(mundo, e.id);
        mundo.eventos.push({ tipo: 'aviso', texto });
      },
      tratosAceitos: () => this.opcoes.tratosAceitos ?? 0,
      silencio: () => !!this.opcoes.silencio,
      casaVoltou: (mundo, e) => this.casaVoltou(mundo, e),
      faixaDaRua: { x0: g.ruaX[0] - 0.6, x1: g.ruaX[1] + 0.6 },
      portaMaisPerto: (p) => {
        let melhor: V2 | null = null;
        let d0 = Infinity;
        for (const q of g.portas) {
          const d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d < d0) {
            d0 = d;
            melhor = { x: q.x, y: q.y };
          }
        }
        return melhor;
      },
      sombraLonge: (p, longeDe, min) => {
        let melhor: V2 | null = null;
        let d0 = Infinity;
        for (let dx = -10; dx <= 10; dx += 0.5) {
          for (let dy = -10; dy <= 10; dy += 0.5) {
            const q = { x: p.x + dx, y: p.y + dy };
            if (Math.hypot(q.x - longeDe.x, q.y - longeDe.y) < min) continue;
            if (!this.campo.grade.ehLivre(q) || this.luz.iluminado(q)) continue;
            const d = Math.hypot(dx, dy);
            if (d < d0) {
              d0 = d;
              melhor = q;
            }
          }
        }
        return melhor;
      },
      livre: (p) => this.campo.grade.ehLivre(p),
    };
  }

  /**
   * Coloca uma elite: a Casa sai de uma porta, o Vizinho patrulha a calçada, a Sombra no escuro.
   * Público para o modo dev (aba Testar).
   */
  nascerElite(mundo: Mundo, especie: string, reforcado: boolean): Entidade | null {
    const g = this.gerada;
    if (!this.conteudo.inimigos?.inimigos[especie]) return null;
    // A elite chega pela praça, que é aberta para desviar dos avisos (docs/DESIGN.md).
    const alvo = g.praca ??
      this.estado.postes[1]?.pos ?? {
        x: (g.ruaX[0] + g.ruaX[1]) / 2,
        y: (g.yEntrada + g.ySaida) / 2,
      };
    let pos: V2 = { x: alvo.x + 2.5, y: alvo.y + 2.5 };
    if (especie === 'sombra_rasteira') {
      pos = this.servicos().sombraLonge(pos, this.heroi.pos, 6) ?? pos;
    } else if (especie === 'cobrador') {
      pos = { x: (g.ruaX[0] + g.ruaX[1]) / 2, y: g.ySaida + 6 };
    }
    if (!this.campo.grade.ehLivre(pos))
      pos = this.campo.grade.centro(this.campo.grade.livreMaisPerto(pos));
    const lote = this.def(especie).comportamento === 'casa' ? this.loteParaACasa(alvo) : null;
    const e = lote
      ? this.acordarCasa(mundo, especie, lote)
      : this.criarInimigo(mundo, especie, pos);
    if (!lote && this.def(especie).comportamento === 'casa')
      levantar(mundo, e, this.def(especie).param['transformacaoS'] ?? 0);
    if (reforcado && e.combate) {
      const r = this.conteudo.inimigos.eliteReforcado;
      e.combate.base.coragemMax *= 1 + r;
      e.combate.base.dano *= 1 + r;
      e.combate.attr = { ...e.combate.attr, coragemMax: e.combate.base.coragemMax };
      e.combate.coragem = e.combate.base.coragemMax;
      e.marcas = { ...e.marcas, reforcado: true };
    }
    if (especie === 'vizinho_curioso') {
      // Patrulha ao longo da rua onde nasceu (o eixo em que há mais chão livre).
      const ia = e.ia as Record<string, unknown>;
      const grade = this.campo.grade;
      const livres = (dx: number, dy: number) =>
        [1, 2, 3].filter((k) => grade.ehLivre({ x: e.pos.x + dx * k, y: e.pos.y + dy * k })).length;
      const emX = livres(1, 0) + livres(-1, 0) >= livres(0, 1) + livres(0, -1);
      ia['a'] = emX ? { x: e.pos.x - 3, y: e.pos.y } : { x: e.pos.x, y: e.pos.y - 3 };
      ia['b'] = emX ? { x: e.pos.x + 3, y: e.pos.y } : { x: e.pos.x, y: e.pos.y + 3 };
    }
    const ofendido = this.opcoes.ofendido;
    if (ofendido && especie === ofendido.especie) {
      e.marcas = { ...e.marcas, tratoDoMorador: ofendido.trato };
      mundo.eventos.push({ tipo: 'grito', id: e.id, pos: { ...e.pos }, texto: ofendido.fala });
    }
    if (especie === 'cobrador' && this.opcoes.docesDoCobrador)
      e.marcas = { ...e.marcas, doces: Number(e.marcas?.doces ?? 0) + this.opcoes.docesDoCobrador };
    this.estado.elites.push(e);
    mundo.eventos.push({ tipo: 'invocou', id: e.id, especie, pos: { ...e.pos } });
    mundo.eventos.push({ tipo: 'aviso', texto: `${this.def(especie).nome} chegou!` });
    return e;
  }

  /** Elites da rua depois do 1º Poste (ou do tempo) e as dos preços logo no começo. */
  private elites(mundo: Mundo): void {
    const est = this.estado;
    const cfg = this.conteudo.inimigos!.elitesNaRua;
    if (est.extrasPendentes.length > 0 && est.tempo >= cfg.extrasAosSegundos) {
      for (const especie of est.extrasPendentes) this.nascerElite(mundo, especie, false);
      est.extrasPendentes = [];
    }
    if (est.elitesPendentes.length > 0 && (est.postesCaidos >= 1 || est.tempo >= cfg.aosSegundos)) {
      for (const el of est.elitesPendentes) this.nascerElite(mundo, el.especie, el.reforcado);
      est.elitesPendentes = [];
    }
  }

  /** Ventania: a cada minuto, um poste amigo apaga por 20 s. */
  private ventania(mundo: Mundo): void {
    const v = this.opcoes.ventania;
    const est = this.estado;
    if (!v || est.tempo < est.proximaVentania) return;
    est.proximaVentania += v.aCadaS;
    const postes = this.luz.fontes.filter((f) => f.tipo === 'poste' && f.desligadaAte === null);
    if (postes.length === 0) return;
    const f = postes[mundo.rng.inteiro(0, postes.length - 1)]!;
    f.desligadaAte = mundo.tick + Math.round(v.apagadoS / mundo.dt);
    this.luz.versao++;
    mundo.eventos.push({ tipo: 'aviso', texto: 'O vento apagou um poste!' });
  }

  /** Como está o pedido do morador; `final` = a rua acabou de ser vencida. */
  avaliarPedido(final = false): SituacaoPedido {
    const p = this.opcoes.pedido;
    const est = this.estado;
    if (!p || est.pedido !== 'andamento') return est.pedido;
    const d = p.def;
    const tps = 1 / this.mundoRef().dt;
    switch (p.id) {
      case 'postes_rapidos':
        if (est.quedas.length >= 2)
          return (est.quedas[1]! - est.quedas[0]!) / tps <= (d.segundos ?? 20)
            ? 'cumprido'
            : 'falhou';
        return 'andamento';
      case 'sem_lanterna':
        if (est.usouLanterna) return 'falhou';
        return final ? 'cumprido' : 'andamento';
      case 'abate_multiplo':
        return est.maiorAbatePorHabilidade >= (d.n ?? 6) ? 'cumprido' : 'andamento';
      case 'frenesi_duplo':
        return this.bolso.susto.frenesisNaRua >= (d.n ?? 2) ? 'cumprido' : 'andamento';
      case 'pouco_dano':
        if (est.coragemMinima < 1 - (d.fracao ?? 0.3)) return 'falhou';
        return final ? 'cumprido' : 'andamento';
      case 'selvagem':
        return est.selvagensDerrotados >= 1 ? 'cumprido' : 'andamento';
      case 'interrupcoes':
        return est.interrupcoes >= (d.n ?? 3) ? 'cumprido' : 'andamento';
      case 'explorador':
        return (this.exploracao?.fracao() ?? 0) >= (d.fracao ?? 0.6) ? 'cumprido' : 'andamento';
      case 'abobora_dourada':
        return (this.exploracao?.estado.achados ?? 0) >= (d.n ?? 2) ? 'cumprido' : 'andamento';
      case 'campainhas':
        return (this.exploracao?.estado.tocadas ?? 0) >= (d.n ?? 4) ? 'cumprido' : 'andamento';
      case 'religar':
        return (this.exploracao?.estado.religados ?? 0) >= (d.n ?? 2) ? 'cumprido' : 'andamento';
      default:
        return 'andamento';
    }
  }

  private atualizarPedido(mundo: Mundo, final = false): void {
    const antes = this.estado.pedido;
    const agora = this.avaliarPedido(final);
    if (agora === antes) return;
    this.estado.pedido = agora;
    if (agora === 'cumprido' && this.opcoes.pedido)
      mundo.eventos.push({ tipo: 'pedidoCumprido', pedido: this.opcoes.pedido.id });
  }

  /** Elites vivas, para a barra da interface. */
  /** Ondas para a interface: quantas já vieram, o total e em quantos segundos chega a próxima. */
  ondasNaTela(): {
    atual: number;
    total: number;
    proximaEm: number | null;
    pontos?: boolean;
  } | null {
    const cfg = this.conteudo.ondas;
    if (!cfg || this.gerada.bueiros.length === 0 || this.estado.chefe) return null;
    const pontos = this.estado.pontosDeOnda;
    if (cfg.modo === 'pontos' && pontos)
      return {
        atual: this.estado.ondasLancadas,
        total: pontos.length,
        proximaEm: null,
        pontos: true,
      };
    const intervalo = this.opcoes.intervaloOndas ?? cfg.intervalo;
    const atual = this.estado.ondasLancadas;
    const proxima =
      atual < cfg.total ? cfg.primeiraEm + atual * intervalo - this.estado.tempo : null;
    return { atual, total: cfg.total, proximaEm: proxima === null ? null : Math.max(0, proxima) };
  }

  elitesVivas(): { nome: string; fracao: number }[] {
    return this.estado.elites
      .filter((e) => vivo(e) && e.combate)
      .map((e) => ({
        nome: this.def(e.especie).nome,
        fracao: e.combate!.coragem / e.combate!.attr.coragemMax,
      }));
  }

  /**
   * Uma casa térrea da rota para a Casa Perseguidora sair (Elenco v7): a mais perto de `perto`, a até
   * `loteAteTiles` dele e a pelo menos `loteLongeDoJogador` do jogador, sem campainha nem outra casa
   * já acordada. Só contam as casas com porta para o caminho (as da cidade em volta ficam).
   */
  private loteParaACasa(perto: V2): number | null {
    const p = this.def('casa_perseguidora').param;
    const ocupadas = new Set([...this.lotesVazios.values()].map((l) => l.objeto));
    const campainhas = this.gerada.exploracao.campainhas;
    let melhor: number | null = null;
    let d0 = p['loteAteTiles'] ?? 14;
    this.gerada.rua.objetos.forEach((o, i) => {
      if (o.modelo !== 'casa_terrea' || o.grupo || ocupadas.has(i)) return;
      const porta = this.portaDoLote(i);
      if (!porta) return;
      if (campainhas.some((c) => Math.hypot(c.x - porta.x, c.y - porta.y) < 0.5)) return;
      const { centro } = meioDoLote(o, this.conteudo.modelos);
      const longe = Math.hypot(centro.x - this.heroi.pos.x, centro.y - this.heroi.pos.y);
      if (longe < (p['loteLongeDoJogador'] ?? 8)) return;
      const d = Math.hypot(centro.x - perto.x, centro.y - perto.y);
      if (d < d0) {
        d0 = d;
        melhor = i;
      }
    });
    return melhor;
  }

  /** O ponto da calçada diante da porta da casa do lote (só as casas da rota têm). */
  portaDoLote(objeto: number): V2 | null {
    const o = this.gerada.rua.objetos[objeto]!;
    const { centro, frente } = meioDoLote(o, this.conteudo.modelos);
    const { pegada } = this.conteudo.modelos[o.modelo];
    const meio = (o.rot === 0 || o.rot === 180 ? pegada.largura : pegada.profundidade) / 2;
    const esperada = { x: centro.x + frente.x * meio, y: centro.y + frente.y * meio };
    let melhor: V2 | null = null;
    let d0 = meio;
    for (const q of this.gerada.portas) {
      const d = Math.hypot(q.x - esperada.x, q.y - esperada.y);
      if (d < d0) {
        d0 = d;
        melhor = { x: q.x, y: q.y };
      }
    }
    return melhor;
  }

  /**
   * A casa do lote vira inimigo: some do cenário, a espécie nasce no meio do lote olhando para a rua,
   * levanta e sai pela porta.
   */
  acordarCasa(mundo: Mundo, especie: string, objeto: number): Entidade {
    const o = this.gerada.rua.objetos[objeto]!;
    const { centro, frente } = meioDoLote(o, this.conteudo.modelos);
    const vazio = esvaziarLote(mundo, this.gerada.rua, this.conteudo.modelos, this.luz, objeto);
    const e = this.criarInimigo(mundo, especie, centro);
    const porta = this.portaDoLote(objeto) ?? centro;
    const saida = { x: porta.x + frente.x * e.raio, y: porta.y + frente.y * e.raio };
    (e.ia as Record<string, unknown>)['saida'] = this.campo.grade.ehLivre(saida)
      ? saida
      : this.campo.grade.centro(this.campo.grade.livreMaisPerto(saida));
    e.marcas = { ...e.marcas, lote: objeto };
    levantar(mundo, e, this.def(especie).param['transformacaoS'] ?? 0, frente);
    this.lotesVazios.set(e.id, vazio);
    return e;
  }

  /** A Casa Desperta derrotada desaba no lote: os doces da casa inteira e, às vezes, um item. */
  private casaDespertaCaiu(mundo: Mundo, e: Entidade): void {
    const cfg = this.conteudo.exploracao!.desconfiada;
    this.lotesVazios.delete(e.id);
    const mult = cfg.multPorBairro[Math.min(this.opcoes.bairro, cfg.multPorBairro.length - 1)]!;
    this.soltarDoces(
      mundo,
      e.pos,
      Math.round(cfg.premios.derrotada * mult),
      false,
      true,
      'desconfiada',
    );
    if (mundo.rng.proximo() < cfg.chanceItemDerrotada) {
      const item = this.opcoes.itemDaCasaDesperta?.() ?? null;
      if (item) this.opcoes.aoGanhar?.({ tipo: 'item', id: item });
    }
    mundo.eventos.push({ tipo: 'aviso', texto: cfg.textos.derrotada });
  }

  /** A Casa Desperta deitou de novo: sai da rua e a casa volta para o lote. */
  private casaVoltou(mundo: Mundo, e: Entidade): void {
    const lote = this.lotesVazios.get(e.id);
    removerEntidade(mundo, e.id);
    this.estado.elites = this.estado.elites.filter((x) => x !== e);
    if (!lote) return;
    this.lotesVazios.delete(e.id);
    devolverLote(mundo, this.gerada.rua, this.conteudo.modelos, this.luz, lote);
    mundo.eventos.push({ tipo: 'aviso', texto: 'A casa voltou a dormir.' });
  }

  private def(especie: string): DefInimigo {
    const d = this.conteudo.inimigos!.inimigos[especie];
    if (!d) throw new Error(`inimigo ${especie} não existe em content/inimigos.json`);
    return d;
  }

  /** Cria um inimigo com a Coragem do bairro e os multiplicadores da noite. */
  criarInimigo(mundo: Mundo, especie: string, pos: V2, extra: Partial<Entidade> = {}): Entidade {
    const def = this.def(especie);
    const esc = this.conteudo.inimigos!.escalaPorBairro;
    // Cada chefe já tem os números do bairro dele.
    const b = def.chefe ? 0 : Math.min(this.opcoes.bairro, esc.coragem.length - 1);
    const meiaNoite = this.opcoes.multMeiaNoite?.() ?? 1;
    const doChefe = def.chefe ? (this.opcoes.multCoragemChefe ?? 1) : 1;
    const porId = new Map(this.conteudo.habilidades.map((h) => [h.id, h]));
    const ataques = def.ataques.map((id) => {
      const h = porId.get(id);
      if (!h) throw new Error(`ataque ${id} de ${especie} não existe`);
      return h;
    });
    const e = adicionarEntidade(mundo, {
      tipo: 'inimigo',
      especie,
      pos,
      raio: def.raio,
      velocidade: def.velocidade,
      solido: def.solido,
      combate: combatenteInimigo(
        {
          coragem:
            def.coragem *
            esc.coragem[b]! *
            (this.opcoes.multCoragemInimigo ?? 1) *
            doChefe *
            meiaNoite,
          resistencia: def.resistencia,
          dano: esc.dano[b]! * (this.opcoes.multDanoInimigo ?? 1) * meiaNoite,
          chefe: def.chefe,
          recua: def.recua && !def.elite,
        },
        this.conteudo.combate,
      ),
      lancador: ataques.length > 0 ? lancadorDeAtaques(ataques) : undefined,
      ataque: def.autoAtaque ? estadoAtaque(def.autoAtaque, false) : undefined,
      ia: { estado: 'inicio', def: especie },
      marcas: {
        xp: def.xp * (this.opcoes.multXp ?? 1),
        doces: def.doces,
        elite: def.elite,
      },
      ...extra,
    });
    if (!this.estado.especiesVistas.includes(especie)) this.estado.especiesVistas.push(especie);
    this.encantar(mundo, e, def);
    const recargaPostes = this.opcoes.multRecargaPostes ?? 1;
    if (especie === 'poste_corrompido' && recargaPostes !== 1 && e.combate) {
      definirModificadores(e.combate, 'lua', [
        { origem: 'lua', atributo: 'velocidadeRecarga', mult: recargaPostes - 1 },
      ]);
      recalcular(e.combate);
    }
    return e;
  }

  // ------------------------------------------------------------------ por tick

  private antesDeMover(mundo: Mundo, acoes: readonly Acao[]): void {
    const dt = mundo.dt;
    const est = this.estado;
    est.tempo += dt;
    this.luz.atualizar(mundo.tick, (id) => mundo.entidades.find((e) => e.id === id)?.pos ?? null);
    this.ondas(mundo);
    this.elites(mundo);
    this.ventania(mundo);
    for (const a of acoes) {
      if (a.tipo === 'usar') this.usar(mundo, a.acao, { x: a.x, y: a.y });
    }
    this.acordar(mundo);
    this.revelarBaus(mundo);
    this.encontros?.tick(mundo);
    if (this.exploracao && vivo(this.heroi)) this.exploracao.tick(mundo, this.heroi);
    if (this.fins && vivo(this.heroi)) this.fins.tick(mundo, this.heroi);
    this.velasDaViuva?.tick(mundo);
    this.luzNoJogador(mundo);
    this.curasAoLongo(mundo);
    this.doces(mundo);
    this.iscas(mundo);
    this.criaturasDaSombra(mundo);
    const j = this.heroi;
    if (j.combate)
      est.coragemMinima = Math.min(
        est.coragemMinima,
        j.combate.coragem / j.combate.attr.coragemMax,
      );
  }

  private ondas(mundo: Mundo): void {
    const est = this.estado;
    const cfg = this.conteudo.ondas!;
    // A praça do chefe não tem bueiros nem ondas.
    if (this.gerada.bueiros.length === 0) return;
    if (cfg.modo === 'pontos' && cfg.pontos) {
      est.pontosDeOnda ??= this.escolherPontos();
      // Ondas Famintas: os bueiros acordam de mais longe (na proporção do intervalo menor).
      const raio =
        cfg.pontos.raioGatilho * (cfg.intervalo / (this.opcoes.intervaloOndas ?? cfg.intervalo));
      const j = this.heroi.pos;
      for (const p of est.pontosDeOnda) {
        if (p.acordado || Math.hypot(p.pos.x - j.x, p.pos.y - j.y) > raio) continue;
        p.acordado = true;
        this.lancarOnda(mundo, [p.pos]);
      }
      // Os morceguinhos continuam aparecendo do nada, por tempo, de um bueiro perto do jogador.
      const intervalo = this.opcoes.intervaloOndas ?? cfg.intervalo;
      if (est.tempo >= cfg.primeiraEm + est.enxamesSorteados * intervalo) {
        est.enxamesSorteados++;
        this.soltarEnxame(mundo, this.bueirosDaOnda(false)[0], est.enxamesSorteados);
      }
    } else {
      const intervalo = this.opcoes.intervaloOndas ?? cfg.intervalo;
      const proxima = cfg.primeiraEm + est.ondasLancadas * intervalo;
      if (est.ondasLancadas < cfg.total && est.tempo >= proxima)
        this.lancarOnda(mundo, this.bueirosDaOnda(est.ondasLancadas + 1 >= cfg.flancoDesdeOnda));
    }
    const prontos = est.filaDeNascimento.filter((f) => f.em <= est.tempo);
    est.filaDeNascimento = est.filaDeNascimento.filter((f) => f.em > est.tempo);
    for (const f of prontos) {
      const b = f.pos;
      const e = this.criarInimigo(mundo, f.especie, {
        x: b.x + mundo.rng.entre(-0.2, 0.2),
        y: b.y + 0.3,
      });
      mundo.eventos.push({ tipo: 'invocou', id: e.id, especie: f.especie, pos: { ...e.pos } });
    }
  }

  /** Uma onda: o grupo do bairro (e às vezes um enxame ou uma Vela) saindo das `saidas`. */
  private lancarOnda(mundo: Mundo, saidas: V2[]): void {
    const est = this.estado;
    const cfg = this.conteudo.ondas!;
    est.ondasLancadas++;
    const b = Math.min(this.opcoes.bairro, cfg.porBairro.length - 1);
    const n = cfg.porBairro[b]! + (this.opcoes.extraPorOnda ?? 0);
    const pesos =
      this.opcoes.composicaoOndas ?? cfg.composicao[Math.min(b, cfg.composicao.length - 1)]!;
    for (let i = 0; i < n; i++) {
      const especie =
        cfg.primeiraSoLencois && est.ondasLancadas === 1
          ? 'pestinha_lencol'
          : sortear(mundo, pesos);
      est.filaDeNascimento.push({
        especie,
        pos: saidas[i % saidas.length]!,
        em: est.tempo + Math.floor(i / saidas.length) * cfg.intervaloEntreNascimentos,
      });
    }
    // Às vezes a onda traz um enxame de morceguinhos (do primeiro bueiro da onda); no modo
    // `pontos` eles vêm por tempo, à parte.
    if (cfg.modo !== 'pontos') this.soltarEnxame(mundo, saidas[0], est.ondasLancadas);
    // E às vezes uma Pestinha de Vela, que vem atrás do grupo.
    const vela = cfg.vela;
    const cv = vela.chancePorBairro[Math.min(b, vela.chancePorBairro.length - 1)] ?? 0;
    if (est.ondasLancadas >= vela.desdeOnda && mundo.rng.proximo() < cv) {
      for (let i = 0; i < vela.n; i++)
        est.filaDeNascimento.push({
          especie: vela.especie,
          pos: saidas[saidas.length - 1]!,
          em: est.tempo + (i + 1) * cfg.intervaloEntreNascimentos,
        });
    }
    mundo.eventos.push({ tipo: 'onda', numero: est.ondasLancadas });
  }

  /** Às vezes (pela chance do bairro, a partir do `desdeOnda`-ésimo) um enxame de morceguinhos. */
  private soltarEnxame(mundo: Mundo, saida: V2 | undefined, numero: number): void {
    const est = this.estado;
    const cfg = this.conteudo.ondas!;
    const enx = cfg.enxame;
    const b = Math.min(this.opcoes.bairro, cfg.porBairro.length - 1);
    const chance = enx.chancePorBairro[Math.min(b, enx.chancePorBairro.length - 1)] ?? 0;
    if (!saida || numero < enx.desdeOnda || mundo.rng.proximo() >= chance) return;
    for (let i = 0; i < enx.n; i++)
      est.filaDeNascimento.push({
        especie: enx.especie,
        pos: saida,
        em: est.tempo + i * cfg.intervaloEntreNascimentos * 0.5,
      });
  }

  /**
   * Modo `pontos`: um bueiro a cada `pontos.aCada` pela rota (na ordem do caminho), nenhum colado
   * na entrada.
   */
  escolherPontos(): { pos: V2; acordado: boolean }[] {
    const cfg = this.conteudo.ondas!;
    const longe = cfg.pontos?.longeDaEntrada ?? 0;
    const aCada = cfg.pontos?.aCada ?? 1;
    const rota = this.gerada.rota;
    // Pelo caminho da rota (a distância dela até o bueiro), do começo para o fim.
    return [...this.gerada.bueiros, ...this.gerada.bueirosFlanco]
      .map((b) => ({ b, d: distanciaNaLinha(rota, b) }))
      .filter((m) => m.d >= longe)
      .sort((a, b) => a.d - b.d)
      .filter((_, k) => k % aCada === 0)
      .map((m) => ({ pos: { ...m.b }, acordado: false }));
  }

  /**
   * De onde sai a onda: os bueiros mais perto do jogador pelo caminho (campo de fluxo), mas nem
   * colados nele nem longe demais; sem nenhum assim, os mais perto em linha reta.
   */
  bueirosDaOnda(comFlanco: boolean): V2[] {
    const cfg = this.conteudo.ondas!;
    const j = this.heroi.pos;
    const todos = [...this.gerada.bueiros, ...(comFlanco ? this.gerada.bueirosFlanco : [])];
    this.campo.calcular(j);
    const celula = this.campo.grade.celula;
    const medidos = todos.map((b) => ({ b, d: this.campo.distanciaDe(b) * celula }));
    const porDistancia = (a: { d: number }, b: { d: number }) => a.d - b.d;
    const longeDoJogador = medidos.filter((m) => m.d >= cfg.distanciaMinima);
    const bons = longeDoJogador.filter((m) => m.d <= cfg.distanciaMaxima).sort(porDistancia);
    // Sem nenhum na faixa: os mais perto que o campo alcança; sem esses, o mais perto em reta.
    const alcancaveis = longeDoJogador.filter((m) => Number.isFinite(m.d)).sort(porDistancia);
    const emReta = [...todos].sort(
      (a, b) => Math.hypot(a.x - j.x, a.y - j.y) - Math.hypot(b.x - j.x, b.y - j.y),
    );
    const escolhidos = (bons.length > 0 ? bons : alcancaveis)
      .slice(0, cfg.bueirosPorOnda)
      .map((m) => m.b);
    if (escolhidos.length === 0) escolhidos.push(...emReta.slice(0, 1));
    return escolhidos;
  }

  /** Postes amigos curam quem está na luz deles; perto de postes, a Luz da lanterna recarrega. */
  private luzNoJogador(mundo: Mundo): void {
    const j = this.heroi;
    const c = j.combate;
    if (!c || !vivo(j)) return;
    const n = this.luz.postesQueCuram(j.pos);
    if (n > 0) {
      const cura = this.conteudo.luz!.cura.postePorS * (this.opcoes.multCuraPostes ?? 1);
      if (c.coragem < c.attr.coragemMax) {
        c.coragem = Math.min(
          c.attr.coragemMax,
          c.coragem + c.attr.coragemMax * cura * mundo.dt * c.attr.cura,
        );
      }
    }
    if (this.luz.pertoDePoste(j.pos)) {
      c.luz = Math.min(
        c.attr.luzMax,
        c.luz + this.conteudo.combate.luz.recargaPorS * c.attr.recargaLuz * mundo.dt,
      );
    }
  }

  /** Pirulito: cura um pouco a cada tick enquanto dura. */
  private curasAoLongo(mundo: Mundo): void {
    const est = this.estado;
    if (est.curas.length === 0) return;
    const j = this.heroi;
    for (const cu of est.curas) {
      const dt = Math.min(mundo.dt, cu.restante);
      cu.restante -= dt;
      if (vivo(j) && j.combate) {
        const c = j.combate;
        c.coragem = Math.min(c.attr.coragemMax, c.coragem + cu.porS * dt * c.attr.cura);
      }
    }
    est.curas = est.curas.filter((cu) => cu.restante > 1e-9);
  }

  private usar(mundo: Mundo, acao: string, ponto: V2): void {
    const j = this.heroi;
    const c = j.combate;
    if (!c || !vivo(j)) return;
    const cfg = this.conteudo.combate.luz;
    if (acao === 'lanterna') {
      if (c.luz < cfg.custoPulso || temEstado(c, 'atordoado')) {
        mundo.eventos.push({ tipo: 'aviso', texto: 'Sem Luz na lanterna' });
        return;
      }
      if (!c.attr.luzSemCusto) c.luz -= cfg.custoPulso;
      this.estado.usouLanterna = true;
      const raio = Math.max(0.5, cfg.raioPulso + c.attr.raioLanterna);
      this.luz.adicionar({
        tipo: 'pulso',
        x: j.pos.x,
        y: j.pos.y,
        raio,
        cura: false,
        segue: j.id,
        ate: mundo.tick + Math.round(cfg.duracaoPulso / mundo.dt),
      });
      mundo.eventos.push({ tipo: 'pulsoLanterna', pos: { ...j.pos }, raio });
      for (const e of mundo.entidades) {
        if (e.tipo !== 'inimigo' || !vivo(e)) continue;
        if (Math.hypot(e.pos.x - j.pos.x, e.pos.y - j.pos.y) > raio) continue;
        // Revela invisíveis e empurra as criaturas da sombra; os lençóis se assustam com a luz.
        if (e.combate) e.combate.estados = e.combate.estados.filter((s) => s.tipo !== 'invisivel');
        const medo = this.conteudo.inimigos?.reacoes.lanterna;
        if (medo?.especies.includes(e.especie))
          aplicarEstado(
            e,
            { tipo: 'medo', restante: medo.medoS, de: { ...j.pos } },
            this.conteudo.combate.estados,
          );
        if (this.def(e.especie).daSombra) {
          const d = Math.hypot(e.pos.x - j.pos.x, e.pos.y - j.pos.y) || 1;
          forcarMovimento(
            e,
            { x: (e.pos.x - j.pos.x) / d, y: (e.pos.y - j.pos.y) / d },
            cfg.empurraoPulso,
            10,
            false,
          );
        }
      }
      return;
    }
    if (acao === 'interagir') {
      if (this.encontros?.interagir()) return;
      if (this.abrirBauPerto(mundo) || this.fins?.interagir(mundo, j)) return;
      if (this.velasDaViuva?.interagir(mundo, j)) return;
      this.exploracao?.interagir(mundo, j);
      return;
    }
    // Doce ou travessura: G na campainha pede a travessura.
    if (acao === 'travessura') {
      this.exploracao?.interagir(mundo, j, 'travessura');
      return;
    }
    if (acao.startsWith('consumivel:')) {
      const espaco = this.bolso.consumiveis[Number(acao.slice('consumivel:'.length))];
      // Pote sem Fundo: a Doce-isca de graça vale mesmo sem nenhuma no bolso.
      if (!espaco || espaco.qtd <= 0) {
        if (acao === 'consumivel:0' && this.estado.iscasGratis > 0)
          this.usar(mundo, 'doce_isca', ponto);
        return;
      }
      this.usarConsumivel(mundo, espaco, ponto);
      return;
    }
    if (acao === 'doce_isca') {
      const espaco = this.bolso.consumiveis.find((e) => e.id === 'doce_isca');
      if (this.estado.iscasGratis > 0) this.estado.iscasGratis--;
      else if (espaco && espaco.qtd > 0) this.gastar(espaco);
      else return;
      const cfgIsca = this.conteudo.inimigos!.doceIsca;
      // Cai no ponto mirado, até 5 tiles do jogador.
      const d = Math.hypot(ponto.x - j.pos.x, ponto.y - j.pos.y);
      const k = d > cfgIsca.raio ? cfgIsca.raio / d : 1;
      const pos = { x: j.pos.x + (ponto.x - j.pos.x) * k, y: j.pos.y + (ponto.y - j.pos.y) * k };
      const livre = this.campo.grade.ehLivre(pos) ? pos : { ...j.pos };
      const isca = adicionarEntidade(mundo, {
        tipo: 'jogador',
        especie: 'doce_isca',
        pos: livre,
        raio: 0.3,
        velocidade: 0,
        solido: false,
        combate: combatenteInimigo({ coragem: 1e6, resistencia: 1e6 }, this.conteudo.combate),
        marcas: {
          isca: true,
          ate:
            mundo.tick +
            Math.round((cfgIsca.duracao * (j.combate?.attr.duracaoIsca ?? 1)) / mundo.dt),
        },
      });
      isca.combate!.estados.push({ tipo: 'imune', restante: 1e6 });
      mundo.eventos.push({ tipo: 'aviso', texto: 'Doce-isca!' });
    }
  }

  private gastar(espaco: EspacoConsumivel): void {
    espaco.qtd--;
    if (espaco.qtd <= 0)
      this.bolso.consumiveis = this.bolso.consumiveis.filter((e) => e !== espaco);
  }

  /** Usa um consumível pelos efeitos dele em content/itens.json. */
  private usarConsumivel(mundo: Mundo, espaco: EspacoConsumivel, ponto: V2): void {
    const def = this.conteudo.itens?.itens[espaco.id];
    const j = this.heroi;
    const c = j.combate!;
    if (!def) return;
    if (def.efeitos.some((ef) => ef.tipo === 'isca')) {
      this.usar(mundo, 'doce_isca', ponto);
      return;
    }
    this.gastar(espaco);
    for (const ef of def.efeitos) {
      if (ef.tipo === 'curaAoLongo') {
        this.estado.curas.push({
          porS: (c.attr.coragemMax * ef.fracao) / ef.duracao,
          restante: ef.duracao,
        });
      } else if (ef.tipo === 'energia') {
        c.energia = Math.min(c.attr.energiaMax, c.energia + ef.soma);
      }
    }
    mundo.eventos.push({ tipo: 'aviso', texto: def.nome });
  }

  /** Abre o baú fechado mais perto, se o jogador estiver encostado nele. */
  private abrirBauPerto(mundo: Mundo): boolean {
    const j = this.heroi;
    const raio = this.conteudo.run?.bau.raioInteracao ?? 1.2;
    const bau = this.estado.baus.find(
      (b) =>
        !b.aberto &&
        Math.hypot(b.entidade.pos.x - j.pos.x, b.entidade.pos.y - j.pos.y) <=
          raio + b.entidade.raio,
    );
    if (!bau) return false;
    bau.aberto = true;
    bau.revelado = true;
    bau.entidade.especie = 'bau_aberto';
    if (bau.tipo === 'amaldicoado' && bau.trato) {
      this.opcoes.aoGanhar?.({ tipo: 'ofertaDoBau', trato: bau.trato, precos: bau.precos ?? [] });
    }
    if (bau.doces > 0) this.soltarDoces(mundo, bau.entidade.pos, bau.doces, true, false, 'baus');
    if (bau.item) this.opcoes.aoGanhar?.({ tipo: 'item', id: bau.item });
    if (bau.rerolls > 0) this.opcoes.aoGanhar?.({ tipo: 'reroll', n: bau.rerolls });
    mundo.eventos.push({
      tipo: 'bauAberto',
      id: bau.entidade.id,
      pos: { ...bau.entidade.pos },
      doces: bau.doces,
      item: bau.item,
    });
    return true;
  }

  private iscas(mundo: Mundo): void {
    for (const e of [...mundo.entidades]) {
      if (ehIsca(e) && Number(e.marcas?.ate ?? 0) <= mundo.tick) removerEntidade(mundo, e.id);
    }
    const vencidas = this.estado.grades.filter((g) => g.ate <= mundo.tick);
    for (const g of vencidas) removerEntidade(mundo, g.entidade.id);
    if (vencidas.length > 0)
      this.estado.grades = this.estado.grades.filter((g) => g.ate > mundo.tick);
  }

  /** Doces caídos: o jogador pega encostando; perto, eles vêm até ele. */
  private doces(mundo: Mundo): void {
    const cfg = this.conteudo.inimigos!.doces;
    const j = this.heroi;
    const ima = cfg.raioIma * (j.combate?.attr.imaDoces ?? 1);
    for (const e of [...mundo.entidades]) {
      if (e.especie !== 'doce') continue;
      const d = Math.hypot(e.pos.x - j.pos.x, e.pos.y - j.pos.y);
      if (vivo(j) && d <= cfg.raioColeta) {
        const valor = Number(e.marcas?.doce ?? 0);
        this.bolso.doces += valor;
        this.estado.docesNaRua += valor;
        mundo.eventos.push({ tipo: 'pegouDoce', valor, pos: { ...e.pos } });
        removerEntidade(mundo, e.id);
      } else if (vivo(j) && d <= ima) {
        e.pos = {
          x: e.pos.x + ((j.pos.x - e.pos.x) / d) * Math.min(d, cfg.velocidadeIma * mundo.dt),
          y: e.pos.y + ((j.pos.y - e.pos.y) / d) * Math.min(d, cfg.velocidadeIma * mundo.dt),
        };
      } else if (mundo.tick - Number(e.marcas?.nasceu ?? 0) > cfg.vidaS / mundo.dt) {
        removerEntidade(mundo, e.id);
      }
    }
  }

  /** Criaturas da sombra não entram na luz: recuam de onde estiverem iluminadas. */
  private criaturasDaSombra(mundo: Mundo): void {
    for (const e of mundo.entidades) {
      if (e.tipo !== 'inimigo' || !vivo(e) || !e.ia) continue;
      const def = this.conteudo.inimigos!.inimigos[e.especie];
      if (!def?.daSombra) continue;
      const proximo = { x: e.pos.x + e.direcao.x * 0.4, y: e.pos.y + e.direcao.y * 0.4 };
      if (this.luz.iluminado(proximo)) e.direcao = { x: 0, y: 0 };
    }
  }

  /**
   * Solta doces no chão; `exato` (baús) ignora Susto e tratos de doces; `semFrenesi` (a Casa
   * Desconfiada) usa a faixa do Susto mesmo no Frenesi.
   */
  soltarDoces(
    mundo: Mundo,
    pos: V2,
    base: number,
    exato = false,
    semFrenesi = false,
    fonte = 'outros',
  ): void {
    const mult = exato
      ? 1
      : (semFrenesi
          ? faixaDoSusto(this.bolso.susto, this.conteudo.susto!).doces
          : multDoces(this.bolso.susto, this.conteudo.susto!)) *
        (this.opcoes.multDoces ?? 1) *
        (this.heroi.combate?.attr.doces ?? 1);
    const total = Math.round(base * mult);
    if (total <= 0) return;
    this.estado.docesPorFonte[fonte] = (this.estado.docesPorFonte[fonte] ?? 0) + total;
    // Até 3 pedaços para os doces se espalharem um pouco.
    const pedacos = Math.min(3, total);
    for (let i = 0; i < pedacos; i++) {
      const valor = Math.floor(total / pedacos) + (i < total % pedacos ? 1 : 0);
      const ang = (i / pedacos) * Math.PI * 2 + mundo.rng.entre(0, 1);
      adicionarEntidade(mundo, {
        tipo: 'neutro',
        especie: 'doce',
        pos: { x: pos.x + Math.cos(ang) * 0.35, y: pos.y + Math.sin(ang) * 0.35 },
        raio: 0.15,
        velocidade: 0,
        solido: false,
        atravessaCorpos: true,
        marcas: { doce: valor, nasceu: mundo.tick },
      });
    }
    mundo.eventos.push({ tipo: 'doces', valor: total, pos: { ...pos } });
  }

  private depoisDoTick(mundo: Mundo, eventos: readonly Evento[]): void {
    const est = this.estado;
    this.encontros?.depoisDoTick(mundo, eventos);
    const abatesPorCarga = new Map<number, number>();
    for (const ev of eventos) {
      if (ev.tipo === 'pulso' && ev.tecla === 'tijolo_dono' && ev.lado === 'inimigo')
        this.criarCobertura(mundo, ev.centro);
      if (ev.tipo === 'dano' && ev.origem === this.heroi.id) est.danoCausado += ev.valor;
      // A Moradora diante dos espelhos repete a habilidade que o jogador acabou de usar.
      if (ev.tipo === 'lancou' && ev.id === this.heroi.id && !ev.eco && est.chefe?.ia) {
        if (this.def(est.chefe.especie).comportamento === 'moradora')
          (est.chefe.ia as Record<string, unknown>)['eco'] = ev.tecla;
      }
      if (ev.tipo === 'derrotado') {
        const e = mundo.entidades.find((x) => x.id === ev.id);
        if (e && ehQuebravel(e)) {
          this.quebrarObjeto(mundo, e);
          continue;
        }
        if (!e || e.tipo !== 'inimigo') continue;
        est.derrotados++;
        this.hesitarPerto(mundo, e);
        if (e.marcas?.encanto === 'explosivo') this.armarExplosao(mundo, e);
        const extra = e.especie === 'poste_corrompido' ? 0 : (this.opcoes.docesPorInimigo ?? 0);
        this.soltarDoces(
          mundo,
          e.pos,
          Number(e.marcas?.doces ?? 0) + extra,
          false,
          false,
          'inimigos',
        );
        e.marcas = { ...e.marcas, caiuEm: mundo.tick };
        this.recompensaDoSelvagem(mundo, e);
        if (e.marcas?.desconfiada !== undefined) this.casaDespertaCaiu(mundo, e);
        const tratoDoMorador = e.marcas?.tratoDoMorador;
        if (typeof tratoDoMorador === 'string') {
          this.opcoes.aoGanhar?.({ tipo: 'tratoDoMorador', trato: tratoDoMorador });
          mundo.eventos.push({ tipo: 'aviso', texto: 'O morador entregou o trato, sem preço.' });
        }
        if (e === est.chefe) {
          mundo.eventos.push({ tipo: 'aviso', texto: `${this.def(e.especie).nome} caiu!` });
          mundo.eventos.push({ tipo: 'tremor', motivo: 'chefe' });
          if (!est.portaoAberto) this.abrirPortao(mundo);
        }
        if (e.especie === 'poste_corrompido') {
          est.postesCaidos++;
          est.quedas.push(mundo.tick);
          mundo.eventos.push({
            tipo: 'posteCaiu',
            id: e.id,
            pos: { ...e.pos },
            indice: Number(e.marcas?.indice ?? 0),
          });
          mundo.eventos.push({ tipo: 'tremor', motivo: 'poste' });
          if (est.postesCaidos >= est.postes.length && !est.portaoAberto) this.abrirPortao(mundo);
        }
      } else if (ev.tipo === 'golpeLinha' && ev.chave === 'portao_sindico') {
        this.levantarGrades(mundo, ev.de, ev.ate, ev.dono);
      } else if (ev.tipo === 'interrompeu' && ev.por === this.heroi.id) {
        est.interrupcoes++;
      } else if (ev.tipo === 'acerto' && ev.dono === this.heroi.id) {
        const alvo = mundo.entidades.find((x) => x.id === ev.alvo);
        if (alvo && !vivo(alvo))
          abatesPorCarga.set(ev.cargaId, (abatesPorCarga.get(ev.cargaId) ?? 0) + 1);
      }
    }
    for (const n of abatesPorCarga.values())
      est.maiorAbatePorHabilidade = Math.max(est.maiorAbatePorHabilidade, n);

    // Corpos somem um pouco depois de cair (os Postes ficam, apagados).
    for (const e of [...mundo.entidades]) {
      const caiu = e.marcas?.caiuEm;
      if (caiu === undefined || e.marcas?.permanece) continue;
      if (mundo.tick - Number(caiu) > 1 / mundo.dt) removerEntidade(mundo, e.id);
    }

    this.abrirBloqueios(mundo);
    this.cortarPreparos(mundo);
    for (const ev of eventos) {
      if (ev.tipo !== 'objetoAtingido') continue;
      const e = mundo.entidades.find((x) => x.id === ev.id);
      if (e?.marcas?.interativo) this.armas?.atingido(mundo, e);
    }
    this.armas?.tick(mundo);
    this.encantosNoTick(mundo);
    this.regulamento(mundo);
    this.auraDasVelas(mundo);
    this.exploracao?.observar(mundo, this.heroi, eventos);
    this.susto.tick(mundo, eventos);
    this.atualizarPedido(mundo);

    const j = this.heroi;
    if (!vivo(j) && !est.derrota && !j.marcas?.remontando) {
      est.derrota = true;
    }
    // A saída de cada rota é um ramal da Encruzilhada; sem eles (arena), a saída é uma só faixa
    // dividida em partes iguais entre os portões.
    const s = this.gerada.saida;
    const dentro = (r: { x0: number; y0: number; x1: number; y1: number }) =>
      j.pos.y <= r.y1 && j.pos.x >= r.x0 && j.pos.x <= r.x1;
    const ramal = this.gerada.saidas?.findIndex(dentro) ?? -1;
    if (
      est.portaoAberto &&
      !est.venceu &&
      vivo(j) &&
      (this.gerada.saidas ? ramal >= 0 : dentro(s))
    ) {
      est.venceu = true;
      this.encontros?.aoVencer(mundo);
      const n = Math.max(1, this.opcoes.portoes ?? 1);
      const fr = (j.pos.x - s.x0) / Math.max(s.x1 - s.x0, 1e-6);
      est.portaoEscolhido = Math.min(n - 1, ramal >= 0 ? ramal : Math.max(0, Math.floor(fr * n)));
      this.atualizarPedido(mundo, true);
    }
  }

  /** Portão do Síndico: grades sólidas ao longo da linha, que somem depois de um tempo. */
  private levantarGrades(mundo: Mundo, de: V2, ate: V2, dono: number): void {
    const chefe = mundo.entidades.find((e) => e.id === dono);
    const duracao = chefe ? (this.def(chefe.especie).param['duracaoPortao'] ?? 6) : 6;
    const d = { x: ate.x - de.x, y: ate.y - de.y };
    const n = Math.hypot(d.x, d.y);
    if (n < 1e-6) return;
    const dir = { x: d.x / n, y: d.y / n };
    for (let t = 0.5; t <= n; t += 1) {
      const p = { x: de.x + dir.x * t, y: de.y + dir.y * t };
      if (chefe && Math.hypot(p.x - chefe.pos.x, p.y - chefe.pos.y) < 1.2) continue;
      if (!this.campo.grade.ehLivre(p)) continue;
      const entidade = adicionarEntidade(mundo, {
        tipo: 'neutro',
        especie: 'grade_sindico',
        pos: p,
        raio: 0.45,
        velocidade: 0,
        solido: true,
      });
      entidade.olhar = { x: -dir.y, y: dir.x };
      this.estado.grades.push({ entidade, ate: mundo.tick + Math.round(duracao / mundo.dt) });
    }
  }

  /** Chefe da praça, para a barra da interface. */
  chefeNaTela(): { nome: string; fracao: number; fase: string } | null {
    const c = this.estado.chefe;
    if (!c?.combate) return null;
    const ia = c.ia as Record<string, unknown> | undefined;
    const n = Number(ia?.['fase'] ?? (ia?.['fase2'] ? 2 : 1));
    const def = this.def(c.especie);
    return {
      nome: def.nome,
      fracao: Math.max(0, c.combate.coragem / c.combate.attr.coragemMax),
      fase: def.fases?.[n - 1] ?? `Fase ${n}`,
    };
  }

  /**
   * O quanto faltou para vencer este mapa, para a tela do fim da run (GAMEPLAY.md): a Coragem que
   * sobrou ao chefe, os Postes ainda de pé ou o caminho até o portão.
   */
  oQueFaltou(): string {
    const chefe = this.chefeNaTela();
    if (chefe) {
      return `${chefe.nome} ficou com ${Math.max(1, Math.round(chefe.fracao * 100))}% de Coragem`;
    }
    const postes = this.estado.postes.filter((p) => vivo(p)).length;
    if (postes === 1) return 'Faltou derrubar 1 Poste Corrompido';
    if (postes > 1) return `Faltou derrubar ${postes} Postes Corrompidos`;
    const falta = Math.max(1, Math.round((1 - this.progressoDe(this.heroi.pos)) * 100));
    return `O portão estava aberto, a ${falta}% do caminho`;
  }

  /** Bônus de derrubar um selvagem (GDD): velocidade do Cão, fim do alarme, trato do Gato. */
  private recompensaDoSelvagem(mundo: Mundo, e: Entidade): void {
    const def = this.def(e.especie);
    if (def.comportamento === 'cao') {
      this.estado.selvagensDerrotados++;
      this.heroi.combate?.mods.push({
        origem: 'cao',
        atributo: 'velocidade',
        mult: def.param['bonusVelocidade'] ?? 0.15,
        restante: def.param['bonusS'] ?? 60,
      });
      mundo.eventos.push({ tipo: 'aviso', texto: 'Cão vencido: +15% de velocidade por 60 s' });
    } else if (def.comportamento === 'corvo') {
      this.estado.selvagensDerrotados++;
      mundo.eventos.push({ tipo: 'aviso', texto: 'O Corvo caiu: a rua perdeu o alarme' });
    } else if (def.comportamento === 'gato') {
      this.estado.selvagensDerrotados++;
      this.opcoes.aoGanhar?.({ tipo: 'tratoGratis' });
      mundo.eventos.push({
        tipo: 'aviso',
        texto: 'Pegou o Gato Preto! Um trato extra sem preço na próxima porta',
      });
    }
  }

  private abrirPortao(mundo: Mundo): void {
    this.estado.portaoAberto = true;
    for (const g of this.gerada.grades ?? [this.gerada.grade]) {
      removerObstaculo(mundo, g);
      this.campo.grade.liberar(g);
    }
    this.campo.alvo = -1;
    const g = this.gerada.grade;
    mundo.eventos.push({
      tipo: 'portaoAbriu',
      pos: { x: (g.x0 + g.x1) / 2, y: (g.y0 + g.y1) / 2 },
    });
  }

  /** Posição ao longo da rota (0 = entrada, 1 = saída), para a régua: a projeção no caminho. */
  progressoDe(p: V2): number {
    const r = this.gerada.rota;
    if (r.length < 2) return 0;
    let total = 0;
    let melhor = { d: Infinity, s: 0 };
    for (let k = 0; k + 1 < r.length; k++) {
      const a = r[k]!;
      const b = r[k + 1]!;
      const comp = Math.hypot(b.x - a.x, b.y - a.y);
      const t =
        comp < 1e-9
          ? 0
          : Math.max(
              0,
              Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (comp * comp)),
            );
      const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < melhor.d) melhor = { d, s: total + comp * t };
      total += comp;
    }
    return total > 0 ? melhor.s / total : 0;
  }

  vivoHeroi(): boolean {
    return vivo(this.heroi);
  }

  heroiAtual(mundo: Mundo): Entidade | undefined {
    return heroiDe(mundo);
  }
}

function sortear(mundo: Mundo, pesos: Record<string, number>): string {
  const itens = Object.entries(pesos).filter(([, p]) => p > 0);
  const total = itens.reduce((s, [, p]) => s + p, 0);
  let r = mundo.rng.proximo() * total;
  for (const [k, p] of itens) {
    r -= p;
    if (r <= 0) return k;
  }
  return itens[itens.length - 1]![0];
}
