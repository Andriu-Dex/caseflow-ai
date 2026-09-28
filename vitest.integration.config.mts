import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

const fromRoot = (relativePath: string) => fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: {
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
    include: ['**/*.integration.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
    // dotenv loads .env; the second setup file then re-points DATABASE_URL at
    // the test database so nothing in an integration run can reach `caseflow`.
    setupFiles: ['dotenv/config', './apps/api/test/integration/support/use-test-database.ts'],
    // Integration files share one test database and reset it in beforeAll.
    fileParallelism: false,
  },
});
