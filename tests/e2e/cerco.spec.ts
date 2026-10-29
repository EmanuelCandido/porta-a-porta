import { expect, test } from '@playwright/test';

interface Estado {
  imortal: () => void;
  cercar: (n: number) => number;
}

test('pestinhas em cerco: 3 atacam e as outras rodeiam em volta', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text());
  });
  await page.goto('/?semente=7&zoom=1.2');
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  const n = await page.evaluate(() => {
    const e = window.__portaAPorta as unknown as Estado;
    e.imortal();
    return e.cercar(8);
  });
  expect(n).toBe(8);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/screenshots/cerco.png' });
  expect(erros).toEqual([]);
});
