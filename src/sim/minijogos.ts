import type { ConfigExploracao } from './content/esquemas';
import { Rng } from './rng';

// Os minijogos da Casa Desconfiada (docs/PLANO_CASA_DESCONFIADA.md): de 2 a 4 segundos, com uma
// tecla só ou o direcional. A rua fica parada enquanto duram; quem decide é esta máquina de estados,
// no passo fixo, alimentada pelas entradas que a tela repassa (a tela só desenha `vista`). A mesma
// semente e as mesmas entradas, nos mesmos ticks, dão sempre o mesmo resultado.

export const TIPOS_DE_MINIJOGO = ['toque', 'olho', 'fresta', 'quem'] as const;
export type TipoMinijogo = (typeof TIPOS_DE_MINIJOGO)[number];
export type Seta = 'cima' | 'baixo' | 'esquerda' | 'direita';
export const SETAS: readonly Seta[] = ['cima', 'baixo', 'esquerda', 'direita'];
export type EntradaMinijogo =
  { tipo: 'toque' } | { tipo: 'seta'; seta: Seta } | { tipo: 'escolha'; indice: number };
export type ResultadoMinijogo = 'perfeito' | 'acerto' | 'erro';
export type ConfigMinijogos = ConfigExploracao['desconfiada']['minijogos'];

export interface OpcoesMinijogo {
  /** Bairro da rua (0 a 2): a dificuldade de cada minijogo. */
  bairro: number;
  /** "Minijogos com folga": janelas e tempos maiores por este fator (1 = normal). */
  folga?: number;
  /** Quem Bate?: a fantasia do jogador e as outras que podem aparecer. */
  fantasia?: string;
  fantasias?: readonly string[];
}

/** Toque Combinado: a aldrava bate um ritmo e o jogador repete. */
export interface VistaToque {
  tipo: 'toque';
  fase: 'ouvir' | 'repetir';
  /** Quando cada batida da aldrava soa (s desde o começo). */
  batidas: number[];
  /** Quando o jogador bateu (s desde o começo). */
  toques: number[];
  janelaS: number;
}

/** Olho Mágico: a senha de setas aparece, some e o jogador digita. */
export interface VistaOlho {
  tipo: 'olho';
  fase: 'olhar' | 'digitar';
  senha: Seta[];
  digitadas: number;
}

/** Doce na Fresta: o doce corre pela fresta da porta; aperte quando ele passar no vão. */
export interface VistaFresta {
  tipo: 'fresta';
  /** Onde o doce está (0 a 1) e o vão (centro e largura, em fração da fresta). */
  doce: number;
  centro: number;
  vao: number;
  parouEm: number | null;
}

/** Quem Bate?: três silhuetas de fantasia; aponte a sua. */
export interface VistaQuem {
  tipo: 'quem';
  fase: 'abrindo' | 'escolher';
  opcoes: string[];
  escolhida: number | null;
}

export type VistaMinijogo = VistaToque | VistaOlho | VistaFresta | VistaQuem;

/** Faixa de valores por bairro: o do bairro, ou o último da lista. */
function doBairro<T>(lista: readonly T[], bairro: number): T {
  return lista[Math.min(Math.max(0, bairro), lista.length - 1)]!;
}

export class Minijogo {
  /** Ticks desde o começo. */
  tick = 0;
  resultado: ResultadoMinijogo | null = null;
  readonly vista: VistaMinijogo;
  private fila: EntradaMinijogo[] = [];
  /** Até quando (s) o jogo espera a resposta; passou disso sem terminar, é erro. */
  private limite: number;
  private readonly dados: {
    janela: number;
    /** Toque: maior desvio dos toques do jogador; Quem e Olho: até quando a resposta é perfeita. */
    desvio: number;
    perfeitoAte: number;
    fimDaMostra: number;
    velocidade: number;
    perfeitoVao: number;
  };

  constructor(
    readonly tipo: TipoMinijogo,
    cfg: ConfigMinijogos,
    semente: number,
    readonly dt: number,
    opcoes: OpcoesMinijogo,
  ) {
    const rng = new Rng(semente);
    const b = opcoes.bairro;
    const folga = opcoes.folga ?? 1;
    this.dados = {
      janela: 0,
      desvio: 0,
      perfeitoAte: 0,
      fimDaMostra: 0,
      velocidade: 0,
      perfeitoVao: 0,
    };
    if (tipo === 'toque') {
      const c = cfg.toque;
      const n = doBairro(c.toques, b);
      const batidas = [c.esperaS];
      for (let k = 1; k < n; k++) {
        const passo = Math.round(rng.entre(c.intervalosS[0], c.intervalosS[1]) / 0.05) * 0.05;
        batidas.push(batidas[k - 1]! + passo);
      }
      this.dados.janela = doBairro(c.janelaS, b) * folga;
      this.dados.fimDaMostra = batidas.at(-1)! + c.pausaS;
      // O prazo conta a partir do fim da escuta e cabe o ritmo inteiro, mais a folga para começar.
      this.limite = this.dados.fimDaMostra + (batidas.at(-1)! - batidas[0]!) + c.limiteS * folga;
      this.vista = {
        tipo,
        fase: 'ouvir',
        batidas,
        toques: [],
        janelaS: this.dados.janela,
      };
    } else if (tipo === 'olho') {
      const c = cfg.olho;
      const n = doBairro(c.setas, b);
      const senha = Array.from({ length: n }, () => SETAS[rng.inteiro(0, SETAS.length - 1)]!);
      this.dados.fimDaMostra = doBairro(c.mostrarS, b) * folga;
      this.dados.perfeitoAte = this.dados.fimDaMostra + n * c.perfeitoPorSetaS * folga;
      this.limite = this.dados.fimDaMostra + c.limiteS * folga;
      this.vista = { tipo, fase: 'olhar', senha, digitadas: 0 };
    } else if (tipo === 'fresta') {
      const c = cfg.fresta;
      const vao = Math.min(0.5, doBairro(c.vao, b) * folga);
      const centro = rng.entre(c.margem + vao / 2, 1 - c.margem - vao / 2);
      this.dados.velocidade = doBairro(c.velocidade, b) / folga;
      this.dados.perfeitoVao = vao * c.perfeito;
      this.limite = c.limiteS * folga;
      this.vista = { tipo, doce: 0, centro, vao, parouEm: null };
    } else {
      const c = cfg.quem;
      const minha = opcoes.fantasia ?? 'bruxinha';
      const outras = (opcoes.fantasias ?? []).filter((f) => f !== minha);
      // Embaralha as outras e põe a do jogador num lugar sorteado.
      for (let i = outras.length - 1; i > 0; i--) {
        const j = rng.inteiro(0, i);
        [outras[i], outras[j]] = [outras[j]!, outras[i]!];
      }
      const opcoesDaPorta = outras.slice(0, c.silhuetas - 1);
      opcoesDaPorta.splice(rng.inteiro(0, opcoesDaPorta.length), 0, minha);
      this.dados.fimDaMostra = c.introS;
      const tempo = doBairro(c.tempoS, b) * folga;
      this.dados.perfeitoAte = c.introS + tempo * c.perfeito;
      this.limite = c.introS + tempo;
      this.vista = { tipo, fase: 'abrindo', opcoes: opcoesDaPorta, escolhida: null };
      this.minha = minha;
    }
  }

  private minha = '';

  get segundos(): number {
    return this.tick * this.dt;
  }

  /** Quanto falta (s) para o tempo do minijogo acabar. */
  get restanteS(): number {
    return Math.max(0, this.limite - this.segundos);
  }

  get terminou(): boolean {
    return this.resultado !== null;
  }

  /** A entrada vale no próximo passo (como os comandos do mundo). */
  entrar(e: EntradaMinijogo): void {
    if (!this.terminou) this.fila.push(e);
  }

  passo(): void {
    if (this.terminou) return;
    const t = this.segundos;
    const entradas = this.fila;
    this.fila = [];
    const v = this.vista;
    if (v.tipo === 'toque') this.passoToque(v, t, entradas);
    else if (v.tipo === 'olho') this.passoOlho(v, t, entradas);
    else if (v.tipo === 'fresta') this.passoFresta(v, t, entradas);
    else this.passoQuem(v, t, entradas);
    if (!this.terminou && t >= this.limite) this.resultado = 'erro';
    this.tick++;
  }

  private passoToque(v: VistaToque, t: number, entradas: EntradaMinijogo[]): void {
    const d = this.dados;
    if (v.fase === 'ouvir') {
      if (t < d.fimDaMostra) return;
      v.fase = 'repetir';
    }
    // Onde o próximo toque devia cair: o primeiro toque do jogador marca o compasso.
    const esperado = (k: number) => v.toques[0]! + (v.batidas[k]! - v.batidas[0]!);
    for (const e of entradas) {
      if (e.tipo !== 'toque') continue;
      const k = v.toques.length;
      if (k > 0) {
        const desvio = Math.abs(t - esperado(k));
        if (desvio > d.janela) {
          v.toques.push(t);
          this.resultado = 'erro';
          return;
        }
        d.desvio = Math.max(d.desvio, desvio);
      }
      v.toques.push(t);
      if (v.toques.length === v.batidas.length) {
        this.resultado = d.desvio <= d.janela / 2 ? 'perfeito' : 'acerto';
        return;
      }
    }
    const k = v.toques.length;
    // Passou da janela do próximo toque sem bater.
    if (k > 0 && t > esperado(k) + d.janela) this.resultado = 'erro';
  }

  private passoOlho(v: VistaOlho, t: number, entradas: EntradaMinijogo[]): void {
    const d = this.dados;
    if (v.fase === 'olhar') {
      if (t < d.fimDaMostra) return;
      v.fase = 'digitar';
    }
    for (const e of entradas) {
      if (e.tipo !== 'seta') continue;
      if (e.seta !== v.senha[v.digitadas]) {
        this.resultado = 'erro';
        return;
      }
      v.digitadas++;
      if (v.digitadas === v.senha.length) {
        this.resultado = t <= d.perfeitoAte ? 'perfeito' : 'acerto';
        return;
      }
    }
  }

  private passoFresta(v: VistaFresta, t: number, entradas: EntradaMinijogo[]): void {
    const d = this.dados;
    // O doce vai e volta pela fresta (onda triangular).
    const fase = (t * d.velocidade) % 2;
    v.doce = fase <= 1 ? fase : 2 - fase;
    if (!entradas.some((e) => e.tipo === 'toque')) return;
    v.parouEm = v.doce;
    const desvio = Math.abs(v.doce - v.centro);
    this.resultado =
      desvio <= d.perfeitoVao / 2 ? 'perfeito' : desvio <= v.vao / 2 ? 'acerto' : 'erro';
  }

  private passoQuem(v: VistaQuem, t: number, entradas: EntradaMinijogo[]): void {
    const d = this.dados;
    if (v.fase === 'abrindo') {
      if (t < d.fimDaMostra) return;
      v.fase = 'escolher';
    }
    for (const e of entradas) {
      const i =
        e.tipo === 'escolha'
          ? e.indice
          : e.tipo === 'seta'
            ? indiceDaSeta(e.seta, v.opcoes.length)
            : null;
      if (i === null || i < 0 || i >= v.opcoes.length) continue;
      v.escolhida = i;
      this.resultado =
        v.opcoes[i] !== this.minha ? 'erro' : t <= d.perfeitoAte ? 'perfeito' : 'acerto';
      return;
    }
  }

  /** A resposta certa agora (os bots usam; a tela não). */
  respostaCerta(): EntradaMinijogo | null {
    const v = this.vista;
    if (v.tipo === 'olho') {
      const s = v.senha[v.digitadas];
      return v.fase === 'digitar' && s ? { tipo: 'seta', seta: s } : null;
    }
    if (v.tipo === 'quem')
      return v.fase === 'escolher'
        ? { tipo: 'escolha', indice: v.opcoes.indexOf(this.minha) }
        : null;
    if (v.tipo === 'fresta')
      return Math.abs(v.doce - v.centro) <= v.vao / 4 ? { tipo: 'toque' } : null;
    if (v.fase !== 'repetir') return null;
    const k = v.toques.length;
    if (k === 0) return { tipo: 'toque' };
    const alvo = v.toques[0]! + (v.batidas[k]! - v.batidas[0]!);
    return Math.abs(this.segundos - alvo) < this.dt / 2 + 1e-9 ? { tipo: 'toque' } : null;
  }
}

/** No Quem Bate?, o direcional escolhe: esquerda, meio (cima ou baixo) e direita. */
function indiceDaSeta(s: Seta, n: number): number {
  if (s === 'esquerda') return 0;
  if (s === 'direita') return n - 1;
  return Math.floor(n / 2);
}

/** Sorteia o minijogo da casa (a mesma semente dá o mesmo). */
export function sortearMinijogo(rng: Rng): TipoMinijogo {
  return TIPOS_DE_MINIJOGO[rng.inteiro(0, TIPOS_DE_MINIJOGO.length - 1)]!;
}
