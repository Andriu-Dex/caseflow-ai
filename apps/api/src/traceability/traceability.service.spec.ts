import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service';
import { TraceabilityService } from './traceability.service';

function emptyPrisma() {
  return {
    artifactVersion: { findMany: vi.fn().mockResolvedValue([]) },
    requirementDetail: { findMany: vi.fn().mockResolvedValue([]) },
    requirementCandidate: { findMany: vi.fn().mockResolvedValue([]) },
    useCaseDetail: { findMany: vi.fn().mockResolvedValue([]) },
    aIRun: { findMany: vi.fn().mockResolvedValue([]) },
    dataModelDetail: { findMany: vi.fn().mockResolvedValue([]) },
    structuredAnalysisDetail: { findMany: vi.fn().mockResolvedValue([]) },
    diagramDetail: { findMany: vi.fn().mockResolvedValue([]) },
    mockupDetail: { findMany: vi.fn().mockResolvedValue([]) },
    projectContextSource: { findMany: vi.fn().mockResolvedValue([]) },
    useCaseRequirementLink: { findMany: vi.fn().mockResolvedValue([]) },
    dataModelGenerationSource: { findMany: vi.fn().mockResolvedValue([]) },
    diagramSourceVersion: { findMany: vi.fn().mockResolvedValue([]) },
    structuredAnalysisGenerationSource: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

describe('TraceabilityService', () => {
  it('returns an empty graph for a project with no traced artifacts', async () => {
    const prisma = emptyPrisma();
    const service = new TraceabilityService(prisma as unknown as PrismaService);
    await expect(service.buildGraph('p')).resolves.toEqual({ nodes: [], edges: [] });
    // No follow-up queries were issued once there are zero versions to trace.
    expect(prisma.projectContextSource.findMany).not.toHaveBeenCalled();
  });

  it('marks the highest version number per artifact as current, others as historical', async () => {
    const prisma = emptyPrisma();
    const artifact = { id: 'artifact-1', code: 'NAV-001' };
    prisma.artifactVersion.findMany.mockResolvedValue([
      {
        id: 'v1',
        artifactId: artifact.id,
        versionNumber: 1,
        status: 'APPROVED',
        origin: 'MANUAL',
        title: 'Nav',
        artifact,
      },
      {
        id: 'v2',
        artifactId: artifact.id,
        versionNumber: 2,
        status: 'DRAFT',
        origin: 'MANUAL',
        title: 'Nav v2',
        artifact,
      },
    ]);
    const service = new TraceabilityService(prisma as unknown as PrismaService);
    const { nodes } = await service.buildGraph('p');
    expect(nodes.find((n) => n.id === 'v1')?.isCurrent).toBe(false);
    expect(nodes.find((n) => n.id === 'v2')?.isCurrent).toBe(true);
  });

  it('never invents an edge without a matching persisted join row', async () => {
    const prisma = emptyPrisma();
    prisma.artifactVersion.findMany.mockResolvedValue([
      {
        id: 'ctx-v1',
        artifactId: 'ctx',
        versionNumber: 1,
        status: 'APPROVED',
        origin: 'MANUAL',
        title: 'Contexto',
        artifact: { id: 'ctx', code: 'CTX-001' },
      },
      {
        id: 'rf-v1',
        artifactId: 'rf',
        versionNumber: 1,
        status: 'APPROVED',
        origin: 'MANUAL',
        title: 'RF',
        artifact: { id: 'rf', code: 'RF-001' },
      },
    ]);
    // A Requirement exists but its sourceContextVersionId is null (manual
    // creation): no CONTEXT_SOURCE_FOR_REQUIREMENT edge should be inferred.
    prisma.requirementDetail.findMany.mockResolvedValue([
      {
        artifactVersionId: 'rf-v1',
        sourceContextVersionId: null,
        generationCandidateId: null,
        aiRun: null,
      },
    ]);
    const service = new TraceabilityService(prisma as unknown as PrismaService);
    const { edges } = await service.buildGraph('p');
    expect(edges).toEqual([]);
  });
});
