import { vivo } from '../sim/combate';
import type { ConfigBots, PerfilBot } from '../sim/content/esquemas';
import { TECLAS } from '../sim/content/esquemas';
import type { TabelaDeEvolucoes } from '../sim/evolucoes';
import { passo } from '../sim/mundo';
import type { SituacaoPedido } from '../sim/regrasDaRua';
import { Rng } from '../sim/rng';
import { Run, type ConteudoRun, type RuaDaRun } from '../sim/run';
import { BotDeCombate, type RegrasDoBot } from './bot';

/** Um mapa de luta jogado pelo bot. */
export interface ResultadoDoMapa {
  tipo: 'rua' | 'chefe';
  bairro: number;
  rua: number;
  venceu: boolean;
  /** Acabou o tempo-limite sem vencer nem perder (conta como derrota). */
  esgotou: boolean;
  tempoS: number;
  frenesis: number;
  /** Fração do tempo com o Susto em 50 ou mais. */
  fracaoSusto50: number;
  pedido: string | null;
  situacaoPedido: SituacaoPedido;
  condicao: string | null;
  /** Condições oferecidas nos portões do fim da rua e a escolhida. */
  oferecidas: string[];
  escolhida: string | null;
  postesCaidos: number;
  derrotados: number;
  coragemMinima: number;
  /** Na praça do chefe: a fração da Coragem dele que sobrou no fim (0 se venceu). */
  coragemDoChefe: number | null;
  /** Dano recebido por espécie de quem bateu (o que mais machuca). */
  danoPor: Record<string, number>;
  /** Doces soltos na rua, por fonte. */
  docesPorFonte: Record<string, number>;
  /** Minijogos da Casa Desconfiada: jogados, vencidos e perfeitos. */
  minijogos: { jogados: number; vencidos: number; perfeitos: number };
}

export interface ResultadoDaRun {
  perfil: string;
  campeao: string;
  semente: number;
  venceu: boolean;
  bairrosVencidos: number;
  /** Tempo de jogo da run, com as fases Porta a Porta. */
  tempoS: number;
  mapas: ResultadoDoMapa[];
  tratos: string[];
  /** Evoluções escolhidas: o id da habilidade e o índice da opção (0 = A). */
  evolucoes: { habilidade: string; opcao: number }[];
  conjuntosDe4: string[];
  /** Conjuntos ativos no fim (de 2 ou de 4): com o campeão, formam a build da run. */
  conjuntos: { marca: string; nivel: number }[];
  nivel: number;
  faltou: string | null;
}

export interface OpcoesDoBot {
  bairros?: number;
  /** Campeão da run (a Bruxinha se não disser). */
  campeao?: string;
  /** Chamado a cada mapa jogado (progresso no terminal). */
  aoTerminarMapa?: (r: ResultadoDoMapa) => void;
  /** Chamado a cada tick de luta (depuração do bot). */
  aoTick?: (r: RuaDaRun) => void;
}

/** Os dados do jogo que o bot e o condutor usam. */
export interface ConteudoDoBot {
  conteudo: ConteudoRun;
  bots: ConfigBots;
  evolucoes: TabelaDeEvolucoes;
}

function regrasDoBot(c: ConteudoDoBot): RegrasDoBot {
  const inimigos = c.conteudo.inimigos?.inimigos ?? {};
  const selvagens = new Set(
    Object.entries(inimigos)
      .filter(([, d]) => ['cao', 'corvo', 'gato'].includes(d.comportamento))
      .map(([id]) => id),
  );
  const luz = c.conteudo.combate.luz;
  return {
    cfg: c.bots,
    combate: c.conteudo.combate,
    evolucoes: c.evolucoes,
    selvagens,
    lanterna: { custo: luz.custoPulso, raio: luz.raioPulso, duracao: luz.duracaoPulso },
  };
}

/** Joga um mapa de luta até vencer, perder ou esgotar o tempo. */
function jogarMapa(
  r: RuaDaRun,
  bot: BotDeCombate,
  limiteS: number,
  portao: number,
  aoTick?: (r: RuaDaRun) => void,
  /** O que o bot decide fora da luta a cada tick (o trato do baú amaldiçoado). */
  decidir?: () => void,
): {
  venceu: boolean;
  esgotou: boolean;
  tempoS: number;
  fracaoSusto50: number;
  danoPor: Record<string, number>;
} {
  const { mundo } = r;
  const est = r.regras.estado;
  const limite = Math.round(limiteS / mundo.dt);
  const mapa = {
    mundo,
    jogador: r.jogador,
    ficha: r.ficha,
    executor: r.executor,
    grade: r.campo.grade,
    luz: r.luz,
    regras: r.regras,
    portao,
  };
  bot.novoMapa();
  const danoPor: Record<string, number> = {};
  let ticks = 0;
  let susto50 = 0;
  while (!est.venceu && !est.derrota && ticks < limite) {
    // A porta da Casa Desconfiada abriu: a rua fica parada enquanto o bot joga o minijogo.
    const minijogo = r.regras.exploracao?.minijogo;
    if (minijogo) bot.jogarMinijogo(minijogo);
    bot.agir(mapa);
    passo(mundo);
    decidir?.();
    aoTick?.(r);
    for (const ev of mundo.eventos) {
      if (ev.tipo !== 'dano' || ev.alvo !== r.jogador.id || ev.valor <= 0) continue;
      const quem = mundo.entidades.find((e) => e.id === ev.origem)?.especie ?? 'outro';
      danoPor[quem] = (danoPor[quem] ?? 0) + ev.valor;
    }
    // Ninguém consome os eventos da tela: as regras já leram os do tick.
    mundo.eventos = [];
    if (r.regras.bolso.susto.valor >= 50) susto50++;
    ticks++;
  }
  return {
    venceu: est.venceu && vivo(r.jogador),
    esgotou: !est.venceu && !est.derrota,
    tempoS: ticks * mundo.dt,
    fracaoSusto50: ticks > 0 ? susto50 / ticks : 0,
    danoPor,
  };
}

function placarDosMinijogos(r: RuaDaRun): ResultadoDoMapa['minijogos'] {
  const ds = r.regras.exploracao?.estado.desconfiadas ?? [];
  const feitos = ds.filter((d) => d.resultado !== null);
  return {
    jogados: feitos.length,
    vencidos: feitos.filter((d) => d.resultado !== 'erro').length,
    perfeitos: feitos.filter((d) => d.resultado === 'perfeito').length,
  };
}

/** Escolhe o portão do fim da rua (índice) entre as rotas oferecidas. */
function escolherPortao(run: Run, perfil: PerfilBot, cfg: ConfigBots, rng: Rng): number {
  const rotas = run.estado.rotas;
  if (rotas.length <= 1) return 0;
  if (perfil.rotas === 'acaso') return rng.inteiro(0, rotas.length - 1);
  const pesos = rotas.map((r) => cfg.pesoDaCondicao[r.condicao] ?? 1);
  const total = pesos.reduce((s, p) => s + p, 0);
  let x = rng.proximo() * total;
  for (let i = 0; i < pesos.length; i++) {
    x -= pesos[i]!;
    if (x <= 0) return i;
  }
  return rotas.length - 1;
}

/**
 * Quanto um trato vale para o bot: marcas que já tem contam mais, o preço pesa contra e um trato
 * lendário (sem marca, com 2 preços) ganha um bônus.
 */
function notaDoTrato(run: Run, cfg: ConfigBots, trato: string, precos: readonly string[]): number {
  const c = run.conteudo;
  const def = run.defTrato(trato);
  const marcas = run.marcas();
  const sinergia = def.marcas.reduce((s, m) => s + (marcas[m] > 0 ? 2 : 0.5), 0);
  const preco = precos.reduce((s, id) => s + c.precos.pesos[c.precos.precos[id]!.peso], 0);
  const lendario = trato in c.tratos.lendarios ? cfg.bonusDoLendario : 0;
  return sinergia - preco * 0.6 + lendario;
}

/** Baú amaldiçoado aberto: o médio decide no acaso; o experiente, pela nota do trato. */
function decidirOfertaDoBau(run: Run, perfil: PerfilBot, cfg: ConfigBots, rng: Rng): void {
  const o = run.estado.ofertaDoBau;
  if (!o) return;
  const aceita =
    perfil.tratos === 'acaso' ? rng.proximo() < 0.5 : notaDoTrato(run, cfg, o.trato, o.precos) >= 0;
  if (aceita) run.aceitarOfertaDoBau();
  else run.recusarOfertaDoBau();
}

/** Fase Porta a Porta sem andar: escolhe o trato (ou recusa), compra e descansa no banco. */
function decidirPorta(run: Run, perfil: PerfilBot, cfg: ConfigBots, rng: Rng): void {
  run.novaPorta();
  const p = run.estado.porta;
  if (!p) return;
  const nota = (casa: number): number => {
    const o = run.oferta(casa)!;
    return notaDoTrato(run, cfg, o.trato, o.precos);
  };
  for (let k = 0; k < p.limite; k++) {
    const livres = p.ofertas.filter((o) => !o.aceito).map((o) => o.casa);
    if (livres.length === 0) break;
    if (perfil.tratos === 'acaso') {
      run.aceitar(rng.escolher(livres));
      continue;
    }
    const melhor = [...livres].sort((a, b) => nota(b) - nota(a))[0]!;
    // Com o melhor trato fraco demais, recusa tudo e fica com a Medalha.
    if (nota(melhor) < 0 && run.estado.tratos.length > 0 && k === 0) break;
    run.aceitar(melhor);
  }
  if (!perfil.compra || !p.banco) return;
  const ficha = run.ficha.combate;
  if (ficha.coragem / ficha.attr.coragemMax < 0.7) run.sentarNoBanco();
  const loja = [...p.loja].sort((a, b) => run.precoNoBanco(b) - run.precoNoBanco(a));
  for (const id of loja) {
    if (run.motivoParaNaoComprar(id) === null) {
      run.comprar(id);
      break;
    }
  }
}

/**
 * Uma run inteira jogada por um bot (ou só os primeiros `bairros`): ruas, fases Porta a Porta e o
 * chefe, como a sessão da tela faz, e as métricas de cada mapa para o relatório.
 */
export function jogarRun(
  semente: number,
  perfilId: string,
  c: ConteudoDoBot,
  opcoes: OpcoesDoBot = {},
): ResultadoDaRun {
  const perfil = c.bots.perfis[perfilId];
  if (!perfil) throw new Error(`perfil de bot ${perfilId} não existe em content/bots.json`);
  const cfg = c.bots;
  const campeao = opcoes.campeao ?? 'bruxinha';
  const run = new Run(c.conteudo, semente, campeao);
  const rng = new Rng(semente * 9973 + 3);
  const bot = new BotDeCombate(perfil, regrasDoBot(c), semente * 31 + 7);
  const bairros = Math.min(opcoes.bairros ?? cfg.bairros, run.totalDeBairros);
  const mapas: ResultadoDoMapa[] = [];
  let venceu = false;
  let faltou: string | null = null;

  for (;;) {
    const e = run.estado;
    if (e.fase === 'vitoria' || e.bairro >= bairros) {
      venceu = true;
      break;
    }
    if (e.fase === 'derrota') break;
    if (e.fase === 'portaAPorta') {
      decidirPorta(run, perfil, cfg, rng);
      run.sairDaPorta();
      e.tempoS += cfg.portaS;
      continue;
    }
    const chefe = e.fase === 'chefe';
    const bairro = e.bairro;
    const rua = e.ruaNoBairro;
    const r = chefe ? run.novaArena() : run.novaRua();
    const oferecidas = e.rotas.map((x) => x.condicao);
    const portao = escolherPortao(run, perfil, cfg, rng);
    bot.gastarPontos(run.ficha);
    const jogo = jogarMapa(
      r,
      bot,
      chefe ? cfg.limiteChefeS : cfg.limiteRuaS,
      portao,
      opcoes.aoTick,
      () => decidirOfertaDoBau(run, perfil, cfg, rng),
    );
    const est = r.regras.estado;
    const resultado: ResultadoDoMapa = {
      tipo: chefe ? 'chefe' : 'rua',
      bairro,
      rua,
      venceu: jogo.venceu,
      esgotou: jogo.esgotou,
      tempoS: jogo.tempoS,
      frenesis: r.regras.bolso.susto.frenesisNaRua,
      fracaoSusto50: jogo.fracaoSusto50,
      pedido: chefe ? null : e.pedido,
      situacaoPedido: est.pedido,
      condicao: chefe ? null : (e.rotaAtual?.condicao ?? null),
      oferecidas,
      escolhida:
        jogo.venceu && oferecidas.length > 0 ? (oferecidas[est.portaoEscolhido] ?? null) : null,
      postesCaidos: est.postesCaidos,
      derrotados: est.derrotados,
      coragemMinima: est.coragemMinima,
      coragemDoChefe: est.chefe?.combate
        ? Math.max(0, est.chefe.combate.coragem / est.chefe.combate.attr.coragemMax)
        : null,
      danoPor: jogo.danoPor,
      docesPorFonte: { ...est.docesPorFonte },
      minijogos: placarDosMinijogos(r),
    };
    mapas.push(resultado);
    opcoes.aoTerminarMapa?.(resultado);
    if (jogo.venceu) {
      if (chefe) run.venceuChefe(est);
      else run.venceuRua(est);
    } else {
      faltou = jogo.esgotou ? 'O tempo acabou' : r.regras.oQueFaltou();
      run.perdeu(est, { onde: r.gerada.rua.nome, faltou });
      break;
    }
  }

  const evolucoes = TECLAS.flatMap((t) => {
    const s = run.ficha.lancador.slots[t]!;
    if (!s.evolucao) return [];
    const opcoesDaHab = c.evolucoes.get(s.def.id) ?? [];
    return [{ habilidade: s.def.id, opcao: opcoesDaHab.findIndex((o) => o.evo.id === s.evolucao) }];
  });
  return {
    perfil: perfilId,
    campeao,
    semente,
    venceu,
    bairrosVencidos: run.estado.chefesVencidos,
    tempoS: run.estado.tempoS,
    mapas,
    tratos: [...run.estado.tratos],
    evolucoes,
    conjuntosDe4: run
      .conjuntos()
      .filter((k) => k.nivel === 4)
      .map((k) => k.marca),
    conjuntos: run
      .conjuntos()
      .filter((k) => k.nivel >= 2)
      .map((k) => ({ marca: k.marca, nivel: k.nivel })),
    nivel: run.ficha.progresso.nivel,
    faltou,
  };
}
