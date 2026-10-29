import { expect, test, type Page } from '@playwright/test';

// Passo 9 do mundo vivo: o fim da rua é uma Encruzilhada (um ramal por rota, cada um com portão e
// arco) e a passagem para o próximo mapa é animada (ela segue andando e a tela fecha num círculo).

interface Ret {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
interface Estado {
  pronta: boolean;
  portaoAberto: boolean;
  saidas: Ret[];
  passagem: 'saindo' | 'entrando' | null;
  fim?: string;
  jogador: { x: number; y: number };
  imortal: () => void;
  derrubarPostes: () => void;
  levarJogador: (x: number, y: number) => void;
  andarAte: (x: number, y: number) => void;
}

const est = (page: Page) => page.evaluate(() => window.__portaAPorta as unknown as Estado);

async function levar(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    ([px, py]) => (window.__portaAPorta as unknown as Estado).levarJogador(px, py),
    [x, y] as const,
  );
  // A câmera segue com atraso: espera ela chegar.
  await page.waitForTimeout(2500);
}

test('a Encruzilhada tem um ramal por rota e a passagem fecha e abre a tela', async ({ page }) => {
  test.slow();
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto('/?semente=3&zoom=0.8');
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  await page.evaluate(() => {
    const e = window.__portaAPorta as unknown as Estado;
    e.imortal();
    e.derrubarPostes();
  });
  await page.waitForFunction(() => (window.__portaAPorta as unknown as Estado).portaoAberto);
  // Guarda, a cada quadro, a fase da passagem e onde ela está. Por quadro e não por timer: sem GPU
  // e com vários workers o jogo cai para menos de 1 quadro/s, os quadros viram tarefas longas
  // coladas umas nas outras e um setInterval pode não rodar entre dois deles (a entrada dura menos
  // de um segundo, poucos quadros).
  await page.evaluate(() => {
    const w = window as unknown as { __passagens: string[]; __y: number[] };
    w.__passagens = [];
    w.__y = [];
    const registrar = () => {
      const e = window.__portaAPorta as unknown as Estado | undefined;
      const p = e?.passagem;
      if (p && w.__passagens.at(-1) !== p) w.__passagens.push(p);
      // Onde ela estava no último quadro antes da saída e em cada quadro da saída.
      if (!p && w.__passagens.length === 0 && e) w.__y = [e.jogador.y];
      if (p === 'saindo') w.__y.push(e!.jogador.y);
      requestAnimationFrame(registrar);
    };
    requestAnimationFrame(registrar);
  });
  const { saidas } = await est(page);
  expect(saidas.length).toBeGreaterThanOrEqual(2);
  // Ramais separados por um quarteirão, não metades da mesma pista.
  expect(saidas[1]!.x0 - saidas[0]!.x1).toBeGreaterThan(4);
  const meio = (saidas[0]!.x0 + saidas[saidas.length - 1]!.x1) / 2;
  await levar(page, meio, saidas[0]!.y1 + 13);
  await page.screenshot({ path: 'test-results/screenshots/encruzilhada.png' });
  // Pelo ramal da esquerda: passa o portão e chega na saída.
  const s = saidas[0]!;
  const x = (s.x0 + s.x1) / 2;
  await levar(page, x, s.y1 + 2.5);
  await page.screenshot({ path: 'test-results/screenshots/encruzilhada-portao.png' });
  await page.evaluate(([px, py]) => (window.__portaAPorta as unknown as Estado).andarAte(px, py), [
    x,
    s.y1 - 1,
  ] as const);
  await page.waitForFunction(
    () => (window.__portaAPorta as unknown as Estado).passagem === 'saindo',
  );
  // Ela continua andando sozinha para o norte enquanto a tela fecha (a foto, quando dá tempo).
  const antes = (await est(page)).jogador.y;
  for (;;) {
    const e = await page.evaluate(() => {
      const x = window.__portaAPorta as unknown as Estado;
      return { passagem: x.passagem, y: x.jogador.y };
    });
    if (e.passagem !== 'saindo') break;
    if (antes - e.y > 1.2) {
      await page.screenshot({ path: 'test-results/screenshots/passagem-fechando.png' });
      break;
    }
    await page.waitForTimeout(50);
  }
  // O mapa seguinte abre com ela entrando, e depois o controle volta. Montar o mapa novo leva uns
  // 10 s com 8 workers sem GPU (e menos de 1 s sozinho).
  await page.waitForFunction(
    () => (window as unknown as { __passagens: string[] }).__passagens.includes('entrando'),
    undefined,
    { timeout: 60_000 },
  );
  // A saída dura 1,5 s de relógio, mas a simulação só anda alguns ticks por quadro: com quadros
  // de mais de 1,5 s ela cabe num quadro só e anda pouco, então vale andar para o norte, não uma
  // distância fixa.
  const ys = await page.evaluate(() => (window as unknown as { __y: number[] }).__y);
  expect(ys.length).toBeGreaterThanOrEqual(2);
  expect(Math.min(...ys.slice(1))).toBeLessThan(ys[0]!);
  await page.screenshot({ path: 'test-results/screenshots/passagem-abrindo.png' });
  await page.waitForFunction(() => (window.__portaAPorta as unknown as Estado).passagem === null);
  expect(
    await page.evaluate(() => (window as unknown as { __passagens: string[] }).__passagens),
  ).toEqual(['saindo', 'entrando']);
  expect(erros).toEqual([]);
});
