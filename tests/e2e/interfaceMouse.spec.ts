import { expect, test, type Page } from '@playwright/test';

// Passo 10 do mundo vivo (interface profissional): o jogo ocupa a janela inteira, sem bordas, e
// dá para jogar só com o mouse do título até a rua; os avisos vão para uma fila no canto.

interface Estado {
  cena: string;
  pronta: boolean;
  tela?: string;
  modoEscolha?: string;
  avisos?: string[];
  imortal?: () => void;
  derrubarPostes?: () => void;
}

const est = (page: Page) => page.evaluate(() => window.__portaAPorta as unknown as Estado);

/** Clica no ponto (em px da tela lógica de 720 de altura) convertido para a janela. */
async function clicar(page: Page, x: number, y: number): Promise<void> {
  const c = (await page.locator('canvas').boundingBox())!;
  const k = c.height / 720;
  await page.mouse.click(c.x + x * k, c.y + y * k);
}

test('janela larga: o canvas ocupa tudo, sem bordas', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 720 });
  await page.goto('/');
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  const c = (await page.locator('canvas').boundingBox())!;
  expect(Math.round(c.x)).toBe(0);
  expect(Math.round(c.width)).toBe(1600);
  expect(Math.round(c.height)).toBe(720);
  await page.screenshot({ path: 'test-results/screenshots/interface-titulo-largo.png' });
});

test('só com o mouse: título → Noite curta → fantasia → começar → rua', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  const c = (await page.locator('canvas').boundingBox())!;
  const largura = (c.width / c.height) * 720;
  // A Noite curta é o primeiro item do menu (a tela publica onde cada item está).
  const item = await page.evaluate(
    () =>
      (
        window.__portaAPorta as unknown as {
          menu: Record<string, { x: number; y: number; w: number; h: number }>;
        }
      ).menu['curta']!,
  );
  await page.waitForTimeout(1500);
  await clicar(page, item.x + 60, item.y + item.h / 2);
  await page.waitForFunction(() => (window.__portaAPorta as unknown as Estado).tela === 'campeao');
  expect((await est(page)).modoEscolha).toBe('curta');
  await page.screenshot({ path: 'test-results/screenshots/interface-escolha.png' });
  // "Enter · Começar" embaixo, à esquerda do meio.
  await clicar(page, largura / 2 - 110, 720 - 70 + 20);
  await page.waitForFunction(() => window.__portaAPorta?.cena === 'CenaRua', undefined, {
    timeout: 60_000,
  });
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/screenshots/interface-rua.png' });
  expect(erros).toEqual([]);
});

test('os avisos vão para a fila do canto (e somem sozinhos)', async ({ page }) => {
  await page.goto('/?semente=3');
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  await page.evaluate(() => {
    const e = window.__portaAPorta as unknown as Estado;
    e.imortal!();
    e.derrubarPostes!();
  });
  await page.waitForFunction(
    () => ((window.__portaAPorta as unknown as Estado).avisos ?? []).length > 0,
  );
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/interface-avisos.png' });
  await page.waitForFunction(
    () => ((window.__portaAPorta as unknown as Estado).avisos ?? []).length === 0,
    undefined,
    { timeout: 20_000 },
  );
});
