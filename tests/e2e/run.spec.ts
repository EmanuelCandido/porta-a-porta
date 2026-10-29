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

interface Porta {
  casas: (Ponto & { acesa: boolean })[];
  banco: Ponto | null;
  saida: { x0: number; x1: number; y1: number };
  ofertas: { casa: number; trato: string; precos: string[] }[];
}

test('na fase Porta a Porta, bater numa casa acesa abre o trato; aceitar dá o poder', async ({
  page,
}) => {
  const erros = await abrir(page, '/?semente=3&porta=1');
  expect(await ler<string>(page, 'e.mapa')).toBe('porta');
  const porta = await ler<Porta>(page, 'e.porta');
  expect(porta.ofertas).toHaveLength(3);
  await page.screenshot({ path: 'test-results/screenshots/porta-a-porta.png' });

  const casa = porta.casas[porta.ofertas[0]!.casa]!;
  await levar(page, casa);
  await page.keyboard.press('f');
  await esperar(page, 'e.janela === true');
  await page.screenshot({ path: 'test-results/screenshots/porta-trato.png' });
  await page.keyboard.press('Enter');
  await esperar(page, 'e.tratos.length === 1');
  // Aceitar já fecha a janela (um Esc a mais abriria a pausa).
  await esperar(page, 'e.janela === false');

  // O banco: loja e cura.
  await levar(page, porta.banco!);
  await page.keyboard.press('f');
  await esperar(page, 'e.janela === true');
  await page.screenshot({ path: 'test-results/screenshots/porta-banco.png' });
  await page.keyboard.press('Escape');
  await esperar(page, 'e.janela === false');
  expect(erros).toEqual([]);
});

test('sair da porta leva à próxima rua, com o preço do trato aceito valendo', async ({ page }) => {
  await abrir(page, '/?semente=3&porta=1');
  const porta = await ler<Porta>(page, 'e.porta');
  await levar(page, porta.casas[porta.ofertas[0]!.casa]!);
  await page.keyboard.press('f');
  await esperar(page, 'e.janela === true');
  await page.keyboard.press('Enter');
  await esperar(page, 'e.tratos.length === 1');
  // Aceitar já fecha a janela (um Esc a mais abriria a pausa).
  await esperar(page, 'e.janela === false');
  // Anda para o norte pelo portão aberto.
  await levar(page, { x: (porta.saida.x0 + porta.saida.x1) / 2, y: porta.saida.y1 + 1.5 });
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowRight');
  await esperar(page, "e.fim === 'porta'");
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('ArrowRight');
  await esperar(page, "e.mapa === 'rua'");
  expect(await ler<string[]>(page, 'e.precos')).toEqual(porta.ofertas[0]!.precos);
  await page.screenshot({ path: 'test-results/screenshots/rua-com-trato.png' });
});
