import { UnprocessableEntityException } from '@nestjs/common';
import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import { generationPlanContentSchema, uiBlueprintContentSchema } from '@caseflow-ai/contracts';
import type { PrismaService } from '../database/prisma.service';

// Resolve historical analysis through the generation plan frozen by the design
// gate. Never substitute the project's latest requirements for those versions.
export async function loadFrozenBusinessContext(
  prisma: PrismaService,
  projectId: string,
  baselineId: string,
) {
  const baseline = await prisma.designBaseline.findFirst({
    where: { id: baselineId, projectId },
    include: {
      entries: {
        include: {
          artifactVersion: {
            include: {
              structuredAnalysisDetail: { include: { generation: { include: { sources: true } } } },
            },
          },
        },
      },
    },
  });
  if (!baseline || baseline.entries.some((entry) => entry.artifactVersion.projectId !== projectId))
    throw new UnprocessableEntityException(
      'No se pudo resolver el análisis del diseño aprobado del proyecto.',
    );
  const planEntry = baseline.entries.find((entry) => entry.role === 'GENERATION_PLAN');
  const blueprintEntry = baseline.entries.find((entry) => entry.role === 'UI_BLUEPRINT');
  const generationPlan = generationPlanContentSchema.parse(
    planEntry?.artifactVersion.structuredAnalysisDetail?.content,
  );
  const blueprint = uiBlueprintContentSchema.parse(
    blueprintEntry?.artifactVersion.structuredAnalysisDetail?.content,
  );
  const ids =
    planEntry?.artifactVersion.structuredAnalysisDetail?.generation?.sources.map(
      (source) => source.artifactVersionId,
    ) ?? [];
  const analysis = ids.length
    ? await prisma.artifactVersion.findMany({
        where: {
          id: { in: ids },
          projectId,
          status: 'APPROVED',
          artifact: { artifactTypeCode: { in: ['REQUIREMENT', 'USE_CASE'] } },
        },
        include: {
          artifact: { select: { code: true } },
          requirementDetail: {
            include: {
              preconditions: { orderBy: { position: 'asc' } },
              postconditions: { orderBy: { position: 'asc' } },
            },
          },
          useCaseDetail: {
            include: {
              requirementLinks: true,
              preconditions: { orderBy: { position: 'asc' } },
              postconditions: { orderBy: { position: 'asc' } },
              mainFlowSteps: { orderBy: { position: 'asc' } },
              alternativeFlows: {
                orderBy: { position: 'asc' },
                include: { steps: { orderBy: { position: 'asc' } } },
              },
            },
          },
        },
        orderBy: { artifact: { code: 'asc' } },
      })
    : [];
  return (
    endpoint: ImplementationPlanContent['customEndpoints'][number],
    plan: ImplementationPlanContent,
  ) => {
    const routes = plan.routes.filter(
      (route) =>
        route.actions.some((action) => action.endpoint === `${endpoint.method} ${endpoint.path}`) ||
        route.contextQueries?.includes(`${endpoint.method} ${endpoint.path}`),
    );
    const screens = blueprint.screens.filter((screen) =>
      routes.some((route) => route.screenLocalId === screen.localId),
    );
    const cited = new Set([
      ...screens.flatMap((screen) => [
        ...(screen.relatedSourceCodes ?? []),
        ...screen.relatedUseCaseCodes,
      ]),
      ...routes.flatMap((route) => route.relatedSourceCodes ?? []),
    ]);
    const modules = generationPlan.modules.filter((module) =>
      module.relatedUseCaseCodes.some((code) => cited.has(code)),
    );
    for (const module of modules)
      for (const code of [...module.relatedRequirementCodes, ...module.relatedUseCaseCodes])
        cited.add(code);
    const cases = analysis.filter(
      (source) => source.useCaseDetail && cited.has(source.artifact.code),
    );
    const requirementIds = new Set(
      cases.flatMap((source) =>
        source.useCaseDetail!.requirementLinks.map((link) => link.requirementVersionId),
      ),
    );
    return {
      baselineId,
      screens,
      workflows: generationPlan.workflows.filter((workflow) =>
        workflow.relatedUseCaseCodes.some((code) => cited.has(code)),
      ),
      requirements: analysis
        .filter(
          (source) =>
            source.requirementDetail &&
            (cited.has(source.artifact.code) ||
              requirementIds.has(source.id) ||
              source.requirementDetail.requirementType === 'NON_FUNCTIONAL'),
        )
        .map((source) => ({
          versionId: source.id,
          code: source.artifact.code,
          name: source.requirementDetail!.name,
          description: source.requirementDetail!.description,
          type: source.requirementDetail!.requirementType,
          preconditions: source.requirementDetail!.preconditions.map((item) => item.description),
          postconditions: source.requirementDetail!.postconditions.map((item) => item.description),
        })),
      useCases: cases.map((source) => ({
        versionId: source.id,
        code: source.artifact.code,
        name: source.useCaseDetail!.name,
        objective: source.useCaseDetail!.objective,
        primaryActor: source.useCaseDetail!.primaryActor,
        preconditions: source.useCaseDetail!.preconditions.map((item) => item.description),
        postconditions: source.useCaseDetail!.postconditions.map((item) => item.description),
        mainFlow: source.useCaseDetail!.mainFlowSteps.map(({ actor, action }) => ({
          actor,
          action,
        })),
        alternatives: source.useCaseDetail!.alternativeFlows.map((flow) => ({
          name: flow.name,
          condition: flow.condition,
          steps: flow.steps.map(({ actor, action }) => ({ actor, action })),
        })),
      })),
    };
  };
}
