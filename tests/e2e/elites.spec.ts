import { expect, test, type Page } from '@playwright/test';

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

async function esperar(page: Page, condicao: string, timeout = 120_000): Promise<void> {
  await page.waitForFunction(
    `(() => { const e = window.__portaAPorta; return ${condicao}; })()`,
    undefined,
    { timeout },
  );
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

test('os quintais têm selvagens e baús, e o selvagem reage a quem entra', async ({ page }) => {
  const erros = await abrir(page, '/?semente=3');
  const selvagens = await ler<(Ponto & { especie: string })[]>(page, 'e.selvagens');
  expect(selvagens.length).toBeGreaterThan(0);
  const baus = await ler<Ponto[]>(page, 'e.baus');
  expect(baus.length).toBeGreaterThanOrEqual(selvagens.length);
  const s = selvagens[0]!;
  await levar(page, { x: s.x + 1.8, y: s.y + 0.6 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/screenshots/quintal.png' });
  expect(erros).toEqual([]);
});

test('na rua 1-2, a elite chega quando os Postes caem', async ({ page }) => {
  const erros = await abrir(page, '/?semente=3&posicao=1-2');
  await page.evaluate(() =>
    (window.__portaAPorta as unknown as { derrubarPostes: () => void }).derrubarPostes(),
  );
  await esperar(page, 'e.elites && e.elites.length >= 1');
  const el = (await ler<(Ponto & { especie: string })[]>(page, 'e.elites'))[0]!;
  expect(['vizinho_curioso', 'casa_perseguidora']).toContain(el.especie);
  await levar(page, { x: el.x + 0.5, y: el.y + 3.2 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/screenshots/elite.png' });
  expect(erros).toEqual([]);
});

test('a praça do Síndico: Multas anunciadas e o Portão de grades', async ({ page }) => {
  const erros = await abrir(page, '/?semente=3&chefe=1');
  await esperar(page, "e.chefe && e.chefe.nome === 'Síndico Zeloso'");
  await esperar(page, 'e.grades > 0', 170_000);
  await page.screenshot({ path: 'test-results/screenshots/chefe-sindico.png' });
  expect(erros).toEqual([]);
});
