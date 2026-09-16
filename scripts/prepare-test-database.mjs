// Portable, idempotent preparation of the isolated integration-test database.
//
// Works identically on Windows, Linux, and CI (GitHub Actions or otherwise) —
// it only requires a reachable PostgreSQL instance and the two environment
// variables below. It never touches application tables and never drops any
// database.
//
// Usage: node scripts/prepare-test-database.mjs
// (invoked via `pnpm db:test:prepare`)

import 'dotenv/config';
import { Client } from 'pg';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and provide a real value before running this script.`,
    );
  }
  return value;
}

function getDatabaseName(connectionString, envVarName) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(`${envVarName} is not a valid connection URL.`);
  }

  const name = url.pathname.replace(/^\//, '');
  if (!name) {
    throw new Error(`${envVarName} does not include a database name.`);
  }
  return name;
}

// Quotes a PostgreSQL identifier for safe interpolation into DDL statements
// that cannot be parameterized (e.g. CREATE DATABASE).
function quoteIdentifier(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function main() {
  const databaseUrl = requireEnv('DATABASE_URL');
  const databaseTestUrl = requireEnv('DATABASE_TEST_URL');

  const testDbName = getDatabaseName(databaseTestUrl, 'DATABASE_TEST_URL');
  const devDbName = getDatabaseName(databaseUrl, 'DATABASE_URL');

  if (testDbName === devDbName) {
    throw new Error(
      `DATABASE_TEST_URL must point to a different database than DATABASE_URL ` +
        `(both currently resolve to "${testDbName}"). Refusing to continue: this ` +
        `script must never operate on the normal development database.`,
    );
  }

  // 1-2. Connect through DATABASE_URL and confirm we are actually talking to
  // a reachable PostgreSQL instance before doing anything else.
  const adminClient = new Client({ connectionString: databaseUrl });
  await adminClient.connect();

  let created = false;
  try {
    const { rows: pingRows } = await adminClient.query('SELECT current_database()');
    const connectedTo = pingRows[0]?.current_database;
    console.log(`Connected to PostgreSQL via DATABASE_URL (database: ${connectedTo}).`);

    // 3. Check whether the test database exists.
    const { rows: existingRows } = await adminClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [testDbName],
    );

    // 4. Create it only if missing. CREATE DATABASE cannot run inside a
    // parameterized statement or a transaction block, so the (validated,
    // quoted) name is interpolated directly.
    if (existingRows.length === 0) {
      await adminClient.query(`CREATE DATABASE ${quoteIdentifier(testDbName)}`);
      created = true;
      console.log(`Created database "${testDbName}".`);
    } else {
      console.log(`Database "${testDbName}" already exists — skipping creation.`);
    }
  } finally {
    await adminClient.end();
  }

  // 5. Connect through DATABASE_TEST_URL.
  const testClient = new Client({ connectionString: databaseTestUrl });
  await testClient.connect();

  try {
    // 6. Verify we are actually connected to the expected test database.
    const { rows } = await testClient.query('SELECT current_database()');
    const actualDb = rows[0]?.current_database;
    if (actualDb !== testDbName) {
      throw new Error(
        `DATABASE_TEST_URL connected to "${actualDb}", but its own connection string ` +
          `names "${testDbName}". Refusing to continue with a mismatched target.`,
      );
    }

    // 7. Enable the approved pgvector extension in the test database only.
    await testClient.query('CREATE EXTENSION IF NOT EXISTS vector');
    console.log(`Ensured "vector" extension is enabled in "${testDbName}".`);
  } finally {
    // 8. Close all connections cleanly.
    await testClient.end();
  }

  console.log(
    created ? 'Test database prepared (newly created).' : 'Test database already prepared.',
  );
}

main().catch((error) => {
  console.error('Failed to prepare the test database:');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
