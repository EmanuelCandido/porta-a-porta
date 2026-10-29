import type { ConfigBots } from '../sim/content/esquemas';
import { Run, type ConteudoRun } from '../sim/run';

/**
 * Regra de frequência das surpresas (GAMEPLAY.md, "Surpresas e recompensas variáveis"): o jogo
 * garante ao menos 1 baú raro por bairro e evita 2 encontros raros na mesma rua. Aqui as runs são
 * simuladas sem luta (cada rua, porta e praça é montada e dada por vencida), só para contar o que
 * o sorteio pôs no caminho.
 */
export interface SurpresasDaRun {
  semente: number;
  /** Encontro de cada rua (null = nenhum), na ordem das 9 ruas. */
  encontros: (string | null)[];
  /** Quantos encontros apareceram de fato em cada rua montada (Gatos nos quintais + o das regras). */
  porRua: number[];
  /** Baús de cada tipo na run. */
  baus: Record<string, number>;
  /** Baús raros em cada bairro. */
  rarosPorBairro: number[];
  /** Fases Porta a Porta e quantas tiveram a Janela Vermelha. */
  portas: number;
  janelasVermelhas: number;
}

export function simularSurpresas(conteudo: ConteudoRun, semente: number): SurpresasDaRun {
  const run = new Run(conteudo, semente);
  const encontros: (string | null)[] = [];
  const porRua: number[] = [];
  const baus: Record<string, number> = { comum: 0, raro: 0, amaldicoado: 0 };
  const rarosPorBairro = Array.from({ length: run.totalDeBairros }, () => 0);
  let portas = 0;
  while (run.estado.fase !== 'vitoria') {
    const e = run.estado;
    if (e.fase === 'rua') {
      const antes = e.encontros.length;
      const r = run.novaRua();
      encontros.push(e.encontros.length > antes ? e.encontros.at(-1)!.tipo : null);
      const gatos = r.mundo.entidades.filter((x) => x.especie === 'gato_preto').length;
      porRua.push(gatos + (r.regras.encontros ? 1 : 0));
      for (const b of r.regras.estado.baus) {
        baus[b.tipo] = (baus[b.tipo] ?? 0) + 1;
        if (b.tipo === 'raro') rarosPorBairro[e.bairro]!++;
      }
      run.venceuRua();
    } else if (e.fase === 'portaAPorta') {
      portas++;
      run.novaPorta();
      run.sairDaPorta();
    } else if (e.fase === 'chefe') {
      run.novaArena();
      run.venceuChefe();
    } else break;
  }
  return {
    semente,
    encontros,
    porRua,
    baus,
    rarosPorBairro,
    portas,
    janelasVermelhas: run.estado.janelasVermelhas,
  };
}

export interface ResumoDasSurpresas {
  runs: number;
  ruas: number;
  /** Fração das ruas com cada encontro. */
  porTipo: Record<string, number>;
  /** O máximo de encontros numa rua (a regra pede 1). */
  maximoPorRua: number;
  /** Fração das runs sem nenhum encontro raro (a meta do complemento pede menos de 10%). */
  semEncontro: number;
  /** Carrinhos de Pipoca por run (a regra pede exatamente 1). */
  carrinhos: { min: number; max: number };
  /** Fração dos bairros com ao menos um baú raro (a regra pede todos). */
  bairrosComRaro: number;
  /** Fração dos baús de cada tipo. */
  baus: Record<string, number>;
  /** Fração das fases Porta a Porta com a Janela Vermelha. */
  janelaVermelha: number;
}

export function resumirSurpresas(
  runs: readonly SurpresasDaRun[],
  minRaros = 1,
): ResumoDasSurpresas {
  const ruas = runs.reduce((s, r) => s + r.encontros.length, 0);
  const porTipo: Record<string, number> = {};
  for (const r of runs)
    for (const t of r.encontros) if (t) porTipo[t] = (porTipo[t] ?? 0) + 1 / Math.max(1, ruas);
  const maximoPorRua = Math.max(0, ...runs.flatMap((r) => r.porRua));
  const carrinhos = runs.map((r) => r.encontros.filter((t) => t === 'carrinho_de_pipoca').length);
  const bairros = runs.flatMap((r) => r.rarosPorBairro);
  const totalBaus = runs.reduce((s, r) => s + Object.values(r.baus).reduce((a, b) => a + b, 0), 0);
  const baus: Record<string, number> = {};
  for (const r of runs)
    for (const [k, v] of Object.entries(r.baus))
      baus[k] = (baus[k] ?? 0) + v / Math.max(1, totalBaus);
  const portas = runs.reduce((s, r) => s + r.portas, 0);
  return {
    runs: runs.length,
    ruas,
    porTipo,
    maximoPorRua,
    semEncontro:
      runs.filter((r) => r.encontros.every((t) => t === null) && r.janelasVermelhas === 0).length /
      Math.max(1, runs.length),
    carrinhos: { min: Math.min(...carrinhos), max: Math.max(...carrinhos) },
    bairrosComRaro: bairros.filter((n) => n >= minRaros).length / Math.max(1, bairros.length),
    baus,
    janelaVermelha: runs.reduce((s, r) => s + r.janelasVermelhas, 0) / Math.max(1, portas),
  };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const ok = (v: boolean) => (v ? '✅' : '❌');

const NOMES: Record<string, string> = {
  gato_preto: 'Gato Preto',
  crianca_perdida: 'Criança Perdida',
  festa_na_garagem: 'Festa na Garagem',
  carrinho_de_pipoca: 'Carrinho de Pipoca',
  comum: 'comum',
  raro: 'raro',
  amaldicoado: 'amaldiçoado',
};

/** A seção do relatório com a regra de frequência validada nas runs simuladas. */
export function secaoDasSurpresas(r: ResumoDasSurpresas, cfg: ConfigBots['surpresas']): string[] {
  const tipos = Object.entries(r.porTipo)
    .sort((a, b) => b[1] - a[1])
    .map(([t, v]) => `${NOMES[t] ?? t} ${pct(v)}`)
    .join(', ');
  const baus = Object.entries(r.baus)
    .map(([t, v]) => `${NOMES[t] ?? t} ${pct(v)}`)
    .join(', ');
  return [
    '## Surpresas (regra de frequência)',
    '',
    `${r.runs} runs simuladas sem luta (${r.ruas} ruas), contando o que o sorteio pôs no caminho.`,
    '',
    '| Regra | Medido | |',
    '| ----- | ------ | - |',
    `| No máximo 1 encontro raro por rua | ${r.maximoPorRua} | ${ok(r.maximoPorRua <= 1)} |`,
    `| Ao menos 1 baú raro por bairro | ${pct(r.bairrosComRaro)} dos bairros | ${ok(r.bairrosComRaro >= 1)} |`,
    `| Carrinho de Pipoca uma vez por run | ${r.carrinhos.min} a ${r.carrinhos.max} | ${ok(r.carrinhos.min === 1 && r.carrinhos.max === 1)} |`,
    `| Runs sem nenhum encontro raro (até ${pct(cfg.semEncontroMax)}) | ${pct(r.semEncontro)} | ${ok(r.semEncontro <= cfg.semEncontroMax)} |`,
    '',
    `- Encontros por rua: ${tipos || 'nenhum'}.`,
    `- Baús: ${baus}.`,
    `- Janela Vermelha: ${pct(r.janelaVermelha)} das fases Porta a Porta.`,
    '',
  ];
}
