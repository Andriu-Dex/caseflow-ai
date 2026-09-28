import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service';
import type { Queue } from 'bullmq';
import {
  FakeMockupProvider,
  FakeStorageProvider,
  FallbackMockupProvider,
  type MockupProvider,
} from '@caseflow-ai/integrations';
import type { MockupGenerationJobPayload } from '@caseflow-ai/domain';
import { MockupsService } from './mockups.service';

const now = new Date('2026-01-01T00:00:00Z');
const blueprintContent = {
  screens: [
    {
      localId: 'home',
      name: 'Inicio',
      purpose: 'p',
      targetActors: [],
      relatedUseCaseCodes: [],
      sections: [],
      primaryActions: [],
      secondaryActions: [],
      principalData: [],
      forms: [],
      states: [],
    },
  ],
};
const artifact = { id: 'artifact', projectId: 'project', code: 'MCK-001', createdAt: now };
const mockupDetail = {
  uiBlueprintVersionId: 'blueprint-version',
  generatorVersion: 'caseflow-mockup-wireframe-v1',
  generatorKind: 'INTERNAL_WIREFRAME',
  svg: '<svg/>',
  screens: [],
};
const version = {
  id: 'version',
  versionNumber: 1,
  status: 'GENERATED',
  origin: 'SYSTEM_GENERATED',
  createdAt: now,
  mockupDetail,
};

function setup(provider: MockupProvider = new FakeMockupProvider()) {
  const tx = {
    project: { findUnique: vi.fn().mockResolvedValue({ id: 'project' }) },
    artifact: {
      create: vi.fn().mockResolvedValue(artifact),
      findUniqueOrThrow: vi.fn().mockResolvedValue(artifact),
    },
    artifactVersion: {
      create: vi.fn().mockResolvedValue(version),
      findUniqueOrThrow: vi.fn().mockResolvedValue(version),
      findFirstOrThrow: vi.fn().mockResolvedValue(version),
    },
    mockupDetail: { create: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([{ last_number: 1 }]),
  };
  let jobSeq = 0;
  const prisma = {
    $transaction: vi.fn((callback) => callback(tx)),
    artifact: { findMany: vi.fn(), findFirst: vi.fn() },
    artifactVersion: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'blueprint-version',
        structuredAnalysisDetail: { content: blueprintContent },
      }),
      update: vi.fn(),
    },
    mockupScreenDetail: { findFirst: vi.fn() },
    mockupGenerationJob: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: `job-${++jobSeq}`,
        status: 'QUEUED',
        resultArtifactId: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      })),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: object }) => ({
        id: where.id,
        ...data,
      })),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
    },
  };
  const storage = new FakeStorageProvider();
  const queue = { add: vi.fn() } as unknown as Queue<MockupGenerationJobPayload>;
  const service = new MockupsService(prisma as unknown as PrismaService, provider, storage, queue);
  // Mirrors what apps/worker does after popping the job off the queue: read
  // it back and run it. Kept here so every test can exercise the full
  // enqueue -> run round trip without a real Redis/worker.
  async function createAndRun(
    uiBlueprintVersionId: string,
    deviceType: 'DESKTOP' | 'MOBILE' = 'DESKTOP',
  ) {
    const job = await service.create('project', uiBlueprintVersionId, deviceType);
    prisma.mockupGenerationJob.findUniqueOrThrow.mockResolvedValue({
      id: job.id,
      projectId: 'project',
      uiBlueprintVersionId,
      existingMockupId: null,
      deviceType,
    });
    await service.runJob(job.id);
    return job.id;
  }
  return { tx, prisma, storage, queue, service, createAndRun };
}

describe('MockupsService', () => {
  it('enqueues a job instead of generating synchronously', async () => {
    const { service, prisma, queue } = setup();
    const job = await service.create('project', 'blueprint-version');
    expect(job.status).toBe('QUEUED');
    expect(prisma.mockupGenerationJob.create).toHaveBeenCalledWith({
      data: {
        projectId: 'project',
        uiBlueprintVersionId: 'blueprint-version',
        existingMockupId: null,
        deviceType: 'DESKTOP',
      },
    });
    expect(queue.add).toHaveBeenCalledWith('mockup-generation', {
      jobId: job.id,
      projectId: 'project',
    });
    expect(prisma.mockupGenerationJob.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('creates a SYSTEM_GENERATED mockup from an exact APPROVED UI Blueprint version', async () => {
    const { prisma, tx, createAndRun } = setup();
    const jobId = await createAndRun('blueprint-version');
    expect(prisma.artifactVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'blueprint-version',
          projectId: 'project',
          status: 'APPROVED',
          artifact: { artifactTypeCode: 'UI_BLUEPRINT' },
        }),
      }),
    );
    expect(tx.mockupDetail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          uiBlueprintVersionId: 'blueprint-version',
          generatorKind: 'INTERNAL_WIREFRAME',
        }),
      }),
    );
    expect(prisma.mockupGenerationJob.update).toHaveBeenCalledWith({
      where: { id: jobId },
      data: { status: 'RUNNING' },
    });
    expect(prisma.mockupGenerationJob.update).toHaveBeenLastCalledWith({
      where: { id: jobId },
      data: { status: 'COMPLETED', resultArtifactId: artifact.id },
    });
  });

  it('forwards the requested deviceType to the provider and stores it on the mockup', async () => {
    const generate = vi.fn().mockResolvedValue({ kind: 'INTERNAL_WIREFRAME', svg: '<svg/>' });
    const provider: MockupProvider = { id: 'spy', generate };
    const { tx, createAndRun } = setup(provider);
    await createAndRun('blueprint-version', 'MOBILE');
    expect(generate).toHaveBeenCalledWith(blueprintContent, 'MOBILE');
    expect(tx.mockupDetail.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deviceType: 'MOBILE' }) }),
    );
  });

  it('marks the job FAILED instead of throwing when generation fails', async () => {
    const { prisma, service } = setup(
      new FallbackMockupProvider([new FakeMockupProvider(new Error('offline'))]),
    );
    const job = await service.create('project', 'blueprint-version');
    prisma.mockupGenerationJob.findUniqueOrThrow.mockResolvedValue({
      id: job.id,
      projectId: 'project',
      uiBlueprintVersionId: 'blueprint-version',
      existingMockupId: null,
    });
    await expect(service.runJob(job.id)).resolves.toBeUndefined();
    expect(prisma.mockupGenerationJob.update).toHaveBeenLastCalledWith({
      where: { id: job.id },
      data: { status: 'FAILED', errorMessage: 'No se pudo generar el boceto.' },
    });
  });

  it('rejects a job that does not belong to the requested project', async () => {
    const { service, prisma } = setup();
    prisma.mockupGenerationJob.findFirst.mockResolvedValue(null);
    await expect(service.getJob('other-project', 'job-1')).rejects.toThrow('no encontrado');
    expect(prisma.mockupGenerationJob.findFirst).toHaveBeenCalledWith({
      where: { id: 'job-1', projectId: 'other-project' },
    });
  });

  it('stores Stitch screens and exposes scoped download URLs', async () => {
    const stitch = new FakeMockupProvider({
      kind: 'STITCH',
      screens: [
        {
          screenLocalId: 'home',
          screenName: 'Inicio',
          image: { body: Buffer.from('png'), contentType: 'image/png' },
          html: '<html></html>',
        },
      ],
    });
    const { tx, storage, prisma, createAndRun, service } = setup(stitch);
    await createAndRun('blueprint-version');
    expect(tx.mockupDetail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          generatorKind: 'STITCH',
          svg: null,
          screens: { create: [expect.objectContaining({ screenLocalId: 'home' })] },
        }),
      }),
    );
    const saved = tx.mockupDetail.create.mock.calls[0]![0].data.screens.create[0];
    expect(await storage.getObject(saved.imageStorageKey)).toEqual(Buffer.from('png'));
    expect(await storage.getObject(saved.htmlStorageKey)).toEqual(Buffer.from('<html></html>'));
    prisma.artifact.findFirst.mockResolvedValue({
      ...artifact,
      versions: [
        {
          ...version,
          mockupDetail: {
            ...mockupDetail,
            generatorKind: 'STITCH',
            svg: null,
            screens: [{ id: 'screen-id', screenLocalId: 'home', screenName: 'Inicio' }],
          },
        },
      ],
    });
    const preview = await service.getPreview('project', 'artifact');
    expect(preview.screens?.[0]).toMatchObject({
      imageUrl: '/projects/project/mockups/artifact/screens/screen-id/image',
      htmlUrl: '/projects/project/mockups/artifact/screens/screen-id/html',
    });
  });

  it('falls back to an internal wireframe when Stitch fails', async () => {
    const provider = new FallbackMockupProvider([
      new FakeMockupProvider(new Error('offline')),
      new FakeMockupProvider(),
    ]);
    const { tx, createAndRun } = setup(provider);
    await createAndRun('blueprint-version');
    expect(tx.mockupDetail.create.mock.calls[0]![0].data.generatorKind).toBe('INTERNAL_WIREFRAME');
  });

  it('rejects a screen outside the requested mockup and project', async () => {
    const { service, prisma } = setup();
    await expect(service.downloadScreenImage('other', 'artifact', 'screen-id')).rejects.toThrow(
      'no encontrada',
    );
    expect(prisma.mockupScreenDetail.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'screen-id',
        mockup: {
          artifactVersion: {
            projectId: 'other',
            artifactId: 'artifact',
            artifact: { artifactTypeCode: 'MOCKUP' },
          },
        },
      },
    });
  });

  it('downloads only a screen scoped to the requested mockup', async () => {
    const { service, prisma, storage } = setup();
    const screen = {
      screenName: 'Inicio',
      imageStorageKey: 'mockups/project/image.png',
      imageContentType: 'image/png',
      htmlStorageKey: 'mockups/project/page.html',
    };
    prisma.mockupScreenDetail.findFirst.mockResolvedValue(screen);
    await storage.putObject({
      key: screen.imageStorageKey,
      body: Buffer.from('image'),
      contentType: 'image/png',
    });
    await storage.putObject({
      key: screen.htmlStorageKey,
      body: Buffer.from('html'),
      contentType: 'text/html',
    });
    await expect(service.downloadScreenImage('project', 'artifact', 'screen-id')).resolves.toEqual({
      body: Buffer.from('image'),
      contentType: 'image/png',
      fileName: 'inicio.png',
    });
    await expect(service.downloadScreenHtml('project', 'artifact', 'screen-id')).resolves.toEqual({
      body: Buffer.from('html'),
    });
  });

  it('rejects incomplete or foreign provider screen lists before persistence', async () => {
    const missing = setup(new FakeMockupProvider({ kind: 'STITCH', screens: [] }));
    const missingJobId = await missing.createAndRun('blueprint-version');
    expect(missing.prisma.mockupGenerationJob.update).toHaveBeenLastCalledWith({
      where: { id: missingJobId },
      data: { status: 'FAILED', errorMessage: 'El proveedor devolvió pantallas incompletas.' },
    });
    expect(missing.tx.mockupDetail.create).not.toHaveBeenCalled();

    const foreign = setup(
      new FakeMockupProvider({
        kind: 'STITCH',
        screens: [
          {
            screenLocalId: 'other',
            screenName: 'Otra',
            image: { body: Buffer.from('x'), contentType: 'image/png' },
            html: '<html/>',
          },
        ],
      }),
    );
    const foreignJobId = await foreign.createAndRun('blueprint-version');
    expect(foreign.prisma.mockupGenerationJob.update).toHaveBeenLastCalledWith({
      where: { id: foreignJobId },
      data: { status: 'FAILED', errorMessage: 'El proveedor devolvió pantallas inesperadas.' },
    });
    expect(foreign.tx.mockupDetail.create).not.toHaveBeenCalled();
  });

  it('reports a safe job error if storing Stitch assets fails', async () => {
    const provider = new FakeMockupProvider({
      kind: 'STITCH',
      screens: [
        {
          screenLocalId: 'home',
          screenName: 'Inicio',
          image: { body: Buffer.from('x'), contentType: 'image/png' },
          html: '<html/>',
        },
      ],
    });
    const { storage, tx, prisma, createAndRun } = setup(provider);
    vi.spyOn(storage, 'putObject').mockRejectedValue(new Error('storage secret'));
    const jobId = await createAndRun('blueprint-version');
    expect(prisma.mockupGenerationJob.update).toHaveBeenLastCalledWith({
      where: { id: jobId },
      data: { status: 'FAILED', errorMessage: 'No se pudieron guardar los archivos del boceto.' },
    });
    expect(tx.mockupDetail.create).not.toHaveBeenCalled();
  });

  it('selects only approved mockups tied to the exact blueprint in export', async () => {
    const { service, prisma } = setup();
    prisma.artifact.findMany.mockResolvedValue([
      { ...artifact, versions: [{ ...version, mockupDetail }] },
      {
        ...artifact,
        id: 'old',
        versions: [
          { ...version, mockupDetail: { ...mockupDetail, uiBlueprintVersionId: 'old-blueprint' } },
        ],
      },
    ]);
    const rows = await service.listApprovedForBlueprint('project', 'blueprint-version');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ generatorKind: 'INTERNAL_WIREFRAME', screens: null });
  });

  it('rejects enqueueing for a missing/unapproved/wrong-type/cross-project source version', async () => {
    const { service, prisma } = setup();
    prisma.artifactVersion.findFirst.mockResolvedValue(null);
    await expect(service.create('project', 'missing')).rejects.toThrow('APPROVED');
  });

  it('lists, gets and previews, protecting project scope', async () => {
    const { service, prisma } = setup();
    prisma.artifact.findMany.mockResolvedValue([{ ...artifact, versions: [version] }]);
    prisma.artifact.findFirst
      .mockResolvedValueOnce({ ...artifact, versions: [version] })
      .mockResolvedValueOnce({ ...artifact, versions: [version] })
      .mockResolvedValueOnce({ ...artifact, versions: [] });
    await expect(service.list('project')).resolves.toMatchObject({ items: [{ code: 'MCK-001' }] });
    await expect(service.get('project', 'artifact')).resolves.toMatchObject({ id: 'artifact' });
    await expect(service.getPreview('project', 'artifact')).resolves.toMatchObject({
      svg: '<svg/>',
      uiBlueprintVersionId: 'blueprint-version',
    });
    await expect(service.get('other', 'artifact')).rejects.toThrow('no encontrado');
  });

  it('enqueues a version regeneration only for an existing mockup in the project', async () => {
    const { service, prisma } = setup();
    prisma.artifact.findFirst.mockResolvedValueOnce(null);
    await expect(service.version('project', 'missing', 'blueprint-version')).rejects.toThrow(
      'no encontrado',
    );

    prisma.artifact.findFirst.mockResolvedValueOnce({ id: 'artifact' });
    const job = await service.version('project', 'artifact', 'blueprint-version');
    expect(prisma.mockupGenerationJob.create).toHaveBeenCalledWith({
      data: {
        projectId: 'project',
        uiBlueprintVersionId: 'blueprint-version',
        existingMockupId: 'artifact',
        deviceType: 'DESKTOP',
      },
    });
    expect(job.status).toBe('QUEUED');
  });

  it('creates a new version by re-rendering from a (possibly different) approved blueprint version', async () => {
    const { service, tx, prisma } = setup();
    prisma.artifact.findFirst.mockResolvedValue({ id: 'artifact' });
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'artifact' }]);
    tx.artifactVersion.findFirstOrThrow.mockResolvedValue({ ...version, versionNumber: 1 });
    tx.artifactVersion.create.mockResolvedValue({ ...version, versionNumber: 2 });
    const job = await service.version('project', 'artifact', 'blueprint-version-2');
    prisma.mockupGenerationJob.findUniqueOrThrow.mockResolvedValue({
      id: job.id,
      projectId: 'project',
      uiBlueprintVersionId: 'blueprint-version-2',
      existingMockupId: 'artifact',
    });
    await service.runJob(job.id);
    expect(tx.artifactVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ versionNumber: 2 }) }),
    );
  });

  it('never versions a mockup that is not in the given project when the job runs', async () => {
    const { service, tx, prisma } = setup();
    prisma.artifact.findFirst.mockResolvedValueOnce({ id: 'artifact' });
    const job = await service.version('project', 'artifact', 'blueprint-version');
    prisma.mockupGenerationJob.findUniqueOrThrow.mockResolvedValue({
      id: job.id,
      projectId: 'project',
      uiBlueprintVersionId: 'blueprint-version',
      existingMockupId: 'artifact',
    });
    tx.$queryRaw.mockResolvedValueOnce([]);
    await service.runJob(job.id);
    expect(prisma.mockupGenerationJob.update).toHaveBeenLastCalledWith({
      where: { id: job.id },
      data: { status: 'FAILED', errorMessage: 'No se pudo generar el boceto.' },
    });
  });

  it('enforces the artifact lifecycle transition rules', async () => {
    const { service, prisma } = setup();
    prisma.artifactVersion.findFirst.mockResolvedValueOnce({ id: 'version', status: 'GENERATED' });
    prisma.artifactVersion.update.mockResolvedValue({ id: 'version', status: 'IN_REVIEW' });
    await expect(
      service.transition('project', 'artifact', 'version', 'IN_REVIEW'),
    ).resolves.toMatchObject({ status: 'IN_REVIEW' });

    prisma.artifactVersion.findFirst.mockResolvedValueOnce({ id: 'version', status: 'GENERATED' });
    await expect(service.transition('project', 'artifact', 'version', 'APPROVED')).rejects.toThrow(
      'no permitida',
    );

    prisma.artifactVersion.findFirst.mockResolvedValueOnce(null);
    await expect(service.transition('project', 'artifact', 'missing', 'IN_REVIEW')).rejects.toThrow(
      'no encontrada',
    );
  });
});
