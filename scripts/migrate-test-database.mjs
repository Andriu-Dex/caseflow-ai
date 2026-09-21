// Applies the official Prisma migrations to the isolated integration-test
// database ONLY.
//
// Guarantees:
//   - operates exclusively on DATABASE_TEST_URL;
//   - refuses to run when DATABASE_TEST_URL resolves to the same server and
//     database as DATABASE_URL (the normal development database);
//   - refuses to run unless the target database name ends with "_test";
//   - uses `prisma migrate deploy` (the same migration history as development),
//     never `prisma db push`.
//
// Usage: node scripts/migrate-test-database.mjs
// (invoked via `pnpm db:test:migrate`; run `pnpm db:test:prepare` first)

import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and provide a real value before running this script.`,
    );
  }
  return value;
}

function parseTarget(connectionString, envVarName) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(`${envVarName} is not a valid connection URL.`);
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) {
    throw new Error(`${envVarName} does not include a database name.`);
  }
  return { host: url.hostname.toLowerCase(), port: url.port || '5432', database };
}

function main() {
  const databaseUrl = requireEnv('DATABASE_URL');
  const databaseTestUrl = requireEnv('DATABASE_TEST_URL');

  const dev = parseTarget(databaseUrl, 'DATABASE_URL');
  const test = parseTarget(databaseTestUrl, 'DATABASE_TEST_URL');

  if (dev.host === test.host && dev.port === test.port && dev.database === test.database) {
    throw new Error(
      `DATABASE_TEST_URL must not point to the development database ` +
        `(both resolve to "${test.database}" on ${test.host}:${test.port}). ` +
        `Refusing to migrate.`,
    );
  }

  if (!test.database.endsWith('_test')) {
    throw new Error(
      `DATABASE_TEST_URL database name "${test.database}" must end with "_test". ` +
        `Refusing to migrate a database that is not clearly a test database.`,
    );
  }

  console.log(
    `Applying Prisma migrations to test database "${test.database}" on ${test.host}:${test.port}.`,
  );

  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve('prisma/build/index.js');

  // prisma.config.ts reads DATABASE_URL; point it at the test database for
  // this child process only. dotenv never overrides an already-set variable.
  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseTestUrl },
  });

  if (result.status !== 0) {
    throw new Error('prisma migrate deploy failed against the test database.');
  }
}

try {
  main();
} catch (error) {
  console.error('Failed to migrate the test database:');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
