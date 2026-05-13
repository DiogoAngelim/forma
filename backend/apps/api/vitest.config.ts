import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      DATABASE_URL: 'sqlite:test.db'
    },
    globalSetup: './test/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/server.ts',
        'src/db/**',
        'src/http/**',
        'src/storage/**',
        'src/pipeline/**'
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100
      }
    }
  },
  resolve: {
    alias: {
      '@forma/shared': new URL('../../packages/shared/src/index.ts', import.meta.url).pathname,
      '@forma/gutenberg-generator': new URL('../../packages/gutenberg-generator/src/index.ts', import.meta.url).pathname,
      '@forma/analysis-engine': new URL('../../packages/analysis-engine/src/index.ts', import.meta.url).pathname
    }
  }
});
