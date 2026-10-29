import { expect, test, type Page } from '@playwright/test';

interface Ponto {
  x: number;
  y: number;
}
interface Estado {
  imortal: () => void;
  cercar: (n: number, especie?: string, encanto?: string) => number;
  levarJogador: (x: number, y: number) => void;
  jogador: Ponto;
}

async function abrir(page: Page): Promise<string[]> {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text());
  });
  await page.goto('/?semente=7&zoom=1.2');
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  await page.evaluate(() => (window.__portaAPorta as unknown as Estado).imortal());
  return erros;
}

test('morceguinhos voam em volta e mergulham com aviso no chão', async ({ page }) => {
  const erros = await abrir(page);
  await page.evaluate(() => (window.__portaAPorta as unknown as Estado).cercar(5, 'morceguinho'));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/screenshots/especie-morceguinhos.png' });
  expect(erros).toEqual([]);
});

test('espantalhos fincados e a Pestinha de Vela iluminando o grupo', async ({ page }) => {
  const erros = await abrir(page);
  await page.evaluate(() => {
    const e = window.__portaAPorta as unknown as Estado;
    e.cercar(2, 'espantalho');
    e.cercar(3, 'pestinha_lencol');
    e.cercar(1, 'pestinha_vela');
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/screenshots/especie-espantalho-vela.png' });
  expect(erros).toEqual([]);
});

test('inimigos encantados mostram o nome e a aura', async ({ page }) => {
  const erros = await abrir(page);
  await page.evaluate(() => {
    const e = window.__portaAPorta as unknown as Estado;
    e.cercar(1, 'pestinha_lencol', 'apressado');
    e.cercar(1, 'pestinha_lencol', 'encouracado');
    e.cercar(1, 'arremessador', 'explosivo');
    e.cercar(1, 'pestinha_lencol', 'chamador');
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/screenshots/especie-encantados.png' });
  expect(erros).toEqual([]);
});

test('o Saco-Surpresa parece uma lixeira e acorda de perto', async ({ page }) => {
  const erros = await abrir(page);
  await page.evaluate(() => (window.__portaAPorta as unknown as Estado).cercar(1, 'saco_surpresa'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/screenshots/especie-saco-disfarce.png' });
  const j = await page.evaluate(() => (window.__portaAPorta as unknown as Estado).jogador);
  // O saco nasceu a 3,5 tiles (ângulo 0): o jogador chega perto.
  await page.evaluate(([x, y]) => (window.__portaAPorta as unknown as Estado).levarJogador(x, y), [
    j.x + 2,
    j.y,
  ] as const);
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'test-results/screenshots/especie-saco-acordou.png' });
  expect(erros).toEqual([]);
});
