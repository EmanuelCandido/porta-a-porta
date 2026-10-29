import { combatenteDoCampeao, recalcular, type Atributos } from '../../sim/combate';
import {
  campeoes,
  combate,
  configRun,
  exploracao,
  habilidades,
  inimigos,
  jogador,
  ondas,
  susto,
  visual,
} from '../../sim/content';
import type { Entidade, Mundo } from '../../sim/mundo';

/**
 * Modo desenvolvedor: balanceamento à mão (docs/PLANO_MUNDO_VIVO.md, frente 0). Os números do
 * `content` já carregado são trocados no lugar; quem guarda a referência (a habilidade no slot, o
 * golpe do jogador, as regras) vê o valor novo no próximo uso. Os atributos que a entidade copia ao
 * nascer (Coragem, Resistência, velocidade) são corrigidos nas entidades vivas por `aplicarNasVivas`.
 */

/** Cada arquivo de conteúdo que dá para ajustar, com o nome do JSON (para copiar o resultado). */
export const RAIZES = {
  campeoes: { arquivo: 'campeoes.json', valor: campeoes as unknown },
  habilidades: { arquivo: 'habilidades.json → habilidades', valor: habilidades as unknown },
  inimigos: { arquivo: 'inimigos.json', valor: inimigos as unknown },
  combate: { arquivo: 'combate.json', valor: combate as unknown },
  jogador: { arquivo: 'jogador.json', valor: jogador as unknown },
  ondas: { arquivo: 'ondas.json', valor: ondas as unknown },
  susto: { arquivo: 'susto.json', valor: susto as unknown },
  exploracao: { arquivo: 'exploracao.json', valor: exploracao as unknown },
  run: { arquivo: 'run.json', valor: configRun as unknown },
  visual: { arquivo: 'visual.json', valor: visual as unknown },
} as const;

export type Raiz = keyof typeof RAIZES;

/** Um número que dá para ajustar: `raiz` + caminho (itens de lista com `id` vão pelo id). */
export interface Campo {
  raiz: Raiz;
  caminho: string[];
  valor: number | number[];
}

/** Valor ajustado: um número ou uma lista de números (recarga e dano por posto). */
export type ValorAjuste = number | number[];

/** Os ajustes guardados: `raiz:a.b.c` → valor. */
export type Ajustes = Record<string, ValorAjuste>;

export const CHAVE_DO_ARMAZENAMENTO = 'portaAPorta.dev.ajustes';

export function chaveDe(raiz: Raiz, caminho: readonly string[]): string {
  return `${raiz}:${caminho.join('.')}`;
}

export function separarChave(chave: string): { raiz: Raiz; caminho: string[] } | null {
  const i = chave.indexOf(':');
  if (i < 0) return null;
  const raiz = chave.slice(0, i);
  if (!(raiz in RAIZES)) return null;
  return { raiz: raiz as Raiz, caminho: chave.slice(i + 1).split('.') };
}

type Objeto = Record<string, unknown>;

function ehObjeto(v: unknown): v is Objeto {
  return typeof v === 'object' && v !== null;
}

function ehListaDeNumeros(v: unknown): v is number[] {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number');
}

/** O filho de um nó pelo segmento do caminho (numa lista de objetos com `id`, pelo id). */
function filho(no: unknown, seg: string): unknown {
  if (Array.isArray(no)) {
    const porId = no.find((x) => ehObjeto(x) && x['id'] === seg);
    if (porId !== undefined) return porId;
    return no[Number(seg)];
  }
  return ehObjeto(no) ? no[seg] : undefined;
}

function segmentoDe(lista: unknown[], i: number): string {
  const x = lista[i];
  return ehObjeto(x) && typeof x['id'] === 'string' ? x['id'] : String(i);
}

export function ler(raiz: Raiz, caminho: readonly string[]): unknown {
  let no: unknown = RAIZES[raiz].valor;
  for (const seg of caminho) no = filho(no, seg);
  return no;
}

/** Troca o número (ou a lista) no lugar; false se o caminho não existe ou o tipo não bate. */
export function escrever(raiz: Raiz, caminho: readonly string[], valor: ValorAjuste): boolean {
  if (caminho.length === 0) return false;
  const pai = ler(raiz, caminho.slice(0, -1));
  const ultimo = caminho[caminho.length - 1]!;
  if (!ehObjeto(pai)) return false;
  const atual = filho(pai, ultimo);
  if (typeof atual === 'number' && typeof valor === 'number' && Number.isFinite(valor)) {
    if (Array.isArray(pai)) pai[Number(ultimo)] = valor;
    else pai[ultimo] = valor;
    return true;
  }
  if (ehListaDeNumeros(atual) && Array.isArray(valor) && valor.every(Number.isFinite)) {
    // A lista é trocada por dentro: quem guardou a referência vê os números novos.
    atual.splice(0, atual.length, ...valor);
    return true;
  }
  return false;
}

/** Todos os números de um nó, em ordem, com o caminho de cada um. */
export function camposDe(raiz: Raiz, caminho: readonly string[] = []): Campo[] {
  const saida: Campo[] = [];
  const andar = (no: unknown, c: string[]): void => {
    if (typeof no === 'number') saida.push({ raiz, caminho: c, valor: no });
    else if (ehListaDeNumeros(no)) saida.push({ raiz, caminho: c, valor: [...no] });
    else if (Array.isArray(no)) no.forEach((x, i) => andar(x, [...c, segmentoDe(no, i)]));
    else if (ehObjeto(no)) for (const [k, v] of Object.entries(no)) andar(v, [...c, k]);
  };
  andar(ler(raiz, caminho), [...caminho]);
  return saida;
}

/** Texto do campo para o painel (`3, 3, 3` numa lista). */
export function textoDoValor(v: ValorAjuste): string {
  return Array.isArray(v) ? v.join(', ') : String(v);
}

/** Lê o que o jogador digitou no formato do valor atual; null se não for número. */
export function lerTexto(texto: string, modelo: ValorAjuste): ValorAjuste | null {
  const num = (s: string): number | null => {
    const n = Number(s.trim().replace(',', '.'));
    return s.trim() !== '' && Number.isFinite(n) ? n : null;
  };
  if (!Array.isArray(modelo)) return num(texto);
  // Lista: separada por ";" ou por ", " (vírgula seguida de espaço; "1,5" continua decimal).
  const partes = texto.includes(';') ? texto.split(';') : texto.split(/,\s+|\s+/);
  const lista = partes.filter((p) => p.trim() !== '').map(num);
  if (lista.length === 0 || lista.some((n) => n === null)) return null;
  return lista as number[];
}

/** Os valores originais (do JSON), guardados na primeira vez que cada campo muda. */
const originais = new Map<string, ValorAjuste>();

function guardarOriginal(raiz: Raiz, caminho: readonly string[]): void {
  const k = chaveDe(raiz, caminho);
  if (originais.has(k)) return;
  const v = ler(raiz, caminho);
  if (typeof v === 'number') originais.set(k, v);
  else if (ehListaDeNumeros(v)) originais.set(k, [...v]);
}

export function original(raiz: Raiz, caminho: readonly string[]): ValorAjuste | undefined {
  return originais.get(chaveDe(raiz, caminho));
}

/** Aplica um ajuste e devolve se pegou. */
export function ajustar(raiz: Raiz, caminho: readonly string[], valor: ValorAjuste): boolean {
  guardarOriginal(raiz, caminho);
  return escrever(raiz, caminho, valor);
}

/** Volta todos os números mudados ao valor do JSON. */
export function restaurarTudo(): void {
  for (const [k, v] of originais) {
    const s = separarChave(k);
    if (s) escrever(s.raiz, s.caminho, Array.isArray(v) ? [...v] : v);
  }
}

/** Aplica um conjunto de ajustes guardados; os que não existem mais são ignorados. */
export function aplicarAjustes(ajustes: Ajustes): number {
  let n = 0;
  for (const [k, v] of Object.entries(ajustes)) {
    const s = separarChave(k);
    if (s && ajustar(s.raiz, s.caminho, v)) n++;
  }
  return n;
}

/** Só os ajustes que ainda diferem do JSON, no formato `raiz:caminho` → valor. */
export function ajustesAtuais(): Ajustes {
  const saida: Ajustes = {};
  for (const [k, v0] of originais) {
    const s = separarChave(k);
    if (!s) continue;
    const v = ler(s.raiz, s.caminho);
    const igual = Array.isArray(v0)
      ? ehListaDeNumeros(v) && v.length === v0.length && v.every((x, i) => x === v0[i])
      : v === v0;
    if (!igual && (typeof v === 'number' || ehListaDeNumeros(v)))
      saida[k] = Array.isArray(v) ? [...v] : v;
  }
  return saida;
}

/** O resumo para colar no chat ou no JSON: um bloco por arquivo, com o caminho de cada número. */
export function textoParaCopiar(ajustes: Ajustes): string {
  const porArquivo = new Map<string, string[]>();
  for (const [k, v] of Object.entries(ajustes)) {
    const s = separarChave(k);
    if (!s) continue;
    const arq = RAIZES[s.raiz].arquivo;
    const antes = originais.get(k);
    const linha = `  ${s.caminho.join('.')}: ${JSON.stringify(v)}${
      antes !== undefined ? `   (era ${JSON.stringify(antes)})` : ''
    }`;
    porArquivo.set(arq, [...(porArquivo.get(arq) ?? []), linha]);
  }
  if (porArquivo.size === 0) return 'Nenhum ajuste.';
  return [...porArquivo]
    .map(([arq, linhas]) => `content/${arq}\n${linhas.join('\n')}`)
    .join('\n\n');
}

/** O armazenamento do navegador pode faltar (janela privada): tudo aqui tolera erro. */
export function carregarAjustes(armazenamento: Pick<Storage, 'getItem'> | undefined): Ajustes {
  try {
    const t = armazenamento?.getItem(CHAVE_DO_ARMAZENAMENTO);
    const v: unknown = t ? JSON.parse(t) : {};
    return ehObjeto(v) && !Array.isArray(v) ? (v as Ajustes) : {};
  } catch {
    return {};
  }
}

export function salvarAjustes(
  armazenamento: Pick<Storage, 'setItem' | 'removeItem'> | undefined,
  ajustes: Ajustes,
): void {
  try {
    if (Object.keys(ajustes).length === 0) armazenamento?.removeItem(CHAVE_DO_ARMAZENAMENTO);
    else armazenamento?.setItem(CHAVE_DO_ARMAZENAMENTO, JSON.stringify(ajustes));
  } catch {
    // Sem armazenamento: os ajustes valem só até recarregar a página.
  }
}

// ------------------------------------------------------------------ entidades que já nasceram

/** Atributos base que a ficha do campeão daria hoje (antes de nível e itens). */
export function baseDoCampeao(id: string): Atributos | null {
  const c = campeoes[id];
  return c ? combatenteDoCampeao(c, combate).base : null;
}

/**
 * Leva para as entidades vivas o que elas copiaram ao nascer. `antes` é a base do campeão antes do
 * ajuste: a diferença entra por cima do que o jogador já ganhou de nível e itens.
 */
export function aplicarNasVivas(
  mundo: Mundo,
  heroi: Entidade | undefined,
  campeaoId: string,
  antes: Atributos | null,
  inimigosAntes: Record<string, { coragem: number; resistencia: number }>,
): void {
  const depois = baseDoCampeao(campeaoId);
  if (heroi?.combate && antes && depois) {
    const b = heroi.combate.base;
    for (const k of Object.keys(depois) as (keyof Atributos)[]) {
      const d = depois[k] - antes[k];
      if (d !== 0) b[k] += d;
    }
    recalcular(heroi.combate);
  }
  if (heroi) heroi.velocidade = jogador.velocidade;
  if (heroi && jogador.aceleracao) heroi.aceleracao = { ...jogador.aceleracao };
  for (const e of mundo.entidades) {
    if (e.tipo !== 'inimigo' || !e.combate || !e.especie) continue;
    const def = inimigos.inimigos[e.especie];
    const velho = inimigosAntes[e.especie];
    if (!def || !velho) continue;
    if (velho.coragem > 0 && def.coragem !== velho.coragem) {
      const fator = def.coragem / velho.coragem;
      e.combate.base.coragemMax *= fator;
      e.combate.coragem *= fator;
    }
    e.combate.base.resistencia += def.resistencia - velho.resistencia;
    e.velocidade = def.velocidade;
    recalcular(e.combate);
  }
}

/** Coragem e Resistência de cada espécie agora (para comparar depois de um ajuste). */
export function fotoDosInimigos(): Record<string, { coragem: number; resistencia: number }> {
  const saida: Record<string, { coragem: number; resistencia: number }> = {};
  for (const [id, d] of Object.entries(inimigos.inimigos))
    saida[id] = { coragem: d.coragem, resistencia: d.resistencia };
  return saida;
}
