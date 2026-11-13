import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { implementationPlanContentSchema } from '@caseflow-ai/contracts';
import { GenerationRunsService } from './generation-runs.service';

const plan = implementationPlanContentSchema.parse({
  designBaselineId: '11111111-1111-4111-8111-111111111111',
  authentication: { required: false },
  modules: [{ localId: 'catalog', name: 'Catalog', description: 'Catálogo' }],
  entities: [
    {
      localId: 'item',
      name: 'Item',
      moduleLocalId: 'catalog',
      fields: [{ name: 'name', type: 'STRING' }],
      operations: ['LIST'],
    },
  ],
  customEndpoints: [
    {
      moduleLocalId: 'catalog',
      entityLocalId: 'item',
      method: 'POST',
      path: '/items/accept',
      summary: 'Aceptar',
    },
  ],
});
const body = 'return { ok: true };';
const content = JSON.stringify({ body });
const digest = createHash('sha256').update(content).digest('hex');
const request = {
  implementationPlanVersionId: '22222222-2222-4222-8222-222222222222',
  reason: 'Integrar corrección revisada',
  revisions: [
    {
      endpoint: 'POST /items/accept',
      sourceFileId: '33333333-3333-4333-8333-333333333333',
      expectedSha256: digest,
      body,
    },
  ],
};

describe('construction working copies', () => {
  const prisma = {
    projectMembership: { findFirst: vi.fn() },
    artifactVersion: { findFirst: vi.fn() },
    project: { findUniqueOrThrow: vi.fn() },
    generatedFile: { findFirst: vi.fn(), findMany: vi.fn(), createManyAndReturn: vi.fn() },
    generationRun: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    codeTraceLink: { createMany: vi.fn() },
    $transaction: vi.fn(),
  };
  const audit = { record: vi.fn() };
  const design = { assertApproved: vi.fn(), get: vi.fn() };
  const business = { implement: vi.fn() };
  const queue = { add: vi.fn() };
  const service = new GenerationRunsService(
    prisma as never,
    audit as never,
    design as never,
    business as never,
    queue as never,
  );
  let row: Record<string, unknown>;
  beforeEach(() => {
    vi.resetAllMocks();
    row = {
      id: 'copy',
      projectId: 'project',
      implementationPlanVersionId: request.implementationPlanVersionId,
      designBaselineId: plan.designBaselineId,
      targetTemplateIdentifier: 'CASEFLOW_WEB_TS_V1',
      targetTemplateVersion: 2,
      status: 'GENERATING',
      warnings: [],
      errorMessage: null,
      createdByUserId: 'owner',
      createdAt: new Date(),
      startedAt: new Date(),
      finishedAt: null,
      archivedAt: null,
      _count: { files: 10 },
    };
    prisma.projectMembership.findFirst.mockResolvedValue({ role: 'OWNER' });
    prisma.artifactVersion.findFirst.mockResolvedValue({
      structuredAnalysisDetail: { content: plan },
    });
    prisma.project.findUniqueOrThrow.mockResolvedValue({ name: 'Catalog' });
    prisma.generatedFile.findFirst.mockResolvedValue({
      id: 'source',
      path: `docs/business-logic/${'a'.repeat(64)}.json`,
      content,
      sha256: digest,
    });
    prisma.generatedFile.findMany.mockResolvedValue([]);
    prisma.generatedFile.createManyAndReturn.mockImplementation(async ({ data }) =>
      data.map((f: { path: string }, i: number) => ({ id: String(i), path: f.path })),
    );
    prisma.generationRun.create.mockResolvedValue(row);
    prisma.generationRun.findFirst.mockImplementation(async () => row);
    prisma.generationRun.update.mockImplementation(async ({ data }) => Object.assign(row, data));
    prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
    design.get.mockResolvedValue({ entries: [] });
    business.implement.mockResolvedValue({
      implementations: { 'POST /items/accept': body },
      warnings: [],
    });
  });
  it('creates immutable reproducible files and provenance without queueing inference or publishing', async () => {
    const result = await service.createWorkingCopy('project', 'owner', request);
    expect(result.status).toBe('WORKING_COPY');
    expect(business.implement).toHaveBeenCalledWith('project', 'copy', plan, expect.anything(), {
      cacheOnly: true,
      revisions: new Map([['POST /items/accept', body]]),
    });
    const files = prisma.generatedFile.createManyAndReturn.mock.calls[0]![0].data;
    const manifest = JSON.parse(
      files.find((f: { path: string }) => f.path === 'docs/working-copy.json').content,
    );
    expect(manifest).toMatchObject({
      officialDelivery: false,
      pendingEndpoints: [],
      revisions: [{ sourceFileId: request.revisions[0]!.sourceFileId, expectedSha256: digest }],
    });
    expect(files.some((f: { path: string }) => f.path.endsWith('.service.ts'))).toBe(true);
    expect(queue.add).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'GENERATION_RUN_FINISHED',
        metadata: expect.objectContaining({ status: 'WORKING_COPY' }),
      }),
      prisma,
    );
    expect(prisma.generatedFile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          generationRun: expect.objectContaining({
            projectId: 'project',
            designBaselineId: plan.designBaselineId,
          }),
        }),
      }),
    );
  });
  it('preserves missing actions explicitly instead of marking the copy generated', async () => {
    business.implement.mockResolvedValue({ implementations: {}, warnings: ['Pending action'] });
    const result = await service.createWorkingCopy('project', 'owner', {
      ...request,
      revisions: [],
    });
    expect(result.status).toBe('WORKING_COPY');
    expect(result.warnings).toContain('Pending action');
    const files = prisma.generatedFile.createManyAndReturn.mock.calls[0]![0].data;
    expect(
      JSON.parse(files.find((f: { path: string }) => f.path === 'docs/working-copy.json').content)
        .pendingEndpoints,
    ).toEqual(['POST /items/accept']);
  });
  it.each(['foreign', 'hash', 'unsafe', 'duplicate', 'unknown', 'permission', 'unapproved'])(
    'rejects %s input before creating a run',
    async (kind) => {
      let input = request;
      if (kind === 'foreign') prisma.generatedFile.findFirst.mockResolvedValue(null);
      if (kind === 'hash')
        input = {
          ...request,
          revisions: [{ ...request.revisions[0]!, expectedSha256: 'b'.repeat(64) }],
        };
      if (kind === 'unsafe')
        input = {
          ...request,
          revisions: [{ ...request.revisions[0]!, body: 'return process.env;' }],
        };
      if (kind === 'duplicate')
        input = { ...request, revisions: [...request.revisions, ...request.revisions] };
      if (kind === 'unknown')
        input = { ...request, revisions: [{ ...request.revisions[0]!, endpoint: 'POST /other' }] };
      if (kind === 'permission') prisma.projectMembership.findFirst.mockResolvedValue(null);
      if (kind === 'unapproved') prisma.artifactVersion.findFirst.mockResolvedValue(null);
      await expect(service.createWorkingCopy('project', 'owner', input)).rejects.toThrow();
      expect(prisma.generationRun.create).not.toHaveBeenCalled();
    },
  );
  it('records failure without changing historical files when integration fails', async () => {
    business.implement.mockRejectedValue(new Error('unavailable'));
    await expect(service.createWorkingCopy('project', 'owner', request)).rejects.toThrow(
      'unavailable',
    );
    expect(row.status).toBe('FAILED');
    expect(prisma.generatedFile.createManyAndReturn).not.toHaveBeenCalled();
  });
});
