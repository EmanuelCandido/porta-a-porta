import { expect, test, type Page } from '@playwright/test';

interface Som {
  ligado: boolean;
  contexto: string;
  tocados: number;
}

const som = (page: Page) => page.evaluate(() => window.__portaAPorta!.som as Som);

test('o som liga no primeiro gesto, toca nos golpes e M desliga e lembra', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto('/?modo=treino&noite=0');
  await page.waitForFunction(() => window.__portaAPorta?.pronta);
  expect((await som(page)).ligado).toBe(true);

  // O navegador só libera o áudio depois de um gesto: uma tecla qualquer acorda o contexto.
  await page.keyboard.press('Shift');
  await expect.poll(async () => (await som(page)).contexto).toBe('running');

  const antes = (await som(page)).tocados;
  await page.evaluate(() => (window.__portaAPorta!.acertarCritico as () => void)());
  await expect.poll(async () => (await som(page)).tocados).toBeGreaterThan(antes);

  await page.keyboard.press('m');
  await expect.poll(async () => (await som(page)).ligado).toBe(false);
  const mudo = (await som(page)).tocados;
  await page.evaluate(() => (window.__portaAPorta!.acertarCritico as () => void)());
  await page.waitForTimeout(300);
  expect((await som(page)).tocados).toBe(mudo);

  // A escolha fica no navegador: depois de recarregar, continua sem som.
  await page.reload();
  await page.waitForFunction(() => window.__portaAPorta?.pronta);
  expect((await som(page)).ligado).toBe(false);
  await page.keyboard.press('m');
  await expect.poll(async () => (await som(page)).ligado).toBe(true);
  expect(erros).toEqual([]);
});

interface Musica {
  trilha: string | null;
  notas: number;
  intensidade: number;
  gravada: string | null;
  arquivos: number;
  falhas: number;
}

const musica = (page: Page) =>
  page.evaluate(() => (window.__portaAPorta!.som as { musica: Musica }).musica);

test('a rua toca a própria trilha gravada depois do primeiro gesto', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  // A música vem em streaming (O4.1): nada longo passa por decodeAudioData, só os efeitos curtos.
  await page.addInitScript(() => {
    const w = window as unknown as { __decodificadoMaiorS: number };
    w.__decodificadoMaiorS = 0;
    const decodificar = BaseAudioContext.prototype.decodeAudioData;
    BaseAudioContext.prototype.decodeAudioData = function (
      this: BaseAudioContext,
      ...a: Parameters<BaseAudioContext['decodeAudioData']>
    ) {
      return decodificar.apply(this, a).then((b) => {
        w.__decodificadoMaiorS = Math.max(w.__decodificadoMaiorS, b.duration);
        return b;
      });
    };
  });
  await page.goto('/?modo=treino&noite=0');
  await page.waitForFunction(() => window.__portaAPorta?.pronta);
  await page.keyboard.press('Shift');
  // A trilha da rua é gravada (CC0, public/audio): toca do arquivo, sem falhas de carga.
  await expect.poll(async () => (await musica(page)).gravada, { timeout: 30_000 }).toBe('rua');
  await expect.poll(async () => (await musica(page)).arquivos).toBeGreaterThan(100);
  expect((await musica(page)).falhas).toBe(0);
  const maiorS = await page.evaluate(
    () => (window as unknown as { __decodificadoMaiorS: number }).__decodificadoMaiorS,
  );
  expect(maiorS).toBeGreaterThan(0);
  expect(maiorS).toBeLessThan(20);
  // Com os arquivos carregados, o acerto toca o som gravado (e não o sintetizado).
  const deArquivo = () =>
    page.evaluate(() => (window.__portaAPorta!.som as { deArquivo: number }).deArquivo);
  const antes = await deArquivo();
  await page.evaluate(() => (window.__portaAPorta!.acertarCritico as () => void)());
  await expect.poll(deArquivo).toBeGreaterThan(antes);
  expect(erros).toEqual([]);
});

test('o título toca a trilha gravada (FLAC) depois do primeiro gesto', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  await page.keyboard.press('Shift');
  const musicaDoTitulo = () =>
    page.evaluate(() => (window.__portaAPorta!.musica as () => Musica)());
  await expect
    .poll(async () => (await musicaDoTitulo()).gravada, { timeout: 30_000 })
    .toBe('titulo');
  expect((await musicaDoTitulo()).falhas).toBe(0);
});
