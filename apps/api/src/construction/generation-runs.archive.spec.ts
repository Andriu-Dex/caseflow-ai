import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerationRunsService } from './generation-runs.service';

const run = (extra: Record<string, unknown> = {}) => ({
  id: 'run-1',
  projectId: 'p1',
  implementationPlanVersionId: '11111111-1111-4111-8111-111111111111',
  designBaselineId: '22222222-2222-4222-8222-222222222222',
  targetTemplateIdentifier: 'CASEFLOW_WEB_TS_V1',
  targetTemplateVersion: 1,
  status: 'GENERATED',
  errorMessage: null,
  warnings: [],
  createdByUserId: '33333333-3333-4333-8333-333333333333',
  createdAt: new Date(),
  startedAt: null,
  finishedAt: null,
  archivedAt: null,
  sandboxRuns: [],
  _count: { files: 3 },
  ...extra,
});

describe('archiving a generation run', () => {
  const prisma = {
    projectMembership: { findFirst: vi.fn() },
    generationRun: { findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
  const audit = { record: vi.fn() };
  const service = new GenerationRunsService(
    prisma as never,
    audit as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.projectMembership.findFirst.mockResolvedValue({ role: 'OWNER' });
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
  });

  it('hides a finished run from the list, keeping it, and records who did it', async () => {
    prisma.generationRun.findFirst.mockResolvedValue(run());
    await service.setArchived('p1', 'run-1', 'user', true);
    expect(prisma.generationRun.update).toHaveBeenCalledWith({
      where: { id: 'run-1' },
      data: { archivedAt: expect.any(Date) },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'GENERATION_RUN_ARCHIVED', actorUserId: 'user' }),
      prisma,
    );
  });

  it('refuses while the run is generating or being validated', async () => {
    prisma.generationRun.findFirst.mockResolvedValue(run({ sandboxRuns: [{ id: 's' }] }));
    await expect(service.setArchived('p1', 'run-1', 'user', true)).rejects.toThrow(
      'mientras se genera o se valida',
    );
    expect(prisma.generationRun.update).not.toHaveBeenCalled();
  });

  it('refuses a user who may not generate, and a run of another project', async () => {
    prisma.projectMembership.findFirst.mockResolvedValueOnce(null);
    await expect(service.setArchived('p1', 'run-1', 'viewer', true)).rejects.toThrow(
      'No tiene permisos',
    );
    prisma.generationRun.findFirst.mockResolvedValue(null);
    await expect(service.setArchived('other', 'run-1', 'user', false)).rejects.toThrow(
      'no encontrada',
    );
  });
});
