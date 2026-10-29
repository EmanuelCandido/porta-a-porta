import { defineConfig, devices } from '@playwright/test';

const PORTA = 4173;

const navegador = {
  ...devices['Desktop Chrome'],
  viewport: { width: 1280, height: 720 },
  // Ambientes com um Chromium já instalado (ex.: sessões na nuvem) apontam para ele aqui.
  launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : undefined,
};

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/playwright',
  // Folgado: sem GPU (CI, contêineres) o jogo roda a poucos quadros por segundo.
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORTA}`,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /ganchos\.spec\.ts/,
      use: navegador,
    },
    {
      // Medidas de tempo (o Retorno): rodam sozinhas, depois de todos os outros testes, para a
      // carga dos testes em paralelo não entrar na conta.
      name: 'medidas',
      testMatch: /ganchos\.spec\.ts/,
      dependencies: ['chromium'],
      use: navegador,
    },
  ],
  webServer: {
    // Testa o build de verdade, o mesmo que vai para o itch.io.
    command: `npm run build && npx vite preview --port ${PORTA} --strictPort`,
    port: PORTA,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
