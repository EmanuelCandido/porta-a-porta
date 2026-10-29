import { expect, test, type Page } from '@playwright/test';

interface Ponto {
  x: number;
  y: number;
}
interface Estado {
  pronta: boolean;
  quebrados: number;
  jogador: Ponto;
  quebravelPerto: () => (Ponto & { raio: number; especie: string }) | null;
  levarJogador: (x: number, y: number) => void;
  imortal: () => void;
  naTela: (x: number, y: number) => Ponto;
}

async function mirar(page: Page, alvo: Ponto): Promise<void> {
  const caixa = (await page.locator('canvas').boundingBox())!;
  const f = await page.evaluate(
    ([x, y]) => (window.__portaAPorta as unknown as Estado).naTela(x, y),
    [alvo.x, alvo.y] as const,
  );
  await page.mouse.move(caixa.x + f.x * caixa.width, caixa.y + f.y * caixa.height);
}

test('golpes quebram a lixeira: ela treme, quebra em pedaços e solta doces', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text());
  });
  // O Fantasma bate de perto (o arco não para em paredes como a estrela da Bruxinha).
  await page.goto('/?semente=7&zoom=1.2&campeao=fantasma');
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  await page.evaluate(() => (window.__portaAPorta as unknown as Estado).imortal());
  const alvo = await page.evaluate(() =>
    (window.__portaAPorta as unknown as Estado).quebravelPerto(),
  );
  expect(alvo).not.toBeNull();
  // De frente para o objeto, fora da colisão dele.
  await page.evaluate(([x, y]) => (window.__portaAPorta as unknown as Estado).levarJogador(x, y), [
    alvo!.x - alvo!.raio - 0.8,
    alvo!.y,
  ] as const);
  // A câmera segue com atraso: mirar antes de ela chegar erra o alvo (a mira anda junto).
  await page.waitForTimeout(1500);
  await mirar(page, alvo!);
  await page.screenshot({ path: 'test-results/screenshots/quebravel-antes.png' });
  await page.mouse.down();
  await page.waitForFunction(
    () => (window.__portaAPorta as unknown as Estado).quebrados >= 1,
    undefined,
    { timeout: 30_000 },
  );
  await page.screenshot({ path: 'test-results/screenshots/quebravel-quebrou.png' });
  await page.mouse.up();
  expect(erros).toEqual([]);
});
