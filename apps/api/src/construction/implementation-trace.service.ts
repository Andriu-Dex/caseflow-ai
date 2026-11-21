import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  ImplementationPlanContent,
  ImplementationTraceResponse,
} from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import { blueprintScreens } from './acceptance';
import { AcceptanceService } from './acceptance.service';
import { loadApprovedPlan } from './approved-plan';
import { planForRun } from './delivery-scope';

const FILE_LIMIT = 200;

const latestApproved = {
  where: { status: 'APPROVED' as const },
  orderBy: { versionNumber: 'desc' as const },
  take: 1,
};

// DEC-172: from a requirement or use case to what implements it: its use
// cases, the screens that realize them, the actions those screens call, the
// files of the latest construction linked to them, the design elements that
// cite it, and its acceptance results.
@Injectable()
export class ImplementationTraceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceptance: AcceptanceService,
  ) {}

  async trace(projectId: string, code: string): Promise<ImplementationTraceResponse> {
    const artifact = await this.prisma.artifact.findFirst({
      where: {
        projectId,
        code,
        archivedAt: null,
        artifactTypeCode: { in: ['REQUIREMENT', 'USE_CASE'] },
      },
      select: {
        id: true,
        artifactTypeCode: true,
        versions: {
          ...latestApproved,
          select: { title: true, useCaseDetail: { select: { name: true } } },
        },
      },
    });
    const version = artifact?.versions[0];
    if (!artifact || !version)
      throw new NotFoundException('No hay un requisito o caso de uso aprobado con ese código.');
    const type = artifact.artifactTypeCode as 'REQUIREMENT' | 'USE_CASE';
    const useCases =
      type === 'USE_CASE'
        ? [{ code, name: version.useCaseDetail?.name ?? version.title }]
        : await this.useCasesOf(projectId, artifact.id);
    const caseCodes = new Set(useCases.map((useCase) => useCase.code));

    const run = await this.prisma.generationRun.findFirst({
      where: { projectId, status: 'GENERATED', archivedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        deliveryId: true,
        implementationPlanVersionId: true,
        designBaselineId: true,
        sandboxRuns: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } },
      },
    });
    const plan = run
      ? await planForRun(this.prisma, projectId, run)
      : await this.latestPlan(projectId);
    const screens = plan
      ? await blueprintScreens(
          this.prisma,
          projectId,
          run?.designBaselineId ?? plan.designBaselineId,
        )
      : [];
    const realizes = new Map(screens.map((s) => [s.localId, s.relatedUseCaseCodes ?? []]));
    const cites = (codes?: string[]) => (codes ?? []).includes(code);
    const routes = (plan?.routes ?? []).filter(
      (route) =>
        cites(route.relatedSourceCodes) ||
        (realizes.get(route.screenLocalId ?? '') ?? []).some((c) => caseCodes.has(c)),
    );
    const called = new Set(
      routes.flatMap((route) => route.actions.flatMap((a) => (a.endpoint ? [a.endpoint] : []))),
    );
    const actions = (plan?.customEndpoints ?? [])
      .filter(
        (endpoint) =>
          called.has(`${endpoint.method} ${endpoint.path}`) || cites(endpoint.relatedSourceCodes),
      )
      .map((endpoint) => ({
        key: `${endpoint.method} ${endpoint.path}`,
        summary: endpoint.summary,
      }));
    const elements = [
      ...routes.map((route) => `route:${route.path}`),
      ...actions.map((action) => `endpoint:${action.key}`),
    ];
    // A file counts when every screen and action it implements belongs to the
    // modules traced here: shared ones, such as the application frame, carry
    // those of every module.
    const modules = new Set([
      ...routes.map((route) => route.moduleLocalId),
      ...(plan?.customEndpoints ?? [])
        .filter((endpoint) => actions.some((a) => a.key === `${endpoint.method} ${endpoint.path}`))
        .map((endpoint) => endpoint.moduleLocalId),
    ]);
    const moduleOf = new Map<string, string>([
      ...(plan?.routes ?? []).map((route): [string, string] => [
        `route:${route.path}`,
        route.moduleLocalId,
      ]),
      ...(plan?.customEndpoints ?? []).map((endpoint): [string, string] => [
        `endpoint:${endpoint.method} ${endpoint.path}`,
        endpoint.moduleLocalId,
      ]),
    ]);
    const screensHere = new Set(routes.map((route) => `route:${route.path}`));
    const own = new Set([
      ...(plan?.routes ?? [])
        .filter((route) => modules.has(route.moduleLocalId))
        .map((route) => `route:${route.path}`),
      ...(plan?.customEndpoints ?? [])
        .filter((endpoint) => modules.has(endpoint.moduleLocalId))
        .map((endpoint) => `endpoint:${endpoint.method} ${endpoint.path}`),
    ]);
    const files =
      run && elements.length
        ? (
            await this.prisma.generatedFile.findMany({
              where: {
                generationRunId: run.id,
                traceLinks: { some: { planElement: { in: elements } } },
              },
              orderBy: { path: 'asc' },
              select: {
                path: true,
                kind: true,
                origin: true,
                traceLinks: { select: { planElement: true } },
              },
            })
          )
            .filter((file) => {
              const implemented = file.traceLinks
                .map((link) => link.planElement)
                .filter((element) => /^(route|endpoint):/.test(element));
              const spanned = new Set(implemented.map((element) => moduleOf.get(element)));
              // The application frame spans most modules: it is not this one's.
              if (spanned.size > Math.max(2, Math.ceil((plan?.modules.length ?? 0) / 2)))
                return false;
              return (
                implemented.some((element) => screensHere.has(element)) ||
                implemented.every((element) => own.has(element))
              );
            })
            .slice(0, FILE_LIMIT)
            .map(({ path, kind, origin }) => ({ path, kind, origin }))
        : [];
    const criteria = run ? (await this.acceptance.report(projectId, run.id)).criteria : [];

    return {
      code,
      title: version.title,
      type,
      useCases,
      run: run
        ? {
            id: run.id,
            createdAt: run.createdAt.toISOString(),
            deliveryId: run.deliveryId,
            validation: run.sandboxRuns[0]?.status ?? null,
          }
        : null,
      screens: routes.map((route) => ({ path: route.path, screenName: route.screenName })),
      actions,
      files,
      design: await this.designCiting(projectId, code),
      acceptance: criteria
        .filter((criterion) => caseCodes.has(criterion.useCaseCode))
        .map(({ key, useCaseName, result }) => ({ key, useCaseName, result })),
    };
  }

  // The approved use cases whose latest approved version realizes the requirement.
  private async useCasesOf(projectId: string, requirementArtifactId: string) {
    const rows = await this.prisma.artifact.findMany({
      where: { projectId, artifactTypeCode: 'USE_CASE', archivedAt: null },
      orderBy: { code: 'asc' },
      select: {
        code: true,
        versions: {
          ...latestApproved,
          select: {
            useCaseDetail: {
              select: {
                name: true,
                requirementLinks: {
                  select: { requirementVersion: { select: { artifactId: true } } },
                },
              },
            },
          },
        },
      },
    });
    return rows.flatMap((row) => {
      const detail = row.versions[0]?.useCaseDetail;
      return detail?.requirementLinks.some(
        (link) => link.requirementVersion.artifactId === requirementArtifactId,
      )
        ? [{ code: row.code, name: detail.name }]
        : [];
    });
  }

  private async latestPlan(projectId: string): Promise<ImplementationPlanContent | null> {
    const version = await this.prisma.artifactVersion.findFirst({
      where: {
        projectId,
        status: 'APPROVED',
        artifact: { artifactTypeCode: 'IMPLEMENTATION_PLAN' },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return version ? loadApprovedPlan(this.prisma, projectId, version.id) : null;
  }

  // Architecture components and nodes that cite the code (relatedSourceCodes).
  private async designCiting(projectId: string, code: string) {
    const rows = await this.prisma.artifact.findMany({
      where: {
        projectId,
        archivedAt: null,
        artifactTypeCode: { in: ['SOFTWARE_ARCHITECTURE', 'SYSTEM_ARCHITECTURE'] },
      },
      select: {
        artifactTypeCode: true,
        versions: {
          ...latestApproved,
          select: { structuredAnalysisDetail: { select: { content: true } } },
        },
      },
    });
    return rows.flatMap((row) => {
      const content = row.versions[0]?.structuredAnalysisDetail?.content as {
        components?: { name: string; relatedSourceCodes?: string[] }[];
        nodes?: { name: string; relatedSourceCodes?: string[] }[];
      } | null;
      const source =
        row.artifactTypeCode === 'SOFTWARE_ARCHITECTURE'
          ? 'Arquitectura de software'
          : 'Arquitectura de sistema';
      return [...(content?.components ?? []), ...(content?.nodes ?? [])]
        .filter((item) => item.relatedSourceCodes?.includes(code))
        .map((item) => ({ source, name: item.name }));
    });
  }
}
