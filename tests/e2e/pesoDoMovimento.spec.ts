import { expect, test, type Page } from '@playwright/test';

// Passo 8 do mundo vivo (movimento com peso): o corpo vira aos poucos, passando pelas direções do
// meio, em vez de pular de uma rotação para a outra.

interface Corpo {
  passo: number;
  golpe: boolean;
  poses: number;
  angulo: number;
  guinada: number;
}

const corpo = (page: Page) => page.evaluate(() => window.__portaAPorta?.corpo) as Promise<Corpo>;

test('ao trocar de direção, o corpo vira aos poucos pelas direções do meio', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto('/?modo=treino&noite=0&zoom=3');
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  // Anda para a direita da tela um pouco, depois vira para a esquerda.
  await page.keyboard.down('d');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/screenshots/peso-direita.png' });
  await page.keyboard.up('d');
  await page.keyboard.down('a');
  const angulos = new Set<number>();
  const guinadas = new Set<number>();
  for (let i = 0; i < 12; i++) {
    const c = await corpo(page);
    angulos.add(Math.round(c.angulo));
    guinadas.add(c.guinada);
    if (i === 1) await page.screenshot({ path: 'test-results/screenshots/peso-virando.png' });
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/screenshots/peso-esquerda.png' });
  await page.keyboard.up('a');
  // A virada passa por vários ângulos e por guinadas entre as rotações.
  expect(angulos.size).toBeGreaterThanOrEqual(3);
  expect([...guinadas].some((g) => g !== 0)).toBe(true);
  expect(erros).toEqual([]);
});
