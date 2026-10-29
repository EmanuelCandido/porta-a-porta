import { defineConfig } from 'vitest/config';
import { ajustesDoModoDev } from './vite.ajustes.ts';

export default defineConfig({
  // Caminhos relativos: o build roda igual no itch.io e no GitHub Pages.
  base: './',
  // Modo desenvolvedor (F1): os ajustes do painel vão direto para o content/*.json.
  plugins: [ajustesDoModoDev()],
  build: {
    target: 'es2022',
    // O Phaser sozinho passa de 1 MB minificado; o limite real é o build abaixo de 10 MB.
    chunkSizeWarningLimit: 2048,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // As simulações longas disputavam CPU com dezenas de arquivos e estouravam o prazo de 5 s.
    maxWorkers: 2,
  },
});
