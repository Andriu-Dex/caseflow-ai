import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { implementationPlanContentSchema } from '@caseflow-ai/contracts';
import { GenerationRunsService } from './generation-runs.service';

const PLAN_VERSION = '11111111-1111-4111-8111-111111111111';
const BASELINE = '22222222-2222-4222-8222-222222222222';
const plan = implementationPlanContentSchema.parse({
  designBaselineId: BASELINE,
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
});
const sha = (content: string) => createHash('sha256').update(content).digest('hex');
const archive = async (entries: Record<string, string>) => {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) zip.file(path, content);
  return zip.generateAsync({ type: 'nodebuffer' });
};

describe('importing a manual implementation (ADR-023)', () => {
  const prisma = {
    projectMembership: { findFirst: vi.fn() },
    artifactVersion: { findFirst: vi.fn() },
    generationRun: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    generatedFile: { createManyAndReturn: vi.fn() },
    codeTraceLink: { createMany: vi.fn() },
    $transaction: vi.fn(),
  };
  const audit = { record: vi.fn() };
  const baselines = { assertApproved: vi.fn(), get: vi.fn() };
  // No method: any attempt to propose business logic with AI would throw.
  const businessLogic = {};
  const service = new GenerationRunsService(
    prisma as never,
    audit as never,
    baselines as never,
    businessLogic as never,
    {} as never,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.projectMembership.findFirst.mockResolvedValue({ role: 'OWNER' });
    prisma.artifactVersion.findFirst.mockResolvedValue({
      structuredAnalysisDetail: { content: plan },
    });
    baselines.get.mockResolvedValue({ entries: [] });
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
    prisma.generationRun.create.mockResolvedValue({ id: 'run-1' });
    prisma.generatedFile.createManyAndReturn.mockImplementation(({ data }) =>
      data.map((file: { path: string }) => ({ id: `id:${file.path}`, path: file.path })),
    );
  });

  it('stores the project as a finished manual run, keeping the origin of unchanged files', async () => {
    prisma.generationRun.findFirst
      // Latest run of the same design: the base to compare against.
      .mockResolvedValueOnce({
        files: [
          {
            path: 'apps/api/src/main.ts',
            sha256: sha('export {};'),
            origin: 'TEMPLATE',
            kind: 'SOURCE',
          },
          {
            path: 'apps/api/src/item.service.ts',
            sha256: sha('old'),
            origin: 'AI_ASSISTED',
            kind: 'SOURCE',
          },
        ],
      })
      .mockResolvedValueOnce({
        id: 'run-1',
        projectId: 'p1',
        status: 'GENERATED',
        origin: 'MANUAL',
        warnings: [],
        createdAt: new Date(),
        _count: { files: 2 },
      });
    const run = await service.importManual(
      'p1',
      'user',
      PLAN_VERSION,
      await archive({
        'apps/api/src/main.ts': 'export {};',
        'apps/api/src/item.service.ts': 'new',
        'docs/business-logic/abc.json': '{"body":"return 1;"}',
        'caseflow-manifest.json': JSON.stringify({
          traceLinks: [
            { path: 'apps/api/src/item.service.ts', planElement: 'entity:item' },
            { path: 'apps/api/src/item.service.ts', planElement: 'entity:invented' },
          ],
        }),
      }),
    );
    expect(run).toMatchObject({ status: 'GENERATED', origin: 'MANUAL' });
    expect(prisma.generationRun.create.mock.calls[0]![0].data).toMatchObject({
      origin: 'MANUAL',
      status: 'GENERATING',
      designBaselineId: BASELINE,
    });
    expect(prisma.generationRun.update.mock.calls[0]![0].data).toMatchObject({
      status: 'GENERATED',
    });
    const stored = prisma.generatedFile.createManyAndReturn.mock.calls[0]![0].data;
    expect(
      stored.map((file: { path: string; origin: string }) => [file.path, file.origin]),
    ).toEqual([
      ['apps/api/src/item.service.ts', 'MANUAL'],
      ['apps/api/src/main.ts', 'TEMPLATE'],
    ]);
    // Only elements of the approved plan are traced; checkpoints never come in.
    const links = prisma.codeTraceLink.createMany.mock.calls[0]![0].data;
    expect(
      links
        .filter((link: { generatedFileId: string }) =>
          link.generatedFileId.endsWith('item.service.ts'),
        )
        .map((link: { planElement: string }) => link.planElement),
    ).toEqual(['entity:item']);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'GENERATION_RUN_FINISHED',
        metadata: expect.objectContaining({ origin: 'MANUAL', files: 2, changed: 1 }),
      }),
      prisma,
    );
  });

  it('refuses people who cannot generate, plans that are not approved and unusable archives', async () => {
    prisma.projectMembership.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.importManual('p1', 'user', PLAN_VERSION, Buffer.from('x')),
    ).rejects.toThrow('No tiene permisos');
    await expect(service.importManual('p1', 'user', PLAN_VERSION, undefined)).rejects.toThrow(
      'Adjunte el ZIP',
    );
    await expect(
      service.importManual('p1', 'user', PLAN_VERSION, Buffer.from('not a zip')),
    ).rejects.toThrow('no es un ZIP válido');
    prisma.artifactVersion.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.importManual('p1', 'user', PLAN_VERSION, await archive({ 'package.json': '{}' })),
    ).rejects.toThrow('plan de implementación aprobado');
    expect(prisma.generationRun.create).not.toHaveBeenCalled();
  });
});
