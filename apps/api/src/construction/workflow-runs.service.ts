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
  WORKFLOW_STAGES,
  type StructuredAnalysisKind,
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

type Status = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED';
type Transition = (status: Status) => Promise<unknown>;
interface LatestVersion {
  artifactId: string;
  code: string;
  versionId: string;
  status: string;
}
interface RunContext {
  runId: string;
  projectId: string;
  userId: string;
  prompt: string;
}

const STAGE_LABELS: Record<WorkflowStage, string> = {
  SOURCE: 'idea inicial',
  CONTEXT: 'contexto',
  REQUIREMENTS: 'requisitos',
  USE_CASES: 'casos de uso',
  USE_CASE_DIAGRAM: 'diagrama de casos de uso',
  DATA_MODEL: 'modelo de datos',
  NAVIGATION_TREE: 'navegación',
  SOFTWARE_ARCHITECTURE: 'arquitectura de software',
  SYSTEM_ARCHITECTURE: 'arquitectura de sistema',
  UI_BLUEPRINT: 'plano de interfaz',
  DESIGN_THEME: 'tema y colores',
  MOCKUP: 'bocetos',
  GENERATION_PLAN: 'plan de generación',
  CONCEPTUAL_DOMAIN_MODEL: 'modelo conceptual',
  DESIGN_BASELINE: 'aprobación de diseño',
  IMPLEMENTATION_PLAN: 'plan de implementación',
  CODE_GENERATION: 'generación de código',
  SANDBOX_VALIDATION: 'validación en el entorno aislado',
};

class StageError extends Error {}

// Route orchestration (DEC-116, ADR-001). In BUILD_ONLY one prompt drives the
// whole existing chain: every stage calls the service that already exists,
// validates with the same schemas, and the database records each approval as
// AUTOMATIC. It is never one giant prompt (DEC-111): one stage at a time,
// stopping at the first failure with a clear message, and a retry resumes
// from that stage instead of generating everything again.
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
    if (project.workflowRoute !== 'BUILD_ONLY')
      throw new UnprocessableEntityException(
        'La construcción automática desde un prompt solo está disponible en la ruta Solo construcción.',
      );
    if (await this.prisma.workflowRun.findFirst({ where: { projectId } }))
      throw new ConflictException(
        'Este proyecto ya tiene una construcción automática. Reintente la existente.',
      );
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

  // A failed run resumes from the stage that failed.
  async retry(projectId: string, runId: string): Promise<WorkflowRunResponse> {
    const { count } = await this.prisma.workflowRun.updateMany({
      where: { id: runId, projectId, status: 'FAILED' },
      data: { status: 'QUEUED', errorMessage: null, finishedAt: null },
    });
    if (!count) {
      await this.get(projectId, runId);
      throw new ConflictException('Solo se puede reintentar una construcción que falló.');
    }
    await this.enqueue(projectId, runId);
    return this.get(projectId, runId);
  }

  async list(projectId: string): Promise<{ items: WorkflowRunResponse[] }> {
    const rows = await this.prisma.workflowRun.findMany({
      where: { projectId },
      include: { stages: true },
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map((row) => this.map(row)) };
  }

  async get(projectId: string, runId: string): Promise<WorkflowRunResponse> {
    const row = await this.prisma.workflowRun.findFirst({
      where: { id: runId, projectId },
      include: { stages: true },
    });
    if (!row) throw new NotFoundException('Construcción automática no encontrada.');
    return this.map(row);
  }

  // Worker callback. Always ends in a terminal status, so polling never hangs.
  async runJob(projectId: string, runId: string): Promise<void> {
    const { count } = await this.prisma.workflowRun.updateMany({
      where: { id: runId, projectId, status: 'QUEUED' },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    if (!count) return; // Already picked up by a previous delivery of the job.
    const row = await this.prisma.workflowRun.findUniqueOrThrow({
      where: { id: runId },
      include: { stages: true },
    });
    const done = new Set(row.stages.map((s) => s.stage));
    const ctx: RunContext = { runId, projectId, userId: row.createdByUserId, prompt: row.prompt };
    for (const stage of WORKFLOW_STAGES) {
      if (done.has(stage)) continue;
      await this.prisma.workflowRun.update({
        where: { id: runId },
        data: { currentStage: stage },
      });
      try {
        await this.runStage(stage, ctx);
      } catch (error) {
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
        await this.ensureApproved(
          pid,
          'PROJECT_SOURCE',
          async () => {
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
          },
          (item) => (status) =>
            this.sources.transition(pid, item.artifactId, item.versionId, status),
        );
        return;
      case 'CONTEXT':
        await this.ensureApproved(
          pid,
          'PROJECT_CONTEXT',
          async () => {
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
          },
          (item) => (status) => this.context.transition(pid, item.versionId, status),
        );
        return;
      case 'REQUIREMENTS': {
        const [contextVersion] = await this.approved(pid, 'PROJECT_CONTEXT');
        await this.ensureApproved(
          pid,
          'REQUIREMENT',
          async () => {
            const generation = await this.requirements.generate(pid, contextVersion!);
            await this.requirements.accept(
              pid,
              generation.id,
              generation.candidates.map((c) => c.id),
            );
          },
          (item) => (status) =>
            this.requirements.transition(pid, item.artifactId, item.versionId, status),
        );
        return;
      }
      case 'USE_CASES': {
        const requirements = await this.approved(pid, 'REQUIREMENT');
        await this.ensureApproved(
          pid,
          'USE_CASE',
          async () => {
            const generation = await this.useCases.generate(pid, requirements);
            await this.useCases.accept(
              pid,
              generation.id,
              generation.candidates.map((c) => c.id),
            );
          },
          (item) => (status) =>
            this.useCases.transition(pid, item.artifactId, item.versionId, status),
        );
        return;
      }
      case 'USE_CASE_DIAGRAM':
        // System-generated and never approved (spec §6.3): it only has to exist.
        if (!(await this.latest(pid, 'USE_CASE_DIAGRAM')).length)
          await this.dataModels.generateUseCaseDiagram(pid, await this.approved(pid, 'USE_CASE'));
        return;
      case 'DATA_MODEL': {
        const [requirements, useCases] = await Promise.all([
          this.approved(pid, 'REQUIREMENT'),
          this.approved(pid, 'USE_CASE'),
        ]);
        await this.ensureApproved(
          pid,
          'DATA_MODEL',
          async () => {
            const generation = await this.dataModels.generate(pid, requirements, useCases);
            await this.dataModels.accept(pid, generation.id, this.first(generation.candidates));
          },
          (item) => (status) =>
            this.dataModels.transition(pid, item.artifactId, item.versionId, status),
        );
        return;
      }
      case 'NAVIGATION_TREE':
      case 'SOFTWARE_ARCHITECTURE':
      case 'SYSTEM_ARCHITECTURE':
      case 'UI_BLUEPRINT':
      case 'DESIGN_THEME':
      case 'GENERATION_PLAN':
      case 'CONCEPTUAL_DOMAIN_MODEL':
        await this.structuredStage(pid, stage);
        return;
      case 'MOCKUP': {
        const [blueprint] = await this.approved(pid, 'UI_BLUEPRINT');
        await this.ensureApproved(
          pid,
          'MOCKUP',
          async () => {
            const job = await this.mockups.generateNow(pid, blueprint!);
            if (job.status !== 'COMPLETED')
              throw new StageError(job.errorMessage ?? 'No se pudo generar el boceto.');
          },
          (item) => (status) =>
            this.mockups.transition(pid, item.artifactId, item.versionId, status),
        );
        return;
      }
      case 'DESIGN_BASELINE': {
        if (await this.prisma.designBaseline.findFirst({ where: { projectId: pid } })) return;
        const one = async (type: string) => (await this.approved(pid, type))[0];
        await this.designBaselines.create(pid, ctx.userId, {
          label: 'Diseño aprobado automáticamente',
          versions: {
            GENERATION_PLAN: (await one('GENERATION_PLAN'))!,
            CONCEPTUAL_DOMAIN_MODEL: (await one('CONCEPTUAL_DOMAIN_MODEL'))!,
            NAVIGATION_TREE: (await one('NAVIGATION_TREE'))!,
            UI_BLUEPRINT: (await one('UI_BLUEPRINT'))!,
            DESIGN_THEME: await one('DESIGN_THEME'),
            MOCKUP: (await one('MOCKUP'))!,
            SOFTWARE_ARCHITECTURE: await one('SOFTWARE_ARCHITECTURE'),
            SYSTEM_ARCHITECTURE: await one('SYSTEM_ARCHITECTURE'),
          },
        });
        return;
      }
      case 'IMPLEMENTATION_PLAN': {
        const baseline = await this.prisma.designBaseline.findFirstOrThrow({
          where: { projectId: pid },
          orderBy: { createdAt: 'desc' },
        });
        await this.ensureApproved(
          pid,
          'IMPLEMENTATION_PLAN',
          async () => {
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
          },
          (item) => (status) =>
            this.structured.transition(
              pid,
              'IMPLEMENTATION_PLAN',
              item.artifactId,
              item.versionId,
              status,
            ),
        );
        return;
      }
      case 'CODE_GENERATION': {
        const [planVersionId] = await this.approved(pid, 'IMPLEMENTATION_PLAN');
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

  private async structuredStage(projectId: string, kind: StructuredAnalysisKind) {
    const sourceIds = (
      await Promise.all(ELIGIBLE_SOURCE_TYPES[kind].map((type) => this.approved(projectId, type)))
    ).flat();
    await this.ensureApproved(
      projectId,
      kind,
      async () => {
        const generation = await this.structured.generate(projectId, kind, sourceIds);
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
        await this.structured.accept(projectId, kind, generation.id, this.first(usable));
      },
      (item) => (status) =>
        this.structured.transition(projectId, kind, item.artifactId, item.versionId, status),
    );
  }

  // Approves what a previous attempt left pending and only generates when
  // the stage produced nothing yet, so a retry never duplicates artifacts.
  private async ensureApproved(
    projectId: string,
    type: string,
    generate: () => Promise<void>,
    transitionFor: (item: LatestVersion) => Transition,
  ) {
    let items = await this.latest(projectId, type);
    if (!items.length) {
      await generate();
      items = await this.latest(projectId, type);
    }
    if (!items.length) throw new StageError('La IA no propuso ningún elemento.');
    for (const item of items) {
      if (item.status === 'APPROVED') continue;
      const transition = transitionFor(item);
      if (item.status !== 'IN_REVIEW') await transition('IN_REVIEW');
      await transition('APPROVED');
    }
  }

  // Latest version of every live artifact of a type in the project.
  private async latest(projectId: string, type: string): Promise<LatestVersion[]> {
    const rows = await this.prisma.artifact.findMany({
      where: { projectId, artifactTypeCode: type, archivedAt: null },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
      orderBy: { code: 'asc' },
    });
    return rows.flatMap((row) =>
      row.versions[0]
        ? [
            {
              artifactId: row.id,
              code: row.code,
              versionId: row.versions[0].id,
              status: row.versions[0].status,
            },
          ]
        : [],
    );
  }

  private async approved(projectId: string, type: string): Promise<string[]> {
    return (await this.latest(projectId, type))
      .filter((item) => item.status === 'APPROVED')
      .map((item) => item.versionId);
  }

  private first(candidates: { id: string }[]): string[] {
    if (!candidates[0]) throw new StageError('La IA no propuso ningún elemento.');
    return [candidates[0].id];
  }

  private failureMessage(stage: WorkflowStage, error: unknown): string {
    const prefix = `La etapa «${STAGE_LABELS[stage]}» no se completó`;
    if (error instanceof StageError) return `${prefix}: ${error.message}`;
    if (error instanceof HttpException) {
      const response = error.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : (response as { message?: string | string[] }).message;
      return `${prefix}: ${Array.isArray(message) ? message.join(' ') : (message ?? error.message)}`;
    }
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
  }): WorkflowRunResponse {
    const done = new Set(row.stages.map((s) => s.stage));
    return {
      id: row.id,
      projectId: row.projectId,
      prompt: row.prompt,
      status: row.status,
      currentStage: row.currentStage as WorkflowStage | null,
      completedStages: WORKFLOW_STAGES.filter((stage) => done.has(stage)),
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
    };
  }
}
