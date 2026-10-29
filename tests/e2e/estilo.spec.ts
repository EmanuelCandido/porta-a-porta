import { expect, test, type Page } from '@playwright/test';

// Screenshots para conferir o kit visual contra a imagem de referência (tarefa 2).
const CAPTURAS = [
  { nome: 'vitrine', url: '/?cena=previa&rua=vitrine&zoom=1.2&foco=7.3,5.2' },
  { nome: 'rua-referencia', url: '/?cena=previa&rua=rua_teste' },
  { nome: 'rua-noite', url: '/?cena=previa&rua=rua_teste&noite=1' },
  { nome: 'rua-noite-detalhe', url: '/?cena=previa&rua=rua_teste&noite=1&zoom=1.2&foco=9,10' },
  // Sombras da noite: cada poste projeta a sombra dos carros e objetos para longe dele.
  { nome: 'sombras-noite', url: '/?cena=previa&rua=acervo&noite=1&zoom=1.2&foco=9,12' },
];

async function esperarDesenho(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  await page.evaluate(
    () =>
      new Promise<void>((pronto) =>
        requestAnimationFrame(() => requestAnimationFrame(() => pronto())),
      ),
  );
}

for (const { nome, url } of CAPTURAS) {
  test(`estilo: ${nome}`, async ({ page }) => {
    const erros: string[] = [];
    page.on('pageerror', (e) => erros.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') erros.push(m.text());
    });

    await page.goto(url);
    await esperarDesenho(page);
    await page.screenshot({ path: `test-results/screenshots/${nome}.png` });
    expect(erros).toEqual([]);
  });
}

test('L alterna a escuridão', async ({ page }) => {
  await page.goto('/?cena=previa&rua=rua_teste');
  await esperarDesenho(page);
  expect(await page.evaluate(() => window.__portaAPorta?.noite)).toBe(false);
  await page.keyboard.press('l');
  expect(await page.evaluate(() => window.__portaAPorta?.noite)).toBe(true);
});
