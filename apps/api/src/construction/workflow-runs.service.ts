import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { CONSTRUCTION_QUEUE, type ConstructionJobPayload } from '@caseflow-ai/domain';
import {
  workflowStagesFor,
  type ApprovalOrigin,
  type StructuredAnalysisKind,
  type WorkflowReviewItem,
  type WorkflowRunResponse,
  type WorkflowStage,
} from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SourcesService } from '../sources/sources.service';
import { ProjectContextService } from '../project-context/project-context.service';
import { RequirementsService } from '../requirements/requirements.service';
import { UseCasesService } from '../use-cases/use-cases.service';
import { DataModelsService } from '../data-models/data-models.service';
import {
  ELIGIBLE_SOURCE_TYPES,
  StructuredAnalysisService,
} from '../structured-analysis/structured-analysis.service';
import { MockupsService } from '../mockups/mockups.service';
import { DesignBaselinesService } from './design-baselines.service';
import { GenerationRunsService } from './generation-runs.service';
import { SandboxRunsService } from './sandbox-runs.service';
import { CONSTRUCTION_QUEUE_TOKEN } from './construction-queue.token';

const logger = new Logger('WorkflowRunsService');

type Route = 'EXPRESS' | 'BUILD_ONLY';
type Status = 'IN_REVIEW' | 'APPROVED';
interface CurrentVersion {
  artifactId: string;
  code: string;
  title: string;
  versionId: string;
  versionNumber: number;
  status: string;
}
interface RunContext {
  runId: string;
  projectId: string;
  userId: string;
  prompt: string;
  route: Route;
}

const STAGE_LABELS: Record<WorkflowStage, string> = {
  SOURCE: 'idea inicial',
  CONTEXT: 'contexto',
  REQUIREMENTS: 'requisitos',
  USE_CASES: 'casos de uso',
  USE_CASE_DIAGRAM: 'diagrama de casos de uso',
  DATA_MODEL: 'modelo de datos',
  CLASS_DIAGRAM: 'diagrama de clases',
  NAVIGATION_TREE: 'navegación',
  SOFTWARE_ARCHITECTURE: 'arquitectura de software',
  SYSTEM_ARCHITECTURE: 'arquitectura de sistema',
  UI_BLUEPRINT: 'plano de interfaz',
  DESIGN_THEME: 'tema y colores',
  MOCKUP: 'bocetos',
  GENERATION_PLAN: 'plan de generación',
  CONCEPTUAL_DOMAIN_MODEL: 'modelo conceptual',
  PLANNING_REVIEW: 'revisión de la planificación',
  DESIGN_BASELINE: 'aprobación de diseño',
  IMPLEMENTATION_PLAN: 'plan de implementación',
  IMPLEMENTATION_REVIEW: 'revisión del plan de implementación',
  CODE_GENERATION: 'generación de código',
  SANDBOX_VALIDATION: 'validación en el entorno aislado',
};

// What the bulk planning review approves, in dependency order (the database
// refuses to approve anything before the versions it was generated from).
const PLANNING_TYPES: { stage: WorkflowStage; type: string }[] = [
  { stage: 'SOURCE', type: 'PROJECT_SOURCE' },
  { stage: 'CONTEXT', type: 'PROJECT_CONTEXT' },
  { stage: 'REQUIREMENTS', type: 'REQUIREMENT' },
  { stage: 'USE_CASES', type: 'USE_CASE' },
  { stage: 'DATA_MODEL', type: 'DATA_MODEL' },
  { stage: 'CLASS_DIAGRAM', type: 'CLASS_DIAGRAM' },
  { stage: 'NAVIGATION_TREE', type: 'NAVIGATION_TREE' },
  { stage: 'SOFTWARE_ARCHITECTURE', type: 'SOFTWARE_ARCHITECTURE' },
  { stage: 'SYSTEM_ARCHITECTURE', type: 'SYSTEM_ARCHITECTURE' },
  { stage: 'UI_BLUEPRINT', type: 'UI_BLUEPRINT' },
  { stage: 'DESIGN_THEME', type: 'DESIGN_THEME' },
  { stage: 'MOCKUP', type: 'MOCKUP' },
  { stage: 'GENERATION_PLAN', type: 'GENERATION_PLAN' },
  { stage: 'CONCEPTUAL_DOMAIN_MODEL', type: 'CONCEPTUAL_DOMAIN_MODEL' },
];
const STRUCTURED_KINDS = new Set<string>([
  'NAVIGATION_TREE',
  'SOFTWARE_ARCHITECTURE',
  'SYSTEM_ARCHITECTURE',
  'UI_BLUEPRINT',
  'DESIGN_THEME',
  'CLASS_DIAGRAM',
  'GENERATION_PLAN',
  'CONCEPTUAL_DOMAIN_MODEL',
  'IMPLEMENTATION_PLAN',
]);

class StageError extends Error {}
class AwaitingReview extends Error {}

// Route orchestration (DEC-116, ADR-001). One prompt drives the existing
// chain: every stage calls the service that already exists and validates with
// the same schemas. It is never one giant prompt (DEC-111): one stage at a
// time, stopping at the first failure with a clear message; a retry resumes
// from that stage instead of generating everything again.
//
// BUILD_ONLY approves every stage as it goes (the database records it as
// AUTOMATIC). EXPRESS generates the planning from provisional drafts
// (DEC-119) and pauses twice for a bulk human review: before the Design Gate
// and before construction.
@Injectable()
export class WorkflowRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sources: SourcesService,
    private readonly context: ProjectContextService,
    private readonly requirements: RequirementsService,
    private readonly useCases: UseCasesService,
    private readonly dataModels: DataModelsService,
    private readonly structured: StructuredAnalysisService,
    private readonly mockups: MockupsService,
    private readonly designBaselines: DesignBaselinesService,
    private readonly generationRuns: GenerationRunsService,
    private readonly sandboxRuns: SandboxRunsService,
    @Inject(CONSTRUCTION_QUEUE_TOKEN) private readonly queue: Queue<ConstructionJobPayload>,
  ) {}

  async start(projectId: string, userId: string, prompt: string): Promise<WorkflowRunResponse> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Proyecto no encontrado.');
    if (project.workflowRoute === 'FULL')
      throw new UnprocessableEntityException(
        'La planificación desde un prompt solo está disponible en las rutas Exprés y Solo construcción.',
      );
    if (await this.prisma.workflowRun.findFirst({ where: { projectId } }))
      throw new ConflictException('Este proyecto ya tiene una ejecución desde su prompt.');
    const run = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workflowRun.create({
        data: { projectId, prompt, createdByUserId: userId },
      });
      await this.audit.record(
        {
          projectId,
          actorUserId: userId,
          action: 'WORKFLOW_RUN_STARTED',
          entityType: 'WORKFLOW_RUN',
          entityId: created.id,
        },
        tx,
      );
      return created;
    });
    await this.enqueue(projectId, run.id);
    return this.get(projectId, run.id);
  }

  // A run still RUNNING when the API starts was cut off by a restart. It is
  // resumed automatically: it continues from the stage it was on and never
  // repeats finished stages (see produce()). Runs after the generation and
  // mockup recovery, so an interrupted stage is retried once from scratch.
  async resumeInterrupted(bootedAt: Date): Promise<number> {
    const runs = await this.prisma.workflowRun.findMany({
      where: { status: 'RUNNING', startedAt: { lt: bootedAt } },
      select: { id: true, projectId: true },
    });
    let resumed = 0;
    for (const run of runs) {
      const { count } = await this.prisma.workflowRun.updateMany({
        where: { id: run.id, status: 'RUNNING' },
        data: { status: 'QUEUED' },
      });
      if (!count) continue;
      await this.enqueue(run.projectId, run.id);
      resumed++;
    }
    return resumed;
  }

  // A failed run resumes from the stage that failed.
  async retry(projectId: string, runId: string): Promise<WorkflowRunResponse> {
    const { count } = await this.prisma.workflowRun.updateMany({
      where: { id: runId, projectId, status: 'FAILED' },
      data: { status: 'QUEUED', errorMessage: null, finishedAt: null },
    });
    if (!count) {
      await this.get(projectId, runId);
      throw new ConflictException('Solo se puede reintentar una ejecución que falló.');
    }
    await this.enqueue(projectId, runId);
    return this.get(projectId, runId);
  }

  // EXPRESS bulk review (HUMAN_BULK). At the planning review it approves
  // everything generated, in dependency order, and freezes the design (the
  // Design Gate); at the implementation review it approves the plan. Either
  // way the run then continues.
  async approve(projectId: string, runId: string, userId: string): Promise<WorkflowRunResponse> {
    const run = await this.prisma.workflowRun.findFirst({ where: { id: runId, projectId } });
    if (!run) throw new NotFoundException('Ejecución no encontrada.');
    if (run.status !== 'AWAITING_REVIEW')
      throw new ConflictException('Esta ejecución no está esperando una revisión.');
    const stage = run.currentStage as WorkflowStage;
    const types =
      stage === 'PLANNING_REVIEW' ? PLANNING_TYPES.map((t) => t.type) : ['IMPLEMENTATION_PLAN'];
    for (const type of types)
      for (const item of await this.current(projectId, type)) {
        if (item.status === 'APPROVED') continue;
        try {
          if (item.status !== 'IN_REVIEW')
            await this.transition(projectId, type, item, 'IN_REVIEW', undefined, userId);
          await this.transition(projectId, type, item, 'APPROVED', 'HUMAN_BULK', userId);
        } catch (error) {
          const message =
            error instanceof HttpException ? this.httpMessage(error) : 'No se pudo aprobar.';
          throw new UnprocessableEntityException(
            `${item.code} no pudo aprobarse: ${message} Lo anterior quedó aprobado; corríjalo y vuelva a aprobar.`,
          );
        }
      }
    const done: WorkflowStage[] = [stage];
    if (stage === 'PLANNING_REVIEW') {
      await this.freezeDesign(projectId, userId, 'HUMAN_BULK');
      done.push('DESIGN_BASELINE');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.workflowRunStage.createMany({
        data: done.map((s) => ({ runId, stage: s })),
        skipDuplicates: true,
      });
      await tx.workflowRun.update({ where: { id: runId }, data: { status: 'QUEUED' } });
    });
    await this.enqueue(projectId, runId);
    return this.get(projectId, runId);
  }

  // What the current review covers, grouped by the stage that produced it.
  async reviewItems(projectId: string, runId: string): Promise<{ items: WorkflowReviewItem[] }> {
    const run = await this.get(projectId, runId);
    const types =
      run.currentStage === 'IMPLEMENTATION_REVIEW'
        ? [{ stage: 'IMPLEMENTATION_PLAN' as const, type: 'IMPLEMENTATION_PLAN' }]
        : PLANNING_TYPES;
    const items: WorkflowReviewItem[] = [];
    for (const { stage, type } of types)
      for (const item of await this.current(projectId, type))
        items.push({
          stage,
          artifactType: type,
          artifactId: item.artifactId,
          versionId: item.versionId,
          code: item.code,
          title: item.title,
          versionNumber: item.versionNumber,
          status: item.status,
        });
    return { items };
  }

  async list(projectId: string): Promise<{ items: WorkflowRunResponse[] }> {
    const rows = await this.prisma.workflowRun.findMany({
      where: { projectId },
      include: { stages: true, project: { select: { workflowRoute: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map((row) => this.map(row)) };
  }

  async get(projectId: string, runId: string): Promise<WorkflowRunResponse> {
    const row = await this.prisma.workflowRun.findFirst({
      where: { id: runId, projectId },
      include: { stages: true, project: { select: { workflowRoute: true } } },
    });
    if (!row) throw new NotFoundException('Ejecución no encontrada.');
    return this.map(row);
  }

  // Worker callback. Always ends in a terminal or review status, so polling
  // never hangs.
  async runJob(projectId: string, runId: string): Promise<void> {
    const { count } = await this.prisma.workflowRun.updateMany({
      where: { id: runId, projectId, status: 'QUEUED' },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    if (!count) return; // Already picked up by a previous delivery of the job.
    const row = await this.prisma.workflowRun.findUniqueOrThrow({
      where: { id: runId },
      include: { stages: true, project: { select: { workflowRoute: true } } },
    });
    // Upgrading out of BUILD_ONLY mid-run adds the EXPRESS review pauses.
    const route: Route = row.project.workflowRoute === 'BUILD_ONLY' ? 'BUILD_ONLY' : 'EXPRESS';
    const done = new Set(row.stages.map((s) => s.stage));
    const ctx: RunContext = {
      runId,
      projectId,
      userId: row.createdByUserId,
      prompt: row.prompt,
      route,
    };
    for (const stage of workflowStagesFor(route)) {
      if (done.has(stage)) continue;
      await this.prisma.workflowRun.update({
        where: { id: runId },
        data: { currentStage: stage },
      });
      try {
        await this.runStage(stage, ctx);
      } catch (error) {
        if (error instanceof AwaitingReview) {
          await this.prisma.workflowRun.update({
            where: { id: runId },
            data: { status: 'AWAITING_REVIEW' },
          });
          return;
        }
        await this.finish(ctx, 'FAILED', this.failureMessage(stage, error));
        return;
      }
      await this.prisma.workflowRunStage.create({ data: { runId, stage } });
    }
    await this.finish(ctx, 'COMPLETED', null);
  }

  private async runStage(stage: WorkflowStage, ctx: RunContext): Promise<void> {
    const { projectId: pid } = ctx;
    switch (stage) {
      case 'SOURCE':
        return this.produce(ctx, 'PROJECT_SOURCE', async () => {
          await this.sources.create(
            pid,
            {
              title: 'Idea inicial del proyecto',
              sourceKind: 'NOTES',
              purpose: 'Descripción de la aplicación a construir',
              description: ctx.prompt,
            },
            undefined,
          );
        });
      case 'CONTEXT':
        return this.produce(ctx, 'PROJECT_CONTEXT', async () => {
          const candidate = await this.context.generate(pid);
          const content = candidate.content;
          const describe = (items: string[]) => items.map((description) => ({ description }));
          await this.context.create(pid, {
            problemStatement: content.problemStatement,
            objective: content.objective,
            additionalContext: content.additionalContext,
            scopeItems: [],
            actors: content.actors.map((name) => ({ name })),
            needs: describe(content.needs),
            constraints: describe(content.constraints),
            businessRules: describe(content.businessRules),
            sourceVersionIds: candidate.sourceVersionIds,
          });
        });
      case 'REQUIREMENTS': {
        const [context] = await this.versionIds(pid, 'PROJECT_CONTEXT');
        return this.produce(ctx, 'REQUIREMENT', async () => {
          const generation = await this.requirements.generate(pid, context!);
          // Ideas beyond the context stay out of the automatic routes.
          const selection = this.requirements.automaticSelection(generation);
          if (!selection.length)
            throw new StageError(
              'Ningún requisito propuesto cita correctamente el contexto del proyecto.',
            );
          await this.requirements.accept(pid, generation.id, selection);
        });
      }
      case 'USE_CASES': {
        const requirements = await this.versionIds(pid, 'REQUIREMENT');
        return this.produce(ctx, 'USE_CASE', async () => {
          const generation = await this.useCases.generate(pid, requirements);
          await this.useCases.accept(
            pid,
            generation.id,
            generation.candidates.map((c) => c.id),
          );
        });
      }
      case 'USE_CASE_DIAGRAM':
        // System-generated and never approved (spec §6.3): it only has to exist.
        if (!(await this.current(pid, 'USE_CASE_DIAGRAM')).length)
          await this.dataModels.generateUseCaseDiagram(pid, await this.versionIds(pid, 'USE_CASE'));
        return;
      case 'DATA_MODEL': {
        const [requirements, useCases] = await Promise.all([
          this.versionIds(pid, 'REQUIREMENT'),
          this.versionIds(pid, 'USE_CASE'),
        ]);
        return this.produce(ctx, 'DATA_MODEL', async () => {
          const generation = await this.dataModels.generate(pid, requirements, useCases);
          await this.dataModels.accept(pid, generation.id, this.first(generation.candidates));
        });
      }
      case 'NAVIGATION_TREE':
      case 'SOFTWARE_ARCHITECTURE':
      case 'SYSTEM_ARCHITECTURE':
      case 'UI_BLUEPRINT':
      case 'DESIGN_THEME':
      case 'CLASS_DIAGRAM':
      case 'GENERATION_PLAN':
      case 'CONCEPTUAL_DOMAIN_MODEL':
        return this.structuredStage(ctx, stage);
      case 'MOCKUP': {
        const [blueprint] = await this.versionIds(pid, 'UI_BLUEPRINT');
        return this.produce(ctx, 'MOCKUP', async () => {
          const job = await this.mockups.generateNow(pid, blueprint!);
          if (job.status !== 'COMPLETED')
            throw new StageError(job.errorMessage ?? 'No se pudo generar el boceto.');
        });
      }
      case 'PLANNING_REVIEW':
      case 'IMPLEMENTATION_REVIEW':
        // Completed by approve(): until then the run waits for the person.
        throw new AwaitingReview();
      case 'DESIGN_BASELINE':
        return this.freezeDesign(pid, ctx.userId);
      case 'IMPLEMENTATION_PLAN': {
        const baseline = await this.prisma.designBaseline.findFirstOrThrow({
          where: { projectId: pid },
          orderBy: { createdAt: 'desc' },
        });
        return this.produce(ctx, 'IMPLEMENTATION_PLAN', async () => {
          const generation = await this.structured.generateFromDesignBaseline(
            pid,
            'IMPLEMENTATION_PLAN',
            baseline.id,
          );
          await this.structured.accept(
            pid,
            'IMPLEMENTATION_PLAN',
            generation.id,
            this.first(generation.candidates),
          );
        });
      }
      case 'CODE_GENERATION': {
        const [planVersionId] = await this.versionIds(pid, 'IMPLEMENTATION_PLAN');
        const existing = await this.prisma.generationRun.findFirst({
          where: { projectId: pid, implementationPlanVersionId: planVersionId },
          orderBy: { createdAt: 'desc' },
        });
        const runId =
          existing && existing.status !== 'FAILED'
            ? existing.id
            : (await this.generationRuns.start(pid, ctx.userId, planVersionId!)).id;
        // Inline: this stage is already a job. A queued delivery of the same
        // generation becomes a no-op (runJob only picks up QUEUED runs).
        await this.generationRuns.runJob(pid, runId);
        const run = await this.prisma.generationRun.findUniqueOrThrow({ where: { id: runId } });
        if (run.status !== 'GENERATED')
          throw new StageError(run.errorMessage ?? 'La generación de código no se completó.');
        return;
      }
      case 'SANDBOX_VALIDATION': {
        const generation = await this.prisma.generationRun.findFirstOrThrow({
          where: { projectId: pid, status: 'GENERATED' },
          orderBy: { createdAt: 'desc' },
        });
        // Validation and its bounded auto-repair run as their own jobs (§26);
        // the result is shown with the generated project.
        if (
          !(await this.prisma.sandboxRun.findFirst({ where: { generationRunId: generation.id } }))
        )
          await this.sandboxRuns.start(pid, ctx.userId, generation.id);
        return;
      }
    }
  }

  private async structuredStage(ctx: RunContext, kind: StructuredAnalysisKind) {
    const sourceIds = (
      await Promise.all(
        ELIGIBLE_SOURCE_TYPES[kind].map((type) => this.versionIds(ctx.projectId, type)),
      )
    ).flat();
    await this.produce(ctx, kind, async () => {
      const generation = await this.structured.generate(ctx.projectId, kind, sourceIds);
      // A theme proposal below WCAG AA could never be approved: take the
      // first accessible palette of the three.
      const usable =
        kind === 'DESIGN_THEME'
          ? generation.candidates.filter(
              (c) => !c.qualityFindings.some((f) => f.code === 'LOW_CONTRAST'),
            )
          : generation.candidates;
      if (!usable.length)
        throw new StageError(
          'Ninguna de las paletas propuestas cumple el contraste mínimo de accesibilidad.',
        );
      await this.structured.accept(ctx.projectId, kind, generation.id, this.first(usable));
    });
  }

  // Generates a stage only when it produced nothing yet, so a retry never
  // duplicates artifacts. BUILD_ONLY then approves what is pending; EXPRESS
  // leaves it for the bulk review.
  private async produce(ctx: RunContext, type: string, generate: () => Promise<void>) {
    let items = await this.current(ctx.projectId, type);
    if (!items.length) {
      await generate();
      items = await this.current(ctx.projectId, type);
    }
    if (!items.length) throw new StageError('La IA no propuso ningún elemento.');
    if (ctx.route === 'EXPRESS') return;
    for (const item of items) {
      if (item.status === 'APPROVED') continue;
      if (item.status !== 'IN_REVIEW')
        await this.transition(ctx.projectId, type, item, 'IN_REVIEW');
      await this.transition(ctx.projectId, type, item, 'APPROVED');
    }
  }

  private async freezeDesign(projectId: string, userId: string, origin?: 'HUMAN_BULK') {
    if (await this.prisma.designBaseline.findFirst({ where: { projectId } })) return;
    const one = async (type: string) =>
      (await this.current(projectId, type)).find((v) => v.status === 'APPROVED')?.versionId;
    await this.designBaselines.create(
      projectId,
      userId,
      {
        label: origin ? 'Diseño aprobado en bloque' : 'Diseño aprobado automáticamente',
        versions: {
          GENERATION_PLAN: (await one('GENERATION_PLAN'))!,
          CONCEPTUAL_DOMAIN_MODEL: (await one('CONCEPTUAL_DOMAIN_MODEL'))!,
          NAVIGATION_TREE: (await one('NAVIGATION_TREE'))!,
          UI_BLUEPRINT: (await one('UI_BLUEPRINT'))!,
          DESIGN_THEME: await one('DESIGN_THEME'),
          CLASS_DIAGRAM: await one('CLASS_DIAGRAM'),
          MOCKUP: (await one('MOCKUP'))!,
          SOFTWARE_ARCHITECTURE: await one('SOFTWARE_ARCHITECTURE'),
          SYSTEM_ARCHITECTURE: await one('SYSTEM_ARCHITECTURE'),
        },
      },
      origin,
    );
  }

  // One stage service's transition, by artifact type.
  private transition(
    projectId: string,
    type: string,
    item: CurrentVersion,
    status: Status,
    origin?: ApprovalOrigin,
    actorUserId: string | null = null,
  ): Promise<unknown> {
    if (STRUCTURED_KINDS.has(type))
      return this.structured.transition(
        projectId,
        type as StructuredAnalysisKind,
        item.artifactId,
        item.versionId,
        status,
        actorUserId,
        origin,
      );
    switch (type) {
      case 'PROJECT_SOURCE':
        return this.sources.transition(projectId, item.artifactId, item.versionId, status, origin);
      case 'PROJECT_CONTEXT':
        return this.context.transition(projectId, item.versionId, status, origin);
      case 'REQUIREMENT':
        return this.requirements.transition(
          projectId,
          item.artifactId,
          item.versionId,
          status,
          origin,
        );
      case 'USE_CASE':
        return this.useCases.transition(projectId, item.artifactId, item.versionId, status, origin);
      case 'DATA_MODEL':
        return this.dataModels.transition(
          projectId,
          item.artifactId,
          item.versionId,
          status,
          origin,
        );
      case 'MOCKUP':
        return this.mockups.transition(projectId, item.artifactId, item.versionId, status, origin);
      default:
        throw new StageError(`Tipo de artefacto no soportado: ${type}.`);
    }
  }

  // Latest version of every live artifact of a type, except rejected ones.
  // In BUILD_ONLY each is approved before the next stage; in EXPRESS the
  // drafts are provisional sources (DEC-119).
  private async current(projectId: string, type: string): Promise<CurrentVersion[]> {
    const rows = await this.prisma.artifact.findMany({
      where: { projectId, artifactTypeCode: type, archivedAt: null },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
      orderBy: { code: 'asc' },
    });
    return rows.flatMap((row) => {
      const version = row.versions[0];
      return version && version.status !== 'CHANGES_REQUESTED'
        ? [
            {
              artifactId: row.id,
              code: row.code,
              title: version.title,
              versionId: version.id,
              versionNumber: version.versionNumber,
              status: version.status,
            },
          ]
        : [];
    });
  }

  private async versionIds(projectId: string, type: string): Promise<string[]> {
    return (await this.current(projectId, type)).map((item) => item.versionId);
  }

  private first(candidates: { id: string }[]): string[] {
    if (!candidates[0]) throw new StageError('La IA no propuso ningún elemento.');
    return [candidates[0].id];
  }

  private httpMessage(error: HttpException): string {
    const response = error.getResponse();
    const message =
      typeof response === 'string'
        ? response
        : (response as { message?: string | string[] }).message;
    return Array.isArray(message) ? message.join(' ') : (message ?? error.message);
  }

  private failureMessage(stage: WorkflowStage, error: unknown): string {
    const prefix = `La etapa «${STAGE_LABELS[stage]}» no se completó`;
    if (error instanceof StageError) return `${prefix}: ${error.message}`;
    if (error instanceof HttpException) return `${prefix}: ${this.httpMessage(error)}`;
    logger.warn(
      `Workflow stage ${stage} failed: ${error instanceof Error ? error.message : error}`,
      error instanceof Error ? error.stack : undefined,
    );
    return `${prefix}. Intente de nuevo más tarde.`;
  }

  private async finish(
    ctx: RunContext,
    status: 'COMPLETED' | 'FAILED',
    errorMessage: string | null,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.workflowRun.update({
        where: { id: ctx.runId },
        data: {
          status,
          errorMessage,
          finishedAt: new Date(),
          ...(status === 'COMPLETED' ? { currentStage: null } : {}),
        },
      });
      await this.audit.record(
        {
          projectId: ctx.projectId,
          actorUserId: null,
          action: 'WORKFLOW_RUN_FINISHED',
          entityType: 'WORKFLOW_RUN',
          entityId: ctx.runId,
          metadata: { status },
        },
        tx,
      );
    });
  }

  private async enqueue(projectId: string, runId: string) {
    await this.queue.add(CONSTRUCTION_QUEUE, { type: 'workflow-run', runId, projectId });
  }

  private map(row: {
    id: string;
    projectId: string;
    prompt: string;
    status: WorkflowRunResponse['status'];
    currentStage: string | null;
    errorMessage: string | null;
    createdAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
    stages: { stage: string }[];
    project: { workflowRoute: string };
  }): WorkflowRunResponse {
    const done = new Set(row.stages.map((s) => s.stage));
    const stages = workflowStagesFor(
      row.project.workflowRoute === 'BUILD_ONLY' ? 'BUILD_ONLY' : 'EXPRESS',
    );
    return {
      id: row.id,
      projectId: row.projectId,
      prompt: row.prompt,
      status: row.status,
      currentStage: row.currentStage as WorkflowStage | null,
      stages,
      completedStages: stages.filter((stage) => done.has(stage)),
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
    };
  }
}
