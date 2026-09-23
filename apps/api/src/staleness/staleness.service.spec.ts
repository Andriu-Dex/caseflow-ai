import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service';
import { StalenessService } from './staleness.service';

const contextArtifact = { id: 'ctx-artifact', code: 'CTX-001' };
const contextVersion = { id: 'ctx-v1', versionNumber: 1, status: 'APPROVED' as const };
const linkedSourceVersion = {
  id: 'src-v1',
  artifactId: 'src-artifact',
  versionNumber: 1,
  artifact: { code: 'SRC-001' },
};

function setup() {
  const prisma = {
    artifact: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    artifactVersion: {
      findMany: vi.fn().mockResolvedValue([linkedSourceVersion]),
      findFirst: vi.fn().mockResolvedValue({ ...linkedSourceVersion, status: 'DRAFT' }),
    },
    requirementDetail: { findMany: vi.fn().mockResolvedValue([]) },
    useCaseRequirementLink: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return { prisma, service: new StalenessService(prisma as unknown as PrismaService) };
}

describe('StalenessService', () => {
  it('returns no entries when the project has no Project Context', async () => {
    const { prisma, service } = setup();
    prisma.artifact.findFirst.mockResolvedValue(null);
    await expect(service.analyzeProject('p')).resolves.toEqual({ entries: [] });
  });

  it('reports CURRENT when no linked source has a newer approved version and none are unlinked', async () => {
    const { prisma, service } = setup();
    prisma.artifact.findFirst.mockResolvedValue({
      id: contextArtifact.id,
      code: contextArtifact.code,
      versions: [
        {
          ...contextVersion,
          projectContextDetail: { sources: [{ sourceVersionId: linkedSourceVersion.id }] },
        },
      ],
    });
    // The linked source's own latest version is still the linked one (v1, DRAFT status irrelevant since not newer).
    prisma.artifactVersion.findFirst.mockResolvedValue({
      ...linkedSourceVersion,
      status: 'APPROVED',
      versionNumber: 1,
    });
    const result = await service.analyzeProject('p');
    expect(result.entries).toEqual([
      expect.objectContaining({
        artifactType: 'PROJECT_CONTEXT',
        impactState: 'CURRENT',
        reasons: [],
      }),
    ]);
  });

  it('flags NEWER_APPROVED_SOURCE_VERSION when a linked source has a newer APPROVED version', async () => {
    const { prisma, service } = setup();
    prisma.artifact.findFirst.mockResolvedValue({
      id: contextArtifact.id,
      code: contextArtifact.code,
      versions: [
        {
          ...contextVersion,
          projectContextDetail: { sources: [{ sourceVersionId: linkedSourceVersion.id }] },
        },
      ],
    });
    prisma.artifactVersion.findFirst.mockResolvedValue({
      id: 'src-v2',
      artifactId: linkedSourceVersion.artifactId,
      versionNumber: 2,
      status: 'APPROVED',
    });
    const result = await service.analyzeProject('p');
    expect(result.entries[0]).toMatchObject({
      impactState: 'NEWER_APPROVED_KNOWLEDGE_AVAILABLE',
      reasons: [expect.objectContaining({ type: 'NEWER_APPROVED_SOURCE_VERSION' })],
    });
  });

  it('flags NEW_APPROVED_SOURCE_NOT_LINKED for an approved source never linked to the context', async () => {
    const { prisma, service } = setup();
    prisma.artifact.findFirst.mockResolvedValue({
      id: contextArtifact.id,
      code: contextArtifact.code,
      versions: [{ ...contextVersion, projectContextDetail: { sources: [] } }],
    });
    prisma.artifact.findMany.mockResolvedValue([
      {
        id: 'unlinked-artifact',
        code: 'SRC-009',
        versions: [{ id: 'unlinked-v1', status: 'APPROVED', versionNumber: 1 }],
      },
    ]);
    const result = await service.analyzeProject('p');
    expect(result.entries[0]).toMatchObject({
      impactState: 'NEWER_APPROVED_KNOWLEDGE_AVAILABLE',
      reasons: [
        expect.objectContaining({
          type: 'NEW_APPROVED_SOURCE_NOT_LINKED',
          sourceArtifactId: 'unlinked-artifact',
        }),
      ],
    });
  });

  it('never mutates historical ArtifactVersion status while computing the analysis', async () => {
    const { prisma, service } = setup();
    prisma.artifact.findFirst.mockResolvedValue({
      id: contextArtifact.id,
      code: contextArtifact.code,
      versions: [{ ...contextVersion, projectContextDetail: { sources: [] } }],
    });
    await service.analyzeProject('p');
    expect(prisma.artifactVersion).not.toHaveProperty('update');
  });
});
