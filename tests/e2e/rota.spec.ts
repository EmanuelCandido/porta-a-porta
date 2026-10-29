import { expect, test, type Page } from '@playwright/test';

// A rota linear (docs/DESIGN.md, seção 9) e a exploração (seção 10): screenshots para conferir a
// olho e o caminho de religar um poste e subir no mirante na tela de verdade.

interface Ponto {
  x: number;
  y: number;
}

async function abrir(page: Page, url: string): Promise<string[]> {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  await page.waitForTimeout(600);
  return erros;
}

async function ler<T>(page: Page, expr: string): Promise<T> {
  return (await page.evaluate(
    `(() => { const e = window.__portaAPorta; return ${expr}; })()`,
  )) as T;
}

async function levar(page: Page, p: Ponto): Promise<void> {
  await page.evaluate(
    ([x, y]) =>
      (
        window.__portaAPorta as unknown as { levarJogador: (x: number, y: number) => void }
      ).levarJogador(x, y),
    [p.x, p.y] as const,
  );
}

test('visão geral da rota: caminho serpenteando pela cidade, com salas e becos', async ({
  page,
}) => {
  const erros = await abrir(page, '/?cena=previa&rua=gerada&semente=1&bairro=0&visao=geral');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/screenshots/rota-geral.png' });
  expect(erros).toEqual([]);
});

test('limites discretos: a entrada interditada e um largo da rota', async ({ page }) => {
  await abrir(page, '/?cena=previa&rua=gerada&semente=3&bairro=1&foco=entrada&zoom=1');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/screenshots/rota-entrada.png' });
});

test('religar um poste e subir no mirante revelam o mapa da rota', async ({ page }) => {
  const erros = await abrir(page, '/?semente=3');
  await page.evaluate(() => (window.__portaAPorta as unknown as { imortal: () => void }).imortal());
  const ex = await ler<{
    fracao: number;
    postes: (Ponto & { aceso: boolean })[];
    mirante: (Ponto & { usado: boolean }) | null;
  }>(page, 'e.exploracao');
  expect(ex.postes.length).toBeGreaterThan(0);
  expect(ex.mirante).not.toBeNull();
  // Religar: F perto do poste e ficar parado.
  await levar(page, ex.postes[0]!);
  await page.waitForTimeout(150);
  await page.keyboard.press('f');
  await page.waitForFunction(
    () =>
      (window.__portaAPorta?.['exploracao'] as { postes: { aceso: boolean }[] }).postes[0]!.aceso,
    undefined,
    { timeout: 40_000 },
  );
  await page.screenshot({ path: 'test-results/screenshots/rota-poste.png' });
  // Mirante: depois de subir, boa parte do mapa aparece.
  await levar(page, ex.mirante!);
  await page.waitForTimeout(150);
  await page.keyboard.press('f');
  // Folgado: sem GPU, a vista do mirante chega a rodar a 3 ticks/s (o canal leva 120 ticks).
  await page.waitForFunction(
    () => (window.__portaAPorta?.['exploracao'] as { mirante: { usado: boolean } }).mirante.usado,
    undefined,
    { timeout: 100_000 },
  );
  const depois = await ler<number>(page, 'e.exploracao.fracao');
  expect(depois).toBeGreaterThan(ex.fracao + 0.1);
  await page.keyboard.down('Tab');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/screenshots/rota-mapa.png' });
  await page.keyboard.up('Tab');
  expect(erros).toEqual([]);
});

test('o rastreador diz em que rua o jogador está', async ({ page }) => {
  await abrir(page, '/?semente=3');
  const rota = await ler<Ponto[]>(page, 'e.rota');
  await levar(page, rota[3]!);
  await page.waitForTimeout(400);
  const lugar = await ler<string | null>(page, 'e.lugar');
  expect(lugar).toBeTruthy();
  await page.screenshot({ path: 'test-results/screenshots/rota-meio.png' });
});
