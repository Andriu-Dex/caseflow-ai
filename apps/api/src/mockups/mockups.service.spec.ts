import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service';
import { MockupRenderer } from './mockup-renderer';
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
  svg: '<svg/>',
};
const version = {
  id: 'version',
  versionNumber: 1,
  status: 'GENERATED',
  origin: 'SYSTEM_GENERATED',
  createdAt: now,
  mockupDetail,
};

function setup() {
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
  };
  return {
    tx,
    prisma,
    service: new MockupsService(prisma as unknown as PrismaService, new MockupRenderer()),
  };
}

describe('MockupsService', () => {
  it('creates a SYSTEM_GENERATED mockup from an exact APPROVED UI Blueprint version', async () => {
    const { service, tx, prisma } = setup();
    const result = await service.create('project', 'blueprint-version');
    expect(result).toMatchObject({
      code: 'MCK-001',
      uiBlueprintVersionId: 'blueprint-version',
      version: { origin: 'SYSTEM_GENERATED', status: 'GENERATED' },
    });
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
        data: expect.objectContaining({ uiBlueprintVersionId: 'blueprint-version' }),
      }),
    );
  });

  it('rejects a missing/unapproved/wrong-type/cross-project source version', async () => {
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

  it('creates a new version by re-rendering from a (possibly different) approved blueprint version', async () => {
    const { service, tx } = setup();
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'artifact' }]);
    tx.artifactVersion.findFirstOrThrow.mockResolvedValue({ ...version, versionNumber: 1 });
    tx.artifactVersion.create.mockResolvedValue({ ...version, versionNumber: 2 });
    const result = await service.version('project', 'artifact', 'blueprint-version-2');
    expect(result.version.versionNumber).toBe(1); // findUniqueOrThrow mock still returns v1's mocked row
    expect(tx.artifactVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ versionNumber: 2 }) }),
    );
  });

  it('never versions a mockup that is not in the given project', async () => {
    const { service, tx } = setup();
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.version('project', 'missing', 'blueprint-version')).rejects.toThrow(
      'no encontrado',
    );
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
