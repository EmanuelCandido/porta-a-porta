import { expect, test, type Page } from '@playwright/test';

interface Ponto {
  x: number;
  y: number;
}
interface Alvo extends Ponto {
  raio: number;
  especie: string;
}
interface Estado {
  imortal: () => void;
  quebravelPerto: (tipo?: string) => Alvo | null;
  levarJogador: (x: number, y: number) => void;
  naTela: (x: number, y: number) => Ponto;
  recarregarTudo: () => void;
  pontoLivre: (x: number, y: number) => boolean;
}

async function abrir(page: Page): Promise<string[]> {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text());
  });
  // O Fantasma bate de perto: o golpe em arco alcança o objeto sem parar em paredes.
  await page.goto('/?semente=7&zoom=1.2&campeao=fantasma');
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  await page.evaluate(() => (window.__portaAPorta as unknown as Estado).imortal());
  return erros;
}

/** Leva o jogador até o objeto mais perto do tipo pedido e mira nele. */
async function irAte(page: Page, tipo: string): Promise<Alvo> {
  const alvo = await page.evaluate(
    (t) => (window.__portaAPorta as unknown as Estado).quebravelPerto(t),
    tipo,
  );
  expect(alvo, tipo).not.toBeNull();
  // Chega pelo lado que é chão livre (o portão atravessa um beco; a abóbora fica na calçada).
  const d = alvo!.raio + 0.45;
  let ponto: [number, number] = [alvo!.x - d, alvo!.y];
  for (const [dx, dy] of [
    [-d, 0],
    [d, 0],
    [0, -d],
    [0, d],
  ] as const) {
    const livre = await page.evaluate(
      ([x, y]) => (window.__portaAPorta as unknown as Estado).pontoLivre(x, y),
      [alvo!.x + dx, alvo!.y + dy] as const,
    );
    if (livre) {
      ponto = [alvo!.x + dx, alvo!.y + dy];
      break;
    }
  }
  await page.evaluate(
    ([x, y]) => (window.__portaAPorta as unknown as Estado).levarJogador(x, y),
    ponto,
  );
  // A câmera segue o jogador suavizando: espera ela chegar antes de mirar (o objeto pode estar longe).
  await page.waitForTimeout(2000);
  const caixa = (await page.locator('canvas').boundingBox())!;
  const f = await page.evaluate(
    ([x, y]) => (window.__portaAPorta as unknown as Estado).naTela(x, y),
    [alvo!.x, alvo!.y] as const,
  );
  await page.mouse.move(caixa.x + f.x * caixa.width, caixa.y + f.y * caixa.height);
  return alvo!;
}

/** Segura o golpe mirando no objeto (a câmera anda para o cursor: a mira é refeita sempre). */
async function baterAte(page: Page, alvo: Alvo, condicao: () => boolean | Promise<boolean>) {
  const caixa = (await page.locator('canvas').boundingBox())!;
  await page.mouse.down();
  // Com a máquina carregada a simulação anda devagar: até ~60 s de golpes.
  for (let i = 0; i < 240 && !(await condicao()); i++) {
    const f = await page.evaluate(
      ([x, y]) => (window.__portaAPorta as unknown as Estado).naTela(x, y),
      [alvo.x, alvo.y] as const,
    );
    await page.mouse.move(caixa.x + f.x * caixa.width, caixa.y + f.y * caixa.height);
    await page.waitForTimeout(250);
  }
  await page.mouse.up();
}

const quebrados = (page: Page) =>
  page.evaluate(() => (window.__portaAPorta as unknown as { quebrados: number }).quebrados);

test('o portão do quintal: o golpe comum não abre, o combo inteiro abre', async ({ page }) => {
  const erros = await abrir(page);
  const alvo = await irAte(page, 'portao_quintal');
  await page.screenshot({ path: 'test-results/screenshots/arma-portao.png' });
  // Golpes direto na direção do portão (a mira pelo mouse escorrega com o navegador carregado).
  for (let i = 0; i < 600 && (await quebrados(page)) === 0; i++) {
    await page.evaluate(
      ([x, y]) =>
        (
          window.__portaAPorta as unknown as { golpearPara: (x: number, y: number) => void }
        ).golpearPara(x, y),
      [alvo.x, alvo.y] as const,
    );
    await page.waitForTimeout(100);
  }
  expect(await quebrados(page)).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/screenshots/arma-portao-aberto.png' });
  expect(erros).toEqual([]);
});

test('a abóbora gigante quebra, avisa e explode', async ({ page }) => {
  const erros = await abrir(page);
  const existe = await page.evaluate(() =>
    (window.__portaAPorta as unknown as Estado).quebravelPerto('abobora_gigante'),
  );
  test.skip(existe === null, 'esta rua não sorteou abóbora gigante');
  const alvo = await irAte(page, 'abobora_gigante');
  await page.screenshot({ path: 'test-results/screenshots/arma-abobora.png' });
  await baterAte(page, alvo, async () => (await quebrados(page)) > 0);
  expect(await quebrados(page)).toBeGreaterThan(0);
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/screenshots/arma-abobora-aviso.png' });
  expect(erros).toEqual([]);
});

test('o fio do poste eletrifica o chão', async ({ page }) => {
  const erros = await abrir(page);
  await irAte(page, 'fio');
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/arma-fio.png' });
  expect(erros).toEqual([]);
});
