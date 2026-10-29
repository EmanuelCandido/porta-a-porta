import { expect, test, type Page } from '@playwright/test';
import { lancarHabilidade } from './teclas';

// Tarefa 11: cada fantasia nova na rua de treino, com as 4 habilidades lançadas pelo teclado, e
// na rua de verdade (a interface com o retrato e os ícones dela). Screenshots para conferir.

interface Ponto {
  x: number;
  y: number;
}
interface Boneco extends Ponto {
  coragem: number;
}
interface Estado {
  naTela: (x: number, y: number) => Ponto;
  recarregarTudo: () => void;
  levarJogador: (x: number, y: number) => void;
}

const CAMPEOES = ['fantasma', 'esqueleto', 'vampirinho'] as const;

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

async function mirar(page: Page, alvo: Ponto): Promise<void> {
  const caixa = (await page.locator('canvas').boundingBox())!;
  const f = await page.evaluate(
    ([x, y]) => (window.__portaAPorta as unknown as Estado).naTela(x, y),
    [alvo.x, alvo.y] as const,
  );
  await page.mouse.move(caixa.x + f.x * caixa.width, caixa.y + f.y * caixa.height);
}

for (const campeao of CAMPEOES) {
  test(`${campeao}: as 4 habilidades na rua de treino`, async ({ page }) => {
    const erros = await abrir(page, `/?modo=treino&campeao=${campeao}`);
    expect(await ler<string>(page, 'e.campeao')).toBe(campeao);
    expect(await ler<Record<string, string>>(page, 'e.habilidades')).toEqual({
      Q: `${campeao}_q`,
      W: `${campeao}_w`,
      E: `${campeao}_e`,
      R: `${campeao}_r`,
    });
    const alvo = await ler<Boneco>(page, 'e.bonecos[0]');
    const cheia = alvo.coragem;
    for (const slot of ['Q', 'W', 'E', 'R']) {
      // Perto do boneco (as de corpo a corpo e as de alvo pedem alcance curto).
      await page.evaluate(
        ([x, y]) => {
          const e = window.__portaAPorta as unknown as Estado;
          e.levarJogador(x, y);
          e.recarregarTudo();
        },
        [alvo.x - 1.6, alvo.y] as const,
      );
      await mirar(page, alvo);
      const antes = (await ler<string[]>(page, 'e.lancou')).length;
      await lancarHabilidade(page, slot);
      await esperar(page, `e.lancou.length > ${antes}`);
      // Dashes e saltos (W do Vampirinho, E do Esqueleto) terminam antes da próxima tecla.
      await esperar(page, 'e.lancando === null && !e.dashando');
    }
    expect(await ler<string[]>(page, 'e.lancou')).toEqual(['Q', 'W', 'E', 'R']);
    await esperar(page, `e.bonecos.some((b) => b.coragem < ${cheia})`);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `test-results/screenshots/campeao-${campeao}-treino.png` });
    expect(erros).toEqual([]);
  });

  test(`${campeao}: a run começa com a interface dele`, async ({ page }) => {
    const erros = await abrir(page, `/?campeao=${campeao}&avancar=20`);
    expect(await ler<string>(page, 'e.campeao')).toBe(campeao);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `test-results/screenshots/campeao-${campeao}-rua.png` });
    expect(erros).toEqual([]);
  });
}
