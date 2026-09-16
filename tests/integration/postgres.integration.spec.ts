import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// This test targets the dedicated caseflow_test database (see
// infra/docker/postgres/prepare-test-db.sh and `pnpm db:test:prepare`).
// It MUST NOT read or write the normal development database (`caseflow`).

describe('PostgreSQL integration (caseflow_test)', () => {
  let client: Client;

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_TEST_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_TEST_URL is not set. Set it to a connection string for the ' +
          'caseflow_test database before running integration tests.',
      );
    }

    client = new Client({ connectionString });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it('connects to caseflow_test, not the development database', async () => {
    const result = await client.query<{ current_database: string }>('SELECT current_database()');

    expect(result.rows[0]?.current_database).toBe('caseflow_test');
  });

  it('SELECT 1 succeeds', async () => {
    const result = await client.query<{ value: number }>('SELECT 1 AS value');

    expect(result.rows[0]?.value).toBe(1);
  });

  it('the vector extension is available', async () => {
    const result = await client.query("SELECT extname FROM pg_extension WHERE extname = 'vector'");

    expect(result.rows).toHaveLength(1);
  });
});
