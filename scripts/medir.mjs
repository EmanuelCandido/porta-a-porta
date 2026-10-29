// Mede o peso do jogo no build de produção (plano de otimização, passo O1) e grava em
// docs/DESEMPENHO.md. Abre o `vite preview` do dist/ no Chromium do Playwright, sem placa de
// vídeo (SwiftShader), e mede cada cena numa aba nova: tempo até `__portaAPorta.pronta`, bytes
// baixados, quadros por requestAnimationFrame em 5 s, canvases criados, bytes enviados à GPU
// (texImage2D), heap do JS e áudio decodificado (decodeAudioData).
//
//   npm run medir                         build + medição, com o rótulo "medição"
//   npm run medir -- --rotulo "O3.1"      dá nome à seção gravada
//   node scripts/medir.mjs --sem-gravar   só mostra (o dist/ já tem de estar construído)
//   node scripts/medir.mjs --dist PASTA --sobre COMMIT   mede outro build (o de um commit anterior)
//
// Sem GPU os quadros saem bem mais lentos que num navegador comum: os tempos servem para
// comparar antes e depois, não como valor absoluto. As seções novas entram no topo do histórico.

import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import prettier from 'prettier';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arquivo = join(raiz, 'docs', 'DESEMPENHO.md');
const MARCA = '<!-- medições: a mais nova primeiro -->';
const PORTA = 4195;
const BASE = `http://localhost:${PORTA}`;
const JANELA = { width: 1280, height: 720 };
const ESPERA_MS = 3000;
const AMOSTRA_MS = 5000;

const args = process.argv.slice(2);
const opcao = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
};
// O cmd do Windows (onde o npm roda os scripts) deixa os ^ de escape no argumento.
const rotulo = (opcao('--rotulo') ?? 'medição').replaceAll('^', '');
const gravar = !args.includes('--sem-gravar');
const dist = resolve(raiz, opcao('--dist') ?? 'dist');

/** As cenas, todas com a semente 5. `acao` roda depois de a cena ficar pronta. */
const CENAS = [
  { nome: 'Título', url: '/', clicar: false },
  { nome: 'Rua 1, de dia', url: '/?posicao=1-1&semente=5&noite=0' },
  { nome: 'Rua 1, de noite', url: '/?posicao=1-1&semente=5&noite=1' },
  {
    nome: 'Rua 1 com 30 inimigos',
    url: '/?posicao=1-1&semente=5',
    acao: async (page) => {
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.__portaAPorta.cercar?.(30, 'pestinha_lencol'));
    },
  },
  { nome: 'Chefe do bairro 1', url: '/?bairro=0&chefe=1&semente=5' },
];

// Roda na página antes do jogo: conta canvases, o que sobe para a GPU e o áudio decodificado.
const espiao = () => {
  const m = { canvases: 0, uploads: 0, bytesGpu: 0, bytesAudio: 0, faixas: [] };
  window.__medidas = m;
  const decodificar = BaseAudioContext.prototype.decodeAudioData;
  BaseAudioContext.prototype.decodeAudioData = function (...a) {
    return decodificar.apply(this, a).then((buf) => {
      const bytes = buf.length * buf.numberOfChannels * 4;
      m.bytesAudio += bytes;
      if (bytes > 2 * 1048576) m.faixas.push(`${buf.duration.toFixed(0)} s`);
      return buf;
    });
  };
  const criar = Document.prototype.createElement;
  Document.prototype.createElement = function (nome, ...r) {
    const el = criar.call(this, nome, ...r);
    if (String(nome).toLowerCase() === 'canvas') m.canvases++;
    return el;
  };
  for (const P of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    const enviar = P.texImage2D;
    P.texImage2D = function (...a) {
      m.uploads++;
      const fonte = a[a.length - 1];
      if (fonte && fonte.width) m.bytesGpu += fonte.width * fonte.height * 4;
      else if (typeof a[3] === 'number' && typeof a[4] === 'number') m.bytesGpu += a[3] * a[4] * 4;
      return enviar.apply(this, a);
    };
  }
};

// Roda na página: amostra os quadros por rAF e junta os contadores.
const amostrar = (duracao) =>
  new Promise((fim) => {
    const quadros = [];
    let antes = performance.now();
    const ate = antes + duracao;
    const passo = (t) => {
      quadros.push(t - antes);
      antes = t;
      if (t < ate) return requestAnimationFrame(passo);
      quadros.sort((a, b) => a - b);
      const m = window.__medidas;
      const recursos = performance.getEntriesByType('resource');
      const navegacao = performance.getEntriesByType('navigation')[0];
      const baixados =
        recursos.reduce((s, r) => s + r.transferSize, 0) + (navegacao?.transferSize ?? 0);
      fim({
        medio: quadros.reduce((a, b) => a + b, 0) / quadros.length,
        p95: quadros[Math.floor(quadros.length * 0.95)],
        pior: quadros[quadros.length - 1],
        canvases: m.canvases,
        uploads: m.uploads,
        gpuMB: m.bytesGpu / 1048576,
        audioMB: m.bytesAudio / 1048576,
        faixas: m.faixas,
        baixadosMB: baixados / 1048576,
      });
    };
    requestAnimationFrame(passo);
  });

async function esperarServidor() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`o vite preview não respondeu em ${BASE}`);
}

async function medir(navegador, cena) {
  const page = await navegador.newPage({ viewport: JANELA });
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.addInitScript(espiao);
  const t0 = Date.now();
  await page.goto(BASE + cena.url);
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true, null, {
    timeout: 180_000,
  });
  const prontaS = (Date.now() - t0) / 1000;
  // O clique destrava o áudio (a música só decodifica depois de um gesto).
  if (cena.clicar !== false) await page.mouse.click(JANELA.width / 2, JANELA.height / 2);
  if (cena.acao) await cena.acao(page);
  await page.waitForTimeout(ESPERA_MS);
  const r = await page.evaluate(amostrar, AMOSTRA_MS);
  // O heap só depois de uma coleta de lixo: sem ela, a leitura varia dezenas de MB.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  r.heapMB = (await page.evaluate(() => performance.memory.usedJSHeapSize)) / 1048576;
  await page.close();
  if (erros.length) console.warn(`  erros na página: ${erros.join(' | ')}`);
  return { nome: cena.nome, prontaS, ...r };
}

const num = (v, casas = 0) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

function tabela(resultados) {
  const linhas = [
    '| Cena (semente 5) | Até jogável | Quadro médio / p95 / pior | Canvases | Texturas na GPU | Heap do JS | Áudio decodificado | Baixado |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of resultados) {
    linhas.push(
      `| ${r.nome} | ${num(r.prontaS, 1)} s | ${num(r.medio)} / ${num(r.p95)} / ${num(r.pior)} ms | ` +
        `${num(r.canvases)} | ${num(r.gpuMB)} MB | ${num(r.heapMB)} MB | ${num(r.audioMB)} MB | ` +
        `${num(r.baixadosMB, 1)} MB |`,
    );
  }
  return linhas.join('\n');
}

function cabecalho() {
  return `# Desempenho medido

Gerado por \`npm run medir\` (\`scripts/medir.mjs\`, passo O1 do \`docs/PLANO_OTIMIZACAO.md\`): o
build de produção no \`vite preview\`, Chromium do Playwright sem placa de vídeo (SwiftShader),
janela de 1280×720, \`devicePixelRatio\` 1. Cada cena abre numa aba nova; depois de pronta, espera
${ESPERA_MS / 1000} s e amostra ${AMOSTRA_MS / 1000} s de quadros.

- **Até jogável**: da navegação até \`window.__portaAPorta.pronta\`.
- **Quadro**: intervalo entre requestAnimationFrame (médio, percentil 95 e pior).
- **Canvases**: \`document.createElement('canvas')\` desde a abertura (as texturas assadas).
- **Texturas na GPU**: soma dos bytes enviados por \`texImage2D\` (largura × altura × 4).
- **Heap do JS**: \`performance.memory.usedJSHeapSize\` no fim, depois de uma coleta de lixo.
- **Áudio decodificado**: soma dos \`AudioBuffer\` de \`decodeAudioData\` (amostras de 32 bits).
- **Baixado**: \`transferSize\` de tudo o que a aba baixou (o preview serve o JS com gzip).

Sem GPU os quadros saem bem mais lentos que num navegador comum: os tempos servem para comparar
antes e depois, não como valor absoluto. A medida varia de uma rodada para outra (±15% nos
quadros e no tempo até jogável); só diferenças maiores que isso contam.

${MARCA}
`;
}

async function main() {
  if (!existsSync(join(dist, 'index.html'))) {
    throw new Error(`${dist} não tem build: rode \`npm run build\` (ou use \`npm run medir\`).`);
  }
  const vite = join(raiz, 'node_modules', 'vite', 'bin', 'vite.js');
  const servidor = spawn(
    process.execPath,
    [vite, 'preview', '--outDir', dist, '--port', PORTA, '--strictPort'],
    {
      cwd: raiz,
      stdio: 'ignore',
    },
  );
  const resultados = [];
  try {
    await esperarServidor();
    const navegador = await chromium.launch({
      args: ['--enable-precise-memory-info', '--use-angle=swiftshader'],
      executablePath: process.env.PW_CHROMIUM || undefined,
    });
    try {
      for (const cena of CENAS) {
        const r = await medir(navegador, cena);
        console.log(
          `${r.nome.padEnd(22)} pronta ${r.prontaS.toFixed(1)} s · quadro ${r.medio.toFixed(0)}/` +
            `${r.p95.toFixed(0)}/${r.pior.toFixed(0)} ms · ${r.canvases} canvases · ` +
            `GPU ${r.gpuMB.toFixed(0)} MB · heap ${r.heapMB.toFixed(0)} MB · ` +
            `áudio ${r.audioMB.toFixed(0)} MB${r.faixas.length ? ` (${r.faixas.join(', ')})` : ''}` +
            ` · baixado ${r.baixadosMB.toFixed(1)} MB`,
        );
        resultados.push(r);
      }
    } finally {
      await navegador.close();
    }
  } finally {
    servidor.kill();
  }
  if (!gravar) return;

  const commit =
    opcao('--sobre') ?? execSync('git rev-parse --short HEAD', { cwd: raiz }).toString().trim();
  const data = new Date().toLocaleDateString('pt-BR');
  const secao = `## ${data} · ${rotulo} (sobre ${commit})\n\n${tabela(resultados)}\n`;
  const atual = existsSync(arquivo) ? readFileSync(arquivo, 'utf8') : cabecalho();
  const i = atual.indexOf(MARCA);
  const texto =
    i < 0
      ? `${atual.trimEnd()}\n\n${MARCA}\n\n${secao}`
      : `${atual.slice(0, i + MARCA.length)}\n\n${secao}\n${atual.slice(i + MARCA.length).trimStart()}`;
  const config = (await prettier.resolveConfig(arquivo)) ?? {};
  writeFileSync(arquivo, await prettier.format(texto, { ...config, filepath: arquivo }));
  console.log(`Gravado em docs/DESEMPENHO.md (${rotulo}).`);
}

await main();
