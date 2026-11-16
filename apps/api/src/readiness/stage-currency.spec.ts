import { describe, expect, it, vi } from 'vitest';
import {
  computeStageCurrency,
  StageCurrencyService,
  withOrderedStageRebuild,
} from './stage-currency';
import type { PrismaService } from '../database/prisma.service';

const at = (day: number) => new Date(`2026-10-${String(day).padStart(2, '0')}T10:00:00Z`);
describe('stage currency', () => {
  it('opens only the first outdated stage and blocks subsequent evidence', () => {
    const result = computeStageCurrency({
      CONTEXT: at(8),
      REQUIREMENTS: at(2),
      USE_CASES: at(3),
      DATA_MODEL: at(4),
    });
    expect(result.REQUIREMENTS.currency).toBe('OUTDATED');
    expect(result.USE_CASES.currency).toBe('BLOCKED');
    expect(result.DATA_MODEL.currency).toBe('BLOCKED');
    expect(result.NAVIGATION.currency).toBe('CURRENT');
    expect(result.REQUIREMENTS.outdatedSince?.stage).toBe('CONTEXT');
  });
  it('moves review forward after a confirmation or new approval', () => {
    const dates = { CONTEXT: at(8), REQUIREMENTS: at(2), USE_CASES: at(3) };
    expect(computeStageCurrency(dates, { REQUIREMENTS: at(9) }).USE_CASES.currency).toBe(
      'OUTDATED',
    );
    expect(computeStageCurrency({ ...dates, REQUIREMENTS: at(9) }).USE_CASES.currency).toBe(
      'OUTDATED',
    );
    expect(computeStageCurrency(dates, { REQUIREMENTS: at(1) }).REQUIREMENTS.currency).toBe(
      'OUTDATED',
    );
  });
  it('keeps the ER derived from a confirmed model current and ignores confirmations without evidence', () => {
    const result = computeStageCurrency(
      { DATA_MODEL: at(2), ER_DIAGRAM: at(2) },
      { DATA_MODEL: at(8), NAVIGATION: at(9) },
    );
    expect(result.ER_DIAGRAM.currency).toBe('CURRENT');
    expect(result.NAVIGATION.currency).toBe('CURRENT');
  });
  it('aggregates evidence scoped to the project and excludes archived artifacts', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ type: 'PROJECT_CONTEXT', changedAt: at(8) }]),
      stageConfirmation: { groupBy: vi.fn().mockResolvedValue([]) },
    };
    const service = new StageCurrencyService(prisma as unknown as PrismaService);
    await service.stageCurrency('project-1');
    const [parts, projectId] = prisma.$queryRaw.mock.calls[0]!;
    expect(parts.join('')).toContain('a.archived_at IS NULL');
    expect(parts.join('')).toContain('a.project_id = ');
    expect(projectId).toBe('project-1');
    expect(prisma.stageConfirmation.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'project-1' } }),
    );
  });
  it('allows only the project of the internal ordered rebuild to bypass the gate', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        { type: 'PROJECT_CONTEXT', changedAt: at(8) },
        { type: 'REQUIREMENT', changedAt: at(2) },
      ]),
      stageConfirmation: { groupBy: vi.fn().mockResolvedValue([]) },
    };
    const service = new StageCurrencyService(prisma as unknown as PrismaService);
    await expect(service.assertCurrent('project-1')).rejects.toThrow('pasos por rehacer');
    await withOrderedStageRebuild('project-1', async () => {
      await service.assertCurrent('project-1');
      await expect(service.assertCurrent('project-2')).rejects.toThrow('pasos por rehacer');
    });
  });

  it('refuses approval at the first incomplete earlier planning stage', async () => {
    const readiness = {
      evaluate: vi.fn().mockResolvedValue({
        stages: [
          { key: 'SOURCES', label: 'Fuentes', satisfied: true },
          { key: 'CONTEXT', label: 'Contexto del proyecto', satisfied: true },
          { key: 'REQUIREMENTS', label: 'Requisitos', satisfied: false },
          { key: 'USE_CASES', label: 'Casos de uso', satisfied: false },
          { key: 'IMPACT', label: 'Impacto potencial', satisfied: false },
        ],
      }),
    };
    const service = new StageCurrencyService(
      {} as PrismaService,
      { get: () => readiness } as never,
    );

    await expect(service.assertEarlierStagesSatisfied('project-1', 'DATA_MODEL')).rejects.toThrow(
      'falta completar Requisitos',
    );
    await expect(
      service.assertEarlierStagesSatisfied('project-1', 'REQUIREMENT'),
    ).resolves.toBeUndefined();

    readiness.evaluate.mockResolvedValue({
      stages: [
        { key: 'SOURCES', label: 'Fuentes', satisfied: true },
        { key: 'CONTEXT', label: 'Contexto del proyecto', satisfied: true },
        { key: 'REQUIREMENTS', label: 'Requisitos', satisfied: true },
        { key: 'USE_CASES', label: 'Casos de uso', satisfied: true },
        { key: 'USE_CASE_DIAGRAM', label: 'Diagrama de casos de uso', satisfied: true },
        { key: 'IMPACT', label: 'Impacto potencial', satisfied: false },
      ],
    });
    await expect(
      service.assertEarlierStagesSatisfied('project-1', 'DATA_MODEL'),
    ).resolves.toBeUndefined();
  });
});
