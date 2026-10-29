import { expect, test, type Page } from '@playwright/test';

// Passo 13 do mundo vivo: cada chefe luta na própria arena (docs/PLANO_MUNDO_VIVO.md, frente 2).

interface Ponto {
  x: number;
  y: number;
}
interface Ganchos {
  pronta: boolean;
  imortal: () => void;
  ferirChefe: (fracao: number) => void;
  levarJogador: (x: number, y: number) => void;
  velasDaViuva: () => (Ponto & { acesa: boolean })[];
  contar: (especie: string) => number;
}

const contar = (page: Page, especie: string) =>
  page.evaluate((e) => (window.__portaAPorta as unknown as Ganchos).contar(e), especie);

const g = (page: Page) => page.evaluate(() => window.__portaAPorta as unknown as Ganchos);

async function abrir(page: Page, url: string): Promise<string[]> {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  await page.evaluate(() => (window.__portaAPorta as unknown as Ganchos).imortal());
  return erros;
}

async function levar(page: Page, p: Ponto): Promise<void> {
  await page.evaluate(([x, y]) => (window.__portaAPorta as unknown as Ganchos).levarJogador(x, y), [
    p.x,
    p.y,
  ] as const);
  await page.waitForTimeout(1800);
}

test('Viúva: o jardim com patamar e velas; F acende a vela', async ({ page }) => {
  test.slow();
  const erros = await abrir(page, '/?semente=7&chefe=1&bairro=2&zoom=0.9');
  const velas = await page.evaluate(() =>
    (window.__portaAPorta as unknown as Ganchos).velasDaViuva(),
  );
  expect(velas).toHaveLength(4);
  await levar(page, { x: velas[0]!.x + 0.9, y: velas[0]!.y });
  await page.screenshot({ path: 'test-results/screenshots/arena-viuva.png' });
  await page.keyboard.press('f');
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => (window.__portaAPorta as unknown as Ganchos).velasDaViuva()))[0]!
          .acesa,
    )
    .toBe(true);
  // A noite cai: as velas apagam; acesa de novo, ela ilumina o escuro.
  await page.evaluate(() => (window.__portaAPorta as unknown as Ganchos).ferirChefe(0.5));
  await page.waitForTimeout(600);
  await page.keyboard.press('f');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/screenshots/arena-viuva-noite.png' });
  expect(erros).toEqual([]);
  void g;
});

test('Dono: os tijolos que caem ficam no chão como cobertura', async ({ page }) => {
  test.slow();
  const erros = await abrir(page, '/?semente=7&chefe=1&bairro=3&zoom=0.8');
  // Andar 2: a chaminé joga tijolos.
  await page.evaluate(() => (window.__portaAPorta as unknown as Ganchos).ferirChefe(0.6));
  await expect.poll(() => contar(page, 'pilha_tijolos'), { timeout: 60_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/screenshots/arena-dono.png' });
  expect(erros).toEqual([]);
});

test('Moradora: o corredor com os 4 espelhos', async ({ page }) => {
  test.slow();
  const erros = await abrir(page, '/?semente=7&moradora=1&zoom=0.8');
  expect(await contar(page, 'espelho')).toBe(4);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/screenshots/arena-moradora.png' });
  expect(erros).toEqual([]);
});
