import { expect, test, type Page } from '@playwright/test';

// Tarefa 12: os chefes dos bairros 2 e 3 em cada fase, com screenshots para conferir.

interface Ponto {
  x: number;
  y: number;
}
interface Ganchos {
  imortal: () => void;
  ferirChefe: (fracao: number) => void;
  levarJogador: (x: number, y: number) => void;
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

/** Chama um gancho de teste da cena. */
async function gancho(page: Page, nome: keyof Ganchos, ...args: number[]): Promise<void> {
  await page.evaluate(
    ([n, a]) => {
      const g = window.__portaAPorta as unknown as Record<string, (...x: number[]) => void>;
      g[n]!(...a);
    },
    [nome, args] as const,
  );
}

test('Viúva do Mirante: Lágrimas da sacada, a praça apagada e ela no chão', async ({ page }) => {
  const erros = await abrir(page, '/?semente=3&bairro=2&chefe=1');
  await esperar(page, "e.chefe && e.chefe.nome === 'Viúva do Mirante'");
  await gancho(page, 'imortal');
  expect(await ler<string>(page, 'e.chefe.fase')).toBe('No mirante');
  const v = await ler<Ponto>(page, 'e.chefePos');
  // Diante da sacada, a uns 3 tiles: as Lágrimas caem em volta do jogador.
  await gancho(page, 'levarJogador', v.x + 3, v.y + 1);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/screenshots/chefe-viuva-mirante.png' });

  await gancho(page, 'ferirChefe', 0.55);
  await esperar(page, "e.chefe.fase === 'Escuridão'");
  await esperar(page, "e.inimigos.some((i) => i.especie === 'sombra_da_viuva')", 60_000);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/screenshots/chefe-viuva-escuridao.png' });

  await gancho(page, 'ferirChefe', 0.2);
  await esperar(page, "e.chefe.fase === 'No chão'");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/screenshots/chefe-viuva-chao.png' });
  expect(erros).toEqual([]);
});

test('O Dono do Bairro: a casa que luta, um andar por fase e o rosto no telhado', async ({
  page,
}) => {
  const erros = await abrir(page, '/?semente=3&bairro=3&chefe=1');
  await esperar(page, "e.chefe && e.chefe.nome === 'O Dono do Bairro'");
  await gancho(page, 'imortal');
  expect(await ler<string>(page, 'e.chefe.fase')).toBe('Andar 1');
  const d = await ler<Ponto>(page, 'e.chefePos');
  await gancho(page, 'levarJogador', d.x + 5, d.y + 1.5);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/screenshots/chefe-dono-andar1.png' });

  await gancho(page, 'ferirChefe', 0.6);
  await esperar(page, "e.chefe.fase === 'Andar 2'");
  await gancho(page, 'levarJogador', d.x + 4, d.y);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/screenshots/chefe-dono-andar2.png' });

  await gancho(page, 'ferirChefe', 0.3);
  await esperar(page, "e.chefe.fase === 'Andar 3'");
  await gancho(page, 'levarJogador', d.x + 5, d.y + 1.5);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/screenshots/chefe-dono-andar3.png' });
  expect(erros).toEqual([]);
});

test('curva dos bairros: a 2-1 com metade dos postes apagados e a 3-3 escura', async ({ page }) => {
  for (const [posicao, nome] of [
    ['2-1', 'rua-2-1'],
    ['3-3', 'rua-3-3-escura'],
  ] as const) {
    const erros = await abrir(page, `/?semente=3&posicao=${posicao}&avancar=3`);
    await gancho(page, 'imortal');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `test-results/screenshots/${nome}.png` });
    expect(erros).toEqual([]);
  }
});
