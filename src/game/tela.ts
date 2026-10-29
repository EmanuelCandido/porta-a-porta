import type * as Phaser from 'phaser';
import { visual } from '../sim/content';

// Tela inteira, sem bordas (PLANO_MUNDO_VIVO.md, frente 7): a altura lógica é sempre a mesma e a
// largura acompanha a proporção da janela, dentro de limites; o Phaser escala para preencher.

/** Largura lógica para uma janela de `largura` × `altura` px (a altura lógica é fixa). */
export function larguraParaJanela(largura: number, altura: number): number {
  const t = visual.tela;
  if (largura <= 0 || altura <= 0) return t.largura;
  const l = Math.round((t.altura * largura) / altura);
  return Math.max(t.larguraMin, Math.min(t.larguraMax, l));
}

/** O tamanho lógico da tela agora (muda quando a janela muda de proporção). */
export function telaDe(cena: Phaser.Scene): { largura: number; altura: number } {
  return { largura: cena.scale.width, altura: cena.scale.height };
}
