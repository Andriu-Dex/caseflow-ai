// Generates the Prisma client into apps/api/src/generated/prisma.
//
// Client generation never connects to a database, but prisma.config.ts reads
// DATABASE_URL eagerly. A placeholder is supplied only when the variable is
// unset so `pnpm install` works on a fresh clone and in CI without a .env file.
//
// Usage: node scripts/generate-prisma-client.mjs
// (invoked by `pnpm db:generate` and the root `postinstall` hook)

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const prismaCli = require.resolve('prisma/build/index.js');

const result = spawnSync(process.execPath, [prismaCli, 'generate'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL:
      process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder',
  },
});

process.exitCode = result.status ?? 1;
