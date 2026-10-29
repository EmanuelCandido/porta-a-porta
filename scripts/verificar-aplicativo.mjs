import { _electron, expect } from '@playwright/test';
import { stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const linux = process.platform === 'linux';
const plataforma = linux ? 'linux' : 'windows';
const pasta = linux ? '/opt/porta-a-porta' : join(raiz, 'entregas/Porta a Porta-win32-x64');
const perfil = join(raiz, 'test-results', `perfil-${plataforma}-${Date.now()}`);
expect(await stat(perfil).catch(() => null)).toBeNull();
const ambiente = { ...process.env, PORTA_A_PORTA_TESTE: '1', PORTA_A_PORTA_PERFIL: perfil };
delete ambiente.ELECTRON_RUN_AS_NODE;
const falhas = [];
const externas = [];
let aplicativo;

async function abrir() {
  aplicativo = await _electron.launch({
    executablePath: join(pasta, linux ? 'porta-a-porta' : 'Porta a Porta.exe'),
    // O contêiner de QA não fornece os namespaces do host ao sandbox do Chromium.
    // Esta opção fica apenas no teste, nunca no executável, no atalho ou no instalador.
    args: process.env.PORTA_A_PORTA_TESTE_CONTAINER === '1' ? ['--no-sandbox'] : [],
    cwd: pasta,
    env: ambiente,
    timeout: 90_000,
  });
  const pagina = await aplicativo.firstWindow();
  pagina.on('pageerror', (erro) => falhas.push(erro.message));
  pagina.on('response', (resposta) => {
    if (resposta.status() >= 400) falhas.push(`${resposta.status()}: ${resposta.url()}`);
  });
  pagina.on('request', (pedido) => {
    if (/^https?:/.test(pedido.url())) externas.push(pedido.url());
  });
  await pagina.waitForFunction(() => window.__portaAPorta?.pronta, undefined, { timeout: 90_000 });
  await expect(pagina).toHaveTitle('Porta a Porta — Uma noite de Halloween');
  expect(await pagina.evaluate(() => typeof window.require)).toBe('undefined');
  await pagina.waitForTimeout(1500);
  await pagina.screenshot({
    path: join(raiz, `test-results/screenshots/${plataforma}-titulo.png`),
  });
  return pagina;
}

async function comecar(pagina) {
  await pagina.keyboard.press('Enter');
  await pagina.waitForFunction(() => window.__portaAPorta?.tela === 'campeao');
  await pagina.keyboard.press('Enter');
  await pagina.waitForFunction(
    () => window.__portaAPorta?.cena === 'CenaRua' && window.__portaAPorta.pronta,
    undefined,
    {
      timeout: 90_000,
    },
  );
  expect(await pagina.evaluate(() => window.__portaAPorta.preparacaoInicial.segundoPlano)).toBe(
    true,
  );
}

async function apertarTelaCheia() {
  // O teclado do Playwright vai direto ao Chromium e não passa por before-input-event.
  // sendInputEvent usa o caminho do teclado nativo que aciona o atalho do aplicativo.
  await aplicativo.evaluate(({ BrowserWindow }) => {
    const janela = BrowserWindow.getAllWindows()[0];
    janela.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F11' });
    janela.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'F11' });
  });
}

try {
  const pagina = await abrir();
  expect((await stat(perfil)).isDirectory()).toBe(true);
  await pagina.keyboard.press('o');
  await pagina.waitForFunction(() => window.__portaAPorta?.opcoesDesempenho === true);
  await pagina.keyboard.press('Enter');
  await pagina.keyboard.press('Escape');
  // O título só volta a ouvir o teclado no quadro seguinte ao Esc.
  await pagina.waitForFunction(() => window.__portaAPorta?.opcoesDesempenho === false);
  await comecar(pagina);
  expect(await pagina.evaluate(() => window.__desempenho.relatorio().ruas.at(-1).qualidade)).toBe(
    'leve',
  );
  await expect
    .poll(() => pagina.evaluate(() => window.__portaAPorta.som.musica.gravada), { timeout: 30_000 })
    .toBe('rua');
  await expect
    .poll(() => pagina.evaluate(() => window.__portaAPorta.som.musica.arquivos), {
      timeout: 30_000,
    })
    .toBeGreaterThan(100);
  expect(await pagina.evaluate(() => window.__portaAPorta.som.musica.falhas)).toBe(0);
  await pagina.keyboard.press('d', { delay: 400 });
  await apertarTelaCheia();
  await expect
    .poll(() =>
      aplicativo.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()),
    )
    .toBe(true);
  await apertarTelaCheia();
  await expect
    .poll(() =>
      aplicativo.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()),
    )
    .toBe(false);
  await expect
    .poll(() =>
      pagina.evaluate(() => {
        const tela = document.querySelector('canvas').getBoundingClientRect();
        return (
          Math.abs(tela.width - window.innerWidth) < 2 &&
          Math.abs(tela.height - window.innerHeight) < 2
        );
      }),
    )
    .toBe(true);
  await pagina.screenshot({ path: join(raiz, `test-results/screenshots/${plataforma}-rua.png`) });
  await pagina.keyboard.press('m');
  await expect.poll(() => pagina.evaluate(() => window.__portaAPorta.som.ligado)).toBe(false);
  await aplicativo.close();
  aplicativo = undefined;

  const reaberta = await abrir();
  await comecar(reaberta);
  expect(await reaberta.evaluate(() => window.__desempenho.relatorio().ruas.at(-1).qualidade)).toBe(
    'leve',
  );
  expect(await reaberta.evaluate(() => window.__portaAPorta.som.ligado)).toBe(false);
  expect(falhas).toEqual([]);
  expect(externas).toEqual([]);
  console.log(
    `${plataforma} verificado: executável, título, partida, áudio, tela cheia e preferência persistente, sem acesso à internet nem Node no jogo.`,
  );
} finally {
  if (aplicativo) await aplicativo.close();
}
