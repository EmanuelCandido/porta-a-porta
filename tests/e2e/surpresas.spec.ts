import { expect, test, type Page } from '@playwright/test';

// Tarefa G8: baús, encontros raros e tratos lendários, com screenshots para conferir.

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

async function esperar(page: Page, condicao: string, timeout = 60_000): Promise<void> {
  await page.waitForFunction(
    `(() => { const e = window.__portaAPorta; return ${condicao}; })()`,
    undefined,
    { timeout },
  );
}

/** Chama um gancho de teste da cena e devolve o que ele devolver. */
async function gancho<T>(page: Page, nome: string, ...args: number[]): Promise<T> {
  return (await page.evaluate(
    ([n, a]) => {
      const g = window.__portaAPorta as unknown as Record<string, (...x: number[]) => unknown>;
      return g[n]!(...a);
    },
    [nome, args] as const,
  )) as T;
}

test('baú amaldiçoado: treme de perto e abre a carta do trato, aceito na hora', async ({
  page,
}) => {
  const erros = await abrir(page, '/?semente=3');
  await gancho(page, 'imortal');
  const b = await gancho<Ponto | false>(page, 'amaldicoarBau');
  expect(b).not.toBe(false);
  const p = b as Ponto;
  await gancho(page, 'levarJogador', p.x + 1.1, p.y + 0.2);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/screenshots/bau-amaldicoado.png' });
  const tratos = (await ler<string[]>(page, 'e.tratos')).length;
  await page.keyboard.press('f');
  await esperar(page, 'e.janela === true');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/bau-amaldicoado-carta.png' });
  await page.keyboard.press('Enter');
  await esperar(page, 'e.janela === false');
  await esperar(page, `e.tratos.length === ${tratos + 1}`);
  expect(erros).toEqual([]);
});

test('encontros raros: a Criança Perdida, a Festa na Garagem e o Carrinho de Pipoca', async ({
  page,
}) => {
  const erros = await abrir(page, '/?semente=3&avancar=2');
  await gancho(page, 'imortal');
  // Criança: perto dela, ela vem junto.
  const c = await gancho<Ponto>(page, 'forcarEncontro', 0);
  await gancho(page, 'levarJogador', c.x - 1, c.y);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/screenshots/encontro-crianca.png' });

  // Carrinho: chega perto e abre a loja com F.
  await abrir(page, '/?semente=3&avancar=2');
  await gancho(page, 'imortal');
  const k = await gancho<Ponto>(page, 'forcarEncontro', 2);
  await gancho(page, 'levarJogador', k.x - 1.2, k.y);
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'test-results/screenshots/encontro-carrinho.png' });
  await page.keyboard.press('f');
  await esperar(page, 'e.janela === true');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/encontro-carrinho-loja.png' });
  await page.keyboard.press('Escape');
  await esperar(page, 'e.janela === false');

  // Festa: a porta abre e saem as pestinhas.
  await abrir(page, '/?semente=3&avancar=2');
  await gancho(page, 'imortal');
  const f = await gancho<Ponto>(page, 'forcarEncontro', 1);
  await gancho(page, 'levarJogador', f.x - 2, f.y);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/screenshots/encontro-festa.png' });
  expect(erros).toEqual([]);
});

test('Janela Vermelha: a placa em vermelho e a carta do trato lendário com dois preços', async ({
  page,
}) => {
  const erros = await abrir(page, '/?semente=3&porta=1');
  await gancho(page, 'imortal');
  const casa = await gancho<number>(page, 'janelaVermelha');
  expect(casa).toBeGreaterThanOrEqual(0);
  const porta = await ler<{ casas: Ponto[]; ofertas: { casa: number; vermelha?: boolean }[] }>(
    page,
    'e.porta',
  );
  expect(porta.ofertas.find((o) => o.casa === casa)?.vermelha).toBe(true);
  const p = porta.casas[casa]!;
  await gancho(page, 'levarJogador', p.x, p.y);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/screenshots/janela-vermelha.png' });
  await page.keyboard.press('f');
  await esperar(page, 'e.janela === true');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/janela-vermelha-carta.png' });
  const tratos = (await ler<string[]>(page, 'e.tratos')).length;
  await page.keyboard.press('Enter');
  await esperar(page, `e.tratos.length === ${tratos + 1}`);
  expect(erros).toEqual([]);
});
