import type { CampoDeFluxo } from './campoDeFluxo';
import { combatenteInimigo, vivo } from './combate';
import type { Combate, ConfigRun } from './content/esquemas';
import type { Evento } from './eventos';
import type { V2 } from './geometria';
import { adicionarEntidade, removerEntidade, type Entidade, type Mundo } from './mundo';

/**
 * Encontros raros de uma rua (GAMEPLAY.md, "Encontros raros"), no máximo um por rua. O Gato
 * Preto fica num quintal (elites.ts); os outros três moram aqui: a Criança Perdida, que segue o
 * jogador até o portão sem poder ser atingida; a Festa na Garagem, uma onda bônus de pestinhas que
 * valem o triplo de doces; e o Carrinho de Pipoca, uma loja com desconto por 30 s.
 */
export type EncontroDaRua =
  | { tipo: 'crianca_perdida'; pos: V2 }
  | { tipo: 'festa_na_garagem'; pos: V2 }
  | { tipo: 'carrinho_de_pipoca'; pos: V2 };

export type TipoDeEncontro = EncontroDaRua['tipo'] | 'gato_preto';

/** Como o encontro terminou, para o relatório e para a tela. */
export type SituacaoDoEncontro = 'esperando' | 'ativo' | 'cumprido' | 'falhou';

/** O que os encontros pedem às regras da rua. */
export interface ServicosDosEncontros {
  heroi(): Entidade;
  campo: CampoDeFluxo;
  combate: Combate;
  criarInimigo(mundo: Mundo, especie: string, pos: V2): Entidade;
  /** A Criança salva: os doces e a Medalha vão para a run. */
  salvarCrianca(mundo: Mundo, doces: number, medalhas: number): void;
  /** O jogador apertou F no Carrinho aberto: a run abre a loja dele. */
  abrirCarrinho(): void;
}

type Cfg = ConfigRun['encontros'];

function distancia(a: V2, b: V2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Ponto a uma fração do comprimento do caminho (0 = entrada, 1 = saída). */
export function pontoNoCaminho(rota: readonly V2[], fracao: number): V2 {
  if (rota.length === 0) return { x: 0, y: 0 };
  const trechos = rota.slice(1).map((b, i) => distancia(rota[i]!, b));
  let falta = Math.max(0, Math.min(1, fracao)) * trechos.reduce((s, t) => s + t, 0);
  for (let i = 0; i < trechos.length; i++) {
    const t = trechos[i]!;
    if (falta <= t && t > 0) {
      const a = rota[i]!;
      const b = rota[i + 1]!;
      return { x: a.x + ((b.x - a.x) * falta) / t, y: a.y + ((b.y - a.y) * falta) / t };
    }
    falta -= t;
  }
  return { ...rota[rota.length - 1]! };
}

/** Fração do caminho (0 a 1) no ponto do caminho mais perto de `p`. */
export function progressoNoCaminho(rota: readonly V2[], p: V2): number {
  const trechos = rota.slice(1).map((b, i) => distancia(rota[i]!, b));
  const total = trechos.reduce((s, t) => s + t, 0);
  if (total <= 0) return 0;
  let melhor = Infinity;
  let progresso = 0;
  let andado = 0;
  for (let i = 0; i < trechos.length; i++) {
    const a = rota[i]!;
    const b = rota[i + 1]!;
    const t = trechos[i]!;
    const k =
      t > 0
        ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / t ** 2))
        : 0;
    const q = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    const d = distancia(p, q);
    if (d < melhor) {
      melhor = d;
      progresso = (andado + k * t) / total;
    }
    andado += t;
  }
  return progresso;
}

export class EncontrosDaRua {
  situacao: SituacaoDoEncontro = 'esperando';
  /** A Criança ou o Carrinho na rua (null antes de nascer e depois de ir embora). */
  entidade: Entidade | null = null;
  /** Tick em que o Carrinho vai embora (depois de chegar). */
  private carrinhoAte = Infinity;

  constructor(
    readonly encontro: EncontroDaRua,
    private readonly cfg: Cfg,
    private readonly s: ServicosDosEncontros,
  ) {}

  /** Põe a Criança ou o Carrinho no lugar dele (a Festa só abre quando o jogador chega perto). */
  iniciar(mundo: Mundo): void {
    const { encontro, cfg } = this;
    const grade = this.s.campo.grade;
    const pos = grade.ehLivre(encontro.pos)
      ? encontro.pos
      : grade.centro(grade.livreMaisPerto(encontro.pos));
    if (encontro.tipo === 'crianca_perdida') {
      // Do lado do jogador: os inimigos acertam (é o que faz o encontro falhar), mas não miram.
      this.entidade = adicionarEntidade(mundo, {
        tipo: 'jogador',
        especie: 'crianca_perdida',
        pos,
        raio: cfg.criancaPerdida.raio,
        velocidade: cfg.criancaPerdida.velocidade,
        solido: false,
        combate: combatenteInimigo(
          { coragem: 1e6, resistencia: 0, dano: 0, chefe: false },
          this.s.combate,
        ),
        marcas: { crianca: true },
      });
    } else if (encontro.tipo === 'carrinho_de_pipoca') {
      this.entidade = adicionarEntidade(mundo, {
        tipo: 'neutro',
        especie: 'carrinho_pipoca',
        pos,
        raio: 0.5,
        velocidade: 0,
        solido: false,
        marcas: { carrinho: true },
      });
    }
  }

  tick(mundo: Mundo): void {
    const j = this.s.heroi();
    if (!vivo(j)) return;
    const { encontro, cfg } = this;
    if (encontro.tipo === 'festa_na_garagem') {
      if (this.situacao !== 'esperando') return;
      if (distancia(j.pos, encontro.pos) > cfg.festaNaGaragem.raioAbrir) return;
      this.abrirFesta(mundo);
      return;
    }
    const e = this.entidade;
    if (!e) return;
    if (encontro.tipo === 'crianca_perdida') {
      const c = cfg.criancaPerdida;
      const d = distancia(e.pos, j.pos);
      if (this.situacao === 'esperando' && d <= c.raioAchar) {
        this.situacao = 'ativo';
        mundo.eventos.push({ tipo: 'encontro', encontro: encontro.tipo, situacao: 'ativo' });
      }
      if (this.situacao !== 'ativo') return;
      // Segue o jogador pelo campo de fluxo, parando a um passo dele.
      e.direcao = d > c.distancia ? this.s.campo.direcao(e.pos, j.pos) : { x: 0, y: 0 };
      e.destino = null;
      return;
    }
    // Carrinho de Pipoca: chega quando o jogador passa perto e vai embora depois de 30 s.
    const p = cfg.carrinhoDePipoca;
    if (this.situacao === 'esperando' && distancia(e.pos, j.pos) <= p.raioChegar) {
      this.situacao = 'ativo';
      this.carrinhoAte = mundo.tick + Math.round(p.duracaoS / mundo.dt);
      mundo.eventos.push({ tipo: 'encontro', encontro: encontro.tipo, situacao: 'ativo' });
    } else if (this.situacao === 'ativo' && mundo.tick >= this.carrinhoAte) {
      this.situacao = 'cumprido';
      removerEntidade(mundo, e.id);
      this.entidade = null;
      mundo.eventos.push({ tipo: 'encontro', encontro: encontro.tipo, situacao: 'cumprido' });
    }
  }

  /** Lê os eventos do tick: a Criança atingida foge (o encontro falha). */
  depoisDoTick(mundo: Mundo, eventos: readonly Evento[]): void {
    const e = this.entidade;
    if (this.encontro.tipo !== 'crianca_perdida' || !e || this.situacao === 'falhou') return;
    const atingida = eventos.some((ev) => ev.tipo === 'dano' && ev.alvo === e.id && ev.valor > 0);
    if (!atingida) return;
    this.situacao = 'falhou';
    removerEntidade(mundo, e.id);
    this.entidade = null;
    mundo.eventos.push({ tipo: 'encontro', encontro: this.encontro.tipo, situacao: 'falhou' });
  }

  /** F encostado no Carrinho aberto: abre a loja. Devolve se usou o F. */
  interagir(): boolean {
    const e = this.entidade;
    if (this.encontro.tipo !== 'carrinho_de_pipoca' || this.situacao !== 'ativo' || !e)
      return false;
    const j = this.s.heroi();
    if (distancia(e.pos, j.pos) > this.cfg.carrinhoDePipoca.raioAtender + e.raio) return false;
    this.s.abrirCarrinho();
    return true;
  }

  /** A rua foi vencida: a Criança que chegou junto ao portão rende doces e Medalha. */
  aoVencer(mundo: Mundo): void {
    const e = this.entidade;
    if (this.encontro.tipo !== 'crianca_perdida' || this.situacao !== 'ativo' || !e) return;
    const c = this.cfg.criancaPerdida;
    if (distancia(e.pos, this.s.heroi().pos) > c.raioChegada) return;
    this.situacao = 'cumprido';
    this.s.salvarCrianca(mundo, c.doces, c.medalhas);
    mundo.eventos.push({ tipo: 'encontro', encontro: this.encontro.tipo, situacao: 'cumprido' });
  }

  /** Festa na Garagem: a porta abre e sai uma onda bônus de pestinhas que valem o triplo. */
  private abrirFesta(mundo: Mundo): void {
    const f = this.cfg.festaNaGaragem;
    const grade = this.s.campo.grade;
    this.situacao = 'cumprido';
    for (let k = 0; k < f.pestinhas; k++) {
      const ang = (k / f.pestinhas) * Math.PI * 2;
      const q = {
        x: this.encontro.pos.x + Math.cos(ang) * f.espalhar,
        y: this.encontro.pos.y + Math.sin(ang) * f.espalhar,
      };
      const pos = grade.ehLivre(q) ? q : grade.centro(grade.livreMaisPerto(q));
      const e = this.s.criarInimigo(mundo, 'pestinha_lencol', pos);
      e.marcas = { ...e.marcas, doces: Number(e.marcas?.doces ?? 0) * f.multDoces, festa: true };
      mundo.eventos.push({ tipo: 'invocou', id: e.id, especie: e.especie, pos: { ...e.pos } });
    }
    mundo.eventos.push({ tipo: 'encontro', encontro: this.encontro.tipo, situacao: 'ativo' });
  }
}
