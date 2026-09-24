import { defineConfig, devices } from '@playwright/test';

// Browser E2E for the professor-demo flows (requirements.md / instruction.md
// "Playwright E2E — mandatory"). Runs entirely against local infrastructure:
// an isolated Postgres test database, no AI provider, no public renderer.
// Never a public/hosted service.
const API_PORT = 3001;
const WEB_PORT = 3000;
export const E2E_DATABASE_URL =
  process.env.DATABASE_TEST_URL ??
  'postgresql://caseflow:caseflow-local-dev@localhost:5432/caseflow_test?schema=public';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  // Keep GitHub annotations for failures and a list reporter so successful CI
  // logs retain explicit evidence for both mandatory scenario files.
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // `npx pnpm@<version>` (matching package.json's packageManager) rather than
  // a bare `pnpm` call: works whether or not pnpm happens to be on PATH
  // directly, in both local dev and CI.
  webServer: [
    {
      command:
        'npx pnpm@11.27.0 --filter @caseflow-ai/api run build && npx pnpm@11.27.0 --filter @caseflow-ai/api run start',
      url: `http://localhost:${API_PORT}/health/live`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: E2E_DATABASE_URL,
        API_PORT: String(API_PORT),
        // Scenario A explicitly proves CASEflow works without AI; Scenario B
        // uses only manual (non-AI) creation too, so this stays disabled for
        // both — never a real or public AI provider.
        AI_PROVIDER: 'disabled',
        // Scenario B needs the real local diagram pipeline (structured
        // artifact → DiagramEngine → Kroki → sanitizeDiagramSvg → API →
        // TrustedSvg); Scenario A never touches diagrams, so sharing one
        // server with this enabled is harmless for it.
        DIAGRAM_RENDERER: 'kroki',
        KROKI_BASE_URL: 'http://localhost:8000',
        WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      command:
        'npx pnpm@11.27.0 --filter @caseflow-ai/web run build && npx pnpm@11.27.0 --filter @caseflow-ai/web run start',
      url: `http://localhost:${WEB_PORT}`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}`,
      },
    },
  ],
});
