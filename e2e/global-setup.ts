import { execSync } from 'node:child_process';
import { request } from '@playwright/test';
import { API_BASE_URL, E2E_USER } from './auth';

// Prepares the same isolated Postgres test database the backend integration
// suite uses (never the developer's own `caseflow` database), then creates the
// one user both scenarios sign in as, through the real API.
export default async function globalSetup(): Promise<void> {
  execSync('npx pnpm@11.27.0 run db:test:prepare', { stdio: 'inherit' });
  execSync('npx pnpm@11.27.0 run db:test:migrate', { stdio: 'inherit' });

  const api = await request.newContext({ baseURL: API_BASE_URL });
  const registered = await api.post('/auth/register', { data: E2E_USER });
  // 409: the user already exists from an earlier local run on the same database.
  if (!registered.ok() && registered.status() !== 409)
    throw new Error(`E2E user registration failed (${registered.status()}).`);
  await api.dispose();
}
