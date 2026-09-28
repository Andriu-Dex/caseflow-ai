import { Client } from 'pg';

interface DatabaseTarget {
  host: string;
  port: string;
  database: string;
}

function parseTarget(connectionString: string): DatabaseTarget {
  const url = new URL(connectionString);
  return {
    host: url.hostname.toLowerCase(),
    port: url.port || '5432',
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
  };
}

// Throws unless the test URL names a "*_test" database that differs from the
// development database (same host + port + database name).
export function assertIsolatedTestTarget(
  developmentUrl: string | undefined,
  testUrl: string,
): void {
  const test = parseTarget(testUrl);
  if (!test.database.endsWith('_test')) {
    throw new Error(`Refusing to run integration tests against "${test.database}".`);
  }
  if (developmentUrl) {
    const dev = parseTarget(developmentUrl);
    if (dev.host === test.host && dev.port === test.port && dev.database === test.database) {
      throw new Error('DATABASE_TEST_URL points at the development database.');
    }
  }
}

export function getTestConnectionString(): string {
  const connectionString = process.env.DATABASE_TEST_URL;
  if (!connectionString) {
    throw new Error('DATABASE_TEST_URL is not set.');
  }
  return connectionString;
}

// Empties every application table except the artifact_types reference data.
// TRUNCATE is used because ArtifactVersion rows can never be DELETEd.
export async function resetTestData(client: Client): Promise<void> {
  const { rows } = await client.query<{ current_database: string }>('SELECT current_database()');
  const database = rows[0]?.current_database ?? '';
  if (!database.endsWith('_test')) {
    throw new Error(`Refusing to truncate "${database}": not a test database.`);
  }
  await client.query('TRUNCATE TABLE workspaces CASCADE');
}
