// Development-only seed: creates the workspace needed to exercise the current
// no-authentication MVP (there is no Identity/Workspace management yet).
//
// Idempotent. Refuses to run with NODE_ENV=production. Operates on DATABASE_URL
// (the normal development database), never on the test database.
//
// Usage: node scripts/seed-development.mjs
// (invoked via `pnpm db:seed:dev`)

import 'dotenv/config';
import { Client } from 'pg';

const DEV_WORKSPACE_SLUG = 'dev-workspace';
const DEV_WORKSPACE_NAME = 'Development Workspace';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The development seed must never run with NODE_ENV=production.');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env first.');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      'INSERT INTO workspaces (slug, name) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING',
      [DEV_WORKSPACE_SLUG, DEV_WORKSPACE_NAME],
    );
    const { rows } = await client.query('SELECT id, slug, name FROM workspaces WHERE slug = $1', [
      DEV_WORKSPACE_SLUG,
    ]);
    const workspace = rows[0];
    console.log(`Development workspace ready: ${workspace.name} (${workspace.slug})`);
    console.log(`workspaceId: ${workspace.id}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Failed to seed the development database:');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
