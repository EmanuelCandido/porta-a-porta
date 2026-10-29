import { expect, test, type Page } from '@playwright/test';
import { lancarHabilidade } from './teclas';

interface Ponto {
  x: number;
  y: number;
}

async function abrir(page: Page): Promise<string[]> {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text());
  });
  // Zoom máximo, e as telas recortadas em volta da Bruxinha, para conferir cada feitiço.
  await page.goto('/?modo=treino&zoom=1.2');
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  return erros;
}

async function mirar(page: Page, alvo: Ponto): Promise<void> {
  const caixa = (await page.locator('canvas').boundingBox())!;
  const f = await page.evaluate(
    ([x, y]) =>
      (window.__portaAPorta as unknown as { naTela: (x: number, y: number) => Ponto }).naTela(x, y),
    [alvo.x, alvo.y] as const,
  );
  await page.mouse.move(caixa.x + f.x * caixa.width, caixa.y + f.y * caixa.height);
}

/** Tela recortada em volta de um ponto do mundo (o desenho dos feitiços é pequeno). */
async function foto(page: Page, nome: string, centro?: Ponto): Promise<void> {
  const caixa = (await page.locator('canvas').boundingBox())!;
  const c =
    centro ??
    (await page.evaluate(() => (window.__portaAPorta as unknown as { jogador: Ponto }).jogador));
  const f = await page.evaluate(
    ([x, y]) =>
      (window.__portaAPorta as unknown as { naTela: (x: number, y: number) => Ponto }).naTela(x, y),
    [c.x, c.y] as const,
  );
  const w = 420;
  const h = 280;
  const x = Math.max(
    caixa.x,
    Math.min(caixa.x + caixa.width - w, caixa.x + f.x * caixa.width - w / 2),
  );
  const y = Math.max(
    caixa.y,
    Math.min(caixa.y + caixa.height - h, caixa.y + f.y * caixa.height - h / 2),
  );
  await page.screenshot({
    path: `test-results/screenshots/${nome}.png`,
    clip: { x, y, width: w, height: h },
  });
}

/** Energia cheia e recargas zeradas (o R custa toda a Energia). */
const recarregar = (page: Page) =>
  page.evaluate(() =>
    (window.__portaAPorta as unknown as { recarregarTudo: () => void }).recarregarTudo(),
  );

const boneco = (page: Page) =>
  page.evaluate(() => (window.__portaAPorta as unknown as { bonecos: Ponto[] }).bonecos[0]!);

async function esperar(page: Page, condicao: string): Promise<void> {
  await page.waitForFunction(
    `(() => { const e = window.__portaAPorta; return ${condicao}; })()`,
    undefined,
    { timeout: 60_000 },
  );
}

test('feitiços da Bruxinha: estrela, vassoura, poção, salto e chuva', async ({ page }) => {
  const erros = await abrir(page);
  const alvo = await boneco(page);
  await mirar(page, alvo);

  // Golpe: a estrela girando (botão esquerdo).
  await page.mouse.down();
  await page.waitForTimeout(90);
  await foto(page, 'feitico-golpe');
  await page.mouse.up();
  await page.waitForTimeout(600);

  // Vassoura: no ar (mirando longe dos bonecos, para voar o alcance todo), e o estouro no fim.
  const eu = await page.evaluate(
    () => (window.__portaAPorta as unknown as { jogador: Ponto }).jogador,
  );
  await mirar(page, alvo);
  await recarregar(page);
  await lancarHabilidade(page, 'Q');
  await esperar(page, 'e.projeteis > 0');
  await foto(page, 'feitico-vassoura');
  await page.waitForTimeout(150);
  await foto(page, 'feitico-vassoura-estouro', alvo);

  // Poção: voando em arco e borbulhando no chão.
  await mirar(page, alvo);
  await recarregar(page);
  await lancarHabilidade(page, 'W');
  // A área nasce quando a poção sai da mão: a foto pega o frasco no ar.
  await esperar(page, 'e.areas === 1');
  await foto(page, 'feitico-pocao-voo', { x: (eu.x + alvo.x) / 2, y: (eu.y + alvo.y) / 2 });
  await page.waitForTimeout(900);
  await foto(page, 'feitico-pocao-chao', alvo);

  // Chuva: sombras crescendo, abóboras caindo e chão queimado.
  await recarregar(page);
  await lancarHabilidade(page, 'R');
  await esperar(page, 'e.danos >= 2');
  await foto(page, 'feitico-chuva', alvo);

  // Salto: estrelas na decolagem e no caminho (na direção dos bonecos, na rua aberta).
  await mirar(page, alvo);
  await recarregar(page);
  await lancarHabilidade(page, 'E');
  await esperar(page, "e.lancou.includes('E') || e.recusou.length > 0");
  expect(
    await page.evaluate(() => (window.__portaAPorta as unknown as { recusou: string[] }).recusou),
  ).toEqual([]);
  await page.waitForTimeout(30);
  await foto(page, 'feitico-salto');
  expect(erros).toEqual([]);
});

test('feitiços no quadro exato: frasco no ar, abóboras caindo e estrelas do Salto', async ({
  page,
}) => {
  // Relógio controlado: a foto pega o quadro pedido, sem a demora da captura.
  await page.clock.install();
  const erros = await abrir(page);
  const alvo = await boneco(page);
  await mirar(page, alvo);
  const agora = await page.evaluate(() => Date.now());
  // Folga larga: com a máquina carregada, o relógio já andou desde a leitura.
  await page.clock.pauseAt(agora + 2000);
  const quadros = async (ms: number) => {
    for (let t = 0; t < ms; t += 16) await page.clock.runFor(16);
  };

  await recarregar(page);
  await lancarHabilidade(page, 'W');
  await quadros(250 + 150);
  const eu = await page.evaluate(
    () => (window.__portaAPorta as unknown as { jogador: Ponto }).jogador,
  );
  await foto(page, 'feitico-pocao-voo', { x: (eu.x + alvo.x) / 2, y: (eu.y + alvo.y) / 2 });
  await quadros(1500);

  await recarregar(page);
  await lancarHabilidade(page, 'R');
  await quadros(800 + 520);
  await foto(page, 'feitico-chuva', alvo);
  await quadros(2000);

  await recarregar(page);
  await lancarHabilidade(page, 'E');
  await quadros(110);
  await foto(page, 'feitico-salto');
  expect(erros).toEqual([]);
});
