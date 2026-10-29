/**
 * Edição cirúrgica do texto de um `content/*.json`: troca um número (ou uma lista de números) sem
 * mexer no resto do arquivo. Puro (sem Node, sem DOM): o servidor do `npm run dev` usa para gravar
 * os ajustes do modo desenvolvedor, e os testes de unidade conferem.
 */

/** Cada raiz do painel: o arquivo em `content/` e por onde se entra nele. */
export const ARQUIVOS_DAS_RAIZES = {
  campeoes: { arquivo: 'campeoes.json', prefixo: [] },
  habilidades: { arquivo: 'habilidades.json', prefixo: ['habilidades'] },
  inimigos: { arquivo: 'inimigos.json', prefixo: [] },
  combate: { arquivo: 'combate.json', prefixo: [] },
  jogador: { arquivo: 'jogador.json', prefixo: [] },
  ondas: { arquivo: 'ondas.json', prefixo: [] },
  susto: { arquivo: 'susto.json', prefixo: [] },
  exploracao: { arquivo: 'exploracao.json', prefixo: [] },
  run: { arquivo: 'run.json', prefixo: [] },
  visual: { arquivo: 'visual.json', prefixo: [] },
} as const satisfies Record<string, { arquivo: string; prefixo: readonly string[] }>;

export type RaizDoArquivo = keyof typeof ARQUIVOS_DAS_RAIZES;

/** Um ajuste a gravar: a raiz do painel, o caminho dentro dela e o valor novo. */
export interface AjusteParaGravar {
  raiz: RaizDoArquivo;
  caminho: string[];
  valor: number | number[];
}

type No =
  | { tipo: 'objeto'; ini: number; fim: number; props: { chave: string; valor: No }[] }
  | { tipo: 'lista'; ini: number; fim: number; itens: No[] }
  | { tipo: 'valor'; ini: number; fim: number; valor: unknown };

/** Lê o JSON guardando onde cada valor começa e termina no texto. */
function analisar(texto: string): No {
  let i = 0;
  const espacos = (): void => {
    while (i < texto.length && /\s/.test(texto[i]!)) i++;
  };
  const cadeia = (): string => {
    const ini = i;
    i++;
    while (texto[i] !== '"') i += texto[i] === '\\' ? 2 : 1;
    i++;
    return JSON.parse(texto.slice(ini, i)) as string;
  };
  const valor = (): No => {
    espacos();
    const ini = i;
    const c = texto[i];
    if (c === '{') {
      i++;
      const props: { chave: string; valor: No }[] = [];
      espacos();
      while (texto[i] !== '}') {
        espacos();
        const chave = cadeia();
        espacos();
        i++; // ':'
        props.push({ chave, valor: valor() });
        espacos();
        if (texto[i] === ',') i++;
        espacos();
      }
      i++;
      return { tipo: 'objeto', ini, fim: i, props };
    }
    if (c === '[') {
      i++;
      const itens: No[] = [];
      espacos();
      while (texto[i] !== ']') {
        itens.push(valor());
        espacos();
        if (texto[i] === ',') i++;
        espacos();
      }
      i++;
      return { tipo: 'lista', ini, fim: i, itens };
    }
    if (c === '"') {
      const v = cadeia();
      return { tipo: 'valor', ini, fim: i, valor: v };
    }
    while (i < texto.length && /[^\s,\]}]/.test(texto[i]!)) i++;
    return { tipo: 'valor', ini, fim: i, valor: JSON.parse(texto.slice(ini, i)) };
  };
  return valor();
}

/** O filho pelo segmento: numa lista de objetos com `id`, pelo id; senão, pelo índice. */
function filho(no: No, seg: string): No | undefined {
  if (no.tipo === 'objeto') return no.props.find((p) => p.chave === seg)?.valor;
  if (no.tipo === 'lista') {
    const porId = no.itens.find(
      (x) =>
        x.tipo === 'objeto' &&
        x.props.some((p) => p.chave === 'id' && p.valor.tipo === 'valor' && p.valor.valor === seg),
    );
    return porId ?? no.itens[Number(seg)];
  }
  return undefined;
}

function escrita(valor: number | number[]): string {
  return Array.isArray(valor) ? `[${valor.join(', ')}]` : JSON.stringify(valor);
}

/**
 * Troca o valor no caminho. Se só a última chave faltar (um campo que o esquema completa com o
 * padrão), ela entra no começo do objeto. Devolve null se o caminho não existe no arquivo.
 */
export function editarJson(
  texto: string,
  caminho: readonly string[],
  valor: number | number[],
): string | null {
  let no: No | undefined = analisar(texto);
  for (let k = 0; k < caminho.length; k++) {
    const seg = caminho[k]!;
    const proximo: No | undefined = no ? filho(no, seg) : undefined;
    if (!proximo) {
      if (k !== caminho.length - 1 || no?.tipo !== 'objeto') return null;
      const virgula = no.props.length > 0 ? ', ' : '';
      const novo = `${JSON.stringify(seg)}: ${escrita(valor)}${virgula}`;
      return texto.slice(0, no.ini + 1) + novo + texto.slice(no.ini + 1);
    }
    no = proximo;
  }
  if (!no || no.tipo === 'objeto') return null;
  return texto.slice(0, no.ini) + escrita(valor) + texto.slice(no.fim);
}

/** O arquivo e o caminho completo dentro dele de um ajuste do painel. */
export function destinoDoAjuste(a: Pick<AjusteParaGravar, 'raiz' | 'caminho'>): {
  arquivo: string;
  caminho: string[];
} {
  const r = ARQUIVOS_DAS_RAIZES[a.raiz];
  return { arquivo: r.arquivo, caminho: [...r.prefixo, ...a.caminho] };
}
