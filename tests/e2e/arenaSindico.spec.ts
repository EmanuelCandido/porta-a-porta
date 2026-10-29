import { expect, test } from '@playwright/test';

test('arena do Síndico: pátio do condomínio, nome grande e câmera no chefe', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text());
  });
  await page.goto('/?semente=7&chefe=1&zoom=0.8');
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  await page.evaluate(() => (window.__portaAPorta as unknown as { imortal: () => void }).imortal());
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/screenshots/arena-sindico-entrada.png' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/screenshots/arena-sindico.png' });
  expect(erros).toEqual([]);
});
