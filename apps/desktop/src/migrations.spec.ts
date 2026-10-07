import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { describe, expect, it } from 'vitest';
import { applyMigrations } from './migrations.js';

const MIGRATIONS = fileURLToPath(new URL('../../../prisma/migrations', import.meta.url));

// DEC-120: every official migration (plpgsql triggers, pgvector, partial
// indexes) must run unchanged on the desktop database.
describe('desktop migrations on PGlite', () => {
  it('applies the whole history once, and nothing on the next start', async () => {
    const db = await PGlite.create({ extensions: { vector } });
    const applied = await applyMigrations(db, MIGRATIONS);
    expect(applied).toEqual(
      readdirSync(MIGRATIONS, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort(),
    );
    expect(await applyMigrations(db, MIGRATIONS)).toEqual([]);

    // The database rules came along: a workflow route only moves up.
    await db.exec(
      `INSERT INTO workspaces (id, slug, name) VALUES ('11111111-1111-4111-8111-111111111111', 'w', 'W')`,
    );
    await db.exec(
      `INSERT INTO projects (id, workspace_id, name, workflow_route) VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'P', 'FULL')`,
    );
    await expect(
      db.exec(
        `UPDATE projects SET workflow_route = 'EXPRESS' WHERE id = '22222222-2222-4222-8222-222222222222'`,
      ),
    ).rejects.toThrow('can only be upgraded');
    await db.close();
  }, 120_000);
});
