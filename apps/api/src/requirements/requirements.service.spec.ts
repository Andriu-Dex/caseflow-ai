import { describe, expect, it, vi } from 'vitest';
import { AIError } from '@caseflow-ai/ai';
import type { AIOrchestrator } from '@caseflow-ai/ai';
import type { PrismaService } from '../database/prisma.service';
import { RequirementsService } from './requirements.service';
const version = {
  id: 'v',
  versionNumber: 1,
  status: 'DRAFT',
  origin: 'MANUAL',
  createdAt: new Date(),
  requirementDetail: {
    requirementType: 'FUNCTIONAL',
    name: 'N',
    description: 'D',
    priority: 'HIGH',
    sourceContextVersionId: null,
    aiRunId: null,
    actors: [],
    preconditions: [],
    postconditions: [],
    dependencies: [],
  },
};
const artifact = {
  id: 'a',
  projectId: 'p',
  code: 'RF-001',
  createdAt: new Date(),
  versions: [version],
};
describe('RequirementsService', () => {
  it('lists, gets and protects project scope', async () => {
    const prisma = {
      artifact: {
        findMany: vi.fn().mockResolvedValue([artifact]),
        findFirst: vi.fn().mockResolvedValueOnce(artifact).mockResolvedValueOnce(null),
      },
    };
    const s = new RequirementsService(prisma as unknown as PrismaService, {} as AIOrchestrator);
    expect((await s.list('p')).items).toHaveLength(1);
    expect((await s.get('p', 'a')).code).toBe('RF-001');
    await expect(s.get('other', 'a')).rejects.toThrow('no encontrado');
  });
  it('enforces valid and invalid lifecycle transitions', async () => {
    const prisma = {
      artifactVersion: {
        findFirst: vi.fn().mockResolvedValue(version),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const s = new RequirementsService(prisma as unknown as PrismaService, {} as AIOrchestrator);
    await s.transition('p', 'a', 'v', 'IN_REVIEW');
    expect(prisma.artifactVersion.update).toHaveBeenCalled();
    await expect(s.transition('p', 'a', 'v', 'APPROVED')).rejects.toThrow('Transición');
  });
  it('normalizes disabled generation and rejects missing context', async () => {
    const prisma = {
      artifactVersion: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ projectContextDetail: { objective: 'x' } }),
      },
    };
    const ai = {
      generateStructured: vi.fn().mockRejectedValue(new AIError('AI_NOT_CONFIGURED', 'disabled')),
    };
    const s = new RequirementsService(
      prisma as unknown as PrismaService,
      ai as unknown as AIOrchestrator,
    );
    await expect(s.generate('p', 'v')).rejects.toThrow('APPROVED');
    await expect(s.generate('p', 'v')).rejects.toMatchObject({
      response: { code: 'AI_NOT_CONFIGURED' },
    });
    expect(ai.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 4096 }),
    );
  });
  it('does not persist candidates when structured output is invalid', async () => {
    const prisma = {
      artifactVersion: {
        findFirst: vi.fn().mockResolvedValue({ projectContextDetail: { objective: 'x' } }),
      },
      $transaction: vi.fn(),
    };
    const ai = {
      generateStructured: vi.fn().mockRejectedValue(new AIError('AI_INVALID_OUTPUT', 'safe')),
    };
    const service = new RequirementsService(
      prisma as unknown as PrismaService,
      ai as unknown as AIOrchestrator,
    );
    await expect(service.generate('p', 'v')).rejects.toMatchObject({
      response: { code: 'AI_INVALID_OUTPUT' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
