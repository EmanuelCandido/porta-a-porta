// Mede o caminho real menu → run e reinícios na mesma aba, desde o primeiro quadro.
// --software usa SwiftShader apenas para comparação de software; o padrão usa a GPU disponível.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opcao = (nome, padrao) => (args.includes(nome) ? args[args.indexOf(nome) + 1] : padrao);
const pasta = resolve(opcao('--dist', 'dist'));
const saida = resolve(opcao('--saida', 'test-results/desempenho/gameplay.json'));
const runs = Number(opcao('--runs', '3'));
const segundos = Number(opcao('--segundos', '30'));
const qualidade = opcao('--qualidade', 'alta');
const variarSemente = args.includes('--variar-semente');
const software = args.includes('--software');
const base = 'http://localhost:4196';
const servidor = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--outDir', pasta, '--port', '4196', '--strictPort'],
  { stdio: 'pipe' },
);
let erroServidor = '';
servidor.stderr.on('data', (b) => {
  erroServidor += b;
});
let navegador;

try {
  let pronto = false;
  for (let i = 0; i < 100; i++) {
    if (servidor.exitCode !== null) throw new Error(erroServidor);
    try {
      pronto = (await fetch(base)).ok;
    } catch {
      /* servidor subindo */
    }
    if (pronto) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!pronto) throw new Error(`Servidor indisponível: ${erroServidor}`);
  navegador = await chromium.launch({
    args: ['--enable-precise-memory-info', ...(software ? ['--use-angle=swiftshader'] : [])],
  });
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 720 } });
  const erros = [];
  pagina.on('pageerror', (e) => erros.push(e.message));
  await pagina.addInitScript(
    ({ qualidade }) => {
      localStorage.setItem('porta-a-porta:qualidade', qualidade);
      const criar = Document.prototype.createElement;
      let canvases = 0;
      Document.prototype.createElement = function (nome, ...resto) {
        if (nome === 'canvas') canvases++;
        return criar.call(this, nome, ...resto);
      };
      window.__canvasesMedidos = () => canvases;
      window.__iniciarMedicao = () => {
        const inicio = performance.now();
        const estadoAnterior = window.__portaAPorta;
        const m = { inicio, jogavel: null, quadros: [] };
        window.__amostraGameplay = m;
        let antes = inicio;
        const quadro = (agora) => {
          if (window.__amostraGameplay !== m) return;
          const estado = window.__portaAPorta;
          if (
            m.jogavel === null &&
            estado !== estadoAnterior &&
            estado?.cena === 'CenaRua' &&
            estado.pronta &&
            !estado.fimDaRun
          ) {
            m.jogavel = performance.now();
            antes = agora;
            requestAnimationFrame(quadro);
            return;
          }
          if (m.jogavel !== null) m.quadros.push([performance.now() - m.jogavel, agora - antes]);
          antes = agora;
          requestAnimationFrame(quadro);
        };
        requestAnimationFrame(quadro);
      };
    },
    { qualidade },
  );
  await pagina.goto(base);
  await pagina.waitForFunction(
    () => window.__portaAPorta?.cena === 'CenaTitulo' && window.__portaAPorta.pronta,
    null,
    { timeout: 180000 },
  );
  await pagina.keyboard.press(variarSemente ? 'Enter' : 'KeyN');
  await pagina.waitForFunction(() => window.__portaAPorta?.tela === 'campeao');
  const resultados = [];
  for (let i = 0; i < runs; i++) {
    await pagina.evaluate(() => window.__iniciarMedicao());
    await pagina.keyboard.press('Enter');
    await pagina.waitForFunction(
      () =>
        window.__portaAPorta?.cena === 'CenaRua' &&
        window.__portaAPorta.pronta &&
        !window.__portaAPorta.fimDaRun,
      null,
      { timeout: 180000 },
    );
    await pagina.evaluate(() => window.__portaAPorta.imortal?.(true));
    const esperar = async (s) => {
      await pagina.waitForFunction(
        (s) =>
          window.__amostraGameplay.jogavel !== null &&
          performance.now() - window.__amostraGameplay.jogavel >= s * 1000,
        s,
        { timeout: 180000 },
      );
    };
    if (segundos >= 15) {
      await esperar(5);
      await pagina.keyboard.down('KeyD');
      await pagina.waitForTimeout(1500);
      await pagina.keyboard.up('KeyD');
      await esperar(10);
      await pagina.evaluate(() => window.__portaAPorta.cercar?.(30, 'pestinha_lencol'));
      await pagina.mouse.move(740, 350);
      await pagina.mouse.down();
      await pagina.keyboard.press('KeyQ');
      await esperar(segundos);
      await pagina.mouse.up();
    } else await esperar(segundos);
    const medido = await pagina.evaluate(() => {
      const m = window.__amostraGameplay;
      window.__amostraGameplay = null;
      const estatistica = (amostras) => {
        const a = amostras.map((q) => q[1]).sort((a, b) => a - b);
        return a.length
          ? {
              quadros: a.length,
              mediaMs: a.reduce((s, n) => s + n, 0) / a.length,
              p95Ms: a[Math.ceil(a.length * 0.95) - 1],
              p99Ms: a[Math.ceil(a.length * 0.99) - 1],
              piorMs: a.at(-1),
              acima50ms: a.filter((n) => n > 50).length,
              acima100ms: a.filter((n) => n > 100).length,
            }
          : null;
      };
      const canvas = document.querySelector('canvas');
      const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        ateJogavelMs: m.jogavel - m.inicio,
        inicio0a5: estatistica(m.quadros.filter((q) => q[0] < 5000)),
        trecho5a15: estatistica(m.quadros.filter((q) => q[0] >= 5000 && q[0] < 15000)),
        trecho15a30: estatistica(m.quadros.filter((q) => q[0] >= 15000 && q[0] < 30000)),
        total: estatistica(m.quadros),
        canvasesCriados: window.__canvasesMedidos(),
        renderizador: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
        relatorioInterno: window.__desempenho?.relatorio() ?? null,
      };
    });
    const cdp = await pagina.context().newCDPSession(pagina);
    await cdp.send('HeapProfiler.collectGarbage');
    medido.heapAposColetaMB = await pagina.evaluate(
      () => performance.memory?.usedJSHeapSize / 1048576,
    );
    await cdp.detach();
    resultados.push(medido);
    mkdirSync(dirname(saida), { recursive: true });
    writeFileSync(
      saida,
      JSON.stringify({ software, qualidade, segundos, variarSemente, resultados, erros }, null, 2),
    );
    console.log(
      `Run ${i + 1}: entrada ${(medido.ateJogavelMs / 1000).toFixed(2)}s; quadro ${medido.total.mediaMs.toFixed(1)} / p95 ${medido.total.p95Ms.toFixed(1)} / pior ${medido.total.piorMs.toFixed(1)} ms; heap ${medido.heapAposColetaMB.toFixed(1)} MB`,
    );
    if (i + 1 === runs) {
      mkdirSync('test-results/screenshots', { recursive: true });
      await pagina.screenshot({ path: `test-results/screenshots/gameplay-${qualidade}.png` });
    }
    if (i + 1 < runs) {
      await pagina.evaluate(() => window.__portaAPorta.derrotar());
      await pagina.waitForFunction(() => window.__portaAPorta?.fimDaRun?.botoes, null, {
        timeout: 180000,
      });
    }
  }
  if (erros.length) throw new Error(erros.join('\n'));
} finally {
  await navegador?.close();
  servidor.kill();
}
