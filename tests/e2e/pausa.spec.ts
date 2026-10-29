import { expect, test, type Page } from '@playwright/test';

// Passo 10 do mundo vivo (interface, parte 2): Esc ou P pausam a rua; o menu tem as telas de
// consulta (tratos e preços, Susto e Frenesi, controles) e funciona com mouse e teclado.

interface Estado {
  pronta: boolean;
  janela: boolean;
  pausa: string | null;
  tick: number;
}

const est = (page: Page) => page.evaluate(() => window.__portaAPorta as unknown as Estado);

test('Esc pausa a rua; o menu troca de consulta e Esc continua', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto('/?semente=3');
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => (window.__portaAPorta as unknown as Estado).pausa === 'tratos');
  // A rua para enquanto o menu está aberto.
  const tick = (await est(page)).tick;
  await page.waitForTimeout(400);
  expect((await est(page)).tick).toBe(tick);
  await page.screenshot({ path: 'test-results/screenshots/pausa-tratos.png' });
  // Teclado: desce até "Susto e Frenesi" e confirma.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window.__portaAPorta as unknown as Estado).pausa === 'susto');
  await page.screenshot({ path: 'test-results/screenshots/pausa-susto.png' });
  // Mouse: "Controles" é o 4º botão da coluna da esquerda.
  const c = (await page.locator('canvas').boundingBox())!;
  const k = c.height / 720;
  const largura = c.width / k;
  const x = (largura - 860) / 2 + 28 + 120;
  const y = (720 - 500) / 2 + 80 + 3 * 50 + 20;
  await page.mouse.click(c.x + x * k, c.y + y * k);
  await page.waitForFunction(
    () => (window.__portaAPorta as unknown as Estado).pausa === 'controles',
  );
  await page.screenshot({ path: 'test-results/screenshots/pausa-controles.png' });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => (window.__portaAPorta as unknown as Estado).pausa === null);
  await page.waitForTimeout(300);
  // Continua sem reabrir, e a rua anda de novo.
  expect((await est(page)).janela).toBe(false);
  const depois = (await est(page)).tick;
  await page.waitForTimeout(400);
  expect((await est(page)).tick).toBeGreaterThan(depois);
  expect(erros).toEqual([]);
});
