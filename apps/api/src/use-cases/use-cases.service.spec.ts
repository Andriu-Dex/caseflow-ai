import { describe, expect, it, vi } from 'vitest';
import { AIError, type AIOrchestrator } from '@caseflow-ai/ai';
import type { PrismaService } from '../database/prisma.service';
import { UseCasesService } from './use-cases.service';
const detail = {
  name: 'N',
  objective: 'O',
  primaryActor: 'U',
  generationId: null,
  generationCandidateId: null,
  aiRunId: null,
  secondaryActors: [],
  preconditions: [],
  postconditions: [],
  mainFlowSteps: [{ actor: 'U', action: 'A' }],
  alternativeFlows: [],
  requirementLinks: [{ requirementVersionId: 'r' }],
};
const version = {
  id: 'v',
  versionNumber: 1,
  status: 'DRAFT',
  origin: 'MANUAL',
  createdAt: new Date(),
  useCaseDetail: detail,
};
const artifact = {
  id: 'a',
  projectId: 'p',
  code: 'CU-001',
  createdAt: new Date(),
  versions: [version],
};
describe('UseCasesService', () => {
  const input = {
    name: 'N',
    objective: 'O',
    primaryActor: 'U',
    secondaryActors: [],
    preconditions: [],
    postconditions: [],
    mainFlow: [{ actor: 'U', action: 'A' }],
    alternativeFlows: [],
    relatedRequirementVersionIds: ['r'],
  };
  const requirementVersion = {
    id: 'r',
    status: 'APPROVED',
    artifact: { id: 'ra', code: 'RF-001' },
    requirementDetail: { name: 'R', actors: [], preconditions: [], postconditions: [] },
  };
  const transaction = () => {
    const tx = {
      project: { findUnique: vi.fn().mockResolvedValue({ id: 'p' }) },
      artifactVersion: {
        findMany: vi.fn().mockResolvedValue([requirementVersion]),
        create: vi.fn().mockResolvedValue(version),
        findFirstOrThrow: vi.fn().mockResolvedValue(version),
        findUniqueOrThrow: vi.fn().mockResolvedValue(version),
        findFirst: vi.fn(),
      },
      artifact: {
        create: vi.fn().mockResolvedValue(artifact),
        findUniqueOrThrow: vi.fn().mockResolvedValue(artifact),
      },
      useCaseDetail: { create: vi.fn().mockResolvedValue({}) },
      useCaseGeneration: { create: vi.fn(), findFirst: vi.fn() },
      useCaseGenerationSource: { createMany: vi.fn() },
      useCaseCandidate: { create: vi.fn(), update: vi.fn() },
      useCaseCandidateSource: { createMany: vi.fn() },
      $queryRaw: vi.fn().mockResolvedValue([{ last_number: 1 }]),
    };
    return tx;
  };
  it('lists, gets and protects project scope', async () => {
    const prisma = {
      artifact: {
        findMany: vi.fn().mockResolvedValue([artifact]),
        findFirst: vi.fn().mockResolvedValueOnce(artifact).mockResolvedValueOnce(null),
      },
    };
    const service = new UseCasesService(prisma as unknown as PrismaService, {} as AIOrchestrator);
    expect((await service.list('p')).items[0]?.code).toBe('CU-001');
    expect((await service.get('p', 'a')).useCase.mainFlow).toHaveLength(1);
    await expect(service.get('x', 'a')).rejects.toThrow('no encontrado');
  });
  it('reports the academic threshold without inventing cases', async () => {
    const prisma = {
      project: { findUnique: vi.fn().mockResolvedValue({ id: 'p' }) },
      artifact: { count: vi.fn().mockResolvedValue(3) },
    };
    await expect(
      new UseCasesService(
        prisma as unknown as PrismaService,
        {} as AIOrchestrator,
      ).academicValidation('p'),
    ).resolves.toEqual({ acceptedCount: 3, minimumRequired: 4, satisfied: false });
  });
  it('creates manual snapshots and appends versions through transactions', async () => {
    const tx = transaction();
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
    const service = new UseCasesService(prisma as unknown as PrismaService, {} as AIOrchestrator);
    expect((await service.create('p', input)).version.status).toBe('DRAFT');
    expect(tx.useCaseDetail.create).toHaveBeenCalled();
    tx.artifactVersion.findFirstOrThrow.mockResolvedValue({ ...version, status: 'DRAFT' });
    expect((await service.version('p', 'a', input)).version.versionNumber).toBe(1);
  });
  it('generates a reloadable batch and rejects invented references', async () => {
    const tx = transaction();
    tx.useCaseGeneration.create.mockResolvedValue({ id: 'g' });
    tx.useCaseCandidate.create.mockResolvedValue({ id: 'c' });
    const candidate = {
      candidateId: 'x',
      name: 'N',
      objective: 'O',
      primaryActor: 'U',
      secondaryActors: [],
      preconditions: [],
      postconditions: [],
      mainFlow: [{ actor: 'U', action: 'A' }],
      alternativeFlows: [],
      relatedRequirementSourceIds: ['r'],
    };
    const generation = { id: 'g', projectId: 'p', sources: [], candidates: [] };
    const prisma = {
      artifactVersion: { findMany: vi.fn().mockResolvedValue([requirementVersion]) },
      useCaseGeneration: { findFirst: vi.fn().mockResolvedValue(generation) },
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const ai = {
      generateStructured: vi
        .fn()
        .mockResolvedValue({ data: { candidates: [candidate] }, metadata: { runId: 'run' } }),
    };
    const service = new UseCasesService(
      prisma as unknown as PrismaService,
      ai as unknown as AIOrchestrator,
    );
    await expect(service.generate('p', ['r'])).resolves.toEqual(generation);
    expect(ai.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 8192 }),
    );
    ai.generateStructured.mockResolvedValueOnce({
      data: { candidates: [{ ...candidate, relatedRequirementSourceIds: ['invented'] }] },
      metadata: { runId: 'run' },
    });
    await expect(service.generate('p', ['r'])).rejects.toMatchObject({
      response: { code: 'AI_INVALID_OUTPUT' },
    });
  });
  it('does not persist candidates when structured output is invalid', async () => {
    const prisma = {
      artifactVersion: { findMany: vi.fn().mockResolvedValue([requirementVersion]) },
      $transaction: vi.fn(),
    };
    const ai = {
      generateStructured: vi.fn().mockRejectedValue(new AIError('AI_INVALID_OUTPUT', 'safe')),
    };
    const service = new UseCasesService(
      prisma as unknown as PrismaService,
      ai as unknown as AIOrchestrator,
    );
    await expect(service.generate('p', ['r'])).rejects.toMatchObject({
      response: { code: 'AI_INVALID_OUTPUT' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('accepts candidates transactionally and enforces lifecycle', async () => {
    const tx = transaction();
    const candidate = {
      id: 'c',
      acceptedArtifactId: null,
      name: 'N',
      objective: 'O',
      primaryActor: 'U',
      secondaryActors: [],
      preconditions: [],
      postconditions: [],
      mainFlow: [{ actor: 'U', action: 'A' }],
      alternativeFlows: [],
      sources: [{ requirementVersionId: 'r' }],
    };
    tx.useCaseGeneration.findFirst.mockResolvedValue({
      id: 'g',
      projectId: 'p',
      aiRunId: 'run',
      candidates: [candidate],
    });
    const prisma = {
      $transaction: vi.fn((callback) => callback(tx)),
      artifactVersion: {
        findFirst: vi.fn().mockResolvedValue(version),
        update: vi.fn().mockResolvedValue({ status: 'IN_REVIEW' }),
      },
    };
    const service = new UseCasesService(prisma as unknown as PrismaService, {} as AIOrchestrator);
    expect((await service.accept('p', 'g', ['c'])).items).toHaveLength(1);
    await expect(service.transition('p', 'a', 'v', 'IN_REVIEW')).resolves.toMatchObject({
      status: 'IN_REVIEW',
    });
    prisma.artifactVersion.findFirst.mockResolvedValueOnce(null);
    await expect(service.transition('p', 'a', 'v', 'IN_REVIEW')).rejects.toThrow('Versión');
  });
  it('rejects missing batches, unknown candidates and duplicate requirement references', async () => {
    const tx = transaction();
    tx.useCaseGeneration.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'g', projectId: 'p', aiRunId: 'run', candidates: [] });
    const prisma = {
      useCaseGeneration: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const service = new UseCasesService(prisma as unknown as PrismaService, {} as AIOrchestrator);
    await expect(service.getGeneration('p', 'missing')).rejects.toThrow('Generación');
    await expect(service.accept('p', 'missing', ['c'])).rejects.toThrow('Generación');
    await expect(service.accept('p', 'g', ['unknown'])).rejects.toThrow('Candidato');
    await expect(
      service.create('p', { ...input, relatedRequirementVersionIds: ['r', 'r'] }),
    ).rejects.toThrow('Referencia');
  });
});
