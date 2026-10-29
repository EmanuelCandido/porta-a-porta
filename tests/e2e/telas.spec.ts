import { expect, test, type Page } from '@playwright/test';

// Tela de título, escolha da fantasia e a tela do fim da run.

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

test('o jogo abre no título; Enter escolhe a fantasia e Enter de novo começa a run', async ({
  page,
}) => {
  const erros = await abrir(page, '/');
  expect(await ler<string>(page, 'e.cena')).toBe('CenaTitulo');
  expect(await ler<string>(page, 'e.tela')).toBe('titulo');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/screenshots/titulo.png' });

  await page.keyboard.press('Enter');
  await esperar(page, "e.tela === 'campeao'");
  expect(await ler<string>(page, 'e.escolhida')).toBe('bruxinha');
  const cartas = await ler<{ id: string; livre: boolean }[]>(page, 'e.cartas');
  // Sem save, só a Bruxinha; as outras liberam pelos marcos ou no Álbum (tarefa 13).
  expect(cartas.filter((c) => c.livre).map((c) => c.id)).toEqual(['bruxinha']);
  expect(cartas.length).toBe(4);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/escolha-campeao.png' });

  await page.keyboard.press('Enter');
  await esperar(page, "e.cena === 'CenaRua' && e.modo === 'run' && e.mapa === 'rua'");
  expect(erros).toEqual([]);
});

test('Esc volta da escolha para o título; T abre a rua de treino', async ({ page }) => {
  await abrir(page, '/');
  await page.keyboard.press('Enter');
  await esperar(page, "e.tela === 'campeao'");
  await page.keyboard.press('Escape');
  await esperar(page, "e.tela === 'titulo'");
  await page.keyboard.press('t');
  await esperar(page, "e.cena === 'CenaRua' && e.modo === 'treino'");
});

test('os parâmetros da hospedagem mantêm o menu inicial e a escolha de fantasia', async ({
  page,
}) => {
  const erros = await abrir(page, '/?v=1792349132&utm_source=itch&language=pt&dev=1');
  expect(await ler<string>(page, 'e.cena')).toBe('CenaTitulo');
  expect(await ler<string>(page, 'e.tela')).toBe('titulo');
  await page.keyboard.press('Enter');
  await esperar(page, "e.tela === 'campeao'");
  await page.keyboard.press('Enter');
  await esperar(page, "e.cena === 'CenaRua' && e.modo === 'run'");
  expect(erros).toEqual([]);
});

test('no quadro do itch.io, o parâmetro de versão abre o título sem cortar o canvas', async ({
  page,
}) => {
  await page.route('**/moldura-itch', (rota) =>
    rota.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body style="margin:0"><iframe id="jogo-itch" src="/?v=1792349132" width="1280" height="720" style="border:0"></iframe></body></html>',
    }),
  );
  await page.goto('/moldura-itch');
  const quadro = page.frames().find((f) => f.url().includes('?v='));
  expect(quadro).toBeDefined();
  await quadro!.waitForFunction(() => window.__portaAPorta?.pronta === true);
  expect(await quadro!.evaluate(() => window.__portaAPorta?.cena)).toBe('CenaTitulo');
  const canvas = quadro!.locator('canvas');
  const limites = await canvas.boundingBox();
  expect(limites!.width).toBeCloseTo(1280, 0);
  expect(limites!.height).toBeCloseTo(720, 0);
  await quadro!.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/screenshots/titulo-itch.png' });
});

test('na derrota, a tela do fim mostra o que faltou e Enter começa outra run', async ({ page }) => {
  const erros = await abrir(page, '/?semente=3');
  await page.evaluate(() =>
    (window.__portaAPorta as unknown as { derrotar: () => void }).derrotar(),
  );
  await esperar(page, 'e.fimDaRun && e.fimDaRun.venceu === false');
  expect(await ler<string>(page, 'e.fimDaRun.faltou')).toBe('Faltou derrubar 2 Postes Corrompidos');
  await esperar(page, 'e.fimDaRun.botoes === true');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/screenshots/fim-da-run.png' });

  await page.keyboard.press('Enter');
  await esperar(page, '!e.fimDaRun && e.mapa === "rua" && e.janela === false');
  expect(await ler<number>(page, 'e.coragem')).toBeGreaterThan(0);
  expect(erros).toEqual([]);
});
