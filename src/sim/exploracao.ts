import type { ConfigExploracao, Rua } from './content/esquemas';
import type { Evento } from './eventos';
import type { ExploracaoGerada } from './gerador';
import { girar, voltadaParaACamera, type V2 } from './geometria';
import { alcanceDoFeixe, type Feixe, type MapaDeLuz } from './luz';
import {
  Minijogo,
  sortearMinijogo,
  type OpcoesMinijogo,
  type ResultadoMinijogo,
  type TipoMinijogo,
} from './minijogos';
import { adicionarEntidade, removerEntidade, type Entidade, type Mundo } from './mundo';
import { Rng } from './rng';

// A exploração do bairro aberto (docs/DESIGN.md, seção 10): a névoa do mapa que some por onde o
// jogador passa, as campainhas das ruas de trás (doce ou travessura), as Abóboras Douradas
// escondidas, os postes apagados que dá para religar e a caixa-d'água que serve de mirante.
// Tudo com o gerador da simulação: a mesma semente e os mesmos comandos dão a mesma noite.

/** De quem é o minijogo: a Casa Desconfiada, ou a campainha pedindo doce (fácil) ou travessura. */
export type OrigemDoDesafio = 'desconfiada' | 'campainha' | 'travessura';

export type ResultadoCampainha = 'doces' | 'item' | 'travessura' | 'historia' | 'fechada';
/** O que o jogador pede na porta: F é doce (seguro), G é travessura (luta por mais). */
export type PedidoNaPorta = 'doce' | 'travessura';
export type AcaoDeCanal = 'poste' | 'mirante';
/** O que dá para fazer perto (a dica de F na tela). */
export type AcaoPerto = 'campainha' | 'desconfiada' | AcaoDeCanal;

/** O que a exploração pede às regras da rua (doces, Susto, inimigos, baús, grade). */
export interface ServicosExploracao {
  /**
   * `semFrenesi`: o multiplicador do Susto vale, o do Frenesi não (a Casa Desconfiada); `fonte`
   * conta de onde vieram os doces (relatório dos bots).
   */
  soltarDoces(mundo: Mundo, pos: V2, base: number, semFrenesi?: boolean, fonte?: string): void;
  /** Põe um consumível no bolso; false se não coube. */
  darConsumivel(id: string): boolean;
  encherSusto(mundo: Mundo, valor: number): void;
  /** Devolve o id da pestinha (a travessura pedida conta quem ainda está de pé). */
  nascerPestinha(mundo: Mundo, pos: V2): number;
  /** Todas as Abóboras Douradas achadas: o baú de recompensa aparece aqui. */
  bauDosSegredos(mundo: Mundo, pos: V2): void;
  /** Ponto livre mais perto (para não pôr nada dentro de uma casa). */
  livreMaisPerto(p: V2): V2;
  /** O ponto é chão andável (conta na fração explorada). */
  andavel(p: V2): boolean;
  /** Casa Desconfiada: bairro, folga e fantasias do minijogo. */
  opcoesDoMinijogo(): OpcoesMinijogo;
  /** Há inimigo de pé a até `raio` tiles (a porta não abre com a rua agitada)? */
  inimigoPerto(mundo: Mundo, p: V2, raio: number): boolean;
  /** O primeiro erro da run é perdoado (a casa só apaga a luz): true uma vez, depois false. */
  perdoarErro(): boolean;
  /** A casa errou o minijogo e acorda: o lote vira a Casa Desperta. */
  acordarCasa(mundo: Mundo, objeto: number, desconfiada: number): void;
}

export interface Desconfiada {
  x: number;
  y: number;
  /** A casa (índice em `rua.objetos`). */
  objeto: number;
  minijogo: TipoMinijogo;
  semente: number;
  /** Já bateu (a porta não abre de novo). */
  batida: boolean;
  resultado: ResultadoMinijogo | null;
}

export interface Campainha {
  x: number;
  y: number;
  objeto: number;
  /** O minijogo do F (sorteado pela semente da casa, como na Casa Desconfiada). */
  minijogo: TipoMinijogo;
  semente: number;
  tocada: boolean;
  /**
   * Luz da varanda (apaga quando a campainha é tocada); -1 quando a porta fica nos fundos, de
   * costas para a câmera: a abóbora acesa ficaria escondida e a luz pareceria não ter fonte.
   */
  luz: number;
}

export interface Segredo {
  x: number;
  y: number;
  achado: boolean;
  /** Já foi visto (de perto ou do mirante): aparece no mapa. */
  conhecido: boolean;
  entidade: number;
}

export interface PosteApagado {
  x: number;
  y: number;
  objeto: number;
  /** Onde a luz acende (o centro do poste). */
  centro: V2;
  aceso: boolean;
}

export interface Canal {
  acao: AcaoDeCanal;
  indice: number;
  inicio: number;
  fim: number;
  /** Onde o jogador estava ao começar: se sair daqui, cancela. */
  pos: V2;
}

export interface EstadoExploracao {
  celula: number;
  colunas: number;
  linhas: number;
  /** 1 = célula já revelada no mapa. */
  vista: Uint8Array;
  /** 1 = célula do chão andável (só estas contam na fração explorada). */
  conta: Uint8Array;
  totalQueConta: number;
  /** Células andáveis já reveladas. */
  reveladas: number;
  /** Muda quando a névoa muda (a tela redesenha o mapa só então). */
  versao: number;
  campainhas: Campainha[];
  segredos: Segredo[];
  postes: PosteApagado[];
  mirante: { x: number; y: number; objeto: number; usado: boolean } | null;
  canal: Canal | null;
  /** Quantos marcos de descoberta já deram recompensa. */
  marcos: number;
  tocadas: number;
  achados: number;
  religados: number;
  /** Travessuras: pestinhas que saem da porta depois do aviso (`grupo`: a travessura pedida). */
  travessuras: { pos: V2; tick: number; grupo?: number }[];
  /** Travessuras pedidas (G): quem saiu de cada porta; vencidas, dão a recompensa. */
  pedidas: { porta: V2; ids: number[]; faltamNascer: number; pagou: boolean }[];
  desconfiadas: Desconfiada[];
  /** O minijogo em curso (a rua fica parada até ele terminar). */
  desafio: { origem: OrigemDoDesafio; indice: number; minijogo: Minijogo } | null;
}

/** Espaço a mais em volta do ponto, para as pestinhas da travessura não nascerem grudadas. */
const ESPALHAR_TRAVESSURA = 0.6;
/** Distância (tiles) que o jogador pode andar sem cancelar um canal. */
const FOLGA_DO_CANAL = 0.2;

export class Exploracao {
  readonly estado: EstadoExploracao;

  constructor(
    mundo: Mundo,
    rua: Rua,
    gerada: ExploracaoGerada,
    private readonly cfg: ConfigExploracao,
    private readonly luz: MapaDeLuz,
    private readonly raioPoste: number,
    private readonly servicos: ServicosExploracao,
  ) {
    const celula = cfg.nevoa.celula;
    const colunas = Math.ceil(rua.largura / celula);
    const linhas = Math.ceil(rua.profundidade / celula);
    const conta = new Uint8Array(colunas * linhas);
    let totalQueConta = 0;
    for (let l = 0; l < linhas; l++)
      for (let c = 0; c < colunas; c++)
        if (servicos.andavel({ x: (c + 0.5) * celula, y: (l + 0.5) * celula })) {
          conta[l * colunas + c] = 1;
          totalQueConta++;
        }
    this.estado = {
      celula,
      colunas,
      linhas,
      vista: new Uint8Array(colunas * linhas),
      conta,
      totalQueConta: Math.max(1, totalQueConta),
      reveladas: 0,
      versao: 0,
      campainhas: gerada.campainhas.map((c) => {
        const casa = rua.objetos[c.objeto];
        const frente = girar({ x: 1, y: 0 }, casa?.rot ?? 0);
        // A abóbora acesa olha para a rua: a luz sai da porta para a frente da casa.
        const { largura, comprimento, abertura } = cfg.campainha.luz;
        const feixe: Feixe = {
          nx: frente.x,
          ny: frente.y,
          largura,
          andar: 0,
          inicio: 0,
          comprimento,
          abertura,
        };
        // Um gerador só da casa (outro sal que o da Casa Desconfiada), sem gastar o do mundo.
        const rng = new Rng((mundo.rng.semente ^ Math.imul(c.objeto + 1, 0x85ebca6b)) >>> 0);
        return {
          ...c,
          minijogo: sortearMinijogo(rng),
          semente: rng.inteiro(1, 0x7fffffff),
          tocada: false,
          luz: voltadaParaACamera(frente)
            ? luz.adicionar({
                tipo: 'janela',
                x: c.x,
                y: c.y,
                raio: alcanceDoFeixe(feixe),
                cura: false,
                feixe,
              }).id
            : -1,
        };
      }),
      segredos: gerada.segredos.map((s) => ({
        ...s,
        achado: false,
        conhecido: false,
        entidade: adicionarEntidade(mundo, {
          tipo: 'neutro',
          especie: 'abobora_dourada',
          pos: { ...s },
          raio: 0.25,
          velocidade: 0,
          solido: false,
          atravessaCorpos: true,
          marcas: { segredo: true },
        }).id,
      })),
      postes: gerada.postes.map((p) => {
        const o = rua.objetos[p.objeto]!;
        return { ...p, centro: { x: o.x + 0.5, y: o.y + 0.5 }, aceso: false };
      }),
      mirante: gerada.mirante ? { ...gerada.mirante, usado: false } : null,
      canal: null,
      marcos: 0,
      tocadas: 0,
      achados: 0,
      religados: 0,
      travessuras: [],
      pedidas: [],
      desconfiadas: (gerada.desconfiadas ?? []).map((d) => {
        // Um gerador só da casa, derivado da semente do mundo sem gastar sorteio dele.
        const rng = new Rng((mundo.rng.semente ^ Math.imul(d.objeto + 1, 0x9e3779b1)) >>> 0);
        return {
          ...d,
          minijogo: sortearMinijogo(rng),
          semente: rng.inteiro(1, 0x7fffffff),
          batida: false,
          resultado: null,
        };
      }),
      desafio: null,
    };
  }

  /** Fração do bairro já revelada no mapa (0 a 1). */
  fracao(): number {
    return this.estado.reveladas / this.estado.totalQueConta;
  }

  /** Revela as células cujo centro está a até `raio` tiles de `c`. */
  revelar(c: V2, raio: number): number {
    const e = this.estado;
    const k = e.celula;
    const c0 = Math.max(0, Math.floor((c.x - raio) / k));
    const c1 = Math.min(e.colunas - 1, Math.floor((c.x + raio) / k));
    const l0 = Math.max(0, Math.floor((c.y - raio) / k));
    const l1 = Math.min(e.linhas - 1, Math.floor((c.y + raio) / k));
    let novas = 0;
    for (let l = l0; l <= l1; l++) {
      for (let col = c0; col <= c1; col++) {
        const i = l * e.colunas + col;
        if (e.vista[i]) continue;
        const dx = (col + 0.5) * k - c.x;
        const dy = (l + 0.5) * k - c.y;
        if (dx * dx + dy * dy > raio * raio) continue;
        e.vista[i] = 1;
        novas++;
        if (e.conta[i]) e.reveladas++;
      }
    }
    if (novas > 0) e.versao++;
    return novas;
  }

  /** A célula do ponto já foi revelada. */
  revelado(p: V2): boolean {
    const e = this.estado;
    const col = Math.floor(p.x / e.celula);
    const l = Math.floor(p.y / e.celula);
    if (col < 0 || l < 0 || col >= e.colunas || l >= e.linhas) return false;
    return e.vista[l * e.colunas + col] === 1;
  }

  /** O que dá para fazer com F aqui (para a dica na tela). */
  pertoDe(p: V2): { acao: AcaoPerto; indice: number } | null {
    const e = this.estado;
    const r = this.cfg.raioInteracao;
    let melhor: { acao: AcaoPerto; indice: number } | null = null;
    let d0 = r;
    const ver = (acao: AcaoPerto, indice: number, q: V2) => {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d <= d0) {
        d0 = d;
        melhor = { acao, indice };
      }
    };
    e.campainhas.forEach((c, i) => !c.tocada && ver('campainha', i, c));
    e.desconfiadas.forEach((c, i) => !c.batida && ver('desconfiada', i, c));
    e.postes.forEach((q, i) => !q.aceso && ver('poste', i, q));
    if (e.mirante && !e.mirante.usado) ver('mirante', 0, e.mirante);
    return melhor;
  }

  /**
   * O jogador apertou F (doce) ou G (travessura): toca a campainha pedindo um dos dois, ou (só no F)
   * começa a religar o poste ou a subir no mirante.
   */
  interagir(mundo: Mundo, heroi: Entidade, pedido: PedidoNaPorta = 'doce'): boolean {
    const alvo = this.pertoDe(heroi.pos);
    if (!alvo || this.estado.canal) return false;
    if (alvo.acao === 'campainha')
      // Doce (F): um minijogo fácil; travessura (G): um difícil.
      return this.abrirDesafio(
        mundo,
        heroi,
        pedido === 'doce' ? 'campainha' : 'travessura',
        alvo.indice,
      );
    if (pedido === 'travessura') return false;
    if (alvo.acao === 'desconfiada')
      return this.abrirDesafio(mundo, heroi, 'desconfiada', alvo.indice);
    const duracao = alvo.acao === 'poste' ? this.cfg.poste.canalS : this.cfg.mirante.canalS;
    const ticks = Math.round(duracao / mundo.dt);
    this.estado.canal = {
      acao: alvo.acao,
      indice: alvo.indice,
      inicio: mundo.tick,
      fim: mundo.tick + ticks,
      pos: { ...heroi.pos },
    };
    mundo.eventos.push({ tipo: 'canal', acao: alvo.acao, pos: { ...heroi.pos }, duracao });
    return true;
  }

  /**
   * F na Casa Desconfiada ou na campainha: com a rua calma, a porta abre o minijogo (a tela para a
   * rua até ele acabar); com inimigo perto, ela não abre.
   */
  private abrirDesafio(mundo: Mundo, heroi: Entidade, origem: OrigemDoDesafio, i: number): boolean {
    const e = this.estado;
    const cfg = this.cfg.desconfiada;
    if (e.desafio) return false;
    if (this.servicos.inimigoPerto(mundo, heroi.pos, cfg.raioRecusa)) {
      mundo.eventos.push({ tipo: 'aviso', texto: cfg.textos.recusa });
      return true;
    }
    const d = origem === 'desconfiada' ? e.desconfiadas[i]! : e.campainhas[i]!;
    if (origem === 'desconfiada') e.desconfiadas[i]!.batida = true;
    else this.marcarTocada(e.campainhas[i]!);
    // A campainha escolhe a dificuldade: o doce é fácil e com folga, a travessura é difícil.
    const opcoes = this.servicos.opcoesDoMinijogo();
    const mj = this.cfg.campainha.minijogo;
    if (origem === 'campainha')
      Object.assign(opcoes, { bairro: mj.nivelDoce, folga: (opcoes.folga ?? 1) * mj.folgaDoce });
    else if (origem === 'travessura') opcoes.bairro = mj.nivelTravessura;
    e.desafio = {
      origem,
      indice: i,
      minijogo: new Minijogo(d.minijogo, cfg.minijogos, d.semente, mundo.dt, opcoes),
    };
    mundo.eventos.push({
      tipo: 'desafioIniciado',
      origem,
      indice: i,
      minijogo: d.minijogo,
      pos: { x: d.x, y: d.y },
    });
    return true;
  }

  /** O minijogo da Casa Desconfiada em curso (a tela e os bots jogam por aqui). */
  get minijogo(): Minijogo | null {
    return this.estado.desafio?.minijogo ?? null;
  }

  /** O minijogo acabou: doces (com o Susto, sem o Frenesi), ou a casa acorda. */
  private resolverDesafio(mundo: Mundo): void {
    const e = this.estado;
    const desafio = e.desafio;
    if (!desafio?.minijogo.terminou) return;
    e.desafio = null;
    if (desafio.origem === 'campainha') {
      this.resolverCampainha(mundo, desafio.indice, desafio.minijogo.resultado!);
      return;
    }
    if (desafio.origem === 'travessura') {
      // Acertou: o prêmio da travessura sem briga. Errou: as pestinhas saem da porta.
      const c = e.campainhas[desafio.indice]!;
      if (desafio.minijogo.resultado === 'erro')
        this.tocar(mundo, null, desafio.indice, 'travessura');
      else this.pagarTravessura(mundo, { x: c.x, y: c.y });
      return;
    }
    const d = e.desconfiadas[desafio.indice]!;
    const cfg = this.cfg.desconfiada;
    const resultado = desafio.minijogo.resultado!;
    d.resultado = resultado;
    const { bairro } = this.servicos.opcoesDoMinijogo();
    const mult = cfg.multPorBairro[Math.min(bairro, cfg.multPorBairro.length - 1)]!;
    const porta = { x: d.x, y: d.y };
    let texto: string = cfg.textos[resultado];
    let perdoado = false;
    let doces = 0;
    let item: string | null = null;
    if (resultado === 'erro') {
      perdoado = this.servicos.perdoarErro();
      if (perdoado) texto = cfg.textos.perdoado;
      else this.servicos.acordarCasa(mundo, d.objeto, desafio.indice);
    } else {
      doces = Math.round(cfg.premios[resultado] * mult);
      this.servicos.soltarDoces(mundo, porta, doces, true, 'desconfiada');
      const itens = this.cfg.campainha.itens;
      if (resultado === 'perfeito' && mundo.rng.proximo() < cfg.chanceConsumivelPerfeito) {
        const id = itens[mundo.rng.inteiro(0, itens.length - 1)]!;
        if (this.servicos.darConsumivel(id)) item = id;
      }
    }
    mundo.eventos.push({
      tipo: 'desafioResultado',
      indice: desafio.indice,
      objeto: d.objeto,
      pos: porta,
      resultado,
      perdoado,
      doces,
      item,
      texto,
    });
  }

  /** A campainha tocou: não toca de novo, conta para os pedidos e a luz da varanda apaga. */
  private marcarTocada(c: Campainha): void {
    c.tocada = true;
    this.estado.tocadas++;
    if (c.luz >= 0) this.luz.remover(c.luz);
  }

  /**
   * O minijogo da campainha acabou: errou, a porta fica fechada; acertou, o doce de sempre;
   * perfeito, doces garantidos e a mais.
   */
  private resolverCampainha(mundo: Mundo, i: number, resultado: ResultadoMinijogo): void {
    const c = this.estado.campainhas[i]!;
    const cfg = this.cfg.campainha;
    const porta = { x: c.x, y: c.y };
    if (resultado === 'erro') {
      mundo.eventos.push({
        tipo: 'campainha',
        indice: i,
        objeto: c.objeto,
        pos: porta,
        resultado: 'fechada',
        texto: cfg.minijogo.textoFechada,
      });
      return;
    }
    if (resultado === 'perfeito') {
      const doces = Math.round(
        mundo.rng.inteiro(cfg.doces[0], cfg.doces[1]) * cfg.minijogo.multPerfeito,
      );
      this.servicos.soltarDoces(mundo, porta, doces, false, 'campainha');
      mundo.eventos.push({
        tipo: 'campainha',
        indice: i,
        objeto: c.objeto,
        pos: porta,
        resultado: 'doces',
        texto: 'Perfeito!',
      });
      return;
    }
    this.tocar(mundo, null, i, 'doce');
  }

  /**
   * O que a porta dá: F (doce) sorteia doces, item ou história; G (travessura) solta as pestinhas.
   * `heroi` null: a porta já foi marcada (o minijogo da campainha) e o pedido é doce.
   */
  private tocar(mundo: Mundo, heroi: Entidade | null, i: number, pedido: PedidoNaPorta): void {
    const e = this.estado;
    const c = e.campainhas[i]!;
    const cfg = this.cfg.campainha;
    if (heroi) this.marcarTocada(c);
    let resultado: ResultadoCampainha =
      pedido === 'travessura' ? 'travessura' : sortearResultado(mundo, cfg.pesosDoce);
    const grupo = pedido === 'travessura' ? e.pedidas.length : undefined;
    if (grupo !== undefined)
      e.pedidas.push({
        porta: { x: c.x, y: c.y },
        ids: [],
        faltamNascer: cfg.travessura.pestinhas,
        pagou: false,
      });
    let texto = '';
    const porta = { x: c.x, y: c.y };
    if (resultado === 'item') {
      const id = cfg.itens[mundo.rng.inteiro(0, cfg.itens.length - 1)]!;
      if (this.servicos.darConsumivel(id)) texto = id;
      else resultado = 'doces';
    }
    if (resultado === 'doces') {
      this.servicos.soltarDoces(
        mundo,
        porta,
        mundo.rng.inteiro(cfg.doces[0], cfg.doces[1]),
        false,
        'campainha',
      );
      texto = 'Gostosura!';
    } else if (resultado === 'travessura') {
      texto = 'Travessura!';
      mundo.eventos.push({ tipo: 'surpresa', pos: porta });
      const em = mundo.tick + Math.round(cfg.travessura.atrasoS / mundo.dt);
      // As pestinhas saem da porta, do lado de fora (longe do jogador).
      const j = heroi?.pos ?? porta;
      const d = Math.hypot(porta.x - j.x, porta.y - j.y) || 1;
      const fora = {
        x: porta.x + ((porta.x - j.x) / d) * cfg.travessura.afastamento,
        y: porta.y + ((porta.y - j.y) / d) * cfg.travessura.afastamento,
      };
      for (let k = 0; k < cfg.travessura.pestinhas; k++) {
        const ang = (k / cfg.travessura.pestinhas) * Math.PI * 2;
        e.travessuras.push({
          pos: this.servicos.livreMaisPerto({
            x: fora.x + Math.cos(ang) * ESPALHAR_TRAVESSURA,
            y: fora.y + Math.sin(ang) * ESPALHAR_TRAVESSURA,
          }),
          tick: em,
          ...(grupo !== undefined ? { grupo } : {}),
        });
      }
    } else if (resultado === 'historia') {
      texto = cfg.historias[mundo.rng.inteiro(0, cfg.historias.length - 1)]!;
      mundo.eventos.push({ tipo: 'ganhouXp', valor: cfg.xpHistoria, motivo: 'historia' });
    }
    mundo.eventos.push({
      tipo: 'campainha',
      indice: i,
      objeto: c.objeto,
      pos: porta,
      resultado,
      texto,
    });
  }

  /** Uma vez por tick, antes do movimento. */
  tick(mundo: Mundo, heroi: Entidade): void {
    const e = this.estado;
    this.resolverDesafio(mundo);
    if (mundo.tick % this.cfg.nevoa.aCadaTicks === 0) {
      this.revelar(heroi.pos, this.cfg.nevoa.raio);
      this.conferirMarcos(mundo, heroi);
    }
    // Abóboras Douradas: aparecem de perto e são pegas encostando.
    const s = this.cfg.segredo;
    e.segredos.forEach((sg, i) => {
      if (sg.achado) return;
      const d = Math.hypot(sg.x - heroi.pos.x, sg.y - heroi.pos.y);
      if (d <= s.raioVer || this.luz.iluminado(sg)) sg.conhecido = true;
      if (d > s.raioPegar) return;
      sg.achado = true;
      sg.conhecido = true;
      e.achados++;
      removerEntidade(mundo, sg.entidade);
      this.servicos.soltarDoces(mundo, { x: sg.x, y: sg.y }, s.doces, false, 'exploracao');
      this.servicos.encherSusto(mundo, s.susto);
      mundo.eventos.push({ tipo: 'ganhouXp', valor: s.xp, motivo: 'segredo' });
      mundo.eventos.push({
        tipo: 'segredo',
        indice: i,
        pos: { x: sg.x, y: sg.y },
        achados: e.achados,
        total: e.segredos.length,
      });
      if (e.achados === e.segredos.length) this.servicos.bauDosSegredos(mundo, { ...heroi.pos });
    });
    // Travessuras que já podem sair.
    const prontas = e.travessuras.filter((t) => t.tick <= mundo.tick);
    if (prontas.length > 0) {
      e.travessuras = e.travessuras.filter((t) => t.tick > mundo.tick);
      for (const t of prontas) {
        const id = this.servicos.nascerPestinha(mundo, t.pos);
        const p = t.grupo !== undefined ? e.pedidas[t.grupo] : undefined;
        if (p) {
          p.ids.push(id);
          p.faltamNascer--;
        }
      }
    }
    this.pagarTravessuras(mundo);
    this.canal(mundo, heroi);
  }

  /** Travessura pedida e vencida (todas as pestinhas da porta caíram): item e doces a mais. */
  private pagarTravessuras(mundo: Mundo): void {
    for (const p of this.estado.pedidas) {
      if (p.pagou || p.faltamNascer > 0) continue;
      const deEmPe = p.ids.some((id) => {
        const ent = mundo.entidades.find((x) => x.id === id);
        return !!ent?.combate && ent.combate.coragem > 0;
      });
      if (deEmPe) continue;
      p.pagou = true;
      this.pagarTravessura(mundo, p.porta);
    }
  }

  /** O prêmio da travessura vencida (as pestinhas ou o minijogo difícil): item e doces a mais. */
  private pagarTravessura(mundo: Mundo, porta: V2): void {
    const cfg = this.cfg.campainha;
    const id = cfg.itens[mundo.rng.inteiro(0, cfg.itens.length - 1)]!;
    const deuItem = this.servicos.darConsumivel(id);
    const doces = Math.round(
      mundo.rng.inteiro(cfg.doces[0], cfg.doces[1]) * cfg.travessura.multDoces,
    );
    this.servicos.soltarDoces(mundo, porta, doces, false, 'campainha');
    mundo.eventos.push({
      tipo: 'travessuraVencida',
      pos: { ...porta },
      item: deuItem ? id : null,
      doces,
    });
  }

  /** Religar o poste ou subir no mirante: o jogador fica parado até o fim. */
  private canal(mundo: Mundo, heroi: Entidade): void {
    const c = this.estado.canal;
    if (!c) return;
    if (Math.hypot(heroi.pos.x - c.pos.x, heroi.pos.y - c.pos.y) > FOLGA_DO_CANAL) {
      this.cancelar(mundo);
      return;
    }
    if (mundo.tick < c.fim) return;
    this.estado.canal = null;
    if (c.acao === 'poste') {
      const p = this.estado.postes[c.indice]!;
      p.aceso = true;
      this.estado.religados++;
      this.luz.adicionar({ tipo: 'poste', ...p.centro, raio: this.raioPoste, cura: true });
      this.revelar(p.centro, this.cfg.poste.raioRevelar);
      mundo.eventos.push({ tipo: 'ganhouXp', valor: this.cfg.poste.xp, motivo: 'poste' });
      mundo.eventos.push({
        tipo: 'posteReligado',
        indice: c.indice,
        objeto: p.objeto,
        pos: { ...p.centro },
      });
    } else if (this.estado.mirante) {
      const m = this.estado.mirante;
      m.usado = true;
      this.revelar(m, this.cfg.mirante.raioRevelar);
      for (const sg of this.estado.segredos) sg.conhecido = true;
      mundo.eventos.push({ tipo: 'ganhouXp', valor: this.cfg.mirante.xp, motivo: 'mirante' });
      mundo.eventos.push({ tipo: 'mirante', pos: { x: m.x, y: m.y } });
    }
    this.conferirMarcos(mundo, heroi);
  }

  cancelar(mundo: Mundo): void {
    if (!this.estado.canal) return;
    this.estado.canal = null;
    mundo.eventos.push({ tipo: 'canalCancelado' });
  }

  /** Dano no jogador interrompe o canal. */
  observar(mundo: Mundo, heroi: Entidade, eventos: readonly Evento[]): void {
    if (!this.estado.canal) return;
    if (eventos.some((ev) => ev.tipo === 'dano' && ev.alvo === heroi.id && ev.valor > 0))
      this.cancelar(mundo);
  }

  private conferirMarcos(mundo: Mundo, heroi: Entidade): void {
    const e = this.estado;
    const fr = this.fracao();
    while (e.marcos < this.cfg.marcos.length && fr >= this.cfg.marcos[e.marcos]!.fracao) {
      const m = this.cfg.marcos[e.marcos]!;
      e.marcos++;
      if (m.doces > 0)
        this.servicos.soltarDoces(mundo, { ...heroi.pos }, m.doces, false, 'exploracao');
      if (m.xp > 0) mundo.eventos.push({ tipo: 'ganhouXp', valor: m.xp, motivo: 'descoberta' });
      mundo.eventos.push({ tipo: 'descoberta', fracao: m.fracao });
    }
  }

  /** Progresso do canal (0 a 1), para a barrinha sobre o jogador. */
  progressoDoCanal(tick: number): number | null {
    const c = this.estado.canal;
    if (!c) return null;
    return Math.min(1, (tick - c.inicio) / Math.max(1, c.fim - c.inicio));
  }
}

function sortearResultado(
  mundo: Mundo,
  pesos: Partial<Record<ResultadoCampainha, number>>,
): ResultadoCampainha {
  const itens = (Object.entries(pesos) as [ResultadoCampainha, number][]).filter(([, p]) => p > 0);
  const total = itens.reduce((s, [, p]) => s + p, 0);
  let r = mundo.rng.proximo() * total;
  for (const [k, p] of itens) {
    r -= p;
    if (r <= 0) return k;
  }
  return itens[itens.length - 1]?.[0] ?? 'doces';
}
