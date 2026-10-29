import { expect, test, type Page } from '@playwright/test';
import { lancarHabilidade, mouseNoJogo, segurarHabilidade, soltarHabilidade } from './teclas';

interface Ponto {
  x: number;
  y: number;
}
interface Boneco extends Ponto {
  coragem: number;
}
interface Estado {
  jogador: Ponto;
  bonecos: Boneco[];
  danos: number;
  lancou: string[];
  recusou: string[];
  lancando: string | null;
  mirando: string | null;
  areas: number;
  projeteis: number;
  naTela: (x: number, y: number) => Ponto;
  recarregarTudo: () => void;
}

async function abrir(page: Page, url = '/?modo=treino'): Promise<string[]> {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text());
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  return erros;
}

/** Lê um valor do estado publicado pela cena (`e` é `window.__portaAPorta`). */
async function ler<T>(page: Page, expr: string): Promise<T> {
  return (await page.evaluate(
    `(() => { const e = window.__portaAPorta; return ${expr}; })()`,
  )) as T;
}

/** Põe o cursor sobre um ponto do mundo (em tiles). */
async function mirar(page: Page, alvo: Ponto): Promise<void> {
  const caixa = (await page.locator('canvas').boundingBox())!;
  const f = await page.evaluate(
    ([x, y]) => (window.__portaAPorta as unknown as Estado).naTela(x, y),
    [alvo.x, alvo.y] as const,
  );
  await page.mouse.move(caixa.x + f.x * caixa.width, caixa.y + f.y * caixa.height);
}

async function esperar(page: Page, condicao: string, timeout = 90_000): Promise<void> {
  await page.waitForFunction(
    `(() => { const e = window.__portaAPorta; return ${condicao}; })()`,
    undefined,
    { timeout },
  );
}

async function recarregar(page: Page): Promise<void> {
  await page.evaluate(() => (window.__portaAPorta as unknown as Estado).recarregarTudo());
}

const boneco = (page: Page, i: number) => ler<Boneco>(page, `e.bonecos[${i}]`);

test('botão direito (Q da ficha): segurar mostra a mira, soltar lança e acerta', async ({
  page,
}) => {
  const erros = await abrir(page);
  const alvo = await boneco(page, 0);
  await mirar(page, alvo);
  await segurarHabilidade(page, 'Q');
  await esperar(page, "e.mirando === 'Q'");
  await page.screenshot({ path: 'test-results/screenshots/habilidade-mira-q.png' });
  await soltarHabilidade(page, 'Q');
  await esperar(page, 'e.bonecos[0].coragem < 500');
  expect(await ler<string[]>(page, 'e.lancou')).toEqual(['Q']);
  expect(erros).toEqual([]);
});

test('W: a poção cai no boneco e o machuca aos poucos', async ({ page }) => {
  await abrir(page);
  const alvo = await boneco(page, 0);
  await mirar(page, alvo);
  await lancarHabilidade(page, 'W');
  await esperar(page, 'e.areas === 1 && e.bonecos[0].coragem < 500');
  const primeiro = (await boneco(page, 0)).coragem;
  await page.screenshot({ path: 'test-results/screenshots/habilidade-w.png' });
  await esperar(page, `e.bonecos[0].coragem < ${primeiro}`);
});

test('E: o salto leva a Bruxinha 4 tiles na direção do cursor', async ({ page }) => {
  await abrir(page);
  const antes = await ler<Ponto>(page, 'e.jogador');
  await mirar(page, { x: antes.x, y: antes.y - 6 });
  await lancarHabilidade(page, 'E');
  await esperar(page, "e.lancou.includes('E') && !e.dashando");
  const depois = await ler<Ponto>(page, 'e.jogador');
  expect(antes.y - depois.y).toBeCloseTo(4, 1);
  expect(Math.abs(depois.x - antes.x)).toBeLessThan(0.05);
});

test('R: a área enche durante o lançamento e 3 ondas de abóboras caem', async ({ page }) => {
  await abrir(page);
  const alvo = await boneco(page, 0);
  await mirar(page, alvo);
  await lancarHabilidade(page, 'R');
  await esperar(page, "e.lancando === 'R'");
  await page.screenshot({ path: 'test-results/screenshots/habilidade-r-lancando.png' });
  await esperar(page, 'e.danos >= 1');
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/screenshots/habilidade-r-ondas.png' });
  await esperar(page, 'e.danos >= 3');
});

test('as 4 habilidades seguidas, com Energia e recargas repostas', async ({ page }) => {
  const erros = await abrir(page);
  const alvo = await boneco(page, 0);
  for (const slot of ['Q', 'W', 'R', 'E']) {
    await recarregar(page);
    await mirar(page, alvo);
    const antes = (await ler<string[]>(page, 'e.lancou')).length;
    await lancarHabilidade(page, slot);
    await esperar(page, `e.lancou.length > ${antes}`);
    await esperar(page, 'e.lancando === null');
  }
  expect(await ler<string[]>(page, 'e.lancou')).toEqual(['Q', 'W', 'R', 'E']);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/habilidade-todas.png' });
  expect(erros).toEqual([]);
});

test('Esc cancela a mira (do mouse e da tecla) sem lançar nem andar', async ({ page }) => {
  await abrir(page);
  const alvo = await boneco(page, 0);
  await mirar(page, alvo);
  await segurarHabilidade(page, 'Q');
  await page.keyboard.press('Escape');
  await soltarHabilidade(page, 'Q');

  const antes = await ler<Ponto>(page, 'e.jogador');
  await segurarHabilidade(page, 'W');
  await esperar(page, "e.mirando === 'W'");
  await page.keyboard.press('Escape');
  await soltarHabilidade(page, 'W');
  // Deixa a simulação andar alguns ticks antes de conferir que nada saiu.
  const tick = await ler<number>(page, 'e.tick');
  await esperar(page, `e.tick > ${tick + 20}`);
  expect(await ler<string[]>(page, 'e.lancou')).toEqual([]);
  const depois = await ler<Ponto>(page, 'e.jogador');
  expect(Math.hypot(depois.x - antes.x, depois.y - antes.y)).toBeLessThan(1e-6);
});

test('opção de lançar ao apertar', async ({ page }) => {
  await abrir(page, '/?modo=treino&lancamento=apertar');
  const alvo = await boneco(page, 0);
  await mirar(page, alvo);
  await segurarHabilidade(page, 'Q');
  await esperar(page, "e.lancou.includes('Q')");
  expect(await ler<string | null>(page, 'e.mirando')).toBeNull();
  await soltarHabilidade(page, 'Q');
});

test('sem Energia, a habilidade é recusada', async ({ page }) => {
  await abrir(page);
  await mirar(page, await boneco(page, 0));
  // R (100) e depois W (60) sem Energia suficiente.
  await lancarHabilidade(page, 'R');
  await esperar(page, "e.lancou.includes('R') && e.lancando === null");
  await lancarHabilidade(page, 'W');
  await esperar(page, "e.recusou.includes('W:energia')");
});

test('Ctrl + botão direito gasta o ponto de nível e o Q da ficha sobe de posto', async ({
  page,
}) => {
  await abrir(page, '/?modo=treino&nivel=2');
  expect(await ler<number>(page, 'e.pontos')).toBe(1);
  await mouseNoJogo(page);
  await page.keyboard.down('Control');
  await lancarHabilidade(page, 'Q');
  await page.keyboard.up('Control');
  await esperar(page, 'e.postos.Q === 2 && e.pontos === 0');
  expect(await ler<string[]>(page, 'e.lancou')).toEqual([]);
  await page.screenshot({ path: 'test-results/screenshots/interface-nivel.png' });
});

test('botão esquerdo: a Bruxinha atira no boneco; parada, não ataca sozinha', async ({ page }) => {
  await abrir(page);
  const alvo = await boneco(page, 1);
  await page.evaluate(
    ([x, y]) =>
      (
        window.__portaAPorta as unknown as { levarJogador: (x: number, y: number) => void }
      ).levarJogador(x, y),
    [alvo.x - 2.5, alvo.y] as const,
  );
  // Parada perto do boneco: o ataque não sai sozinho.
  const tick = await ler<number>(page, 'e.tick');
  await esperar(page, `e.tick > ${tick + 40}`);
  expect(await ler<number>(page, 'e.ataques')).toBe(0);
  await mirar(page, alvo);
  await page.mouse.down();
  await esperar(page, 'e.ataques >= 2 && e.bonecos[1].coragem < 500');
  await page.mouse.up();
  await page.screenshot({ path: 'test-results/screenshots/ataque-manual.png' });
});
