import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { DataModelGenerationJobsService } from '../data-models/data-model-generation-jobs.service';
import { StructuredGenerationJobsService } from '../structured-analysis/structured-generation-jobs.service';
import { UseCaseGenerationJobsService } from '../use-cases/use-case-generation-jobs.service';

// The three batched-generation job services (use cases, data model and the
// structured design artifacts) share one lifecycle: start, resume, cancel,
// finish and recover after a restart. They are exercised together against an
// in-memory table so each service keeps the same behaviour.

const PROJECT = '00000000-0000-4000-8000-0000000000a1';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SOURCES = [uuid(101), uuid(102)];

type Row = Record<string, unknown> & { id: string; sources: Record<string, unknown>[] };

function matches(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (expected && typeof expected === 'object' && 'in' in expected)
      return (expected.in as unknown[]).includes(row[key]);
    return row[key] === expected;
  });
}

// A Prisma-like delegate over a Map of rows.
function fakeTable(sourceKey: string) {
  const rows = new Map<string, Row>();
  let seq = 0;
  const copy = (row: Row | undefined) => (row ? { ...row } : null);
  return {
    rows,
    findFirst: vi.fn(
      async ({ where, orderBy }: { where?: Record<string, unknown>; orderBy?: unknown }) => {
        const found = [...rows.values()].filter((row) => matches(row, where));
        return copy(orderBy ? found.at(-1) : found[0]);
      },
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const { sources, ...rest } = data as { sources?: { create: Record<string, unknown>[] } };
      const row: Row = {
        id: uuid(500 + ++seq),
        status: 'QUEUED',
        completedBatches: 0,
        totalBatches: 0,
        outputChars: 0,
        generationId: null,
        errorMessage: null,
        designBaselineId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...rest,
        sources: sources?.create ?? [],
      };
      rows.set(row.id, row);
      return { ...row };
    }),
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.get(where.id)!;
        Object.assign(
          row,
          Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)),
        );
        return { ...row };
      },
    ),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const hits = [...rows.values()].filter((row) => matches(row, where));
        hits.forEach((row) => Object.assign(row, data));
        return { count: hits.length };
      },
    ),
    sourceKey,
  };
}

interface Harness {
  name: string;
  build: (
    table: ReturnType<typeof fakeTable>,
    prisma: object,
    audit: object,
    work: object,
  ) => {
    start: (ids: string[], userId: string) => Promise<{ id: string; status: string }>;
    cancel: (jobId: string, userId: string) => Promise<{ status: string }>;
    get: (jobId: string, projectId?: string) => Promise<{ status: string }>;
    latest: () => Promise<{ job: { status: string } | null }>;
    boot: () => Promise<void>;
  };
  sourceKey: string;
  delegate: string;
  startedAction: string;
  finishedAction: string;
  // The service's method that runs the AI in batches, and the checker it calls first.
  generate: string;
  check: string;
  // Arguments the batches method receives before the progress object.
  leading: unknown[];
}

const harnesses: Harness[] = [
  {
    name: 'use cases',
    sourceKey: 'requirementVersionId',
    delegate: 'useCaseGenerationJob',
    startedAction: 'USE_CASE_GENERATION_STARTED',
    finishedAction: 'USE_CASE_GENERATION_FINISHED',
    generate: 'generateInBatches',
    check: 'checkGenerationSources',
    leading: [PROJECT, SOURCES],
    build: (_table, prisma, audit, work) => {
      const service = new UseCaseGenerationJobsService(
        prisma as never,
        work as never,
        audit as never,
      );
      return {
        start: (ids, userId) => service.start(PROJECT, ids, userId),
        cancel: (jobId, userId) => service.cancel(PROJECT, jobId, userId),
        get: (jobId, projectId = PROJECT) => service.get(projectId, jobId),
        latest: () => service.latest(PROJECT),
        boot: () => service.onApplicationBootstrap(),
      };
    },
  },
  {
    name: 'data model',
    sourceKey: 'artifactVersionId',
    delegate: 'dataModelGenerationJob',
    startedAction: 'DATA_MODEL_GENERATION_STARTED',
    finishedAction: 'DATA_MODEL_GENERATION_FINISHED',
    generate: 'generateInBatches',
    check: 'checkBatchedSources',
    leading: [PROJECT, SOURCES],
    build: (_table, prisma, audit, work) => {
      const service = new DataModelGenerationJobsService(
        prisma as never,
        work as never,
        audit as never,
      );
      return {
        start: (ids, userId) => service.start(PROJECT, ids, userId),
        cancel: (jobId, userId) => service.cancel(PROJECT, jobId, userId),
        get: (jobId, projectId = PROJECT) => service.get(projectId, jobId),
        latest: () => service.latest(PROJECT),
        boot: () => service.onApplicationBootstrap(),
      };
    },
  },
  {
    name: 'structured artifacts',
    sourceKey: 'artifactVersionId',
    delegate: 'structuredGenerationJob',
    startedAction: 'STRUCTURED_GENERATION_STARTED',
    finishedAction: 'STRUCTURED_GENERATION_FINISHED',
    generate: 'generateInBatches',
    check: 'checkBatchedSources',
    leading: [PROJECT, 'CLASS_DIAGRAM', SOURCES],
    build: (_table, prisma, audit, work) => {
      const service = new StructuredGenerationJobsService(
        prisma as never,
        work as never,
        audit as never,
      );
      return {
        start: (ids, userId) => service.start(PROJECT, 'CLASS_DIAGRAM', ids, userId),
        cancel: (jobId, userId) => service.cancel(PROJECT, 'CLASS_DIAGRAM', jobId, userId),
        get: (jobId, projectId = PROJECT) => service.get(projectId, 'CLASS_DIAGRAM', jobId),
        latest: () => service.latest(PROJECT, 'CLASS_DIAGRAM'),
        boot: () => service.onApplicationBootstrap(),
      };
    },
  },
];

describe.each(harnesses)('batched generation jobs: $name', (h) => {
  let table: ReturnType<typeof fakeTable>;
  let prisma: Record<string, unknown>;
  let audit: { record: ReturnType<typeof vi.fn> };
  let work: Record<string, ReturnType<typeof vi.fn>>;
  let api: ReturnType<Harness['build']>;

  beforeEach(() => {
    table = fakeTable(h.sourceKey);
    // Every job these tests create is of the kind the structured service starts.
    const create = table.create;
    table.create = vi.fn(async (args: { data: Record<string, unknown> }) =>
      create({ data: { kind: 'CLASS_DIAGRAM', ...args.data } }),
    ) as never;
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    prisma = {
      projectMembership: { findFirst: vi.fn().mockResolvedValue({ role: 'OWNER' }) },
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
      [h.delegate]: table,
    };
    work = {
      [h.check]: vi.fn().mockResolvedValue(undefined),
      [h.generate]: vi.fn(async (...args: unknown[]) => {
        const progress = args.find(
          (arg) => arg && typeof arg === 'object' && 'update' in (arg as object),
        ) as { update: (a: number, b: number, c: number) => void };
        progress.update(0, 2, 10);
        progress.update(2, 2, 0);
        return { id: uuid(900) };
      }),
    };
    api = h.build(table, prisma, audit, work);
  });

  const only = () => [...table.rows.values()][0]!;
  const settled = (status: string) => vi.waitFor(() => expect(only().status).toBe(status));

  it('creates a job, runs it to completion and records its start and end', async () => {
    const job = await api.start(SOURCES, 'user');
    expect(job.status).toBe('QUEUED');
    await settled('COMPLETED');
    expect(only()).toMatchObject({ generationId: uuid(900), completedBatches: 2, totalBatches: 2 });
    expect(work[h.check]).toHaveBeenCalled();
    const actions = audit.record.mock.calls.map(([event]) => event.action);
    expect(actions).toEqual([h.startedAction, h.finishedAction]);
    expect((await api.latest()).job?.status).toBe('COMPLETED');
    expect((await api.get(only().id)).status).toBe('COMPLETED');
  });

  it('refuses a user without permission, before creating anything', async () => {
    (
      prisma.projectMembership as { findFirst: ReturnType<typeof vi.fn> }
    ).findFirst.mockResolvedValueOnce(null);
    await expect(api.start(SOURCES, 'viewer')).rejects.toThrow('No tiene permisos');
    expect(table.rows.size).toBe(0);
    (
      prisma.projectMembership as { findFirst: ReturnType<typeof vi.fn> }
    ).findFirst.mockResolvedValueOnce(null);
    await expect(api.cancel(uuid(1), 'viewer')).rejects.toThrow('No tiene permisos');
  });

  it('reuses an active job with the same selection and refuses another selection', async () => {
    let release!: () => void;
    work[h.generate]!.mockImplementation(
      () => new Promise((resolve) => (release = () => resolve({ id: uuid(900) }))),
    );
    const first = await api.start(SOURCES, 'user');
    await vi.waitFor(() => expect(only().status).toBe('RUNNING'));
    expect((await api.start([...SOURCES].reverse(), 'user')).id).toBe(first.id);
    await expect(api.start([uuid(999)], 'user')).rejects.toThrow('otra selección');
    release();
    await settled('COMPLETED');
  });

  it('keeps an actionable error, hides an unexpected one, and resumes a failed run', async () => {
    work[h.generate]!.mockRejectedValueOnce(new ServiceUnavailableException('Puede reanudar.'));
    await api.start(SOURCES, 'user');
    await settled('FAILED');
    expect(only().errorMessage).toBe('Puede reanudar.');

    // Same selection: the failed job is resumed, not duplicated.
    work[h.generate]!.mockRejectedValueOnce(new Error('private SQL and credentials'));
    await api.start(SOURCES, 'user');
    await vi.waitFor(() => expect(work[h.generate]).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(only().errorMessage).not.toBe('Puede reanudar.'));
    await settled('FAILED');
    expect(String(only().errorMessage)).not.toContain('private');
    expect(table.rows.size).toBe(1);

    // A different selection starts a new job instead of resuming.
    await api.start([uuid(777)], 'user');
    expect(table.rows.size).toBe(2);
  });

  it('recovers an already committed result instead of generating again', async () => {
    work[h.generate]!.mockRejectedValueOnce(new Error('boom'));
    await api.start(SOURCES, 'user');
    await settled('FAILED');
    only().generationId = uuid(901);
    const calls = work[h.generate]!.mock.calls.length;
    expect((await api.start(SOURCES, 'user')).status).toBe('COMPLETED');
    expect(work[h.generate]!.mock.calls.length).toBe(calls);
  });

  it('cancels a running job: the run stops at its next batch and the job stays cancelled', async () => {
    let release!: () => void;
    let stopped: unknown = null;
    work[h.generate]!.mockImplementation(async (...args: unknown[]) => {
      const progress = args.find(
        (arg) => arg && typeof arg === 'object' && 'update' in (arg as object),
      ) as {
        update: (a: number, b: number, c: number) => void;
      };
      progress.update(0, 2, 0);
      await new Promise<void>((resolve) => (release = resolve));
      try {
        progress.update(1, 2, 0);
      } catch (error) {
        stopped = error;
        throw error;
      }
      return { id: uuid(900) };
    });
    await api.start(SOURCES, 'user');
    await vi.waitFor(() => expect(only().status).toBe('RUNNING'));
    expect((await api.cancel(only().id, 'user')).status).toBe('CANCELLED');
    expect(audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: h.finishedAction, metadata: { status: 'CANCELLED' } }),
    );
    release();
    await vi.waitFor(() => expect(stopped).not.toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(only()).toMatchObject({ status: 'CANCELLED', generationId: null });
  });

  it('leaves a finished job as it was when cancelled, and does not start one cancelled while queued', async () => {
    await api.start(SOURCES, 'user');
    await settled('COMPLETED');
    const finished = audit.record.mock.calls.length;
    expect((await api.cancel(only().id, 'user')).status).toBe('COMPLETED');
    expect(audit.record.mock.calls.length).toBe(finished);

    // Cancelled before its run claimed it: the run never starts.
    table.updateMany.mockResolvedValueOnce({ count: 0 });
    const before = work[h.generate]!.mock.calls.length;
    await api.start([uuid(555)], 'user');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(work[h.generate]!.mock.calls.length).toBe(before);
  });

  it('refuses a job that is not in the project', async () => {
    await expect(api.get(uuid(404))).rejects.toThrow('no encontrado');
    expect((await api.latest()).job).toBeNull();
  });

  it('marks queued and running jobs as interrupted at startup, even if the table fails', async () => {
    await api.boot();
    expect(table.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { in: ['QUEUED', 'RUNNING'] } } }),
    );
    table.updateMany.mockRejectedValueOnce(new Error('db down'));
    await expect(api.boot()).resolves.toBeUndefined();
  });
});
