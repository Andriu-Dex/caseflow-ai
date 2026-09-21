import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FIRST_DELIVERABLE_ARTIFACT_TYPE_CODES } from '@caseflow-ai/domain';

const migrationsDir = join(__dirname, '..', '..', 'prisma', 'migrations');

describe('official Prisma migrations on caseflow_test', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.DATABASE_TEST_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it('is connected to caseflow_test, not the development database', async () => {
    const { rows } = await client.query<{ current_database: string }>('SELECT current_database()');

    expect(rows[0]?.current_database).toBe('caseflow_test');
    // The setup file re-points DATABASE_URL at the test database.
    expect(process.env.DATABASE_URL).toBe(process.env.DATABASE_TEST_URL);
  });

  it('has applied every migration directory in prisma/migrations, in order', async () => {
    const onDisk = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    const { rows } = await client.query<{ migration_name: string }>(
      `SELECT migration_name FROM _prisma_migrations
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
       ORDER BY migration_name`,
    );

    expect(rows.map((row) => row.migration_name)).toEqual(onDisk);
  });

  it('created the foundation tables with snake_case physical names', async () => {
    const { rows } = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const tables = rows.map((row) => row.table_name);

    expect(tables).toEqual(
      expect.arrayContaining([
        'workspaces',
        'projects',
        'artifact_types',
        'artifacts',
        'artifact_versions',
        'project_code_counters',
        'project_context_details',
        'project_context_actors',
        'project_context_needs',
        'project_context_constraints',
        'project_context_business_rules',
        'project_context_scope_items',
        'ai_runs',
      ]),
    );
  });

  it('seeded the controlled first-deliverable artifact types', async () => {
    const { rows } = await client.query<{ code: string }>('SELECT code FROM artifact_types');

    expect(rows.map((row) => row.code).sort()).toEqual(
      [...FIRST_DELIVERABLE_ARTIFACT_TYPE_CODES].sort(),
    );
  });

  it('keeps the pgvector migration', async () => {
    const { rows } = await client.query("SELECT 1 FROM pg_extension WHERE extname = 'vector'");

    expect(rows).toHaveLength(1);
  });
});
