import type { ConfigBots, MetaBot } from '../sim/content/esquemas';
import { secaoDasSurpresas, type ResumoDasSurpresas } from './frequencia';
import type { ResultadoDaRun, ResultadoDoMapa } from './jogarRun';

/** Os números de um perfil de bot, tirados das runs que ele jogou. */
export interface MetricasDoPerfil {
  perfil: string;
  runs: number;
  vitorias: number;
  /** Onde as runs acabaram ("1-1", "1-2", "chefe 1", "vitória"). */
  fins: Record<string, number>;
  ruasJogadas: number;
  ruasVencidas: number;
  duracaoRuaMin: number | null;
  duracaoChefeMin: number | null;
  frenesisPorRua: number | null;
  fracaoSusto50: number | null;
  pedidosCumpridos: number | null;
  nivelMedio: number;
  /** Dano recebido por espécie, somado (o que mais machuca). */
  danoPor: Record<string, number>;
  /** Escolha de cada evolução: por habilidade, quantas vezes A e B. */
  evolucoes: Record<string, [number, number]>;
  /** Por condição da noite: oferecida e escolhida (nos portões). */
  condicoes: Record<string, { oferecida: number; escolhida: number }>;
  /** Tratos nas vitórias: em quantas vitórias cada um apareceu. */
  tratosNasVitorias: Record<string, number>;
  conjuntosDe4: number;
  /** Cada Conjunto de 4: em quantas runs ficou completo e quantas delas venceram. */
  porConjuntoDe4: Record<string, Placar>;
  /** Vitórias pelo número de tratos que a run aceitou (o Bom Vizinho quase não aceita). */
  vitoriasPorTratos: Record<number, number>;
  /** Cada build (campeão + Conjuntos ativos no fim): runs e vitórias. */
  builds: Record<string, Placar>;
  /** Quantas runs passaram de cada bairro (índice 0: venceram o chefe do bairro 1). */
  passouDoBairro: number[];
  /** Cada chefe, pelo número do bairro (1 a 3). */
  chefes: Record<number, ResumoDoChefe>;
  /** Os mesmos números, separados por campeão. */
  porCampeao: Record<string, ResumoDoCampeao>;
  /** Doces soltos nas ruas, por fonte (inimigos, campainha, desconfiada, baús...). */
  docesPorFonte: Record<string, number>;
  /** Minijogos da Casa Desconfiada: jogados, vencidos (acerto ou perfeito) e perfeitos. */
  minijogos: { jogados: number; vencidos: number; perfeitos: number };
}

export interface Placar {
  runs: number;
  vitorias: number;
}

/** A build de uma run: o campeão e os Conjuntos ativos no fim ("bruxinha + abobora 4"). */
export function buildDaRun(r: Pick<ResultadoDaRun, 'campeao' | 'conjuntos'>): string {
  const ks = [...r.conjuntos]
    .sort((a, b) => b.nivel - a.nivel || a.marca.localeCompare(b.marca))
    .map((k) => `${k.marca} ${k.nivel}`);
  return [r.campeao, ...ks].join(' + ');
}

function somar(placar: Record<string, Placar>, chave: string, venceu: boolean): void {
  const p = (placar[chave] ??= { runs: 0, vitorias: 0 });
  p.runs++;
  if (venceu) p.vitorias++;
}

/** As lutas contra o chefe de um bairro. */
export interface ResumoDoChefe {
  tentativas: number;
  vitorias: number;
  /** Duração média das lutas vencidas, em min. */
  duracaoMin: number | null;
  /** Fração média da Coragem do chefe que sobrou nas derrotas. */
  sobrouNasDerrotas: number | null;
}

/** O que a tabela por campeão mostra. */
export interface ResumoDoCampeao {
  runs: number;
  vitorias: number;
  ruasJogadas: number;
  ruasVencidas: number;
  duracaoRuaMin: number | null;
  nivelMedio: number;
  fins: Record<string, number>;
  passouDoBairro: number[];
}

const media = (xs: number[]): number | null =>
  xs.length > 0 ? xs.reduce((s, x) => s + x, 0) / xs.length : null;

/** Quantas runs venceram o chefe de cada bairro (até o 3º). */
function passaram(runs: readonly ResultadoDaRun[]): number[] {
  return [1, 2, 3].map((b) => runs.filter((r) => r.bairrosVencidos >= b).length);
}

function resumoDosChefes(mapas: readonly ResultadoDoMapa[]): Record<number, ResumoDoChefe> {
  const chefes: Record<number, ResumoDoChefe> = {};
  for (const b of [...new Set(mapas.filter((m) => m.tipo === 'chefe').map((m) => m.bairro))]) {
    const lutas = mapas.filter((m) => m.tipo === 'chefe' && m.bairro === b);
    const vencidas = lutas.filter((m) => m.venceu);
    const perdidas = lutas.filter((m) => !m.venceu && m.coragemDoChefe !== null);
    chefes[b + 1] = {
      tentativas: lutas.length,
      vitorias: vencidas.length,
      duracaoMin: media(vencidas.map((m) => m.tempoS / 60)),
      sobrouNasDerrotas: media(perdidas.map((m) => m.coragemDoChefe!)),
    };
  }
  return chefes;
}

/** Ordem de um fim na run: 1-1, 1-2, 1-3, chefe 1, 2-1... e a vitória por último. */
function ordemDoFim(fim: string): number {
  if (fim === 'vitória') return 1000;
  const chefe = /^chefe (\d+)$/.exec(fim);
  if (chefe) return Number(chefe[1]) * 10 + 9;
  const [b, r] = fim.split('-').map(Number);
  return (b || 0) * 10 + (r || 0);
}

function ondeAcabou(r: ResultadoDaRun): string {
  if (r.venceu) return 'vitória';
  const m = r.mapas.at(-1);
  if (!m) return '—';
  return m.tipo === 'chefe' ? `chefe ${m.bairro + 1}` : `${m.bairro + 1}-${m.rua + 1}`;
}

export function metricasDoPerfil(
  perfil: string,
  runs: readonly ResultadoDaRun[],
): MetricasDoPerfil {
  const mapas = runs.flatMap((r) => r.mapas);
  const ruas = mapas.filter((m) => m.tipo === 'rua');
  const vencidas = ruas.filter((m) => m.venceu);
  const chefes = mapas.filter((m) => m.tipo === 'chefe');
  const chefesVencidos = chefes.filter((m) => m.venceu);
  const fins: Record<string, number> = {};
  for (const r of runs) fins[ondeAcabou(r)] = (fins[ondeAcabou(r)] ?? 0) + 1;
  const danoPor: Record<string, number> = {};
  for (const m of mapas)
    for (const [k, v] of Object.entries(m.danoPor)) danoPor[k] = (danoPor[k] ?? 0) + v;
  const evolucoes: Record<string, [number, number]> = {};
  for (const r of runs)
    for (const e of r.evolucoes) {
      const par = (evolucoes[e.habilidade] ??= [0, 0]);
      if (e.opcao === 0 || e.opcao === 1) par[e.opcao]++;
    }
  const condicoes: MetricasDoPerfil['condicoes'] = {};
  for (const m of vencidas) {
    for (const c of new Set(m.oferecidas))
      (condicoes[c] ??= { oferecida: 0, escolhida: 0 }).oferecida++;
    if (m.escolhida) (condicoes[m.escolhida] ??= { oferecida: 0, escolhida: 0 }).escolhida++;
  }
  const vitorias = runs.filter((r) => r.venceu);
  const tratosNasVitorias: Record<string, number> = {};
  for (const r of vitorias)
    for (const t of new Set(r.tratos)) tratosNasVitorias[t] = (tratosNasVitorias[t] ?? 0) + 1;
  const comPedido = vencidas.filter((m: ResultadoDoMapa) => m.pedido !== null);
  const porConjuntoDe4: Record<string, Placar> = {};
  const builds: Record<string, Placar> = {};
  const vitoriasPorTratos: Record<number, number> = {};
  for (const r of runs) {
    for (const k of new Set(r.conjuntosDe4)) somar(porConjuntoDe4, k, r.venceu);
    somar(builds, buildDaRun(r), r.venceu);
    if (r.venceu)
      vitoriasPorTratos[r.tratos.length] = (vitoriasPorTratos[r.tratos.length] ?? 0) + 1;
  }
  const porCampeao: Record<string, ResumoDoCampeao> = {};
  for (const campeao of new Set(runs.map((r) => r.campeao))) {
    const dele = runs.filter((r) => r.campeao === campeao);
    const ruasDele = dele.flatMap((r) => r.mapas).filter((x) => x.tipo === 'rua');
    const vencidasDele = ruasDele.filter((x) => x.venceu);
    const finsDele: Record<string, number> = {};
    for (const r of dele) finsDele[ondeAcabou(r)] = (finsDele[ondeAcabou(r)] ?? 0) + 1;
    porCampeao[campeao] = {
      runs: dele.length,
      vitorias: dele.filter((r) => r.venceu).length,
      ruasJogadas: ruasDele.length,
      ruasVencidas: vencidasDele.length,
      duracaoRuaMin: media(vencidasDele.map((x) => x.tempoS / 60)),
      nivelMedio: media(dele.map((r) => r.nivel)) ?? 0,
      fins: finsDele,
      passouDoBairro: passaram(dele),
    };
  }
  return {
    perfil,
    runs: runs.length,
    vitorias: vitorias.length,
    fins,
    ruasJogadas: ruas.length,
    ruasVencidas: vencidas.length,
    duracaoRuaMin: media(vencidas.map((m) => m.tempoS / 60)),
    duracaoChefeMin: media(
      (chefesVencidos.length > 0 ? chefesVencidos : chefes).map((m) => m.tempoS / 60),
    ),
    frenesisPorRua: media(ruas.map((m) => m.frenesis)),
    fracaoSusto50: media(ruas.map((m) => m.fracaoSusto50)),
    pedidosCumpridos:
      comPedido.length > 0
        ? comPedido.filter((m) => m.situacaoPedido === 'cumprido').length / comPedido.length
        : null,
    nivelMedio: media(runs.map((r) => r.nivel)) ?? 0,
    danoPor,
    evolucoes,
    condicoes,
    tratosNasVitorias,
    conjuntosDe4: runs.filter((r) => r.conjuntosDe4.length > 0).length,
    porConjuntoDe4,
    vitoriasPorTratos,
    builds,
    passouDoBairro: passaram(runs),
    chefes: resumoDosChefes(mapas),
    porCampeao,
    docesPorFonte: somarFontes(mapas),
    minijogos: {
      jogados: mapas.reduce((s, m) => s + m.minijogos.jogados, 0),
      vencidos: mapas.reduce((s, m) => s + m.minijogos.vencidos, 0),
      perfeitos: mapas.reduce((s, m) => s + m.minijogos.perfeitos, 0),
    },
  };
}

function somarFontes(mapas: readonly ResultadoDoMapa[]): Record<string, number> {
  const t: Record<string, number> = {};
  for (const m of mapas)
    for (const [k, v] of Object.entries(m.docesPorFonte)) t[k] = (t[k] ?? 0) + v;
  return t;
}

/** O valor de uma métrica de meta, ou null quando não há dados (nenhuma rua, nenhuma escolha). */
export function valorDaMeta(
  meta: MetaBot,
  porPerfil: Record<string, MetricasDoPerfil>,
): number | null {
  const todos = Object.values(porPerfil);
  const m = porPerfil[meta.perfil];
  // Com `bairro`, vence quem passou daquele bairro; sem, quem venceu a run.
  const venceu = (x: { vitorias: number; passouDoBairro: number[] }) =>
    meta.bairro ? (x.passouDoBairro[meta.bairro - 1] ?? 0) : x.vitorias;
  switch (meta.metrica) {
    case 'vitorias':
      return m && m.runs > 0 ? venceu(m) / m.runs : null;
    case 'duracaoRuaMin':
      return m?.duracaoRuaMin ?? null;
    case 'duracaoChefeMin':
      return m?.duracaoChefeMin ?? null;
    case 'frenesisPorRua':
      return m?.frenesisPorRua ?? null;
    case 'fracaoSusto50':
      return m?.fracaoSusto50 ?? null;
    case 'pedidosCumpridos':
      return m?.pedidosCumpridos ?? null;
    case 'evolucaoMenosEscolhida': {
      const pares: Record<string, [number, number]> = {};
      for (const p of meta.perfil === 'todos' ? todos : m ? [m] : [])
        for (const [h, [a, b]] of Object.entries(p.evolucoes)) {
          const par = (pares[h] ??= [0, 0]);
          par[0] += a;
          par[1] += b;
        }
      const fracoes = Object.values(pares)
        .filter(([a, b]) => a + b > 0)
        .map(([a, b]) => Math.min(a, b) / (a + b));
      return fracoes.length > 0 ? Math.min(...fracoes) : null;
    }
    case 'condicaoEscolhida': {
      if (!m) return null;
      const fr = Object.values(m.condicoes)
        .filter((c) => c.oferecida > 0)
        .map((c) => c.escolhida / c.oferecida);
      return fr.length > 0 ? Math.min(...fr) : null;
    }
    case 'diferencaEntreCampeoes':
    case 'campeaoQueMenosVence': {
      const taxas = Object.values(m?.porCampeao ?? {})
        .filter((c) => c.runs > 0)
        .map((c) => venceu(c) / c.runs);
      if (taxas.length === 0) return null;
      return meta.metrica === 'campeaoQueMenosVence'
        ? Math.min(...taxas)
        : Math.max(...taxas) - Math.min(...taxas);
    }
    case 'runsComConjuntoDe4':
      return m && m.runs > 0 ? m.conjuntosDe4 / m.runs : null;
    case 'conjuntoQueMenosVence':
    case 'conjuntoQueMaisVence': {
      const taxas = Object.values(m?.porConjuntoDe4 ?? {})
        .filter((c) => c.runs > 0)
        .map((c) => c.vitorias / c.runs);
      if (taxas.length === 0) return null;
      return meta.metrica === 'conjuntoQueMenosVence' ? Math.min(...taxas) : Math.max(...taxas);
    }
    case 'conjuntoMaisPresenteNasVitorias': {
      if (!m || m.vitorias === 0) return null;
      const n = Object.values(m.porConjuntoDe4).map((c) => c.vitorias);
      return n.length > 0 ? Math.max(...n) / m.vitorias : 0;
    }
    case 'vitoriasBomVizinho': {
      if (!m || m.vitorias === 0) return null;
      const limite = meta.maxTratos ?? 0;
      const bv = Object.entries(m.vitoriasPorTratos)
        .filter(([n]) => Number(n) <= limite)
        .reduce((s, [, v]) => s + v, 0);
      return bv / m.vitorias;
    }
    case 'tratoMaisPresente': {
      if (!m || m.vitorias === 0) return null;
      const n = Object.values(m.tratosNasVitorias);
      return n.length > 0 ? Math.max(...n) / m.vitorias : 0;
    }
    case 'docesDaDesconfiada': {
      const total = Object.values(m?.docesPorFonte ?? {}).reduce((s, v) => s + v, 0);
      return m && total > 0 ? (m.docesPorFonte['desconfiada'] ?? 0) / total : null;
    }
    case 'minijogosVencidos':
      return m && m.minijogos.jogados > 0 ? m.minijogos.vencidos / m.minijogos.jogados : null;
  }
}

function dentroDaMeta(meta: MetaBot, v: number | null): '✅' | '❌' | '—' {
  if (v === null) return '—';
  if (meta.min !== undefined && v < meta.min - 1e-9) return '❌';
  if (meta.max !== undefined && v > meta.max + 1e-9) return '❌';
  return '✅';
}

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
const num = (x: number | null, casas = 1) =>
  x === null ? '—' : x.toFixed(casas).replace('.', ',');

function faixa(meta: MetaBot): string {
  const f = (x: number) =>
    meta.metrica === 'duracaoRuaMin' ||
    meta.metrica === 'duracaoChefeMin' ||
    meta.metrica === 'frenesisPorRua'
      ? num(x)
      : pct(x);
  if (meta.min !== undefined && meta.max !== undefined) return `${f(meta.min)} a ${f(meta.max)}`;
  if (meta.min !== undefined) return `≥ ${f(meta.min)}`;
  if (meta.max !== undefined) return `≤ ${f(meta.max)}`;
  return '—';
}

function valorFormatado(meta: MetaBot, v: number | null): string {
  if (
    meta.metrica === 'duracaoRuaMin' ||
    meta.metrica === 'duracaoChefeMin' ||
    meta.metrica === 'frenesisPorRua'
  )
    return num(v);
  return pct(v);
}

/**
 * As 5 builds (campeão + Conjuntos ativos no fim) que mais e que menos vencem, somando todos os
 * perfis, entre as que jogaram ao menos `minRunsPorBuild` runs: as primeiras a ajustar.
 */
export function rankingDeBuilds(
  runs: Record<string, readonly ResultadoDaRun[]>,
  minRuns: number,
): { build: string; runs: number; vitorias: number }[] {
  const builds: Record<string, Placar> = {};
  for (const lista of Object.values(runs))
    for (const r of lista) somar(builds, buildDaRun(r), r.venceu);
  return Object.entries(builds)
    .filter(([, b]) => b.runs >= minRuns)
    .map(([build, b]) => ({ build, ...b }))
    .sort((a, b) => b.vitorias / b.runs - a.vitorias / a.runs || b.runs - a.runs);
}

function secaoDasBuilds(
  runs: Record<string, readonly ResultadoDaRun[]>,
  cfg: ConfigBots,
): string[] {
  const ranking = rankingDeBuilds(runs, cfg.minRunsPorBuild);
  const l = [
    '## Builds que mais e que menos vencem',
    '',
    `Campeão + Conjuntos ativos no fim da run, todos os perfis, com ${cfg.minRunsPorBuild} runs ` +
      'ou mais.',
    '',
  ];
  const tabela = (titulo: string, lista: typeof ranking) => {
    l.push(`| ${titulo} | Runs | Vence |`, '| ----- | ---- | ----- |');
    for (const b of lista) l.push(`| ${b.build} | ${b.runs} | ${pct(b.vitorias / b.runs)} |`);
    if (lista.length === 0) l.push('| — | 0 | — |');
    l.push('');
  };
  tabela('Mais vencem', ranking.slice(0, 5));
  // Sem repetir as do topo quando há menos de 10 builds.
  tabela('Menos vencem', ranking.slice(Math.max(5, ranking.length - 5)).reverse());
  l.pop();
  return l;
}

/** O relatório de balanceamento em Markdown (docs/BALANCO.md). */
export function relatorio(
  runs: Record<string, readonly ResultadoDaRun[]>,
  cfg: ConfigBots,
  quando: string,
  /** A regra de frequência das surpresas nas runs simuladas, quando foi rodada. */
  surpresas?: ResumoDasSurpresas,
): string {
  const perfis = Object.keys(runs);
  const porPerfil = Object.fromEntries(perfis.map((p) => [p, metricasDoPerfil(p, runs[p]!)]));
  const nome = (p: string) => cfg.perfis[p]?.nome ?? p;
  const l: string[] = [];
  const total = perfis.reduce((s, p) => s + runs[p]!.length, 0);
  const campeoes = [...new Set(perfis.flatMap((p) => runs[p]!.map((r) => r.campeao)))];
  l.push('# Relatório de balanceamento dos bots', '');
  l.push(
    `Gerado em ${quando} por \`npm run bots\`: ${total} runs (${campeoes.join(', ')}), ` +
      `${cfg.bairros === 1 ? 'só o bairro 1' : `${cfg.bairros} bairros`}, ` +
      `perfis do GDD (\`content/bots.json\`). Cada run usa outra semente.`,
    '',
  );
  l.push('## Resumo por perfil', '');
  l.push(
    '| Perfil | Runs | Vence | Ruas vencidas | Rua (min) | Chefe (min) | Frenesis/rua | Susto ≥ 50 | Pedidos | Nível |',
    '| ------ | ---- | ----- | ------------- | --------- | ----------- | ------------ | ---------- | ------- | ----- |',
  );
  for (const p of perfis) {
    const m = porPerfil[p]!;
    l.push(
      `| ${nome(p)} | ${m.runs} | ${pct(m.runs ? m.vitorias / m.runs : null)} | ` +
        `${m.ruasVencidas}/${m.ruasJogadas} | ${num(m.duracaoRuaMin)} | ${num(m.duracaoChefeMin)} | ` +
        `${num(m.frenesisPorRua)} | ${pct(m.fracaoSusto50)} | ${pct(m.pedidosCumpridos)} | ` +
        `${num(m.nivelMedio)} |`,
    );
  }
  l.push('', '## Por campeão', '');
  l.push(
    '| Campeão | Perfil | Runs | Vence | Ruas vencidas | Rua (min) | Nível | Onde acaba |',
    '| ------- | ------ | ---- | ----- | ------------- | --------- | ----- | ---------- |',
  );
  for (const campeao of campeoes)
    for (const p of perfis) {
      const c = porPerfil[p]!.porCampeao[campeao];
      if (!c) continue;
      const fins = Object.entries(c.fins)
        .sort((a, b) => b[1] - a[1])
        .map(([onde, n]) => `${onde}: ${n}`)
        .join(', ');
      l.push(
        `| ${campeao} | ${nome(p)} | ${c.runs} | ${pct(c.vitorias / c.runs)} | ` +
          `${c.ruasVencidas}/${c.ruasJogadas} | ${num(c.duracaoRuaMin)} | ${num(c.nivelMedio)} | ${fins} |`,
      );
    }
  l.push('', '## Metas', '');
  l.push('| Meta | Alvo | Medido | |', '| ---- | ---- | ------ | - |');
  for (const meta of cfg.metas) {
    const v = valorDaMeta(meta, porPerfil);
    const obs = meta.runCompleta && cfg.bairros < 3 ? ' (meta da run inteira)' : '';
    l.push(
      `| ${meta.nome}${obs} | ${faixa(meta)} | ${valorFormatado(meta, v)} | ${dentroDaMeta(meta, v)} |`,
    );
  }
  const notas = cfg.metas.filter((m) => m.nota);
  l.push('');
  for (const m of notas) l.push(`- ${m.nome}: ${m.nota}.`);
  l.push(
    `- Retorno (da derrota ao começo da nova run, meta abaixo de ${cfg.retornoMaxS} s): é de tela, ` +
      'medido pelo Playwright em `tests/e2e/ganchos.spec.ts`.',
  );
  l.push('', '## Doces por fonte', '');
  l.push(
    'Doces soltos nas ruas (com o Susto e os tratos), e os minijogos da Casa Desconfiada.',
    '',
    '| Perfil | Inimigos | Campainha | Desconfiada | Baús | Exploração | Outros | Minijogos vencidos | Perfeitos |',
    '| ------ | -------- | --------- | ----------- | ---- | ---------- | ------ | ------------------ | --------- |',
  );
  for (const p of perfis) {
    const m = porPerfil[p]!;
    const f = m.docesPorFonte;
    const total = Object.values(f).reduce((s, v) => s + v, 0) || 1;
    const conhecidas = ['inimigos', 'campainha', 'desconfiada', 'baus', 'exploracao'];
    const outros = Object.entries(f)
      .filter(([k]) => !conhecidas.includes(k))
      .reduce((s, [, v]) => s + v, 0);
    const mj = m.minijogos;
    l.push(
      `| ${nome(p)} | ${conhecidas.map((k) => pct((f[k] ?? 0) / total)).join(' | ')} | ` +
        `${pct(outros / total)} | ${mj.jogados > 0 ? `${pct(mj.vencidos / mj.jogados)} de ${mj.jogados}` : '—'} | ` +
        `${mj.vencidos > 0 ? pct(mj.perfeitos / mj.vencidos) : '—'} |`,
    );
  }
  l.push('', '## Chefes', '');
  l.push(
    '| Chefe | Perfil | Lutas | Vence | Luta vencida (min) | Coragem que sobrou nas derrotas |',
    '| ----- | ------ | ----- | ----- | ------------------ | ------------------------------- |',
  );
  for (const b of [1, 2, 3])
    for (const p of perfis) {
      const c = porPerfil[p]!.chefes[b];
      if (!c) continue;
      l.push(
        `| Bairro ${b} | ${nome(p)} | ${c.tentativas} | ${pct(c.vitorias / c.tentativas)} | ` +
          `${num(c.duracaoMin)} | ${pct(c.sobrouNasDerrotas)} |`,
      );
    }
  l.push('', '## Conjuntos de 4', '');
  l.push(
    'Runs em que o Conjunto ficou completo, quantas venceram e a parte das vitórias do perfil.',
    '',
    '| Conjunto | Perfil | Runs | Vence | Parte das vitórias |',
    '| -------- | ------ | ---- | ----- | ------------------ |',
  );
  let algumConjunto = false;
  for (const p of perfis) {
    const m = porPerfil[p]!;
    for (const [k, c] of Object.entries(m.porConjuntoDe4).sort((a, b) => b[1].runs - a[1].runs)) {
      algumConjunto = true;
      l.push(
        `| ${k} | ${nome(p)} | ${c.runs} | ${pct(c.vitorias / c.runs)} | ` +
          `${pct(m.vitorias > 0 ? c.vitorias / m.vitorias : null)} |`,
      );
    }
  }
  if (!algumConjunto) l.push('| — | — | 0 | — | — |');
  l.push('', ...secaoDasBuilds(runs, cfg));
  if (surpresas) l.push('', ...secaoDasSurpresas(surpresas, cfg.surpresas));
  l.push('', '## Onde as runs acabam', '');
  const fins = [...new Set(perfis.flatMap((p) => Object.keys(porPerfil[p]!.fins)))].sort(
    (x, y) => ordemDoFim(x) - ordemDoFim(y),
  );
  l.push(`| Perfil | ${fins.join(' | ')} |`, `| ------ | ${fins.map(() => '---').join(' | ')} |`);
  for (const p of perfis)
    l.push(`| ${nome(p)} | ${fins.map((f) => porPerfil[p]!.fins[f] ?? 0).join(' | ')} |`);
  l.push('', '## O que mais machuca (dano recebido, todos os perfis)', '');
  const dano: Record<string, number> = {};
  for (const p of perfis)
    for (const [k, v] of Object.entries(porPerfil[p]!.danoPor)) dano[k] = (dano[k] ?? 0) + v;
  const totalDano = Object.values(dano).reduce((s, v) => s + v, 0) || 1;
  l.push('| Quem | Dano | Parte |', '| ---- | ---- | ----- |');
  for (const [k, v] of Object.entries(dano)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8))
    l.push(`| ${k} | ${Math.round(v)} | ${pct(v / totalDano)} |`);
  l.push('', '## Evoluções escolhidas (todos os perfis)', '');
  const pares: Record<string, [number, number]> = {};
  for (const p of perfis)
    for (const [h, [a, b]] of Object.entries(porPerfil[p]!.evolucoes)) {
      const par = (pares[h] ??= [0, 0]);
      par[0] += a;
      par[1] += b;
    }
  l.push('| Habilidade | A | B |', '| ---------- | - | - |');
  for (const [h, [a, b]] of Object.entries(pares)) l.push(`| ${h} | ${a} | ${b} |`);
  if (Object.keys(pares).length === 0) l.push('| — | 0 | 0 |');
  l.push('', '## Condições da noite (escolhida / oferecida)', '');
  l.push(
    `| Condição | ${perfis.map(nome).join(' | ')} |`,
    `| -------- | ${perfis.map(() => '---').join(' | ')} |`,
  );
  const conds = [...new Set(perfis.flatMap((p) => Object.keys(porPerfil[p]!.condicoes)))].sort();
  for (const c of conds)
    l.push(
      `| ${c} | ${perfis
        .map((p) => {
          const x = porPerfil[p]!.condicoes[c];
          return x ? `${x.escolhida}/${x.oferecida}` : '—';
        })
        .join(' | ')} |`,
    );
  l.push('');
  return l.join('\n');
}
