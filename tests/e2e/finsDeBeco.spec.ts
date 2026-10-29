import { expect, test, type Page } from '@playwright/test';

interface Ponto {
  x: number;
  y: number;
}
interface Fim {
  tipo: 'poco' | 'velas' | 'assombrada';
  centro: Ponto;
  vencido: boolean;
  velas: (Ponto & { acesa: boolean })[];
}
interface Estado {
  pronta: boolean;
  fins: () => Fim[];
  atalho: () => { a: Ponto; b: Ponto; bau: Ponto } | null;
  levarJogador: (x: number, y: number) => void;
  imortal: () => void;
}

const estado = (page: Page) => page.evaluate(() => window.__portaAPorta as unknown as Estado);

/** Abre a run nas sementes dadas até achar uma rua com o fim de beco pedido. */
async function ruaCom(page: Page, tipo: Fim['tipo']): Promise<Fim> {
  for (let s = 1; s <= 12; s++) {
    await page.goto(`/?semente=${s}&zoom=1.4`);
    await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
    const fins = await page.evaluate(() => (window.__portaAPorta as unknown as Estado).fins());
    const f = fins.find((x) => x.tipo === tipo);
    if (f) return f;
  }
  throw new Error(`nenhuma rua com ${tipo}`);
}

async function levar(page: Page, p: Ponto): Promise<void> {
  await page.evaluate(([x, y]) => (window.__portaAPorta as unknown as Estado).levarJogador(x, y), [
    p.x,
    p.y,
  ] as const);
  // A câmera segue o jogador com atraso: espera ela chegar depois do salto.
  await page.waitForTimeout(2500);
}

test('o Quintal das Velas: F acende a vela e a chama aparece', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  const f = await ruaCom(page, 'velas');
  await page.evaluate(() => (window.__portaAPorta as unknown as Estado).imortal());
  const v = f.velas[0]!;
  await levar(page, { x: v.x + 0.7, y: v.y });
  await page.screenshot({ path: 'test-results/screenshots/velas-apagadas.png' });
  await page.keyboard.press('f');
  await page.waitForTimeout(300);
  const depois = (
    await page.evaluate(() => (window.__portaAPorta as unknown as Estado).fins())
  ).find((x) => x.tipo === 'velas')!;
  expect(depois.velas[0]!.acesa).toBe(true);
  await page.screenshot({ path: 'test-results/screenshots/velas-acesa.png' });
  expect(erros).toEqual([]);
});

test('o Poço dos Desejos e a Casa Assombrada aparecem no fim dos becos', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  const poco = await ruaCom(page, 'poco');
  await page.evaluate(() => (window.__portaAPorta as unknown as Estado).imortal());
  await levar(page, { x: poco.centro.x + 1.2, y: poco.centro.y + 1.2 });
  await page.screenshot({ path: 'test-results/screenshots/poco-dos-desejos.png' });
  const casa = await ruaCom(page, 'assombrada');
  await page.evaluate(() => (window.__portaAPorta as unknown as Estado).imortal());
  await levar(page, { x: casa.centro.x, y: casa.centro.y });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/screenshots/casa-assombrada.png' });
  expect((await estado(page)).pronta).toBe(true);
  expect(erros).toEqual([]);
});
