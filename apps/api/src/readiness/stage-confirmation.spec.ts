import { describe, expect, it, vi } from 'vitest';
import { ReadinessService } from './readiness.service';
import { computeStageCurrency } from './stage-currency';

function setup() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    projectMembership: { findFirst: vi.fn().mockResolvedValue({ role: 'EDITOR' }) },
    stageConfirmation: { create: vi.fn().mockResolvedValue({ id: 'confirmation' }) },
  };
  const prisma = { $transaction: vi.fn(async (callback) => callback(tx)) };
  const currency = {
    stageCurrency: vi.fn().mockResolvedValue(
      computeStageCurrency({
        CONTEXT: new Date('2026-10-13'),
        REQUIREMENTS: new Date('2026-10-12'),
      }),
    ),
  };
  const audit = { record: vi.fn() };
  const consistency = { generateReport: vi.fn().mockResolvedValue({ issues: [] }) };
  const service = new ReadinessService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    currency as never,
    audit as never,
    consistency as never,
  );
  const evaluate = vi.spyOn(service, 'evaluate').mockResolvedValue({
    ready: false,
    stages: [
      {
        key: 'REQUIREMENTS',
        label: 'Requisitos',
        satisfied: true,
        blockers: [],
        warnings: [],
        nextAction: null,
        summary: '',
      },
    ],
    blockers: [],
    warnings: [],
  });
  return { service, tx, currency, audit, consistency, evaluate };
}

describe('stage confirmation safeguards', () => {
  it('records review and its audit together, scoped to project and reviewer', async () => {
    const { service, tx, audit, currency } = setup();
    await service.confirmCurrent('project', 'REQUIREMENTS', 'reviewer', 'Revisado');
    expect(tx.projectMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: 'project',
          userId: 'reviewer',
          role: { in: ['OWNER', 'EDITOR', 'REVIEWER'] },
        }),
      }),
    );
    expect(currency.stageCurrency).toHaveBeenCalledWith('project', tx);
    expect(tx.stageConfirmation.create).toHaveBeenCalledWith({
      data: {
        projectId: 'project',
        stage: 'REQUIREMENTS',
        confirmedByUserId: 'reviewer',
        note: 'Revisado',
      },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'STAGE_CONFIRMED_CURRENT',
        metadata: { stage: 'REQUIREMENTS', upstreamStage: 'CONTEXT', note: 'Revisado' },
      }),
      tx,
    );
  });
  it('rejects viewers and nonmembers without recording a confirmation', async () => {
    const { service, tx } = setup();
    tx.projectMembership.findFirst.mockResolvedValue(null as never);
    await expect(service.confirmCurrent('project', 'REQUIREMENTS', 'viewer')).rejects.toThrow(
      'permiso',
    );
    expect(tx.stageConfirmation.create).not.toHaveBeenCalled();
  });
  it('rejects a blocked stage and replay of a current stage', async () => {
    const { service, currency, tx } = setup();
    currency.stageCurrency.mockResolvedValue(
      computeStageCurrency({
        SOURCES: new Date('2026-10-14'),
        CONTEXT: new Date('2026-10-13'),
        REQUIREMENTS: new Date('2026-10-12'),
      }),
    );
    await expect(service.confirmCurrent('project', 'REQUIREMENTS', 'reviewer')).rejects.toThrow(
      'Primero revise Contexto',
    );
    currency.stageCurrency.mockResolvedValue(computeStageCurrency({}));
    await expect(service.confirmCurrent('project', 'REQUIREMENTS', 'reviewer')).rejects.toThrow(
      'no está pendiente',
    );
    expect(tx.stageConfirmation.create).not.toHaveBeenCalled();
  });
  it('does not let a confirmation hide missing evidence or coherence errors', async () => {
    const { service, evaluate, consistency, tx } = setup();
    evaluate.mockResolvedValue({
      ready: false,
      stages: [
        {
          key: 'REQUIREMENTS',
          label: 'Requisitos',
          satisfied: false,
          blockers: ['Falta evidencia'],
          warnings: [],
          nextAction: null,
          summary: '',
        },
      ],
      blockers: [],
      warnings: [],
    });
    await expect(service.confirmCurrent('project', 'REQUIREMENTS', 'reviewer')).rejects.toThrow(
      'Falta evidencia',
    );
    consistency.generateReport.mockResolvedValue({
      issues: [
        { severity: 'ERROR', artifactType: 'REQUIREMENT', message: 'Referencia inexistente' },
      ],
    } as never);
    await expect(service.confirmCurrent('project', 'REQUIREMENTS', 'reviewer')).rejects.toThrow(
      'Referencia inexistente',
    );
    expect(tx.stageConfirmation.create).not.toHaveBeenCalled();
  });
});
