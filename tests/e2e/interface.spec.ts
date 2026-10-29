import { expect, test, type Page } from '@playwright/test';

// Screenshots da interface nova (docs/DESIGN.md, seção 7) para conferir a olho.

async function abrir(page: Page, url: string): Promise<string[]> {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  await page.waitForTimeout(900);
  return erros;
}

test('interface em jogo: retrato, habilidades, itens, minimapa e rastreador', async ({ page }) => {
  const erros = await abrir(page, '/?avancar=20');
  await page.screenshot({ path: 'test-results/screenshots/interface-rua.png' });
  expect(erros).toEqual([]);
});

test('Tab segurado abre o mapa grande', async ({ page }) => {
  await abrir(page, '/?avancar=20');
  await page.keyboard.down('Tab');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/interface-mapa.png' });
  await page.keyboard.up('Tab');
});

test('interface na rua do chefe: barra do chefe no topo', async ({ page }) => {
  const erros = await abrir(page, '/?semente=3&chefe=1&avancar=6');
  await page.screenshot({ path: 'test-results/screenshots/interface-chefe.png' });
  expect(erros).toEqual([]);
});

test('interface no Porta a Porta: sem ondas nem Postes', async ({ page }) => {
  const erros = await abrir(page, '/?semente=3&porta=1&avancar=3');
  await page.screenshot({ path: 'test-results/screenshots/interface-porta.png' });
  expect(erros).toEqual([]);
});

test('dica da habilidade sob o mouse', async ({ page }) => {
  await abrir(page, '/?avancar=5');
  const caixa = (await page.locator('canvas').boundingBox())!;
  // Botão W: o segundo da placa de habilidades, embaixo ao centro.
  const sx = caixa.width / 1280;
  const sy = caixa.height / 720;
  await page.mouse.move(caixa.x + (1280 / 2 - 7) * sx, caixa.y + (720 - 16 - 106 + 22 + 30) * sy);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/interface-dica.png' });
});
