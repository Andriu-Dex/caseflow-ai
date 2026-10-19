import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['**/*.spec.tsx', '**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/.next/**'],
    setupFiles: ['./vitest.setup.pointer-event.ts', './vitest.setup.ts'],
    // Form tests type through whole dialogs: about 1-2 s each alone, but more
    // than the default 5 s when the whole suite runs on a busy machine.
    testTimeout: 15_000,
  },
});
