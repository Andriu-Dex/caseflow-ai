import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CASEFLOW_WEB_TS_V2 } from '@caseflow-ai/domain';
import { implementationPlanContentSchema } from '@caseflow-ai/contracts';
import { BusinessLogicService } from './business-logic.service';
vi.mock('./frozen-business-context', () => ({
  loadFrozenBusinessContext: vi.fn(async () => () => ({ requirements: [] })),
}));
const plan = implementationPlanContentSchema.parse({
  designBaselineId: '11111111-1111-4111-8111-111111111111',
  authentication: { required: false },
  modules: [{ localId: 'catalog', name: 'Catalog', description: 'Catálogo' }],
  entities: [
    {
      localId: 'item',
      name: 'Item',
      moduleLocalId: 'catalog',
      fields: [{ name: 'name', type: 'STRING' }],
      operations: ['LIST'],
    },
  ],
  customEndpoints: [
    { moduleLocalId: 'catalog', method: 'POST', path: '/catalog/check', summary: 'Comprobar' },
  ],
});
describe('business checkpoint consolidation', () => {
  const prisma = {
    project: { findUnique: vi.fn() },
    generationRun: { findFirst: vi.fn() },
    generatedFile: { findFirst: vi.fn(), upsert: vi.fn() },
  };
  const ai = { generateStructured: vi.fn() };
  const service = new BusinessLogicService(prisma as never, ai as never);
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.project.findUnique.mockResolvedValue({ language: 'ES' });
    prisma.generationRun.findFirst.mockResolvedValue({ id: 'new' });
    prisma.generatedFile.findFirst.mockResolvedValue({
      content: JSON.stringify({ body: 'return { previous: true };' }),
    });
  });
  it('reuses newest compatible bodies without calling a provider and copies them into new history', async () => {
    const result = await service.implement('project', 'new', plan, CASEFLOW_WEB_TS_V2, {
      cacheOnly: true,
    });
    expect(result.implementations['POST /catalog/check']).toBe('return { previous: true };');
    expect(ai.generateStructured).not.toHaveBeenCalled();
    expect(prisma.generatedFile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          generationRun: { projectId: 'project', designBaselineId: plan.designBaselineId },
        }),
        orderBy: [{ generationRun: { createdAt: 'desc' } }, { id: 'desc' }],
      }),
    );
    expect(prisma.generatedFile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {},
        create: expect.objectContaining({ generationRunId: 'new' }),
      }),
    );
  });
  it('keeps a missing action pending without inference', async () => {
    prisma.generatedFile.findFirst.mockResolvedValue(null);
    const result = await service.implement('project', 'new', plan, CASEFLOW_WEB_TS_V2, {
      cacheOnly: true,
    });
    expect(result.implementations).toEqual({});
    expect(result.warnings).toEqual([expect.stringContaining('pendiente')]);
    expect(ai.generateStructured).not.toHaveBeenCalled();
    expect(prisma.generatedFile.upsert).not.toHaveBeenCalled();
  });
  it('uses reviewed corrections ahead of cached proposals without overwriting them', async () => {
    const result = await service.implement('project', 'new', plan, CASEFLOW_WEB_TS_V2, {
      cacheOnly: true,
      revisions: new Map([['POST /catalog/check', 'return { corrected: true };']]),
    });
    expect(result.implementations['POST /catalog/check']).toBe('return { corrected: true };');
    expect(ai.generateStructured).not.toHaveBeenCalled();
    expect(prisma.generatedFile.upsert.mock.calls[0]![0].update).toEqual({});
  });
  it('rejects dangerous corrected bodies without storing them', async () => {
    const result = await service.implement('project', 'new', plan, CASEFLOW_WEB_TS_V2, {
      cacheOnly: true,
      revisions: new Map([['POST /catalog/check', 'return process.env;']]),
    });
    expect(result.implementations).toEqual({});
    expect(result.warnings[0]).toContain('process');
    expect(prisma.generatedFile.upsert).not.toHaveBeenCalled();
  });
});
