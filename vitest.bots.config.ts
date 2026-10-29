import { defineConfig } from 'vitest/config';

// `npm run bots`: os bots jogam runs inteiras em Node (um arquivo por perfil, em paralelo) e o
// relatório sai em docs/BALANCO.md. Fica fora do `npm test` porque leva minutos.
export default defineConfig({
  test: {
    include: ['tests/bots/**/*.bots.ts'],
    environment: 'node',
    testTimeout: 3 * 60 * 60 * 1000,
    globalSetup: ['tests/bots/relatorio.global.ts'],
  },
});
