import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { UserManualsService } from './user-manuals.service';
import type { UserManualResponse } from '@caseflow-ai/contracts';
import { capturePng } from '../../../../packages/integrations/src/testing/runtime-capture-fixture';

const id = '00000000-0000-4000-8000-000000000001';
const manual: UserManualResponse = {
  id,
  code: 'MAN-001',
  snapshotId: id,
  isCurrent: true,
  introduction: 'Guía de uso',
  version: { id, versionNumber: 1, status: 'IN_REVIEW' },
  history: [],
  tasks: [
    {
      id,
      generatedFileId: id,
      routePath: '/items',
      title: 'Artículos',
      roles: ['Editor'],
      verified: true,
      steps: [{ instruction: 'Abra Artículos.', expectedResult: 'Compruebe el listado.' }],
    },
  ],
};
const software = Buffer.from('original software archive');
const snapshot = {
  id,
  projectId: id,
  generationRunId: id,
  designBaselineId: id,
  implementationPlanVersionId: id,
  archiveStorageKey: 'archive',
  archiveSize: software.length,
  archiveSha256: createHash('sha256').update(software).digest('hex'),
};
const plan = {
  designBaselineId: id,
  authentication: { required: false, roles: [] },
  modules: [{ localId: 'items', name: 'Items', description: 'Artículos' }],
  entities: [
    {
      localId: 'item',
      name: 'Item',
      moduleLocalId: 'items',
      fields: [{ name: 'name', type: 'STRING' }],
    },
  ],
  routes: [{ path: '/items', screenName: 'Artículos', moduleLocalId: 'items', kind: 'LIST' }],
};

function setup() {
  const job = { id, projectId: id, snapshotId: id, status: 'QUEUED', errorMessage: null };
  const prisma = {
    generatedProjectSnapshot: { findFirst: vi.fn().mockResolvedValue(snapshot) },
    projectMembership: { findFirst: vi.fn().mockResolvedValue({ role: 'OWNER' }) },
    userManualJob: {
      upsert: vi.fn().mockResolvedValue(job),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(job),
      findFirst: vi.fn().mockResolvedValue(job),
      findMany: vi.fn().mockResolvedValue([job]),
      update: vi.fn(),
    },
    artifactVersion: {
      findFirst: vi.fn().mockResolvedValue({
        id,
        projectId: id,
        status: 'APPROVED',
        structuredAnalysisDetail: { content: plan },
      }),
      findFirstOrThrow: vi.fn().mockResolvedValue({ id, versionNumber: 1, status: 'IN_REVIEW' }),
      create: vi.fn().mockResolvedValue({ id }),
      update: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    designBaseline: { findFirst: vi.fn().mockResolvedValue({ entries: [] }) },
    generatedFile: {
      findMany: vi.fn().mockResolvedValue([{ id, path: 'apps/web/app/items/page.tsx' }]),
    },
    userManualDetail: { findFirst: vi.fn().mockResolvedValue(null) },
    userManualCapture: { findMany: vi.fn().mockResolvedValue([]) },
    artifact: { create: vi.fn().mockResolvedValue({ id }) },
    $queryRaw: vi.fn().mockResolvedValue([{ last_number: 1 }]),
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation((callback) => callback(prisma));
  const queue = { add: vi.fn().mockResolvedValue(undefined) };
  const audit = { record: vi.fn() };
  const storage = {
    getObject: vi.fn().mockResolvedValue(software),
    putObject: vi.fn(),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  };
  const service = new UserManualsService(
    prisma as never,
    audit as never,
    queue as never,
    storage as never,
  );
  return { service, prisma, queue, audit, storage, job };
}

describe('UserManualsService', () => {
  it('returns the new manual when capture completes during the final status poll', async () => {
    const { service, prisma, job } = setup();
    let completed = false;
    prisma.userManualJob.findFirst.mockImplementation(async () => {
      completed = true;
      return { ...job, status: 'COMPLETED' };
    });
    vi.spyOn(service, 'get').mockImplementation(async () => ({
      ...manual,
      version: { ...manual.version, versionNumber: completed ? 2 : 1 },
    }));
    const state = await service.state(id, id);
    expect(state.job?.status).toBe('COMPLETED');
    expect(state.manual?.version.versionNumber).toBe(2);
  });
  async function captureSetup() {
    const context = setup();
    const { service, prisma, storage, job } = context;
    Object.assign(job, { captureRequested: true });
    vi.spyOn(service, 'get').mockResolvedValue(manual);
    prisma.artifactVersion.findFirstOrThrow.mockResolvedValue({
      id,
      artifactId: id,
      versionNumber: 2,
      title: 'Manual',
      userManualDetail: {
        introduction: 'Edición actual',
        tasks: manual.tasks.map((task) => ({
          ...task,
          roles: task.roles.map((name) => ({ name })),
        })),
      },
    } as never);
    const zip = new JSZip();
    zip.file('software/package.json', '{}', { createFolders: false });
    zip.file('software/pnpm-lock.yaml', 'lockfileVersion: 9', { createFolders: false });
    const archive = await zip.generateAsync({ type: 'nodebuffer' });
    storage.getObject.mockResolvedValue(archive);
    prisma.generatedProjectSnapshot.findFirst.mockResolvedValue({
      ...snapshot,
      targetTemplateIdentifier: 'CASEFLOW_WEB_TS_V1',
      archiveSha256: createHash('sha256').update(archive).digest('hex'),
    });
    const capture = vi.fn(async ({ targets }: { targets: { routePath: string; role: string }[] }) =>
      targets.map((target) => ({
        ...target,
        status: 'CAPTURED',
        png: capturePng(),
        width: 1440,
        height: 900,
        reason: null,
      })),
    );
    Reflect.set(service, 'captureProvider', { capture });
    return { ...context, capture };
  }
  it('adds screenshot evidence in a new unverified version and copies the current text', async () => {
    const { service, prisma, storage, capture } = await captureSetup();
    await service.runJob(id, id);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'image/png' }),
    );
    const created = prisma.artifactVersion.create.mock.calls[0]![0] as {
      data: {
        versionNumber: number;
        userManualDetail: {
          create: {
            introduction: string;
            tasks: {
              create: {
                verified: boolean;
                captures: { createMany: { data: { status: string }[] } };
              }[];
            };
          };
        };
      };
    };
    expect(created.data.versionNumber).toBe(3);
    expect(created.data.userManualDetail.create.introduction).toBe('Edición actual');
    expect(created.data.userManualDetail.create.tasks.create[0]).toMatchObject({
      verified: false,
      captures: { createMany: { data: [{ status: 'CAPTURED' }] } },
    });
    expect(prisma.userManualJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'COMPLETED', errorMessage: null } }),
    );
  });
  it('keeps a safe schematic fallback when Docker fails and cleans stored files if persistence fails', async () => {
    const failed = await captureSetup();
    failed.capture.mockRejectedValue(new Error('private Docker credential'));
    await failed.service.runJob(id, id);
    expect(failed.storage.putObject).not.toHaveBeenCalled();
    expect(JSON.stringify(failed.prisma.artifactVersion.create.mock.calls)).not.toContain(
      'credential',
    );
    expect(JSON.stringify(failed.prisma.artifactVersion.create.mock.calls)).toContain('FAILED');
    const rollback = await captureSetup();
    rollback.prisma.artifactVersion.create.mockRejectedValue(new Error('Transaction aborted'));
    await rollback.service.runJob(id, id);
    expect(rollback.storage.deleteObject).toHaveBeenCalledTimes(1);
    expect(rollback.prisma.userManualJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });
  it('checks private image scope and integrity and refuses capture without a provider', async () => {
    const { service, prisma, storage } = setup();
    vi.spyOn(service, 'get').mockResolvedValue(manual);
    await expect(service.capture(id, id, id)).rejects.toThrow('capturador');
    const findFirst = vi.fn().mockResolvedValue(null);
    Object.assign(prisma.userManualCapture, { findFirst });
    await expect(service.image(id, id, id, id)).rejects.toThrow('no encontrada');
    findFirst.mockResolvedValue({
      storageKey: 'private',
      sha256: createHash('sha256').update(software).digest('hex'),
    } as never);
    expect(await service.image(id, id, id, id)).toEqual(software);
    storage.getObject.mockResolvedValue(Buffer.from('tampered'));
    await expect(service.image(id, id, id, id)).rejects.toThrow('evidencia');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          task: {
            manualVersionId: id,
            manual: { snapshotId: id, artifactVersion: { projectId: id } },
          },
        }),
      }),
    );
  });
  it('enqueues idempotent work and records safe failures separately from software validation', async () => {
    const { service, prisma, queue, job } = setup();
    await service.enqueue(id, id, id);
    expect(queue.add).toHaveBeenCalledWith('user-manual', {
      projectId: id,
      runId: id,
      type: 'user-manual',
    });
    queue.add.mockRejectedValue(new Error('private transport failure'));
    await service.enqueue(id, id);
    expect(prisma.userManualJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
    expect(JSON.stringify(prisma.userManualJob.updateMany.mock.calls)).not.toContain(
      'private transport',
    );
    prisma.userManualJob.upsert.mockResolvedValue({ ...job, status: 'COMPLETED' });
    queue.add.mockClear();
    await service.enqueue(id, id);
    expect(queue.add).not.toHaveBeenCalled();
  });
  it('refuses missing resources, viewers and mismatched job projects', async () => {
    const { service, prisma } = setup();
    prisma.projectMembership.findFirst.mockResolvedValue({ role: 'VIEWER' });
    await expect(service.enqueue(id, id, id)).rejects.toThrow('rol');
    prisma.generatedProjectSnapshot.findFirst.mockResolvedValue(null);
    await expect(service.enqueue(id, id)).rejects.toThrow('no encontrada');
    prisma.generatedProjectSnapshot.findFirst.mockResolvedValue(snapshot);
    prisma.userManualJob.upsert.mockResolvedValue({
      id,
      snapshotId: id,
      projectId: 'foreign',
      status: 'QUEUED',
      errorMessage: null,
    });
    await expect(service.enqueue(id, id)).rejects.toThrow('no encontrado');
  });
  it('generates once from pinned plan and files and records provenance', async () => {
    const { service, prisma, audit } = setup();
    await service.runJob(id, id);
    expect(prisma.artifactVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'GENERATED', origin: 'SYSTEM_GENERATED' }),
      }),
    );
    expect(prisma.userManualJob.update).toHaveBeenCalledWith({
      where: { id },
      data: { status: 'COMPLETED' },
    });
    expect(audit.record).toHaveBeenCalled();
    prisma.userManualDetail.findFirst.mockResolvedValue({ artifactVersionId: id } as never);
    prisma.artifactVersion.create.mockClear();
    await service.runJob(id, id);
    expect(prisma.artifactVersion.create).not.toHaveBeenCalled();
    prisma.userManualJob.updateMany.mockResolvedValue({ count: 0 });
    await service.runJob(id, id);
  });
  it('marks invalid generation input failed and recovers interrupted or queued work', async () => {
    const { service, prisma, queue } = setup();
    prisma.generatedFile.findMany.mockResolvedValue([]);
    await service.runJob(id, id);
    expect(prisma.userManualJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
    expect(await service.recover(new Date())).toBe(1);
    expect(queue.add).toHaveBeenCalled();
  });
  it('maps immutable content, versions and whether a newer snapshot exists', async () => {
    const { service, prisma } = setup();
    prisma.artifactVersion.findFirst.mockResolvedValue({
      id,
      artifactId: id,
      projectId: id,
      versionNumber: 1,
      status: 'GENERATED',
      artifact: { code: 'MAN-001' },
      userManualDetail: {
        introduction: 'Guía',
        tasks: manual.tasks.map((task) => ({
          ...task,
          captures: [],
          roles: task.roles.map((name) => ({ name })),
        })),
      },
    } as never);
    expect(await service.get(id, id)).toMatchObject({
      isCurrent: true,
      tasks: [{ roles: ['Editor'] }],
    });
    expect(await service.state(id, id)).toHaveProperty('job.status', 'QUEUED');
    prisma.artifactVersion.findFirst.mockResolvedValue(null as never);
    expect(await service.get(id, id)).toBeNull();
    await expect(service.get(id, id, id)).rejects.toThrow('no encontrada');
  });
  it('creates an edit version without altering sources and rejects lost updates or removed tasks', async () => {
    const { service, prisma } = setup();
    vi.spyOn(service, 'get').mockResolvedValue(manual);
    const input = {
      expectedVersionId: id,
      introduction: 'Guía nueva',
      tasks: manual.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        verified: true,
        steps: task.steps,
      })),
    };
    await service.edit(id, id, id, input);
    expect(prisma.artifactVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ versionNumber: 2, status: 'DRAFT' }),
      }),
    );
    await expect(service.edit(id, id, id, { ...input, tasks: [] })).rejects.toThrow('Conserve');
    await expect(service.edit(id, id, id, { ...input, expectedVersionId: 'old' })).rejects.toThrow(
      'Recargue',
    );
  });
  it('requires human verification, a valid transition and the current version before approval', async () => {
    const { service, prisma } = setup();
    prisma.userManualJob.findFirst.mockResolvedValue(null as never);
    const get = vi.spyOn(service, 'get').mockResolvedValue({
      ...manual,
      tasks: manual.tasks.map((task) => ({ ...task, verified: false })),
    });
    await expect(service.transition(id, id, id, id, 'APPROVED')).rejects.toThrow(
      'todas las tareas',
    );
    get.mockResolvedValue(manual);
    await service.transition(id, id, id, id, 'APPROVED');
    expect(prisma.artifactVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ approvalOrigin: 'HUMAN' }) }),
    );
    await expect(service.transition(id, id, id, id, 'DRAFT')).rejects.toThrow('Transición');
    prisma.artifactVersion.findFirstOrThrow.mockResolvedValue({
      id: 'new',
      versionNumber: 2,
      status: 'DRAFT',
    });
    await expect(service.transition(id, id, id, id, 'APPROVED')).rejects.toThrow('última');
  });
  it('exports review drafts and binds delivery bytes to the immutable software hash', async () => {
    const { service, storage, prisma } = setup();
    const get = vi.spyOn(service, 'get').mockResolvedValue(manual);
    expect((await service.download(id, id, id, id, 'html')).body.toString()).toContain('BORRADOR');
    expect((await service.download(id, id, id, id, 'pdf')).body.subarray(0, 4).toString()).toBe(
      '%PDF',
    );
    await expect(service.download(id, id, id, id, 'zip')).rejects.toThrow('Apruebe');
    get.mockResolvedValue({ ...manual, version: { ...manual.version, status: 'APPROVED' } });
    const result = await service.download(id, id, id, id, 'zip');
    const zip = await JSZip.loadAsync(result.body);
    expect(await zip.file('software.zip')!.async('nodebuffer')).toEqual(software);
    storage.getObject.mockResolvedValue(Buffer.from('tampered'));
    await expect(service.download(id, id, id, id, 'zip')).rejects.toThrow('no coincide');
    prisma.generatedProjectSnapshot.findFirst.mockResolvedValue({
      ...snapshot,
      archiveSize: 300_000_000,
    });
    await expect(service.download(id, id, id, id, 'zip')).rejects.toThrow('por separado');
  });
});
