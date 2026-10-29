import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// G10, parte 2: o Retorno (GAMEPLAY.md, "Metas de teste dos ganchos") é de tela, então é medido
// aqui: da derrota até a nova run estar jogável, com o jogador apertando Enter assim que pode.

const ler = (arquivo: string) => JSON.parse(readFileSync(`content/${arquivo}`, 'utf8'));
const { retornoMaxS } = ler('bots.json') as { retornoMaxS: number };
const { pausaFimMs, botaoDoFimMs } = (
  ler('visual.json') as { interface: { pausaFimMs: number; botaoDoFimMs: number } }
).interface;

test('da derrota à nova run leva menos que a meta do Retorno', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto('/?semente=3');
  await page.waitForFunction(() => window.__portaAPorta?.pronta === true);
  // Como no meio de uma rua: o mapa já terminou de carregar quando a Coragem acaba.
  await page.waitForTimeout(3000);
  const inicio = Date.now();
  await page.evaluate(() =>
    (window.__portaAPorta as unknown as { derrotar: () => void }).derrotar(),
  );
  await page.waitForFunction(
    () => (window.__portaAPorta as { fimDaRun?: { botoes?: boolean } }).fimDaRun?.botoes === true,
    undefined,
    { timeout: 60_000, polling: 50 },
  );
  const botoes = Date.now();
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => {
      const e = window.__portaAPorta as { fimDaRun?: unknown; mapa?: string; pronta?: boolean };
      return !e.fimDaRun && e.mapa === 'rua' && e.pronta === true;
    },
    undefined,
    { timeout: 60_000, polling: 50 },
  );
  const fim = Date.now();
  // As pausas são de projeto (no navegador de teste, sem placa de vídeo, o relógio da cena anda
  // mais devagar que o real); o tempo de carregar a nova run é medido de verdade.
  const pausasS = (pausaFimMs + botaoDoFimMs) / 1000;
  const cargaS = (fim - botoes) / 1000;
  console.log(
    `Retorno: pausas ${pausasS.toFixed(1)} s + carga ${cargaS.toFixed(1)} s ` +
      `(no relógio da parede deste navegador: ${((fim - inicio) / 1000).toFixed(1)} s)`,
  );
  expect(pausasS + cargaS).toBeLessThan(retornoMaxS);
  expect(erros).toEqual([]);
});
