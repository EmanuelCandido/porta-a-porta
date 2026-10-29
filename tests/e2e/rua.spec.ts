import { expect, test, type Page } from '@playwright/test';
import { lancarHabilidade, mouseNoJogo, teclaLanterna } from './teclas';

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

/** Espera a câmera chegar ao jogador (no navegador de teste, sem placa de vídeo, ela demora). */
async function esperarCamera(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const e = window.__portaAPorta as unknown as {
        jogador: Ponto;
        naTela: (x: number, y: number) => Ponto;
      };
      const f = e.naTela(e.jogador.x, e.jogador.y);
      return f.x > 0.3 && f.x < 0.7 && f.y > 0.3 && f.y < 0.7;
    },
    undefined,
    { timeout: 60_000 },
  );
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

test('a rua gerada abre com os 2 Postes Corrompidos e sem erros', async ({ page }) => {
  const erros = await abrir(page, '/?semente=3');
  expect(await ler<string>(page, 'e.modo')).toBe('run');
  expect(await ler<string>(page, 'e.mapa')).toBe('rua');
  const inimigos = await ler<{ especie: string }[]>(page, 'e.inimigos');
  expect(inimigos.filter((i) => i.especie === 'poste_corrompido')).toHaveLength(2);
  await page.screenshot({ path: 'test-results/screenshots/rua-gerada.png' });
  expect(erros).toEqual([]);
});

test('a primeira onda vem dos bueiros, e a Vassoura acerta uma pestinha', async ({ page }) => {
  await abrir(page, '/?semente=3&avancar=16');
  await esperar(page, "e.inimigos.some((i) => i.especie === 'pestinha_lencol')");
  await mouseNoJogo(page);
  await page.keyboard.down('Control');
  await lancarHabilidade(page, 'Q');
  await page.keyboard.up('Control');
  await esperar(page, 'e.postos.Q === 1');
  // A pestinha mais perto; a Bruxinha vai para 3 tiles dela (a onda nasce longe no mapa grande).
  const j = await ler<Ponto>(page, 'e.jogador');
  const alvo = (await ler<(Ponto & { especie: string })[]>(page, 'e.inimigos'))
    .filter((i) => i.especie === 'pestinha_lencol')
    .sort((a, b) => Math.hypot(a.x - j.x, a.y - j.y) - Math.hypot(b.x - j.x, b.y - j.y))[0]!;
  await page.evaluate(
    ([x, y]) =>
      (
        window.__portaAPorta as unknown as { levarJogador: (x: number, y: number) => void }
      ).levarJogador(x, y),
    [alvo.x - 3, alvo.y] as const,
  );
  await esperarCamera(page);
  const perto = (await ler<(Ponto & { especie: string })[]>(page, 'e.inimigos'))
    .filter((i) => i.especie === 'pestinha_lencol')
    .sort(
      (a, b) => Math.hypot(a.x - alvo.x, a.y - alvo.y) - Math.hypot(b.x - alvo.x, b.y - alvo.y),
    )[0]!;
  await mirar(page, perto);
  await lancarHabilidade(page, 'Q');
  await esperar(page, "e.lancou.includes('Q')");
  await esperar(page, 'e.danos >= 1');
  await page.screenshot({ path: 'test-results/screenshots/rua-onda.png' });
});

test('Shift pulsa a lanterna (gasta 25 de Luz) e 1 joga a Doce-isca', async ({ page }) => {
  await abrir(page, '/?semente=3');
  await page.keyboard.press(teclaLanterna());
  await esperar(page, 'e.luz <= 76');
  const j = await ler<Ponto>(page, 'e.jogador');
  await mirar(page, { x: j.x, y: j.y - 3 });
  await page.keyboard.press('1');
  await esperar(page, 'e.inimigos !== undefined && document !== null');
  await page.screenshot({ path: 'test-results/screenshots/rua-lanterna.png' });
});

test('derrubados os Postes, o portão abre e a saída vence a rua', async ({ page }) => {
  // Atravessar a rua andando leva 15 s sozinho, mas minutos com os outros testes em paralelo.
  test.slow();
  await abrir(page, '/?semente=3');
  // Sob carga o navegador de teste anda devagar e as ondas alcançam o jogador: aqui só importa
  // a saída, então ele não cai.
  await page.evaluate(() => (window.__portaAPorta as unknown as { imortal: () => void }).imortal());
  await page.evaluate(() =>
    (window.__portaAPorta as unknown as { derrubarPostes: () => void }).derrubarPostes(),
  );
  await esperar(page, 'e.portaoAberto === true');
  // A saída de cada rota é um ramal da Encruzilhada: vai pelo da esquerda.
  const saida = (await ler<{ x0: number; x1: number; y1: number }[]>(page, 'e.saidas'))[0]!;
  // Começa logo depois da linha do portão (sob carga o navegador de teste anda bem devagar) e
  // anda uma vez até a saída do ramal.
  const x = (saida.x0 + saida.x1) / 2;
  await page.evaluate(
    ([px, py]) =>
      (
        window.__portaAPorta as unknown as { levarJogador: (x: number, y: number) => void }
      ).levarJogador(px, py),
    [x, saida.y1 + 0.8] as const,
  );
  await esperarCamera(page);
  await page.screenshot({ path: 'test-results/screenshots/rua-portoes.png' });
  await page.evaluate(
    ([px, py]) =>
      (window.__portaAPorta as unknown as { andarAte: (x: number, y: number) => void }).andarAte(
        px,
        py,
      ),
    [x, saida.y1 - 1] as const,
  );
  await esperar(page, "e.fim === 'vitoria'");
  await page.screenshot({ path: 'test-results/screenshots/rua-vencida.png' });
});

test('F na campainha abre um minijogo fácil e, acertando, dá doces', async ({ page }) => {
  const erros = await abrir(page, '/?semente=3');
  const c = (await ler<(Ponto & { tocada: boolean })[]>(page, 'e.campainhas'))[0]!;
  await page.evaluate(
    ([x, y]) =>
      (
        window.__portaAPorta as unknown as { levarJogador: (x: number, y: number) => void }
      ).levarJogador(x, y),
    [c.x, c.y] as const,
  );
  await page.evaluate(() =>
    (window.__portaAPorta as unknown as { afastarInimigos: (r: number) => void }).afastarInimigos(
      8,
    ),
  );
  await esperarCamera(page);
  const antes = await ler<number>(page, 'e.doces');
  await page.keyboard.press('f');
  await esperar(page, 'e.janela === true');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/screenshots/campainha-minijogo.png' });
  await page.evaluate(() =>
    (
      window.__portaAPorta as unknown as { acertarMinijogos: (s: boolean) => void }
    ).acertarMinijogos(true),
  );
  await esperar(page, 'e.janela === false');
  await esperar(page, `e.doces > ${antes}`);
  expect(erros).toEqual([]);
});

test('doce ou travessura: G abre um minijogo difícil; errando, as pestinhas saem da porta', async ({
  page,
}) => {
  const erros = await abrir(page, '/?semente=3');
  const c = (await ler<(Ponto & { tocada: boolean })[]>(page, 'e.campainhas'))[0]!;
  await page.evaluate(
    ([x, y]) =>
      (
        window.__portaAPorta as unknown as { levarJogador: (x: number, y: number) => void }
      ).levarJogador(x, y),
    [c.x, c.y] as const,
  );
  await esperarCamera(page);
  const antes = (await ler<{ especie: string }[]>(page, 'e.inimigos')).filter(
    (i) => i.especie === 'pestinha_lencol',
  ).length;
  await page.keyboard.press('g');
  await esperar(page, 'e.campainhas[0].tocada === true');
  await esperar(page, 'e.janela === true');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/screenshots/travessura-minijogo.png' });
  // Sem responder, o minijogo acaba em erro e a travessura sai da porta.
  await esperar(page, 'e.janela === false');
  await esperar(
    page,
    `e.inimigos.filter((i) => i.especie === 'pestinha_lencol').length >= ${antes + 3}`,
  );
  await page.screenshot({ path: 'test-results/screenshots/travessura.png' });
  expect(erros).toEqual([]);
});
