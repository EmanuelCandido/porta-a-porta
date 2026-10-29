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

async function esperar(page: Page, condicao: string, timeout = 90_000): Promise<void> {
  await page.waitForFunction(
    `(() => { const e = window.__portaAPorta; return ${condicao}; })()`,
    undefined,
    { timeout },
  );
}

async function subir(page: Page, slot: string): Promise<void> {
  if (slot === 'Q') await mouseNoJogo(page);
  await page.keyboard.down('Control');
  await lancarHabilidade(page, slot);
  await page.keyboard.up('Control');
}

test('no posto 3 o jogo pausa e mostra as 2 evoluções; 2 escolhe a Vassoura Pesada', async ({
  page,
}) => {
  const erros = await abrir(page, '/?modo=treino&nivel=5');
  await subir(page, 'Q');
  await esperar(page, 'e.postos.Q === 2');
  expect(await ler<string | null>(page, 'e.evolucaoPendente')).toBeNull();
  await subir(page, 'Q');
  await esperar(page, "e.evolucaoPendente === 'Q' && e.janela === true");
  // A rua para enquanto a escolha está aberta.
  const tick = await ler<number>(page, 'e.tick');
  await page.waitForTimeout(400);
  expect(await ler<number>(page, 'e.tick')).toBe(tick);
  await page.screenshot({ path: 'test-results/screenshots/evolucao-escolha.png' });

  await page.keyboard.press('2');
  await esperar(page, "e.evolucoes.Q === 'vassoura_pesada' && e.janela === false");
  await esperar(page, `e.tick > ${tick}`);
  expect(await ler<string | null>(page, 'e.evolucaoPendente')).toBeNull();
  await page.screenshot({ path: 'test-results/screenshots/evolucao-escolhida.png' });
  expect(erros).toEqual([]);
});

test('o clique numa carta também escolhe (Poção Explosiva)', async ({ page }) => {
  await abrir(page, '/?modo=treino&nivel=5');
  await subir(page, 'W');
  await subir(page, 'W');
  await esperar(page, "e.evolucaoPendente === 'W'");
  const caixa = (await page.locator('canvas').boundingBox())!;
  // A carta da esquerda fica à esquerda do centro da tela.
  await page.mouse.click(caixa.x + caixa.width * 0.38, caixa.y + caixa.height * 0.55);
  await esperar(page, "e.evolucoes.W === 'pocao_explosiva' && e.janela === false");
});
