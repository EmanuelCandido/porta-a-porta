import { expect, test, type Page } from '@playwright/test';

interface Desconfiada {
  x: number;
  y: number;
  batida: boolean;
  resultado: string | null;
}

type Gancho = Record<string, (...a: unknown[]) => unknown>;

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

async function chamar(page: Page, nome: string, ...args: unknown[]): Promise<void> {
  await page.evaluate(
    ([n, a]) => (window.__portaAPorta as unknown as Gancho)[n as string]!(...(a as unknown[])),
    [nome, args] as const,
  );
}

async function ler<T>(page: Page, expr: string): Promise<T> {
  return (await page.evaluate(
    `(() => { const e = window.__portaAPorta; return ${expr}; })()`,
  )) as T;
}

/** Leva a Bruxinha à porta da casa `i`, limpa a rua em volta e bate (F). */
async function bater(page: Page, i: number): Promise<void> {
  const d = (await ler<Desconfiada[]>(page, 'e.desconfiadas'))[i]!;
  await chamar(page, 'levarJogador', d.x, d.y);
  await chamar(page, 'afastarInimigos', 8);
  await page.waitForTimeout(300);
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__portaAPorta?.janela === true);
}

test('Casa Desconfiada: os quatro minijogos na porta e o acerto dá doces', async ({ page }) => {
  test.setTimeout(240_000);
  const erros = await abrir(page, '/?semente=3&posicao=1-2');
  const casas = await ler<Desconfiada[]>(page, 'e.desconfiadas');
  expect(casas.length).toBeGreaterThan(0);
  for (const tipo of ['toque', 'olho', 'fresta', 'quem']) {
    // Uma rua nova para cada minijogo (cada casa só abre uma vez).
    await abrir(page, '/?semente=3&posicao=1-2');
    await chamar(page, 'forcarMinijogo', tipo);
    await bater(page, 0);
    // No navegador de teste o jogo anda devagar: o Quem Bate? precisa da porta aberta.
    await page.waitForTimeout(tipo === 'olho' ? 500 : tipo === 'quem' ? 2200 : 1300);
    await page.screenshot({ path: `test-results/screenshots/desconfiada-${tipo}.png` });
    expect(await ler<{ tipo: string } | null>(page, 'e.minijogo')).toMatchObject({ tipo });
    if (tipo === 'toque') {
      // Acerta sozinho e a rua volta com os doces.
      const antes = await ler<number>(page, 'e.doces');
      await chamar(page, 'acertarMinijogos', true);
      await page.waitForFunction(() => window.__portaAPorta?.janela === false, undefined, {
        timeout: 30_000,
      });
      await page.waitForFunction(
        () =>
          (window.__portaAPorta as unknown as { desconfiadas: Desconfiada[] }).desconfiadas[0]!
            .resultado !== null,
      );
      const d = (await ler<Desconfiada[]>(page, 'e.desconfiadas'))[0]!;
      expect(['perfeito', 'acerto']).toContain(d.resultado);
      await page.waitForFunction(
        (a) => (window.__portaAPorta as unknown as { doces: number }).doces > a,
        antes,
      );
      await page.screenshot({ path: 'test-results/screenshots/desconfiada-acerto.png' });
    }
  }
  expect(erros).toEqual([]);
});

test('Casa Desconfiada: errar acorda a casa do lote, que levanta e sai pela porta', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const erros = await abrir(page, '/?semente=3&posicao=1-2');
  // O primeiro erro da run seria perdoado: gasta o perdão para ver a casa acordar.
  await chamar(page, 'gastarPerdao');
  await chamar(page, 'forcarMinijogo', 'fresta');
  await bater(page, 0);
  // Sem apertar nada, o tempo da fresta acaba em erro.
  await page.waitForFunction(() => window.__portaAPorta?.janela === false, undefined, {
    timeout: 30_000,
  });
  await page.waitForFunction(() =>
    (window.__portaAPorta as unknown as { elites: { especie: string }[] }).elites?.some(
      (e) => e.especie === 'casa_desperta',
    ),
  );
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'test-results/screenshots/desconfiada-acordando.png' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/screenshots/desconfiada-casa-desperta.png' });
  expect((await ler<Desconfiada[]>(page, 'e.desconfiadas'))[0]!.resultado).toBe('erro');
  expect(erros).toEqual([]);
});

test('Casa Desconfiada: a segunda porta da rua também abre (a janela não guarda a anterior)', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const erros = await abrir(page, '/?posicao=2-2');
  expect((await ler<Desconfiada[]>(page, 'e.desconfiadas')).length).toBeGreaterThanOrEqual(2);
  await chamar(page, 'forcarMinijogo', 'fresta');
  await chamar(page, 'acertarMinijogos', true);
  for (const i of [0, 1]) {
    await bater(page, i);
    await page.waitForFunction(() => window.__portaAPorta?.janela === false, undefined, {
      timeout: 30_000,
    });
    await page.waitForFunction(
      (k) =>
        (window.__portaAPorta as unknown as { desconfiadas: Desconfiada[] }).desconfiadas[k]!
          .resultado !== null,
      i,
    );
  }
  expect(erros).toEqual([]);
});

test('modo dev (?dev=1): a aba Testar leva às casas e as rearma', async ({ page }) => {
  test.setTimeout(240_000);
  const erros = await abrir(page, '/?posicao=2-2&dev=1');
  await page.keyboard.press('F1');
  const painel = page.locator('#painel-dev');
  await expect(painel.getByRole('button', { name: 'Testar' })).toHaveClass(/ativo/);
  await painel.locator('select').nth(4).selectOption('olho');
  await chamar(page, 'afastarInimigos', 40);
  await painel.getByRole('button', { name: /Ir à casa 1/ }).click();
  await page.waitForTimeout(300);
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__portaAPorta?.janela === true);
  expect(await ler<{ tipo: string } | null>(page, 'e.minijogo')).toMatchObject({ tipo: 'olho' });
  await chamar(page, 'acertarMinijogos', true);
  await page.waitForFunction(() => window.__portaAPorta?.janela === false, undefined, {
    timeout: 30_000,
  });
  await page.keyboard.press('F1');
  await painel.getByRole('button', { name: 'Rearmar casas' }).click();
  expect((await ler<Desconfiada[]>(page, 'e.desconfiadas'))[0]!.batida).toBe(false);
  await page.screenshot({ path: 'test-results/screenshots/dev-testar.png' });
  expect(erros).toEqual([]);
});
