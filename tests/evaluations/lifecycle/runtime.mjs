import assert from 'node:assert/strict';
import { PrismaService } from '../../../apps/api/dist/prisma/prisma.service.js';
import { RevisionService } from '../../../apps/api/dist/records/revision.service.js';
import { RevisionEntryService } from '../../../apps/api/dist/records/revision-entry.service.js';
import {
  lockLifecycleRecord,
  operationContext,
  scopedTransaction,
} from '../../../apps/api/dist/auth/lifecycle-scope-evaluation.js';

async function main() {
  const database = new PrismaService();
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await database.revision.count();
        break;
      } catch (error) {
        if (attempt >= 40) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    const revisions = new RevisionService(database);
    const entries = new RevisionEntryService(database);
    let checks = 0;
    async function rejected(operation) {
      await assert.rejects(operation);
      checks++;
    }
    for (const from of [
      '2026-02-30',
      '2026-13-01',
      '2026-01-01T25:00:00Z',
      '2026-01-01T12:00:00',
    ]) {
      await rejected(() => Promise.resolve().then(() => revisions.list({ from })));
    }
    await revisions.list({ from: '2024-02-29' });
    checks++;
    await rejected(() => revisions.create({ title: 'Unsafe', state: 'FINAL' }));
    const draft = await revisions.create({ title: 'Draft', state: 'DRAFT' });
    await rejected(() => revisions.update(draft.id, { state: 'FINAL' }));
    await rejected(() => revisions.update(draft.id, { finalizedAt: new Date().toISOString() }));
    const entry = await entries.create({ description: 'Original', revisionId: draft.id });
    // Seed finalized history directly in this disposable database, outside the CRUD under test.
    await database.revision.update({ where: { id: draft.id }, data: { state: 'FINAL' } });
    await rejected(() => revisions.update(draft.id, { title: 'Changed' }));
    await rejected(() => revisions.remove(draft.id));
    await rejected(() => entries.create({ description: 'Late', revisionId: draft.id }));
    await rejected(() => entries.update(entry.id, { description: 'Changed' }));
    await rejected(() => entries.remove(entry.id));
    const other = await revisions.create({ title: 'Other', state: 'DRAFT' });
    await rejected(() => entries.update(entry.id, { revisionId: other.id }));
    assert.equal(
      (await database.revisionEntry.findUnique({ where: { id: entry.id } })).description,
      'Original',
    );
    assert.equal(await database.revisionEntry.count({ where: { revisionId: draft.id } }), 1);
    checks += 2;

    const racing = await revisions.create({ title: 'Concurrent', state: 'DRAFT' });
    let locked;
    const lockReady = new Promise((resolve) => {
      locked = resolve;
    });
    let release;
    const released = new Promise((resolve) => {
      release = resolve;
    });
    const transition = database.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "revisions" WHERE "id" = ${racing.id}::uuid FOR UPDATE`;
        await tx.revision.update({ where: { id: racing.id }, data: { state: 'FINAL' } });
        locked();
        await released;
      },
      { isolationLevel: 'Serializable', timeout: 10000 },
    );
    await lockReady;
    const changing = entries.create({ description: 'Racing', revisionId: racing.id });
    // Attach the rejection handler before releasing the concurrent transaction.
    const outcome = changing.then(
      () => 'accepted',
      () => 'rejected',
    );
    let waiting = false;
    try {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const blocked = await database.$queryRaw`SELECT pid FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND query LIKE '%FOR UPDATE%' AND pid <> pg_backend_pid()`;
        if (blocked.length) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(waiting, true, 'The component mutation must reach the conflicting row lock.');
    } finally {
      release();
    }
    await transition;
    assert.equal(await outcome, 'rejected');
    assert.equal(await database.revisionEntry.count({ where: { revisionId: racing.id } }), 0);
    checks += 2;
    await operationContext.run(
      {
        userId: other.id,
        roles: ['EDITOR'],
        permissions: [],
        scopeIds: [other.id],
        dataAccess: { Revision: ['READ'] },
      },
      async () =>
        database.$transaction(async (tx) => {
          const scoped = scopedTransaction(tx);
          await lockLifecycleRecord(scoped, 'revision', other.id);
          await rejected(() => lockLifecycleRecord(scoped, 'revision', draft.id));
          await rejected(() => lockLifecycleRecord(scoped, 'undeclared', other.id));
          assert.throws(() => scoped.$queryRaw);
          checks += 2;
        }),
    );
    console.log(JSON.stringify({ status: 'PASSED', checks, database: 'disposable-postgresql' }));
  } finally {
    await database.$disconnect();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
