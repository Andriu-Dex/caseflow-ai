import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
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

// Without an approved navigation tree there is no menu: the screens still share the name.
const appContext = {
  appName: 'Aplicación',
  menu: [],
  activeMenuByScreen: { home: null },
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
    // A project created before DEC-118 without a theme: the standard design.
    projectMembership: { findFirst: vi.fn().mockResolvedValue({ role: 'OWNER' }) },
    project: { findUnique: vi.fn().mockResolvedValue({ designThemeRequired: false }) },
    artifact: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    structuredAnalysisDetail: {
      findUniqueOrThrow: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    artifactVersion: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'blueprint-version',
        structuredAnalysisDetail: { content: blueprintContent },
      }),
      update: vi.fn(),
    },
    mockupScreenDetail: { findFirst: vi.fn() },
    mockupGenerationJob: {
      // runJob claims a QUEUED job; every job these tests run is queued.
      updateMany: vi.fn(async () => ({ count: 1 })),
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
        refinementPrompt: null,
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
          // Outside EXPRESS only approved versions are sources (DEC-119).
          status: { in: ['APPROVED'] },
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
    // Claimed only while still QUEUED, so a redelivered job never runs twice.
    expect(prisma.mockupGenerationJob.updateMany).toHaveBeenCalledWith({
      where: { id: jobId, status: 'QUEUED' },
      data: { status: 'RUNNING' },
    });
    expect(prisma.mockupGenerationJob.updateMany).toHaveBeenLastCalledWith({
      where: { id: jobId, status: 'RUNNING' },
      data: { status: 'COMPLETED', resultArtifactId: artifact.id },
    });
  });

  it('forwards the requested deviceType to the provider and stores it on the mockup', async () => {
    const generate = vi.fn().mockResolvedValue({ kind: 'INTERNAL_WIREFRAME', svg: '<svg/>' });
    const provider: MockupProvider = { id: 'spy', generate };
    const { tx, createAndRun } = setup(provider);
    await createAndRun('blueprint-version', 'MOBILE');
    expect(generate).toHaveBeenCalledWith(
      blueprintContent,
      'MOBILE',
      undefined,
      undefined,
      appContext,
    );
    expect(tx.mockupDetail.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deviceType: 'MOBILE' }) }),
    );
  });

  // DEC-118: mockups are painted with the current approved theme and record it.
  it('passes the approved theme to the provider and records its version', async () => {
    const generate = vi.fn().mockResolvedValue({ kind: 'INTERNAL_WIREFRAME', svg: '<svg/>' });
    const { tx, prisma, createAndRun } = setup({ id: 'spy', generate });
    const theme = {
      name: 'Océano',
      mode: 'LIGHT',
      light: Object.fromEntries(
        [
          'background',
          'foreground',
          'primary',
          'primaryForeground',
          'secondary',
          'secondaryForeground',
          'accent',
          'accentForeground',
          'muted',
          'mutedForeground',
          'destructive',
          'destructiveForeground',
          'border',
        ].map((token) => [token, '#123456']),
      ),
    };
    prisma.artifact.findMany.mockResolvedValue([
      {
        id: 'theme',
        code: 'TEM-001',
        versions: [{ id: 'theme-v1', versionNumber: 1, approvedAt: now, createdAt: now }],
      },
    ]);
    prisma.structuredAnalysisDetail.findUniqueOrThrow.mockResolvedValue({ content: theme });
    await createAndRun('blueprint-version');
    expect(generate).toHaveBeenCalledWith(
      blueprintContent,
      'DESKTOP',
      undefined,
      theme,
      appContext,
    );
    expect(tx.mockupDetail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ designThemeVersionId: 'theme-v1' }),
      }),
    );
  });

  it('refuses to generate mockups for a new project without an approved theme', async () => {
    const { service, prisma } = setup();
    prisma.project.findUnique.mockResolvedValue({ designThemeRequired: true });
    await expect(service.create('project', 'blueprint-version')).rejects.toThrow(
      'Apruebe el tema y los colores antes de generar los bocetos.',
    );
    expect(prisma.mockupGenerationJob.create).not.toHaveBeenCalled();
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
    expect(prisma.mockupGenerationJob.updateMany).toHaveBeenLastCalledWith({
      where: { id: job.id, status: 'RUNNING' },
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

  it('cancels a running job keeping its screens, and leaves a finished job as it was', async () => {
    const { service, prisma } = setup();
    prisma.mockupGenerationJob.findFirst.mockResolvedValueOnce({
      id: 'job-1',
      status: 'RUNNING',
      totalScreens: 77,
      _count: { parts: 12 },
    });
    prisma.mockupGenerationJob.findFirst.mockResolvedValueOnce({
      id: 'job-1',
      status: 'CANCELLED',
    });
    await service.cancelJob('project', 'job-1', 'u').catch(() => undefined);
    expect(prisma.mockupGenerationJob.updateMany).toHaveBeenCalledWith({
      where: { id: 'job-1', projectId: 'project', status: { in: ['QUEUED', 'RUNNING'] } },
      data: { status: 'CANCELLED', errorMessage: 'Se canceló con 12 de 77 pantallas generadas.' },
    });

    prisma.mockupGenerationJob.updateMany.mockClear();
    prisma.mockupGenerationJob.findFirst.mockResolvedValue({
      id: 'job-2',
      status: 'COMPLETED',
      totalScreens: 1,
      _count: { parts: 1 },
    });
    await service.cancelJob('project', 'job-2', 'u').catch(() => undefined);
    expect(prisma.mockupGenerationJob.updateMany).not.toHaveBeenCalled();

    prisma.mockupGenerationJob.findFirst.mockResolvedValue(null);
    await expect(service.cancelJob('other', 'job-1', 'u')).rejects.toThrow('no encontrado');
  });

  it('refuses to cancel a job for a user without permission', async () => {
    const { service, prisma } = setup();
    prisma.projectMembership.findFirst.mockResolvedValue(null);
    await expect(service.cancelJob('project', 'job-1', 'viewer')).rejects.toThrow(
      'No tiene permisos',
    );
    expect(prisma.mockupGenerationJob.updateMany).not.toHaveBeenCalled();
  });

  it('stops asking Stitch for screens once the job is cancelled', async () => {
    const { service, prisma } = setup();
    const job = { id: 'job-1', stitchProjectId: 'sp', parts: [] };
    const content = {
      screens: Array.from({ length: 12 }, (_, i) => ({ localId: `s${i}`, name: `s${i}` })),
    };
    const drawn: string[] = [];
    const generator = {
      createProject: vi.fn(),
      generateScreen: vi.fn(async (_p: string, screen: { localId: string }) => {
        drawn.push(screen.localId);
        return { screenName: screen.localId, image: new Uint8Array([1]), html: '<p/>' };
      }),
    };
    Object.assign(prisma.mockupGenerationJob, {
      findUniqueOrThrow: vi.fn().mockResolvedValue(job),
      // The person cancels after the first screen was drawn.
      count: vi.fn(async () => (drawn.length >= 1 ? 1 : 0)),
    });
    Object.assign(prisma, {
      mockupGenerationPart: { create: vi.fn(async ({ data }: { data: object }) => data) },
    });
    const run = (
      service as unknown as {
        generateScreenByScreen: (...args: unknown[]) => Promise<unknown>;
      }
    ).generateScreenByScreen(
      'job-1',
      'project',
      content,
      'DESKTOP',
      null,
      undefined,
      null,
      generator,
      {},
    );
    await expect(run).rejects.toThrow();
    // Calls already in flight finish (at most the concurrency), but no new one starts.
    expect(drawn.length).toBeLessThan(12);
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

  it('bundles every Stitch screen image into a downloadable ZIP', async () => {
    const { service, prisma, storage } = setup();
    const screens = [
      {
        id: 's1',
        screenLocalId: 'home',
        screenName: 'Inicio',
        imageStorageKey: 'mockups/project/home.png',
        imageContentType: 'image/png',
        htmlStorageKey: 'mockups/project/home.html',
      },
      {
        id: 's2',
        screenLocalId: 'detail',
        screenName: 'Detalle',
        imageStorageKey: 'mockups/project/detail.png',
        imageContentType: 'image/png',
        htmlStorageKey: 'mockups/project/detail.html',
      },
    ];
    prisma.artifact.findFirst.mockResolvedValue({
      ...artifact,
      versions: [
        {
          ...version,
          mockupDetail: { ...mockupDetail, generatorKind: 'STITCH', svg: null, screens },
        },
      ],
    });
    await storage.putObject({
      key: screens[0]!.imageStorageKey,
      body: Buffer.from('png-home'),
      contentType: 'image/png',
    });
    await storage.putObject({
      key: screens[1]!.imageStorageKey,
      body: Buffer.from('png-detail'),
      contentType: 'image/png',
    });

    const { body, fileName } = await service.downloadMockupScreensZip('project', 'artifact');
    expect(fileName).toBe('MCK-001-pantallas.zip');
    const zip = await JSZip.loadAsync(body);
    expect(Object.keys(zip.files).sort()).toEqual(['01-inicio.png', '02-detalle.png']);
    expect(await zip.files['01-inicio.png']!.async('nodebuffer')).toEqual(Buffer.from('png-home'));
    expect(await zip.files['02-detalle.png']!.async('nodebuffer')).toEqual(
      Buffer.from('png-detail'),
    );
  });

  it('rejects a ZIP download for a mockup with no screen images (internal wireframe)', async () => {
    const { service, prisma } = setup();
    prisma.artifact.findFirst.mockResolvedValue({ ...artifact, versions: [version] });
    await expect(service.downloadMockupScreensZip('project', 'artifact')).rejects.toThrow(
      'No hay imágenes para descargar.',
    );
  });

  it('rejects a ZIP whose combined image size exceeds the archive limit', async () => {
    const { service, prisma, storage } = setup();
    const screens = [
      {
        id: 's1',
        screenLocalId: 'home',
        screenName: 'Inicio',
        imageStorageKey: 'mockups/project/home.png',
        imageContentType: 'image/png',
        htmlStorageKey: 'mockups/project/home.html',
      },
    ];
    prisma.artifact.findFirst.mockResolvedValue({
      ...artifact,
      versions: [
        {
          ...version,
          mockupDetail: { ...mockupDetail, generatorKind: 'STITCH', svg: null, screens },
        },
      ],
    });
    vi.spyOn(storage, 'getObject').mockResolvedValue(Buffer.alloc(300_000_001));
    await expect(service.downloadMockupScreensZip('project', 'artifact')).rejects.toThrow(
      'supera el límite',
    );
  });

  it('downloads the ZIP of a mockup of many screens, about 60 MB of images, which the old limit refused', async () => {
    const { service, prisma, storage } = setup();
    const screens = Array.from({ length: 3 }, (_, i) => ({
      id: `s${i}`,
      screenLocalId: `p${i}`,
      screenName: `Pantalla ${i}`,
      imageStorageKey: `mockups/project/${i}.png`,
      imageContentType: 'image/png',
      htmlStorageKey: `mockups/project/${i}.html`,
    }));
    prisma.artifact.findFirst.mockResolvedValue({
      ...artifact,
      versions: [
        {
          ...version,
          mockupDetail: { ...mockupDetail, generatorKind: 'STITCH', svg: null, screens },
        },
      ],
    });
    vi.spyOn(storage, 'getObject').mockResolvedValue(Buffer.alloc(20_000_000));
    const { body } = await service.downloadMockupScreensZip('project', 'artifact');
    expect(body.length).toBeGreaterThan(60_000_000);
    expect(Object.keys((await JSZip.loadAsync(body)).files)).toHaveLength(3);
  });

  it('rejects incomplete or foreign provider screen lists before persistence', async () => {
    const missing = setup(new FakeMockupProvider({ kind: 'STITCH', screens: [] }));
    const missingJobId = await missing.createAndRun('blueprint-version');
    expect(missing.prisma.mockupGenerationJob.updateMany).toHaveBeenLastCalledWith({
      where: { id: missingJobId, status: 'RUNNING' },
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
    expect(foreign.prisma.mockupGenerationJob.updateMany).toHaveBeenLastCalledWith({
      where: { id: foreignJobId, status: 'RUNNING' },
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
    expect(prisma.mockupGenerationJob.updateMany).toHaveBeenLastCalledWith({
      where: { id: jobId, status: 'RUNNING' },
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
        refinementPrompt: null,
      },
    });
    expect(job.status).toBe('QUEUED');
  });

  const stitchLatest = {
    ...artifact,
    versions: [
      {
        ...version,
        mockupDetail: { ...mockupDetail, generatorKind: 'STITCH', deviceType: 'MOBILE' },
      },
    ],
  };

  it('enqueues a refinement as a new version of the same Stitch mockup, keeping blueprint and device', async () => {
    const { service, prisma } = setup();
    prisma.artifact.findFirst.mockResolvedValue(stitchLatest);
    const job = await service.refine('project', 'artifact', 'Usa tonos verdes');
    expect(prisma.mockupGenerationJob.create).toHaveBeenCalledWith({
      data: {
        projectId: 'project',
        uiBlueprintVersionId: 'blueprint-version',
        existingMockupId: 'artifact',
        deviceType: 'MOBILE',
        refinementPrompt: 'Usa tonos verdes',
      },
    });
    expect(job.status).toBe('QUEUED');
  });

  it('refuses to refine an internal wireframe, a foreign mockup or one whose blueprint is no longer approved', async () => {
    const { service, prisma } = setup();
    prisma.artifact.findFirst.mockResolvedValueOnce({ ...artifact, versions: [version] });
    await expect(service.refine('project', 'artifact', 'Cambiar')).rejects.toThrow('Stitch');

    prisma.artifact.findFirst.mockResolvedValueOnce(null);
    await expect(service.refine('other-project', 'artifact', 'Cambiar')).rejects.toThrow(
      'no encontrado',
    );

    prisma.artifact.findFirst.mockResolvedValueOnce(stitchLatest);
    prisma.artifactVersion.findFirst.mockResolvedValueOnce(null);
    await expect(service.refine('project', 'artifact', 'Cambiar')).rejects.toThrow('APPROVED');
    expect(prisma.mockupGenerationJob.create).not.toHaveBeenCalled();
  });

  it('passes the refinement to the provider and records it on the new version', async () => {
    const generate = vi.fn().mockResolvedValue({
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
    const { service, tx, prisma } = setup({ id: 'spy', generate });
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'artifact' }]);
    prisma.mockupGenerationJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job-1',
      projectId: 'project',
      uiBlueprintVersionId: 'blueprint-version',
      existingMockupId: 'artifact',
      deviceType: 'DESKTOP',
      refinementPrompt: 'Usa tonos verdes',
    });
    await service.runJob('job-1');
    expect(generate).toHaveBeenCalledWith(
      blueprintContent,
      'DESKTOP',
      'Usa tonos verdes',
      undefined,
      appContext,
    );
    expect(tx.mockupDetail.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ refinementPrompt: 'Usa tonos verdes' }),
      }),
    );
  });

  const stitchScreen = (id: string, localId: string, ref: boolean) => ({
    id,
    screenLocalId: localId,
    screenName: localId,
    imageStorageKey: `${localId}.png`,
    imageContentType: 'image/png',
    htmlStorageKey: `${localId}.html`,
    stitchProjectId: ref ? 'stitch-project' : null,
    stitchScreenId: ref ? `stitch-${localId}` : null,
    refinementPrompt: null,
  });
  const twoScreenLatest = (ref = true) => ({
    ...artifact,
    versions: [
      {
        ...version,
        mockupDetail: {
          ...mockupDetail,
          generatorKind: 'STITCH',
          deviceType: 'DESKTOP',
          svg: null,
          screens: [stitchScreen('s-home', 'home', ref), stitchScreen('s-list', 'list', ref)],
        },
      },
    ],
  });

  it('enqueues a single-screen edit targeting that screen of the latest version', async () => {
    const { service, prisma } = setup();
    prisma.artifact.findFirst.mockResolvedValue(twoScreenLatest());
    await service.refineScreen('project', 'artifact', 's-list', 'Agrega un buscador');
    expect(prisma.mockupGenerationJob.create).toHaveBeenCalledWith({
      data: {
        projectId: 'project',
        uiBlueprintVersionId: 'blueprint-version',
        existingMockupId: 'artifact',
        deviceType: 'DESKTOP',
        refinementPrompt: 'Agrega un buscador',
        screenLocalId: 'list',
      },
    });
  });

  it('rejects editing a screen from another version or one without its Stitch identity', async () => {
    const { service, prisma } = setup();
    prisma.artifact.findFirst.mockResolvedValueOnce(twoScreenLatest());
    await expect(
      service.refineScreen('project', 'artifact', 'old-screen', 'x y z'),
    ).rejects.toThrow('no encontrada');
    prisma.artifact.findFirst.mockResolvedValueOnce(twoScreenLatest(false));
    await expect(service.refineScreen('project', 'artifact', 's-home', 'x y z')).rejects.toThrow(
      'individualmente',
    );
    expect(prisma.mockupGenerationJob.create).not.toHaveBeenCalled();
  });

  it('edits only the target screen at Stitch and carries the other screens over unchanged', async () => {
    const editScreen = vi.fn().mockResolvedValue({
      image: { body: Buffer.from('new'), contentType: 'image/png' },
      html: '<html>new</html>',
      providerRef: { projectId: 'stitch-project', screenId: 'stitch-list-v2' },
    });
    const generate = vi.fn();
    const { service, tx, prisma, storage } = setup({ id: 'stitch', generate, editScreen });
    prisma.artifact.findFirst.mockResolvedValue(twoScreenLatest());
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'artifact' }]);
    prisma.mockupGenerationJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job-1',
      projectId: 'project',
      uiBlueprintVersionId: 'blueprint-version',
      existingMockupId: 'artifact',
      deviceType: 'DESKTOP',
      refinementPrompt: 'Agrega un buscador',
      screenLocalId: 'list',
    });
    await service.runJob('job-1');

    expect(generate).not.toHaveBeenCalled();
    expect(editScreen).toHaveBeenCalledWith(
      { projectId: 'stitch-project', screenId: 'stitch-list' },
      'Agrega un buscador',
      'DESKTOP',
    );
    const data = tx.mockupDetail.create.mock.calls[0]![0].data;
    expect(data.refinementPrompt).toBeNull();
    const [home, list] = data.screens.create;
    expect(home).toMatchObject({
      screenLocalId: 'home',
      imageStorageKey: 'home.png',
      stitchScreenId: 'stitch-home',
      refinementPrompt: null,
    });
    expect(list).toMatchObject({
      screenLocalId: 'list',
      stitchScreenId: 'stitch-list-v2',
      refinementPrompt: 'Agrega un buscador',
    });
    expect(list.imageStorageKey).not.toBe('list.png');
    expect(await storage.getObject(list.imageStorageKey)).toEqual(Buffer.from('new'));
    expect(prisma.mockupGenerationJob.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'job-1', status: 'RUNNING' },
      data: { status: 'COMPLETED', resultArtifactId: artifact.id },
    });
  });

  it('fails a single-screen edit safely when the provider cannot edit', async () => {
    const { service, tx, prisma } = setup(new FakeMockupProvider());
    prisma.artifact.findFirst.mockResolvedValue(twoScreenLatest());
    prisma.mockupGenerationJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job-1',
      projectId: 'project',
      uiBlueprintVersionId: 'blueprint-version',
      existingMockupId: 'artifact',
      deviceType: 'DESKTOP',
      refinementPrompt: 'Agrega un buscador',
      screenLocalId: 'list',
    });
    await service.runJob('job-1');
    expect(tx.mockupDetail.create).not.toHaveBeenCalled();
    expect(prisma.mockupGenerationJob.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'job-1', status: 'RUNNING' },
      data: {
        status: 'FAILED',
        errorMessage: 'Stitch no está disponible para editar la pantalla.',
      },
    });
  });

  it('fails a refinement job instead of silently storing a wireframe fallback', async () => {
    const { service, tx, prisma } = setup(new FakeMockupProvider());
    prisma.mockupGenerationJob.findUniqueOrThrow.mockResolvedValue({
      id: 'job-1',
      projectId: 'project',
      uiBlueprintVersionId: 'blueprint-version',
      existingMockupId: 'artifact',
      deviceType: 'DESKTOP',
      refinementPrompt: 'Usa tonos verdes',
    });
    await service.runJob('job-1');
    expect(tx.mockupDetail.create).not.toHaveBeenCalled();
    expect(prisma.mockupGenerationJob.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'job-1', status: 'RUNNING' },
      data: {
        status: 'FAILED',
        errorMessage: 'Stitch no está disponible; no se pudo aplicar la edición del boceto.',
      },
    });
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
    expect(prisma.mockupGenerationJob.updateMany).toHaveBeenLastCalledWith({
      where: { id: job.id, status: 'RUNNING' },
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
