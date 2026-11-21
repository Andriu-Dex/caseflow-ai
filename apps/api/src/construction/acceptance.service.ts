import { Injectable, NotFoundException } from '@nestjs/common';
import type { AcceptanceReportResponse, RequirementAcceptanceStatus } from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import { loadCriteria } from './acceptance';
import { planForRun } from './delivery-scope';

// ADR-025: what a run's acceptance criteria are, how its latest validation
// left them, and what that means for each functional requirement.
@Injectable()
export class AcceptanceService {
  constructor(private readonly prisma: PrismaService) {}

  async report(projectId: string, runId: string): Promise<AcceptanceReportResponse> {
    const run = await this.prisma.generationRun.findFirst({
      where: { id: runId, projectId },
      select: { implementationPlanVersionId: true, deliveryId: true, designBaselineId: true },
    });
    if (!run) throw new NotFoundException('Corrida de construcción no encontrada.');
    const plan = await planForRun(this.prisma, projectId, run);
    const criteria = await loadCriteria(this.prisma, projectId, plan, run.designBaselineId);
    const validation = await this.prisma.sandboxRun.findFirst({
      where: { generationRunId: runId, projectId, acceptanceResults: { some: {} } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, acceptanceResults: true },
    });
    const results = new Map(
      (validation?.acceptanceResults ?? []).map((row) => [
        row.criterionKey,
        { passed: row.passed, message: row.message },
      ]),
    );
    const report = criteria.map((criterion) => ({
      key: criterion.key,
      useCaseCode: criterion.useCaseCode,
      useCaseName: criterion.useCaseName,
      given: criterion.given,
      when: criterion.when,
      then: criterion.then,
      alternativeFlows: criterion.alternativeFlows,
      requirementCodes: criterion.requirementCodes,
      role: criterion.role,
      screens: criterion.screens.map(({ path, screenName }) => ({ path, screenName })),
      result: results.get(criterion.key) ?? null,
    }));
    return {
      generationRunId: runId,
      sandboxRunId: validation?.id ?? null,
      criteria: report,
      requirements: (await this.functionalRequirements(projectId)).map((requirement) => {
        const own = report.filter((c) => c.requirementCodes.includes(requirement.code));
        const status: RequirementAcceptanceStatus = !own.length
          ? 'NO_CRITERIA'
          : own.some((c) => c.result && !c.result.passed)
            ? 'FAILED'
            : own.some((c) => !c.result)
              ? 'NOT_RUN'
              : 'PASSED';
        return { ...requirement, status };
      }),
    };
  }

  // The approved functional requirements, in code order.
  private async functionalRequirements(projectId: string) {
    const rows = await this.prisma.artifact.findMany({
      where: { projectId, artifactTypeCode: 'REQUIREMENT', archivedAt: null },
      select: {
        code: true,
        versions: {
          where: { status: 'APPROVED' },
          orderBy: { versionNumber: 'desc' },
          take: 1,
          select: { title: true, requirementDetail: { select: { requirementType: true } } },
        },
      },
    });
    return rows
      .flatMap((row) =>
        row.versions[0]?.requirementDetail?.requirementType === 'FUNCTIONAL'
          ? [{ code: row.code, title: row.versions[0].title }]
          : [],
      )
      .sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }));
  }
}
