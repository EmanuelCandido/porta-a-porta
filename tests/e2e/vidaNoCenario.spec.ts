import { expect, test, type Page } from '@playwright/test';

// Passo 12 do mundo vivo (vida no cenário): fumaça nas chaminés, folhas no vento, morcegos,
// crianças fantasiadas pela rota, gatos nos muros e janelas da cidade. Tudo só desenho.

interface Vida {
  fumaca: number;
  folhas: number;
  folhasNaVista: number;
  morcegos: number;
  criancas: number;
  gatos: number;
  janelasTrocadas: number;
}

const vida = (page: Page) =>
  page.evaluate(() => (window.__portaAPorta as unknown as { vida: Vida }).vida);

test('a rua tem fumaça, folhas, morcegos, crianças e gatos', async ({ page }) => {
  test.slow();
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto('/?semente=3&zoom=1');
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  await page.evaluate(() => (window.__portaAPorta as unknown as { imortal: () => void }).imortal());
  await expect.poll(async () => (await vida(page)).folhas).toBe(14);
  // As folhas atravessam a vista (não ficam presas na margem de fora).
  await expect.poll(async () => (await vida(page)).folhasNaVista).toBeGreaterThan(3);
  await expect.poll(async () => (await vida(page)).fumaca, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect
    .poll(async () => (await vida(page)).criancas, { timeout: 30_000 })
    .toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/screenshots/vida-rua.png' });
  await expect
    .poll(async () => (await vida(page)).morcegos, { timeout: 40_000 })
    .toBeGreaterThan(0);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/screenshots/vida-morcegos.png' });
  console.log('vida', JSON.stringify(await vida(page)));
  expect(erros).toEqual([]);
});
