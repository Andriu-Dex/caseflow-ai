import { Injectable, Module, UnprocessableEntityException } from '@nestjs/common';
import { PIPELINE_LABELS, PIPELINE_ORDER, type ReadinessStageKey } from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';

const orderedRebuild = new AsyncLocalStorage<string>();
// Only server-owned orchestration may bypass the intermediate currency gate.
export function withOrderedStageRebuild<T>(projectId: string, work: () => Promise<T>): Promise<T> {
  return orderedRebuild.run(projectId, work);
}

type PipelineStage = (typeof PIPELINE_ORDER)[number];
type Currency = {
  currency: 'CURRENT' | 'OUTDATED' | 'BLOCKED';
  reviewedAt?: string;
  outdatedSince?: { stage: ReadinessStageKey; approvedAt: string };
};
export type StageDates = Partial<Record<PipelineStage, Date>>;

export function computeStageCurrency(
  dates: StageDates,
  confirmations: StageDates = {},
): Record<PipelineStage, Currency> {
  const result = {} as Record<PipelineStage, Currency>;
  let latest: { stage: PipelineStage; date: Date } | undefined;
  let firstOutdated = false;
  for (const stage of PIPELINE_ORDER) {
    const approved = dates[stage];
    let date = approved;
    const confirmation = confirmations[stage];
    if (approved && confirmation && confirmation > approved) date = confirmation;
    // ER is derived from the exact model version, not an independently approved artifact.
    if (
      stage === 'ER_DIAGRAM' &&
      approved &&
      confirmations.DATA_MODEL &&
      confirmations.DATA_MODEL > approved
    )
      date = confirmations.DATA_MODEL;
    if (!date) {
      result[stage] = { currency: 'CURRENT' };
      continue;
    }
    const outdated = latest && date < latest.date;
    result[stage] = firstOutdated
      ? {
          currency: 'BLOCKED',
          outdatedSince: latest
            ? { stage: latest.stage, approvedAt: latest.date.toISOString() }
            : undefined,
        }
      : outdated
        ? {
            currency: 'OUTDATED',
            outdatedSince: { stage: latest!.stage, approvedAt: latest!.date.toISOString() },
          }
        : { currency: 'CURRENT' };
    if (
      result[stage].currency === 'CURRENT' &&
      confirmation &&
      approved &&
      confirmation >= approved
    )
      result[stage].reviewedAt = confirmation.toISOString();
    if (outdated) firstOutdated = true;
    if (!latest || date > latest.date) latest = { stage, date };
  }
  return result;
}

const stageByType: Record<string, PipelineStage> = {
  PROJECT_SOURCE: 'SOURCES',
  PROJECT_CONTEXT: 'CONTEXT',
  REQUIREMENT: 'REQUIREMENTS',
  USE_CASE: 'USE_CASES',
  USE_CASE_DIAGRAM: 'USE_CASE_DIAGRAM',
  DATA_MODEL: 'DATA_MODEL',
  CLASS_DIAGRAM: 'CLASS_DIAGRAM',
  NAVIGATION_TREE: 'NAVIGATION',
  SOFTWARE_ARCHITECTURE: 'SOFTWARE_ARCHITECTURE',
  SYSTEM_ARCHITECTURE: 'SYSTEM_ARCHITECTURE',
  UI_BLUEPRINT: 'UI_BLUEPRINT',
  DESIGN_THEME: 'DESIGN_THEME',
  MOCKUP: 'MOCKUPS',
};

@Injectable()
export class StageCurrencyService {
  constructor(private readonly prisma: PrismaService) {}

  async stageCurrency(
    projectId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const [approved, archiveChanges, confirmations] = await Promise.all([
      client.$queryRaw<{ type: string; changedAt: Date }[]>`
        SELECT a.artifact_type_code AS type,
          MAX(CASE WHEN a.artifact_type_code = 'USE_CASE_DIAGRAM' THEN v.created_at ELSE COALESCE(v.approved_at, v.created_at) END) AS "changedAt"
        FROM artifacts a JOIN artifact_versions v ON v.artifact_id = a.id AND v.project_id = a.project_id
        WHERE a.project_id = ${projectId}::uuid AND a.archived_at IS NULL
          AND (v.status = 'APPROVED' OR a.artifact_type_code = 'USE_CASE_DIAGRAM')
        GROUP BY a.artifact_type_code`,
      // DEC-137: archiving or restoring something that was approved changes
      // its stage too; one that never was approved changes nothing.
      client.$queryRaw<{ type: string; changedAt: Date }[]>`
        SELECT a.artifact_type_code AS type, MAX(a.archive_changed_at) AS "changedAt"
        FROM artifacts a
        WHERE a.project_id = ${projectId}::uuid AND a.archive_changed_at IS NOT NULL
          AND EXISTS (SELECT 1 FROM artifact_versions v
                      WHERE v.artifact_id = a.id AND v.status = 'APPROVED')
        GROUP BY a.artifact_type_code`,
      client.stageConfirmation.groupBy({
        by: ['stage'],
        where: { projectId },
        _max: { confirmedAt: true },
      }),
    ]);
    const dates: StageDates = {};
    for (const row of [...approved, ...archiveChanges]) {
      const stage = stageByType[row.type];
      const current = stage ? dates[stage] : undefined;
      if (stage && row.changedAt && (!current || row.changedAt > current))
        dates[stage] = row.changedAt;
    }
    // The ER representation lives on the approved DATA_MODEL version.
    if (dates.DATA_MODEL) dates.ER_DIAGRAM = dates.DATA_MODEL;
    const confirmed: StageDates = {};
    for (const row of confirmations)
      if (PIPELINE_ORDER.includes(row.stage as PipelineStage) && row._max.confirmedAt)
        confirmed[row.stage as PipelineStage] = row._max.confirmedAt;
    return computeStageCurrency(dates, confirmed);
  }

  async assertCurrent(projectId: string) {
    if (orderedRebuild.getStore() === projectId) return;
    const currencies = await this.stageCurrency(projectId);
    const first = PIPELINE_ORDER.find((stage) => currencies[stage].currency === 'OUTDATED');
    if (first)
      throw new UnprocessableEntityException(
        `Hay pasos por rehacer desde ${PIPELINE_LABELS[first]}. Complételos antes de continuar.`,
      );
  }
}

@Module({ providers: [StageCurrencyService], exports: [StageCurrencyService] })
export class StageCurrencyModule {}
