import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';

// Applies the official Prisma migrations (never rewritten, AGENTS.md §32) to
// the desktop database at startup, in order, each in its own transaction.
// Records them in Prisma's own `_prisma_migrations` table, so the history is
// the same one `prisma migrate deploy` keeps on the web edition.
export async function applyMigrations(db: PGlite, migrationsDir: string): Promise<string[]> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )`);
  const applied = new Set(
    (
      await db.query<{ migration_name: string }>(
        `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
      )
    ).rows.map((row) => row.migration_name),
  );
  const names = (await readdir(migrationsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const newlyApplied: string[] = [];
  for (const name of names) {
    if (applied.has(name)) continue;
    const sql = await readFile(join(migrationsDir, name, 'migration.sql'), 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
         VALUES ($1, $2, now(), $3, 1)`,
        [randomUUID(), createHash('sha256').update(sql).digest('hex'), name],
      );
    });
    newlyApplied.push(name);
  }
  return newlyApplied;
}
