import { expect, test, type Page } from '@playwright/test';

// O jogo no controle: um controle de mentira (o navegador de teste não tem um), trocando o
// `navigator.getGamepads`. Na rua o analógico anda, o RT golpeia e Start pausa; nos menus o
// direcional move o foco entre os botões, A aperta e B volta.

interface Ponto {
  x: number;
  y: number;
}
interface Estado {
  pronta: boolean;
  jogador: Ponto;
  ataques: number;
  pausa: string | null;
  tela?: string;
}
interface Controle {
  tela: string | null;
  foco: { x: number; y: number; w: number; h: number } | null;
}

const BOTAO = { A: 0, B: 1, RT: 7, START: 9, BAIXO: 13 } as const;

async function comControle(page: Page): Promise<string[]> {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.addInitScript(() => {
    const pad = {
      id: 'Controle de teste',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    (window as unknown as { __pad: typeof pad }).__pad = pad;
    // Como um controle de verdade, o carimbo de tempo anda (o Phaser ignora leituras velhas).
    navigator.getGamepads = () => {
      pad.timestamp = performance.now();
      return [pad as unknown as Gamepad, null, null, null];
    };
  });
  return erros;
}

const est = (page: Page) => page.evaluate(() => window.__portaAPorta as unknown as Estado);
const ctl = (page: Page) =>
  page.evaluate(() => {
    const c = (window as unknown as { __controleNosMenus: Controle }).__controleNosMenus;
    return { tela: c.tela, foco: c.foco };
  });

async function segurar(page: Page, botao: number, valor: boolean): Promise<void> {
  await page.evaluate(
    ([b, v]) => {
      const pad = (
        window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }
      ).__pad;
      pad.buttons[b]!.pressed = v;
      pad.buttons[b]!.value = v ? 1 : 0;
    },
    [botao, valor] as const,
  );
}

/** Aperta e solta (com folga para a tela ver os dois quadros). */
async function apertar(page: Page, botao: number): Promise<void> {
  await segurar(page, botao, true);
  await page.waitForTimeout(150);
  await segurar(page, botao, false);
  await page.waitForTimeout(250);
}

async function analogico(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    ([ax, ay]) => {
      const pad = (window as unknown as { __pad: { axes: number[] } }).__pad;
      pad.axes[0] = ax;
      pad.axes[1] = ay;
    },
    [x, y] as const,
  );
}

test('na rua: o analógico anda, o RT golpeia e Start pausa; B volta', async ({ page }) => {
  const erros = await comControle(page);
  await page.goto('/?semente=3&zoom=1.1');
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  const inicio = (await est(page)).jogador;
  // Segura o analógico até a personagem andar (sem GPU, a simulação roda devagar).
  await analogico(page, 1, 0);
  await expect
    .poll(
      async () => {
        const j = (await est(page)).jogador;
        return Math.hypot(j.x - inicio.x, j.y - inicio.y);
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0.8);
  await analogico(page, 0, 0);
  const ataques = (await est(page)).ataques;
  await apertar(page, BOTAO.RT);
  await expect.poll(async () => (await est(page)).ataques).toBeGreaterThan(ataques);
  await page.screenshot({ path: 'test-results/screenshots/controle-rua.png' });

  await apertar(page, BOTAO.START);
  await expect.poll(async () => (await est(page)).pausa).not.toBeNull();
  await expect.poll(async () => (await ctl(page)).foco).not.toBeNull();
  const antes = (await ctl(page)).foco!;
  await apertar(page, BOTAO.BAIXO);
  await expect.poll(async () => (await ctl(page)).foco?.y).toBeGreaterThan(antes.y);
  await page.screenshot({ path: 'test-results/screenshots/controle-pausa.png' });
  await apertar(page, BOTAO.B);
  await expect.poll(async () => (await est(page)).pausa).toBeNull();
  expect(erros).toEqual([]);
});

test('no título: o foco aparece num botão e A aperta', async ({ page }) => {
  const erros = await comControle(page);
  await page.goto('/');
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  await expect.poll(async () => (await ctl(page)).tela).toBe('CenaTitulo');
  await expect.poll(async () => (await ctl(page)).foco).not.toBeNull();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/controle-titulo.png' });
  await apertar(page, BOTAO.A);
  // O botão apertado leva para a escolha da fantasia ou para outra tela do título.
  await expect
    .poll(async () => {
      const e = await est(page);
      const c = await ctl(page);
      return e.tela !== 'titulo' || c.tela !== 'CenaTitulo';
    })
    .toBe(true);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/screenshots/controle-titulo-depois.png' });
  expect(erros).toEqual([]);
});

test('no controle, a poção (área) cai sozinha no inimigo perto, sem apontar', async ({ page }) => {
  const erros = await comControle(page);
  await page.goto('/?modo=treino');
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  const boneco = await page.evaluate(
    () =>
      (window.__portaAPorta as unknown as { bonecos: (Ponto & { coragem: number })[] }).bonecos[0]!,
  );
  // Ao lado do boneco, olhando para o outro lado: a mira antiga cairia longe dele.
  await page.evaluate(
    ([x, y]) =>
      (
        window.__portaAPorta as unknown as { levarJogador: (x: number, y: number) => void }
      ).levarJogador(x, y),
    [boneco.x + 3, boneco.y] as const,
  );
  await analogico(page, 0.6, 0);
  await page.waitForTimeout(300);
  await analogico(page, 0, 0);
  // Y lança o W da ficha (a poção), ao soltar.
  await apertar(page, 3);
  await page.waitForFunction(
    () => {
      const e = window.__portaAPorta as unknown as {
        areas: number;
        bonecos: { coragem: number }[];
      };
      return e.areas >= 1 && e.bonecos[0]!.coragem < 500;
    },
    undefined,
    { timeout: 60_000 },
  );
  await page.screenshot({ path: 'test-results/screenshots/controle-mira-automatica.png' });
  expect(erros).toEqual([]);
});
