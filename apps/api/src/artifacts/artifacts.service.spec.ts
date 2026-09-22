import { InternalServerErrorException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service';
import { ArtifactsService } from './artifacts.service';

const projectId = '7b1d3c4e-5f60-4a71-8b92-a3b4c5d6e7f8';
const artifactId = '9c2e4d5f-6071-4b82-9ca3-b4c5d6e7f809';
const now = new Date('2026-01-01T00:00:00.000Z');

const versionRow = {
  id: 'v-1',
  artifactId,
  projectId,
  versionNumber: 1,
  title: 'T',
  status: 'DRAFT',
  origin: 'MANUAL',
  metadataAuxiliary: {},
  createdAt: now,
  submittedAt: null,
  approvedAt: null,
};
const artifactRow = {
  id: artifactId,
  projectId,
  artifactTypeCode: 'USE_CASE',
  code: 'RF-001',
  createdAt: now,
};

// Business-rule branches with a mocked Prisma client. The real persistence
// behavior is covered by the integration suite against caseflow_test.
describe('ArtifactsService (rule branches)', () => {
  const tx = {
    project: { findUnique: vi.fn() },
    artifactType: { findUnique: vi.fn() },
    artifact: { create: vi.fn() },
    artifactVersion: { aggregate: vi.fn(), create: vi.fn() },
    $queryRaw: vi.fn(),
  };
  const prisma = {
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    artifact: { findFirst: vi.fn() },
  };
  let service: ArtifactsService;

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(tx));
    service = new ArtifactsService(prisma as unknown as PrismaService);
  });

  it('rejects PROJECT_CONTEXT through the generic artifact workflow', async () => {
    await expect(
      service.createArtifact(projectId, { type: 'PROJECT_CONTEXT', title: 'Contexto' }),
    ).rejects.toMatchObject({ status: 422 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates the artifact and version 1 using the type default prefix', async () => {
    tx.project.findUnique.mockResolvedValue({ id: projectId });
    tx.artifactType.findUnique.mockResolvedValue({ code: 'USE_CASE', defaultCodePrefix: 'CU' });
    tx.$queryRaw.mockResolvedValue([{ last_number: 7 }]);
    tx.artifact.create.mockResolvedValue({ ...artifactRow, code: 'RF-007' });
    tx.artifactVersion.create.mockResolvedValue(versionRow);

    const result = await service.createArtifact(projectId, { type: 'USE_CASE', title: 'T' });

    expect(tx.artifact.create).toHaveBeenCalledWith({
      data: { projectId, artifactTypeCode: 'USE_CASE', code: 'CU-007' },
    });
    expect(tx.artifactVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId,
        versionNumber: 1,
        status: 'DRAFT',
        origin: 'MANUAL',
        metadataAuxiliary: {},
      }),
    });
    expect(result.code).toBe('RF-007');
  });

  it('uses an explicit code prefix and the GENERATED status for AI_GENERATED', async () => {
    tx.project.findUnique.mockResolvedValue({ id: projectId });
    tx.artifactType.findUnique.mockResolvedValue({ code: 'USE_CASE', defaultCodePrefix: 'CU' });
    tx.$queryRaw.mockResolvedValue([{ last_number: 1 }]);
    tx.artifact.create.mockResolvedValue({ ...artifactRow, code: 'RNF-001' });
    tx.artifactVersion.create.mockResolvedValue(versionRow);

    await service.createArtifact(projectId, {
      type: 'USE_CASE',
      title: 'T',
      codePrefix: 'RNF',
      origin: 'AI_GENERATED',
    });

    expect(tx.artifact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: 'RNF-001' }),
    });
    expect(tx.artifactVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'GENERATED', origin: 'AI_GENERATED' }),
    });
  });

  it('does not touch the counter or create anything when the project is missing', async () => {
    tx.project.findUnique.mockResolvedValue(null);

    await expect(
      service.createArtifact(projectId, { type: 'USE_CASE', title: 'T' }),
    ).rejects.toThrow('Proyecto no encontrado.');
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.artifact.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown artifact type with 422 before allocating a code', async () => {
    tx.project.findUnique.mockResolvedValue({ id: projectId });
    tx.artifactType.findUnique.mockResolvedValue(null);

    await expect(
      service.createArtifact(projectId, { type: 'NOPE', title: 'T' }),
    ).rejects.toMatchObject({ status: 422 });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('fails safely if the counter returns no row', async () => {
    tx.project.findUnique.mockResolvedValue({ id: projectId });
    tx.artifactType.findUnique.mockResolvedValue({ code: 'USE_CASE', defaultCodePrefix: 'CU' });
    tx.$queryRaw.mockResolvedValue([]);

    await expect(
      service.createArtifact(projectId, { type: 'USE_CASE', title: 'T' }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('resolves the current version as the highest version number, scoped by project', async () => {
    prisma.artifact.findFirst.mockResolvedValue({
      ...artifactRow,
      versions: [{ ...versionRow, versionNumber: 3 }],
    });

    const result = await service.getArtifact(projectId, artifactId);

    expect(prisma.artifact.findFirst).toHaveBeenCalledWith({
      where: { id: artifactId, projectId },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    expect(result.currentVersion.versionNumber).toBe(3);
  });

  it('reports a missing artifact or one without versions as not found', async () => {
    prisma.artifact.findFirst.mockResolvedValueOnce(null);
    prisma.artifact.findFirst.mockResolvedValueOnce({ ...artifactRow, versions: [] });

    await expect(service.getArtifact(projectId, artifactId)).rejects.toThrow(
      'Artefacto no encontrado.',
    );
    await expect(service.getArtifact(projectId, artifactId)).rejects.toThrow(
      'Artefacto no encontrado.',
    );
  });

  it('appends the next version number after locking the artifact', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: artifactId }]);
    tx.artifactVersion.aggregate.mockResolvedValue({ _max: { versionNumber: 4 } });
    tx.artifactVersion.create.mockResolvedValue({ ...versionRow, versionNumber: 5 });

    const result = await service.createVersion(projectId, artifactId, { title: 'T5' });

    expect(tx.artifactVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ artifactId, projectId, versionNumber: 5, title: 'T5' }),
    });
    expect(result.versionNumber).toBe(5);
  });

  it('never creates a version when the artifact is not in the given project', async () => {
    tx.$queryRaw.mockResolvedValue([]);

    await expect(service.createVersion(projectId, artifactId, { title: 'T' })).rejects.toThrow(
      'Artefacto no encontrado.',
    );
    expect(tx.artifactVersion.create).not.toHaveBeenCalled();
  });
});
