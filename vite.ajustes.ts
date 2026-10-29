import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as prettier from 'prettier';
import type { Plugin } from 'vite';
import {
  ARQUIVOS_DAS_RAIZES,
  destinoDoAjuste,
  editarJson,
  type AjusteParaGravar,
} from './src/game/dev/editarJson.ts';

/** Rota que o painel do modo desenvolvedor chama para gravar os ajustes no `content/`. */
export const ROTA_DOS_AJUSTES = '/__dev/ajustes';

/** Arquivos gravados agora pelo painel: a mudança não recarrega a página (os números já valem). */
const gravadosAgora = new Map<string, number>();
const SILENCIO_MS = 3000;

function lerCorpo(req: NodeJS.ReadableStream): Promise<string> {
  return new Promise((ok, falha) => {
    let corpo = '';
    req.on('data', (p: Buffer) => (corpo += p.toString('utf8')));
    req.on('end', () => ok(corpo));
    req.on('error', falha);
  });
}

function ehAjuste(x: unknown): x is AjusteParaGravar {
  if (typeof x !== 'object' || x === null) return false;
  const a = x as Record<string, unknown>;
  const valorOk =
    (typeof a['valor'] === 'number' && Number.isFinite(a['valor'])) ||
    (Array.isArray(a['valor']) &&
      a['valor'].every((n) => typeof n === 'number' && Number.isFinite(n)));
  return (
    typeof a['raiz'] === 'string' &&
    a['raiz'] in ARQUIVOS_DAS_RAIZES &&
    Array.isArray(a['caminho']) &&
    a['caminho'].every((s) => typeof s === 'string') &&
    valorOk
  );
}

/** Grava os ajustes nos JSON (formatados como o resto do projeto) e diz quais arquivos mudaram. */
export async function gravarAjustes(
  raizDoProjeto: string,
  ajustes: readonly AjusteParaGravar[],
): Promise<{ arquivos: string[]; falhas: string[] }> {
  const textos = new Map<string, string>();
  const falhas: string[] = [];
  for (const a of ajustes) {
    const { arquivo, caminho } = destinoDoAjuste(a);
    const nome = resolve(raizDoProjeto, 'content', arquivo);
    const atual = textos.get(nome) ?? (await readFile(nome, 'utf8'));
    const novo = editarJson(atual, caminho, a.valor);
    if (novo === null) falhas.push(`${arquivo}: ${caminho.join('.')}`);
    else textos.set(nome, novo);
  }
  const arquivos: string[] = [];
  for (const [nome, texto] of textos) {
    const opcoes = (await prettier.resolveConfig(nome)) ?? {};
    const formatado = await prettier.format(texto, { ...opcoes, filepath: nome });
    gravadosAgora.set(resolve(nome), Date.now());
    await writeFile(nome, formatado, 'utf8');
    arquivos.push(`content/${nome.replace(/\\/g, '/').split('/content/').pop()}`);
  }
  return { arquivos, falhas };
}

/**
 * Só no `npm run dev`: o painel do modo desenvolvedor (F1) manda cada número mudado e ele vai
 * direto para o `content/*.json`, que é o que entra no jogo final.
 */
export function ajustesDoModoDev(): Plugin {
  return {
    name: 'porta-a-porta:ajustes-do-modo-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(ROTA_DOS_AJUSTES, (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        void (async () => {
          try {
            const corpo: unknown = JSON.parse(await lerCorpo(req));
            const lista = (corpo as { ajustes?: unknown }).ajustes;
            if (!Array.isArray(lista) || !lista.every(ehAjuste)) throw new Error('ajuste inválido');
            const r = await gravarAjustes(server.config.root, lista);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(r));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ erro: String(e) }));
          }
        })();
      });
    },
    handleHotUpdate({ file }) {
      // O próprio painel gravou: os números já estão valendo na página, sem recarregar a rua.
      const quando = gravadosAgora.get(resolve(file));
      if (quando !== undefined && Date.now() - quando < SILENCIO_MS) return [];
      return undefined;
    },
  };
}
