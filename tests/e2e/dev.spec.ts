import { expect, test, type Page } from '@playwright/test';
import { lancarHabilidade, mouseNoJogo } from './teclas';

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

/** Digita um valor no campo do painel cujo rótulo é `rotulo`, dentro do grupo de título `grupo`. */
async function ajustarCampo(page: Page, grupo: string, rotulo: string, valor: string) {
  const campo = page
    .locator('#painel-dev h4', { hasText: grupo })
    .locator('xpath=following-sibling::div[contains(@class,"campo")]')
    .filter({ has: page.locator('span', { hasText: rotulo }) })
    .first();
  const input = campo.locator('input');
  await input.fill(valor);
  await input.press('Enter');
  await expect(campo).toHaveClass(/mudou/);
}

test('o modo desenvolvedor não aparece no jogo publicado sem ?dev=1', async ({ page }) => {
  await abrir(page, '/?modo=treino');
  await page.keyboard.press('F1');
  await expect(page.locator('#painel-dev')).toHaveCount(0);
  await expect(page.locator('#botao-dev')).toHaveCount(0);
});

test('F1 abre o painel; recarga e vida mudam na hora e ficam guardadas', async ({ page }) => {
  const erros = await abrir(page, '/?modo=treino&dev=1');
  await page.evaluate(() => localStorage.removeItem('portaAPorta.dev.ajustes'));
  await page.keyboard.press('F1');
  const painel = page.locator('#painel-dev');
  await expect(painel).toBeVisible();

  // O painel abre na aba Testar; os números da Vassoura ficam em Habilidades.
  await page.locator('#painel-dev nav button', { hasText: 'Habilidades' }).click();
  // Recarga da Vassoura (botão direito) de 6 s para 1 s: vale no próximo lançamento.
  await ajustarCampo(page, 'Vassoura Disparada', 'Recarga', '1 1 1 1 1');
  await mouseNoJogo(page);
  // Nos primeiros segundos da rua (a entrada) a habilidade ainda não sai: tenta até sair.
  await expect
    .poll(
      async () => {
        await lancarHabilidade(page, 'Q');
        await page.waitForTimeout(400);
        return ler<string[]>(page, 'e.lancou');
      },
      { timeout: 60_000 },
    )
    .toContain('Q');
  const recarga = await ler<number>(page, 'e.recargas.Q');
  expect(recarga).toBeGreaterThan(0);
  expect(recarga).toBeLessThanOrEqual(1);

  // Vida da Bruxinha: a Coragem cheia sobe junto.
  await page.locator('#painel-dev nav button', { hasText: 'Campeão' }).click();
  await ajustarCampo(page, 'Bruxinha', 'Vida (Coragem)', '300');
  await expect.poll(() => ler<number>(page, 'e.coragem')).toBe(300);
  await page.screenshot({ path: 'test-results/screenshots/dev-painel.png' });

  // Guardado no navegador: a rua recarregada já nasce com 300.
  await page.reload();
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  expect(await ler<number>(page, 'e.coragem')).toBe(300);

  // Desfazer tudo volta ao JSON.
  await page.keyboard.press('F1');
  await page.locator('#painel-dev footer button', { hasText: 'Desfazer tudo' }).click();
  await expect.poll(() => ler<number>(page, 'e.coragem')).toBeLessThan(300);
  expect(erros).toEqual([]);
});

test('Copiar ajustes mostra o caminho de cada número no JSON', async ({ page }) => {
  await abrir(page, '/?modo=treino&dev=1');
  await page.evaluate(() => localStorage.removeItem('portaAPorta.dev.ajustes'));
  await page.keyboard.press('F1');
  await page.locator('#painel-dev nav button', { hasText: 'Golpe' }).click();
  await ajustarCampo(page, 'Golpe manual e combo', 'multUltimo', '2');
  await page.locator('#painel-dev footer button', { hasText: 'Copiar ajustes' }).click();
  const texto = await page.locator('#painel-dev textarea').inputValue();
  expect(texto).toContain('content/combate.json');
  expect(texto).toContain('ataqueManual.multUltimo: 2');
  await page.locator('#painel-dev footer button', { hasText: 'Desfazer tudo' }).click();
});
