import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

// Teclas físicas de content/controles.json (estilo Minecraft Dungeons): cada habilidade da ficha
// (Q, W, E, R) fica numa tecla ou no botão direito do mouse.
const controles = JSON.parse(readFileSync('content/controles.json', 'utf-8')) as {
  habilidades: Record<string, string>;
  rolar: string;
  lanterna: string;
};

const NOMES: Record<string, string> = { SPACE: 'Space', SHIFT: 'Shift' };
const tecla = (nome: string) => NOMES[nome] ?? nome.toLowerCase();
const doMouse = (slot: string) => controles.habilidades[slot] === 'BOTAO_DIREITO';

/** Segura a habilidade do slot (mostra a mira no chão). */
export async function segurarHabilidade(page: Page, slot: string): Promise<void> {
  if (doMouse(slot)) await page.mouse.down({ button: 'right' });
  else await page.keyboard.down(tecla(controles.habilidades[slot]!));
}

/** Solta a habilidade do slot (lança, no lançamento rápido). */
export async function soltarHabilidade(page: Page, slot: string): Promise<void> {
  if (doMouse(slot)) await page.mouse.up({ button: 'right' });
  else await page.keyboard.up(tecla(controles.habilidades[slot]!));
}

/** Aperta e solta a habilidade do slot. */
export async function lancarHabilidade(page: Page, slot: string): Promise<void> {
  await segurarHabilidade(page, slot);
  await soltarHabilidade(page, slot);
}

export const teclaRolar = () => tecla(controles.rolar);
export const teclaLanterna = () => tecla(controles.lanterna);

/** Põe o mouse no meio do jogo: o botão direito só conta sobre o canvas. */
export async function mouseNoJogo(page: Page): Promise<void> {
  const caixa = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
}
