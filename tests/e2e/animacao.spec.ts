import { expect, test, type Page } from '@playwright/test';
import { lancarHabilidade } from './teclas';

// E5 (corpo animado): as malhas prontas mexem braços e pernas ao andar e o braço no golpe.

interface Corpo {
  passo: number;
  golpe: boolean;
  poses: number;
}

async function abrir(page: Page, url: string): Promise<string[]> {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  return erros;
}

async function corpo(page: Page): Promise<Corpo> {
  return (await page.evaluate(() => window.__portaAPorta?.corpo)) as Corpo;
}

test('a Bruxinha balança braços e pernas ao andar e ergue o braço no golpe', async ({ page }) => {
  const erros = await abrir(page, '/?modo=treino&noite=0&zoom=3');
  expect((await corpo(page)).passo).toBe(0);

  // Segura D (WASD): ele anda e o passo passa pelos degraus dos dois lados.
  await page.keyboard.down('d');
  const passos = new Set<number>();
  let golpe = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(50);
    const c = await corpo(page);
    passos.add(c.passo);
    golpe ||= c.golpe;
    if (i === 20) await page.screenshot({ path: 'test-results/screenshots/animacao-andando.png' });
  }
  expect([...passos].some((p) => p > 0)).toBe(true);
  expect([...passos].some((p) => p < 0)).toBe(true);

  // Chegou: parada, volta à pose de sempre (o auto-ataque nos bonecos pode erguer o braço).
  await page.keyboard.up('d');
  // Parou (ou bateu num obstáculo): a posição não muda mais.
  let antes = '';
  for (let i = 0; i < 60; i++) {
    const agora = JSON.stringify(await page.evaluate(() => window.__portaAPorta?.jogador));
    if (agora === antes) break;
    antes = agora;
    await page.waitForTimeout(300);
  }
  expect((await corpo(page)).passo).toBe(0);
  if (!golpe) {
    await lancarHabilidade(page, 'Q');
    await page.waitForFunction(
      () => (window.__portaAPorta?.corpo as Corpo | undefined)?.golpe === true,
      undefined,
      { timeout: 5_000 },
    );
  }
  expect((await corpo(page)).poses).toBeGreaterThanOrEqual(4);
  expect(erros).toEqual([]);
});
