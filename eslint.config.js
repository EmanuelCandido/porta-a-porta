import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  // `.claude` guarda os worktrees de outras sessões: cada um se verifica sozinho.
  {
    ignores: [
      'dist',
      'entregas',
      'coverage',
      'test-results',
      'playwright-report',
      'node_modules',
      '.claude',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // Regra 1 de docs/ARQUITETURA.md: só o gerador com semente.
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Math.random é proibido: use o gerador com semente (mulberry32).',
        },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Com noUncheckedIndexedAccess, `lista[i]!` em índices já conferidos é o jeito direto.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // Regra 1 de docs/ARQUITETURA.md: a simulação nunca importa o Phaser nem o desenho.
    files: ['src/sim/**/*.ts', 'src/bots/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'phaser', message: 'src/sim nunca importa o Phaser.' }],
          patterns: [
            {
              group: ['phaser/*', '**/render/**', '**/game/**'],
              message: 'src/sim não depende do desenho nem do Phaser.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
