import { expect, test, type Page } from '@playwright/test';
import { teclaRolar } from './teclas';

interface Ponto {
  x: number;
  y: number;
}

async function abrir(page: Page, url = '/?modo=treino'): Promise<string[]> {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  return erros;
}

const posicao = (page: Page) =>
  page.evaluate(() => window.__portaAPorta?.jogador as { x: number; y: number });

/** Segura as teclas até o jogador andar `minimo` tiles (o navegador de teste pode ser lento). */
async function segurar(page: Page, teclas: string[], minimo: number): Promise<[Ponto, Ponto]> {
  const antes = await posicao(page);
  for (const t of teclas) await page.keyboard.down(t);
  await page.waitForFunction(
    ([a, m]) => {
      const p = window.__portaAPorta?.jogador as Ponto;
      return Math.hypot(p.x - a.x, p.y - a.y) >= m;
    },
    [antes, minimo] as const,
    { timeout: 90_000 },
  );
  for (const t of teclas) await page.keyboard.up(t);
  return [antes, await posicao(page)];
}

test('seta para a direita anda para a direita da tela (x sobe, y desce no mundo)', async ({
  page,
}) => {
  const erros = await abrir(page);
  const [antes, depois] = await segurar(page, ['ArrowRight'], 1);
  expect(depois.x - antes.x).toBeGreaterThan(0.5);
  expect(antes.y - depois.y).toBeGreaterThan(0.5);
  expect(Math.abs(depois.x - antes.x - (antes.y - depois.y))).toBeLessThan(0.05);
  expect(erros).toEqual([]);
});

test('seta para cima anda para cima da tela (x e y descem juntos)', async ({ page }) => {
  await abrir(page);
  const [antes, depois] = await segurar(page, ['ArrowUp'], 1);
  expect(antes.x - depois.x).toBeGreaterThan(0.5);
  expect(antes.y - depois.y).toBeGreaterThan(0.5);
  expect(Math.abs(antes.x - depois.x - (antes.y - depois.y))).toBeLessThan(0.05);
});

test('as casas bloqueiam o caminho', async ({ page }) => {
  await abrir(page);
  // Esquerda e cima juntas levam para −x no mundo, contra a fileira oeste.
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('ArrowUp');
  // Espera o jogador parar na parede: a posição não muda entre duas leituras seguidas.
  await page.waitForFunction(
    () => {
      const e = window.__portaAPorta as { jogador: Ponto; ultima?: Ponto } | undefined;
      if (!e) return false;
      const parado =
        e.ultima && Math.hypot(e.jogador.x - e.ultima.x, e.jogador.y - e.ultima.y) < 1e-6;
      e.ultima = { ...e.jogador };
      return parado && e.jogador.x < 9;
    },
    undefined,
    { timeout: 120_000, polling: 1_000 },
  );
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowUp');
  const p = await posicao(page);
  expect(p.x).toBeGreaterThan(7.5);
  await page.screenshot({ path: 'test-results/screenshots/jogo-parede.png' });
});

test('retrato do jogador no meio da rua (zoom 1,2)', async ({ page }) => {
  const erros = await abrir(page, '/?modo=treino&zoom=1.2');
  await segurar(page, ['ArrowUp'], 4);
  // Dá tempo de a câmera alcançar o jogador antes da foto.
  await page.waitForTimeout(3_000);
  await page.screenshot({ path: 'test-results/screenshots/jogo-zoom.png' });
  expect(erros).toEqual([]);
});

test('WASD anda como as setas (D vai para a direita da tela)', async ({ page }) => {
  await abrir(page);
  const [antes, depois] = await segurar(page, ['d'], 1);
  expect(depois.x - antes.x).toBeGreaterThan(0.5);
  expect(antes.y - depois.y).toBeGreaterThan(0.5);
});

test('Espaço rola na direção do movimento, mais rápido que andar', async ({ page }) => {
  const erros = await abrir(page);
  await page.keyboard.down('d');
  await page.waitForTimeout(200);
  const antes = await posicao(page);
  await page.keyboard.press(teclaRolar());
  await expect
    .poll(async () => {
      const p = await posicao(page);
      return Math.hypot(p.x - antes.x, p.y - antes.y);
    })
    .toBeGreaterThan(2);
  await page.keyboard.up('d');
  await page.screenshot({ path: 'test-results/screenshots/jogo-rolamento.png' });
  expect(erros).toEqual([]);
});
