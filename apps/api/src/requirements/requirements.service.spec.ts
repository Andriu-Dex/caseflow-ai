import { describe, expect, it, vi } from 'vitest';
import type { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { AIError } from '@caseflow-ai/ai';
import type { AIOrchestrator } from '@caseflow-ai/ai';
import type { PrismaService } from '../database/prisma.service';
import { RequirementsService } from './requirements.service';

const fakeKb = (): Pick<KnowledgeBaseService, 'retrieve'> => ({
  retrieve: vi.fn().mockResolvedValue([]),
});

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
    const s = new RequirementsService(
      prisma as unknown as PrismaService,
      {} as AIOrchestrator,
      fakeKb() as KnowledgeBaseService,
    );
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
    const s = new RequirementsService(
      prisma as unknown as PrismaService,
      {} as AIOrchestrator,
      fakeKb() as KnowledgeBaseService,
    );
    await s.transition('p', 'a', 'v', 'IN_REVIEW');
    expect(prisma.artifactVersion.update).toHaveBeenCalled();
    await expect(s.transition('p', 'a', 'v', 'APPROVED')).rejects.toThrow('Transición');
  });
  const contextDetail = {
    problemStatement: 'p',
    objective: 'x',
    additionalContext: null,
    actors: [],
    scopeItems: [],
    needs: [{ id: 'n1', artifactVersionId: 'v', position: 0, description: 'Registrar pedidos' }],
    constraints: [
      { id: 'c1', artifactVersionId: 'v', position: 0, description: 'Funciona en teléfonos' },
    ],
    businessRules: [],
  };
  it('normalizes disabled generation and rejects missing/source-less context', async () => {
    const prisma = {
      project: { findUnique: vi.fn().mockResolvedValue({ language: 'EN' }) },
      artifactVersion: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ projectContextDetail: { ...contextDetail, sources: [] } })
          .mockResolvedValueOnce({
            projectContextDetail: { ...contextDetail, sources: [{ sourceVersionId: 's' }] },
          }),
      },
    };
    const ai = {
      generateStructured: vi.fn().mockRejectedValue(new AIError('AI_NOT_CONFIGURED', 'disabled')),
    };
    const s = new RequirementsService(
      prisma as unknown as PrismaService,
      ai as unknown as AIOrchestrator,
      fakeKb() as KnowledgeBaseService,
    );
    await expect(s.generate('p', 'v')).rejects.toThrow('APPROVED');
    // An APPROVED context with zero linked approved sources does not satisfy
    // the official First Deliverable knowledge-intake gate.
    await expect(s.generate('p', 'v')).rejects.toThrow('fuente de proyecto APPROVED');
    await expect(s.generate('p', 'v')).rejects.toMatchObject({
      response: { code: 'AI_NOT_CONFIGURED' },
    });
    expect(ai.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 8192, language: 'EN', promptVersion: 3 }),
    );
    // The model receives the coded context and what it must cover (DEC-126).
    const sent = JSON.parse(ai.generateStructured.mock.calls[0]![0].messages[0].content);
    expect(sent).toMatchObject({
      needs: [{ code: 'N-1', description: 'Registrar pedidos' }],
      constraints: [{ code: 'RES-1', description: 'Funciona en teléfonos' }],
      mustCover: ['N-1'],
    });
  });
  it('does not persist candidates when structured output is invalid', async () => {
    const prisma = {
      project: { findUnique: vi.fn().mockResolvedValue({ language: 'ES' }) },
      artifactVersion: {
        findFirst: vi.fn().mockResolvedValue({
          projectContextDetail: { ...contextDetail, sources: [{ sourceVersionId: 's' }] },
        }),
      },
      $transaction: vi.fn(),
    };
    const ai = {
      generateStructured: vi.fn().mockRejectedValue(new AIError('AI_INVALID_OUTPUT', 'safe')),
    };
    const service = new RequirementsService(
      prisma as unknown as PrismaService,
      ai as unknown as AIOrchestrator,
      fakeKb() as KnowledgeBaseService,
    );
    await expect(service.generate('p', 'v')).rejects.toMatchObject({
      response: { code: 'AI_INVALID_OUTPUT' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
