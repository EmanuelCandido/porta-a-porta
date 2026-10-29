import { expect, test, type Page } from '@playwright/test';

interface Impacto {
  pausaMs: number;
  tremorPx: number;
  escuridao: number;
  zoom: number;
  precoDoTrato: string | null;
}

async function abrir(page: Page, url: string): Promise<string[]> {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.clock.install();
  await page.goto(url);
  await page.waitForFunction(() => window.__portaAPorta?.pronta);
  // Usa o relógio do navegador; a criação das malhas pode atrasar bastante sob carga dos bots.
  const agora = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(agora + 60_000);
  return erros;
}

async function impacto(page: Page): Promise<Impacto> {
  return page.evaluate(() => window.__portaAPorta!.impacto as Impacto);
}

test('crítico amarelo e maior congela os ticks, depois o jogo retoma', async ({ page }) => {
  const erros = await abrir(page, '/?modo=treino&noite=0');
  await page.evaluate(() => {
    const e = window.__portaAPorta!;
    const alvo = (e.bonecos as { x: number; y: number }[])[0]!;
    (e.levarJogador as (x: number, y: number) => void)(alvo.x - 2, alvo.y);
  });
  await page.clock.runFor(1000);
  await page.evaluate(() => (window.__portaAPorta!.acertarCritico as () => void)());
  await page.clock.runFor(16);
  const tick = await page.evaluate(() => window.__portaAPorta!.tick);
  expect((await impacto(page)).pausaMs).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/screenshots/impacto-critico.png' });
  await page.clock.runFor(32);
  expect(await page.evaluate(() => window.__portaAPorta!.tick)).toBe(tick);
  await page.clock.runFor(160);
  expect(await page.evaluate(() => window.__portaAPorta!.tick as number)).toBeGreaterThan(
    tick as number,
  );
  expect(erros).toEqual([]);
});

test('queda do Poste apaga o halo roxo e clareia a rua por um segundo', async ({ page }) => {
  const erros = await abrir(page, '/?semente=3');
  await page.evaluate(() => {
    const e = window.__portaAPorta!;
    (e.imortal as () => void)();
    const poste = (e.inimigos as { especie: string; x: number; y: number }[]).find(
      (i) => i.especie === 'poste_corrompido',
    )!;
    (e.levarJogador as (x: number, y: number) => void)(poste.x - 2, poste.y);
  });
  await page.clock.runFor(1000);
  const antes = (await impacto(page)).escuridao;
  await page.screenshot({ path: 'test-results/screenshots/impacto-poste-antes.png' });
  await page.evaluate(() => (window.__portaAPorta!.derrubarPostes as () => void)());
  await page.clock.runFor(16);
  expect((await impacto(page)).tremorPx).toBe(6);
  expect((await impacto(page)).escuridao).toBeLessThan(antes);
  await page.screenshot({ path: 'test-results/screenshots/impacto-poste-caido.png' });
  await page.clock.runFor(1100);
  expect((await impacto(page)).escuridao).toBeCloseTo(antes);
  expect(await page.evaluate(() => window.__portaAPorta!.postesCaidos)).toBe(2);
  expect(erros).toEqual([]);
});

test('aceitar o trato mostra o preço no bairro e devolve o zoom após um segundo', async ({
  page,
}) => {
  const erros = await abrir(page, '/?semente=3&porta=1');
  await page.evaluate(() => {
    const e = window.__portaAPorta!;
    const porta = e.porta as { casas: { x: number; y: number }[]; ofertas: { casa: number }[] };
    const casa = porta.casas[porta.ofertas[0]!.casa]!;
    (e.levarJogador as (x: number, y: number) => void)(casa.x, casa.y);
  });
  await page.clock.runFor(500);
  await page.keyboard.press('f');
  await page.clock.runFor(32);
  const zoom = (await impacto(page)).zoom;
  await page.keyboard.press('Enter');
  await page.clock.runFor(400);
  expect((await impacto(page)).precoDoTrato).toContain('O preço nas próximas ruas:');
  expect((await impacto(page)).zoom).toBeLessThan(zoom);
  expect(await page.evaluate(() => window.__portaAPorta!.janela)).toBe(false);
  // O preço aparece na hora: a casa de quem vendeu o trato apaga as janelas.
  const naHora = (await page.evaluate(() => window.__portaAPorta!.precoNaHora)) as {
    casa: boolean;
    precos: string[];
  };
  expect(naHora.casa).toBe(true);
  expect(naHora.precos.length).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/screenshots/impacto-trato.png' });
  await page.clock.runFor(700);
  expect((await impacto(page)).zoom).toBeCloseTo(zoom);
  expect((await impacto(page)).precoDoTrato).toBeNull();
  expect(erros).toEqual([]);
});
