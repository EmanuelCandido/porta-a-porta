import { expect, test } from '@playwright/test';

test('a preparação termina antes de a simulação começar e há diagnóstico dos quadros', async ({
  page,
}) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.addInitScript(() => {
    const ticks: number[] = [];
    (window as unknown as { ticksPreparacao: number[] }).ticksPreparacao = ticks;
    const olhar = () => {
      const e = window.__portaAPorta;
      if (e?.cena === 'CenaRua' && !e.pronta) ticks.push(Number(e.tick));
      requestAnimationFrame(olhar);
    };
    requestAnimationFrame(olhar);
  });
  await page.goto('/?semente=5');
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  const ticks = await page.evaluate(
    () => (window as unknown as { ticksPreparacao: number[] }).ticksPreparacao,
  );
  expect(ticks.length).toBeGreaterThan(0);
  expect(ticks.every((n) => n === 0)).toBe(true);
  const preparacao = await page.evaluate(() => window.__portaAPorta?.preparacaoInicial);
  expect(preparacao).toMatchObject({ poses: 0, sombras: false, chao: false, segundoPlano: true });
  // A captura precisa da abertura concluída, inclusive em renderização lenta por software.
  await page.waitForFunction(() => Number(window.__portaAPorta?.tick) >= 90);
  const relatorio = await page.evaluate(() => window.__desempenho?.relatorio());
  expect(relatorio?.ruas.at(-1)?.quadrosRecentes?.quadros).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/screenshots/desempenho-alta.png' });
  expect(erros).toEqual([]);
});

test('o menu dos jogadores salva a qualidade e volta pelo mouse', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  const caixa = (await page.locator('canvas').boundingBox())!;
  const fator = caixa.height / 720;
  const largura = caixa.width / fator;
  // Desempenho é um item do menu do título, como os outros.
  const item = await page.evaluate(
    () =>
      (
        window.__portaAPorta as unknown as {
          menu: Record<string, { x: number; y: number; w: number; h: number }>;
        }
      ).menu['desempenho']!,
  );
  await page.waitForTimeout(1500);
  await page.mouse.click(caixa.x + (item.x + 60) * fator, caixa.y + (item.y + item.h / 2) * fator);
  await page.waitForFunction(() => window.__portaAPorta?.opcoesDesempenho === true);
  await page.screenshot({ path: 'test-results/screenshots/desempenho-opcoes.png' });
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => localStorage.getItem('porta-a-porta:qualidade'))).toBe('leve');
  // Voltar: o quarto botão da coluna (Leve, Média, Alta e, depois de um respiro, Voltar).
  await page.mouse.click(
    caixa.x + ((largura - 680) / 2 + 28 + 110) * fator,
    caixa.y + ((720 - 320) / 2 + 80 + 3 * 50 + 10 + 20) * fator,
  );
  await page.waitForFunction(() => window.__portaAPorta?.opcoesDesempenho === false);
  await page.mouse.move(0, 0);
  await page.goto('/?semente=5');
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  expect(await page.evaluate(() => window.__desempenho?.relatorio().ruas.at(-1)?.qualidade)).toBe(
    'leve',
  );
  await page.waitForFunction(() => Number(window.__portaAPorta?.tick) >= 90);
  await page.screenshot({ path: 'test-results/screenshots/desempenho-leve.png' });
});

test('o jogo também prepara as poses quando o navegador não oferece Worker', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Worker', { value: undefined });
  });
  await page.goto('/?semente=5');
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyD');
  expect(erros).toEqual([]);
});
