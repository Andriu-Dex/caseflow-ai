import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

const fromRoot = (relativePath: string) => fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: {
    // Resolve workspace packages from source so tests never depend on a prior build.
    alias: {
      '@caseflow-ai/contracts': fromRoot('./packages/contracts/src/index.ts'),
      '@caseflow-ai/domain': fromRoot('./packages/domain/src/index.ts'),
      '@caseflow-ai/ai': fromRoot('./packages/ai/src/index.ts'),
      '@caseflow-ai/config': fromRoot('./packages/config/src/index.ts'),
      '@caseflow-ai/integrations': fromRoot('./packages/integrations/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['apps/**/*.spec.ts', 'packages/**/*.spec.ts', 'tests/unit/**/*.spec.ts'],
    // apps/web has its own vitest.config.mts (jsdom environment, React
    // Testing Library) run separately via `pnpm --filter @caseflow-ai/web test`.
    exclude: [
      '**/*.integration.spec.ts',
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      'apps/web/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      // Global gate (Increment 1A.1). Do not lower to make a run pass.
      thresholds: { lines: 70, statements: 70, branches: 70, functions: 70 },
      include: ['apps/api/src/**/*.ts', 'apps/worker/src/**/*.ts', 'packages/*/src/**/*.ts'],
      exclude: [
        '**/*.spec.ts',
        '**/*.integration.spec.ts',
        '**/*.d.ts',
        '**/generated/**',
        '**/dist/**',
        '**/node_modules/**',
      ],
    },
  },
});
