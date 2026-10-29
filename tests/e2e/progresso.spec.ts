import { expect, test, type Page } from '@playwright/test';

// Tarefa 13: save, Álbum de Fantasias, Lua Cheia, semente da noite, cores e A Moradora do 13.

const CHAVE = 'porta-a-porta:save';

interface Ponto {
  x: number;
  y: number;
}

/** Um save de quem já jogou: doces guardados, vitória e Lua Cheia liberada. */
function saveDeVeterano(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    versao: 1,
    docesGuardados: 900,
    campeoes: ['fantasma', 'esqueleto', 'vampirinho'],
    paginas: [],
    itens: [],
    bonus: { coragem: 0, doces: 0, reroll: 0 },
    cores: ['bruxinha_pantano'],
    corEscolhida: {},
    luaLiberada: 5,
    luaEscolhida: 0,
    ultimoCampeao: 'fantasma',
    runs: 6,
    vitorias: 1,
    maisChefes: 3,
    moradoraVencida: false,
    noites: {},
    ...extra,
  });
}

async function comSave(page: Page, texto: string): Promise<void> {
  // Só na primeira carga: depois o jogo grava o próprio save e o reload lê o dele.
  await page.addInitScript(
    ([chave, valor]) => {
      if (!sessionStorage.getItem('semeado')) {
        localStorage.setItem(chave, valor);
        sessionStorage.setItem('semeado', '1');
      }
    },
    [CHAVE, texto] as const,
  );
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

async function esperar(page: Page, condicao: string, timeout = 90_000): Promise<void> {
  await page.waitForFunction(
    `(() => { const e = window.__portaAPorta; return ${condicao}; })()`,
    undefined,
    { timeout },
  );
}

async function save(page: Page): Promise<Record<string, unknown>> {
  return (await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k) ?? 'null'),
    CHAVE,
  )) as Record<string, unknown>;
}

test('o fim de uma run começada no título grava o progresso no localStorage', async ({ page }) => {
  const erros = await abrir(page, '/');
  expect(await save(page)).toBeNull();
  await page.keyboard.press('Enter');
  await esperar(page, "e.tela === 'campeao'");
  await page.keyboard.press('Enter');
  await esperar(page, "e.cena === 'CenaRua' && e.mapa === 'rua'");
  await page.evaluate(() =>
    (window.__portaAPorta as unknown as { derrotar: () => void }).derrotar(),
  );
  await esperar(page, 'e.fimDaRun && e.fimDaRun.botoes === true');
  expect(await ler<unknown>(page, 'e.fimDaRun.novidades')).not.toBeNull();
  const s = await save(page);
  expect(s['runs']).toBe(1);
  expect(s['ultimoCampeao']).toBe('bruxinha');
  expect(erros).toEqual([]);
});

test('o Álbum compra com Doces Guardados e a compra continua lá depois de recarregar', async ({
  page,
}) => {
  await comSave(page, saveDeVeterano());
  const erros = await abrir(page, '/');
  expect(await ler<number>(page, 'e.docesGuardados')).toBe(900);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/screenshots/titulo-com-progresso.png' });
  await page.keyboard.press('a');
  await esperar(page, "e.cena === 'CenaAlbum'");
  await page.keyboard.press('2');
  await esperar(page, "e.aba === 'Tratos'");
  await page.keyboard.press('Enter');
  await esperar(page, 'e.docesGuardados === 840');
  await page.keyboard.press('4');
  await esperar(page, "e.aba === 'Bônus iniciais'");
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/album-bonus.png' });
  await page.keyboard.press('5');
  await esperar(page, "e.aba === 'Cores'");
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/album-cores.png' });
  expect((await save(page))['paginas']).toEqual(['pagina_luz']);

  await page.reload();
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  expect(await ler<number>(page, 'e.docesGuardados')).toBe(840);
  await page.keyboard.press('a');
  await esperar(page, "e.cena === 'CenaAlbum' && e.aba === 'Fantasias'");
  await page.keyboard.press('2');
  await esperar(page, "e.aba === 'Tratos'");
  expect(await ler<(number | null)[]>(page, 'e.entradas.map((x) => x.preco)')).toEqual([
    null,
    60,
    60,
    70,
    70,
    80,
  ]);
  await page.screenshot({ path: 'test-results/screenshots/album-tratos.png' });
  await page.keyboard.press('Escape');
  await esperar(page, "e.cena === 'CenaTitulo'");
  expect(erros).toEqual([]);
});

test('a escolha da fantasia lembra o último campeão, escolhe a Lua Cheia e a cor', async ({
  page,
}) => {
  await comSave(page, saveDeVeterano());
  const erros = await abrir(page, '/');
  // A Lua Cheia é da run completa (R); o Enter abre a Noite curta, sem Lua.
  await page.keyboard.press('r');
  await esperar(page, "e.tela === 'campeao' && e.modoEscolha === 'run'");
  expect(await ler<string>(page, 'e.escolhida')).toBe('fantasma');
  const livres = await ler<string[]>(page, 'e.cartas.filter((c) => c.livre).map((c) => c.id)');
  expect(livres).toEqual(['bruxinha', 'fantasma', 'esqueleto', 'vampirinho']);
  for (let k = 0; k < 7; k++) await page.keyboard.press('ArrowUp');
  await esperar(page, 'e.lua === 5');
  await page.keyboard.press('ArrowLeft');
  await esperar(page, "e.escolhida === 'bruxinha'");
  await page.keyboard.press('c');
  await esperar(page, "e.cor === 'bruxinha_pantano'");
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/screenshots/escolha-lua-e-cor.png' });
  await page.keyboard.press('Enter');
  await esperar(page, "e.cena === 'CenaRua' && e.mapa === 'rua'");
  expect(await ler<number>(page, 'e.lua')).toBe(5);
  expect(await ler<number>(page, 'e.matiz')).toBe(118);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/screenshots/bruxa-do-pantano.png' });
  expect(erros).toEqual([]);
});

test('a semente da noite usa a mesma semente para o mesmo dia', async ({ page }) => {
  const erros = await abrir(page, '/');
  await page.keyboard.press('n');
  await esperar(page, "e.tela === 'campeao' && e.modoEscolha === 'noite'");
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/semente-da-noite.png' });
  await page.keyboard.press('Enter');
  await esperar(page, "e.cena === 'CenaRua' && e.mapa === 'rua'");
  const semente = await ler<number>(page, 'e.semente');
  // De novo, em outra página: a mesma semente.
  await abrir(page, '/');
  await page.keyboard.press('n');
  await esperar(page, "e.tela === 'campeao'");
  await page.keyboard.press('Enter');
  await esperar(page, "e.cena === 'CenaRua' && e.mapa === 'rua'");
  expect(await ler<number>(page, 'e.semente')).toBe(semente);
  expect(erros).toEqual([]);
});

test('A Moradora do 13 copia as habilidades e o desenho do campeão', async ({ page }) => {
  const erros = await abrir(page, '/?semente=3&campeao=fantasma&moradora=1&lua=5');
  await esperar(page, "e.chefe && e.chefe.nome === 'A Moradora do 13'");
  await page.evaluate(() => (window.__portaAPorta as unknown as { imortal: () => void }).imortal());
  expect(await ler<string>(page, 'e.moradora')).toBe('duelo');
  const m = await ler<Ponto>(page, 'e.chefePos');
  await page.evaluate(
    ([x, y]) =>
      (
        window.__portaAPorta as unknown as { levarJogador: (x: number, y: number) => void }
      ).levarJogador(x, y),
    [m.x + 3.5, m.y + 1] as const,
  );
  await page.waitForTimeout(3500);
  await page.screenshot({ path: 'test-results/screenshots/moradora-do-13.png' });
  expect(erros).toEqual([]);
});

// Tarefa G9: Diário, maestria, passiva alternativa, começo alternativo, desafio e a tela do fim.

test('o Diário do Bairro mostra o visto, as silhuetas e a maestria', async ({ page }) => {
  await comSave(
    page,
    saveDeVeterano({
      maestria: { bruxinha: 5600, fantasma: 1300 },
      diario: {
        tratos: ['eco', 'vagalume', 'mira_torta', 'chave_da_cidade'],
        conjuntos: ['eco:2'],
        encontros: ['gato_preto', 'janela_vermelha'],
        condicoes: ['noite_comum', 'neblina'],
        inimigos: ['pestinha_lencol', 'poste_corrompido', 'sindico_zeloso'],
      },
      paginasFechadas: [],
    }),
  );
  const erros = await abrir(page, '/');
  await page.keyboard.press('d');
  await esperar(page, "e.cena === 'CenaDiario' && e.aba === 'fantasias'");
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/screenshots/diario-maestria.png' });
  await page.keyboard.press('2');
  await esperar(page, "e.aba === 'tratos'");
  expect(await ler<number>(page, 'e.vistos')).toBe(4);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/diario-tratos.png' });
  await page.keyboard.press('5');
  await esperar(page, "e.aba === 'inimigos'");
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/diario-inimigos.png' });
  await page.keyboard.press('Escape');
  await esperar(page, "e.cena === 'CenaTitulo'");
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/screenshots/titulo-g9.png' });
  expect(erros).toEqual([]);
});

test('maestria 4 troca a passiva; a 3 começa a run com tratos sem preço', async ({ page }) => {
  await comSave(page, saveDeVeterano({ maestria: { bruxinha: 3700 }, ultimoCampeao: 'bruxinha' }));
  const erros = await abrir(page, '/');
  await page.keyboard.press('Enter');
  await esperar(page, "e.tela === 'campeao' && e.escolhida === 'bruxinha'");
  await page.keyboard.press('p');
  await esperar(page, 'e.passivaAlternativa === true');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/screenshots/passiva-alternativa.png' });
  await page.keyboard.press('Enter');
  await esperar(page, "e.cena === 'CenaRua' && e.mapa === 'porta'");
  expect(await ler<string>(page, 'e.fase')).toBe('portaAPorta');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/screenshots/comeco-alternativo.png' });
  expect(erros).toEqual([]);
});

test('o desafio da semana começa pela tecla S e a derrota mostra as barras e o objetivo', async ({
  page,
}) => {
  await comSave(page, saveDeVeterano({ maestria: { bruxinha: 900 }, ultimoCampeao: 'bruxinha' }));
  const erros = await abrir(page, '/');
  await page.keyboard.press('s');
  await esperar(page, "e.tela === 'campeao' && e.modoEscolha === 'desafio'");
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/screenshots/desafio-da-semana.png' });
  await page.keyboard.press('Escape');
  await esperar(page, "e.tela === 'titulo'");
  await page.keyboard.press('Enter');
  await esperar(page, "e.tela === 'campeao'");
  await page.keyboard.press('Enter');
  await esperar(page, "e.cena === 'CenaRua' && e.mapa === 'rua'");
  await page.evaluate(() =>
    (window.__portaAPorta as unknown as { derrotar: () => void }).derrotar(),
  );
  await esperar(page, 'e.fimDaRun && e.fimDaRun.botoes === true');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/screenshots/fim-da-run-g9.png' });
  const s = await save(page);
  expect((s['diario'] as Record<string, string[]>)['condicoes']).toContain('noite_comum');
  expect(erros).toEqual([]);
});
