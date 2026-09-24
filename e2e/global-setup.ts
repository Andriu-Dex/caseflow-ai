import { execSync } from 'node:child_process';
import { Client } from 'pg';
import { E2E_DATABASE_URL } from '../playwright.config';

// Prepares the same isolated Postgres test database the backend integration
// suite uses (never the developer's own `caseflow` database), then seeds the
// one workspace the current no-auth MVP needs — mirrors
// scripts/seed-development.mjs, but targets the test database explicitly
// rather than relying on that script's DATABASE_URL-only convention.
export default async function globalSetup(): Promise<void> {
  execSync('npx pnpm@11.27.0 run db:test:prepare', { stdio: 'inherit' });
  execSync('npx pnpm@11.27.0 run db:test:migrate', { stdio: 'inherit' });

  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      'INSERT INTO workspaces (slug, name) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING',
      ['e2e-workspace', 'E2E Workspace'],
    );
  } finally {
    await client.end();
  }
}
