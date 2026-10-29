import { expect, test, type Page } from '@playwright/test';

// Tarefa 14, parte 2: a primeira run tem dicas curtas, uma porta simples e dá para desligar.

const CHAVE = 'porta-a-porta:save';

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
  return erros;
}

async function ler<T>(page: Page, expr: string): Promise<T> {
  return (await page.evaluate(
    `(() => { const e = window.__portaAPorta; return ${expr}; })()`,
  )) as T;
}

async function esperar(page: Page, condicao: string, timeout = 90_000): Promise<void> {
  await page.waitForFunction(
    `(() => { const e = window.__portaAPorta; return ${condicao}; })()`,
    undefined,
    { timeout },
  );
}

test('a primeira run mostra a dica de andar, que some ao andar; a run seguinte não tem dicas', async ({
  page,
}) => {
  const erros = await abrir(page, '/');
  await page.keyboard.press('Enter');
  await esperar(page, "e.tela === 'campeao'");
  await page.keyboard.press('Enter');
  await esperar(page, "e.cena === 'CenaRua' && e.mapa === 'rua'");
  await esperar(page, "e.dica && e.dica.passo === 'andar'");
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/dica-primeira-run.png' });

  // Segura D (WASD): ele anda e a dica de andar sai.
  const inicio = await ler<Ponto>(page, 'e.jogador');
  await page.keyboard.down('d');
  await esperar(page, "e.dica.passo !== 'andar'");
  await page.keyboard.up('d');
  const depois = await ler<Ponto>(page, 'e.jogador');
  expect(Math.hypot(depois.x - inicio.x, depois.y - inicio.y)).toBeGreaterThan(1);

  // Acaba a run e começa outra: o save já tem 1 run, então sem dicas.
  await page.evaluate(() =>
    (window.__portaAPorta as unknown as { derrotar: () => void }).derrotar(),
  );
  await esperar(page, 'e.fimDaRun && e.fimDaRun.botoes === true');
  await page.keyboard.press('Enter');
  await esperar(page, '!e.fimDaRun && e.mapa === "rua" && e.janela === false');
  await page.waitForTimeout(4000);
  expect(await ler<string | null>(page, 'e.dica.passo')).toBeNull();
  expect(erros).toEqual([]);
});

test('H no título desliga as dicas, e a escolha fica no save', async ({ page }) => {
  const erros = await abrir(page, '/');
  expect(await ler<boolean>(page, 'e.dicas')).toBe(true);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/screenshots/titulo-dicas.png' });
  await page.keyboard.press('h');
  await esperar(page, 'e.dicas === false');
  const save = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), CHAVE);
  expect(save.dicas).toBe(false);
  await page.reload();
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  expect(await ler<boolean>(page, 'e.dicas')).toBe(false);
  // Com as dicas desligadas, a primeira run começa sem elas.
  await page.keyboard.press('Enter');
  await esperar(page, "e.tela === 'campeao'");
  await page.keyboard.press('Enter');
  await esperar(page, "e.cena === 'CenaRua' && e.mapa === 'rua'");
  await page.waitForTimeout(4000);
  expect(await ler<string | null>(page, 'e.dica.passo')).toBeNull();
  expect(erros).toEqual([]);
});

test('a primeira porta da primeira run tem 2 tratos e explica as marcas', async ({ page }) => {
  const erros = await abrir(page, '/?semente=3&porta=1&primeira=1');
  const porta = await ler<{ casas: Ponto[]; ofertas: { casa: number }[] }>(page, 'e.porta');
  expect(porta.ofertas).toHaveLength(2);
  const casa = porta.casas[porta.ofertas[0]!.casa]!;
  await page.evaluate(
    ([x, y]) =>
      (
        window.__portaAPorta as unknown as { levarJogador: (x: number, y: number) => void }
      ).levarJogador(x, y),
    [casa.x, casa.y] as const,
  );
  await page.keyboard.press('f');
  await esperar(page, 'e.janela === true');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/primeira-porta.png' });
  expect(erros).toEqual([]);
});
