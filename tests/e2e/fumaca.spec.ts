import { expect, test } from '@playwright/test';

test('o jogo abre sem erros no console', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text());
  });

  await page.goto('/');
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/screenshots/abertura.png' });

  expect(erros).toEqual([]);
});
