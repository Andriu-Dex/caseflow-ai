import { implementationReadinessProblems } from './implementation-readiness';
import { FrontendDesignService } from './frontend-design.service';
import { assertCanGenerate } from '../common/generation-cancelled';
import { INTERRUPTED_BY_RESTART, startHeartbeat, staleHeartbeat } from '../common/interrupted';
import { createHash } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { StageCurrencyService } from '../readiness/stage-currency';
import {
  CONSTRUCTION_QUEUE,
  findTargetTemplate,
  type ConstructionJobPayload,
} from '@caseflow-ai/domain';
import {
  designThemeContentSchema,
  implementationPlanContentSchema,
  type GeneratedFileResponse,
  type GeneratedFileSummary,
  type GenerationRunResponse,
  type CreateWorkingCopyRequest,
} from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PlanGenerationError } from '../code-generation/naming';
import { generateProject, projectSlug } from '../code-generation/engine/project-generator';
import { planTraceLinks } from '../code-generation/engine/trace-links';
import { BusinessLogicService, reviewBusinessLogic } from './business-logic.service';
import { DesignBaselinesService } from './design-baselines.service';
import { CONSTRUCTION_QUEUE_TOKEN } from './construction-queue.token';

const TEMPLATE_IDENTIFIER = 'CASEFLOW_WEB_TS_V1';
const logger = new Logger('GenerationRunsService');

type RunRow = {
  id: string;
  projectId: string;
  implementationPlanVersionId: string;
  designBaselineId: string;
  targetTemplateIdentifier: string;
  targetTemplateVersion: number;
  status: GenerationRunResponse['status'];
  errorMessage: string | null;
  warnings: string[];
  createdByUserId: string;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  archivedAt: Date | null;
  _count: { files: number };
};

// Official code generation (spec §197, DEC-111): an approved Implementation
// Plan, built on an approved Design Baseline, is turned into the project's
// files asynchronously. Every run is new history — never an overwrite.
@Injectable()
export class GenerationRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly designBaselines: DesignBaselinesService,
    private readonly businessLogic: BusinessLogicService,
    @Inject(CONSTRUCTION_QUEUE_TOKEN) private readonly queue: Queue<ConstructionJobPayload>,
    @Optional() private readonly currency?: StageCurrencyService,
    @Optional() private readonly frontendDesign?: FrontendDesignService,
  ) {}

  async createWorkingCopy(projectId: string, userId: string, input: CreateWorkingCopyRequest) {
    await assertCanGenerate(this.prisma, projectId, userId);
    await this.currency?.assertCurrent(projectId);
    const plan = await this.approvedPlan(projectId, input.implementationPlanVersionId);
    await this.designBaselines.assertApproved(projectId, plan.designBaselineId);
    const template = findTargetTemplate(TEMPLATE_IDENTIFIER)!;
    const problems = implementationReadinessProblems(plan);
    if (problems.length) throw new UnprocessableEntityException(problems.join(' '));
    const revisions = new Map<string, string>();
    const internalFields = plan.entities.flatMap((entity) =>
      entity.fields.filter((field) => field.internal).map((field) => field.name),
    );
    for (const revision of input.revisions) {
      const endpoint = plan.customEndpoints.find(
        (endpoint) => `${endpoint.method} ${endpoint.path}` === revision.endpoint,
      );
      if (
        !endpoint ||
        endpoint.builtin ||
        endpoint.disabledReason ||
        revisions.has(revision.endpoint)
      )
        throw new UnprocessableEntityException(
          'La revisión debe identificar una acción activa y no repetida del plan.',
        );
      const source = await this.prisma.generatedFile.findFirst({
        where: {
          id: revision.sourceFileId,
          kind: 'DOCUMENTATION',
          generationRun: {
            projectId,
            designBaselineId: plan.designBaselineId,
            targetTemplateIdentifier: template.identifier,
            targetTemplateVersion: template.version,
          },
        },
      });
      if (!source || !/^docs\/business-logic\/[a-f0-9]{64}\.json$/.test(source.path))
        throw new NotFoundException('Checkpoint de origen no encontrado en el proyecto y diseño.');
      if (
        source.sha256 !== revision.expectedSha256 ||
        createHash('sha256').update(source.content).digest('hex') !== revision.expectedSha256
      )
        throw new ConflictException('El checkpoint de origen no coincide con la revisión.');
      const review = reviewBusinessLogic(revision.body, internalFields);
      if (!review.accepted)
        throw new UnprocessableEntityException(`La revisión se rechazó: ${review.reason}.`);
      revisions.set(revision.endpoint, revision.body);
    }
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { name: true },
    });
    const run = await this.prisma.$transaction(async (tx) => {
      const created = await tx.generationRun.create({
        data: {
          projectId,
          createdByUserId: userId,
          implementationPlanVersionId: input.implementationPlanVersionId,
          designBaselineId: plan.designBaselineId,
          targetTemplateIdentifier: template.identifier,
          targetTemplateVersion: template.version,
          status: 'GENERATING',
          startedAt: new Date(),
        },
      });
      await this.audit.record(
        {
          projectId,
          actorUserId: userId,
          action: 'GENERATION_RUN_STARTED',
          entityType: 'GENERATION_RUN',
          entityId: created.id,
          metadata: {
            workingCopy: true,
            implementationPlanVersionId: input.implementationPlanVersionId,
            reason: input.reason,
            revisions: input.revisions.map(({ endpoint, sourceFileId, expectedSha256, body }) => ({
              endpoint,
              sourceFileId,
              expectedSha256,
              bodySha256: createHash('sha256').update(body).digest('hex'),
            })),
          },
        },
        tx,
      );
      return created;
    });
    try {
      const result = await this.businessLogic.implement(projectId, run.id, plan, template, {
        cacheOnly: true,
        revisions,
      });
      // A rejected revision must not silently turn into a stub in a published working copy.
      if (input.revisions.some((revision) => !result.implementations[revision.endpoint]))
        throw new PlanGenerationError('No se pudieron integrar todas las revisiones solicitadas.');
      const theme = await this.frozenTheme(projectId, plan.designBaselineId);
      const files = generateProject(
        { plan, template, projectName: project.name, slug: projectSlug(project.name), theme },
        result.implementations,
      );
      const manifest = {
        formatVersion: 1,
        officialDelivery: false,
        implementationPlanVersionId: input.implementationPlanVersionId,
        designBaselineId: plan.designBaselineId,
        reason: input.reason,
        revisions: input.revisions.map(({ body, ...revision }) => ({
          ...revision,
          bodySha256: createHash('sha256').update(body).digest('hex'),
        })),
        implementedEndpoints: Object.keys(result.implementations),
        pendingEndpoints: plan.customEndpoints
          .filter(
            (endpoint) =>
              !endpoint.builtin &&
              !endpoint.disabledReason &&
              !result.implementations[`${endpoint.method} ${endpoint.path}`],
          )
          .map((endpoint) => `${endpoint.method} ${endpoint.path}`),
      };
      files.push({
        path: 'docs/working-copy.json',
        content: JSON.stringify(manifest, null, 2),
        kind: 'DOCUMENTATION',
        origin: 'DETERMINISTIC',
        planElements: [],
      });
      const frozen = await this.frozenVersionsByCode(projectId, plan.designBaselineId);
      const links = planTraceLinks(files, plan, input.implementationPlanVersionId, frozen);
      await this.prisma.$transaction(async (tx) => {
        const checkpoints = await tx.generatedFile.findMany({
          where: { generationRunId: run.id },
          select: { id: true, path: true },
        });
        const existing = new Set(checkpoints.map((file) => file.path));
        const created = await tx.generatedFile.createManyAndReturn({
          data: files
            .filter((file) => !existing.has(file.path))
            .map(({ path, content, kind, origin }) => ({
              generationRunId: run.id,
              path,
              content,
              kind,
              origin,
              sha256: createHash('sha256').update(content).digest('hex'),
            })),
          select: { id: true, path: true },
        });
        const ids = new Map([...checkpoints, ...created].map((file) => [file.path, file.id]));
        await tx.codeTraceLink.createMany({
          data: links.map(({ path, ...link }) => ({ ...link, generatedFileId: ids.get(path)! })),
        });
        await tx.generationRun.update({
          where: { id: run.id },
          data: {
            status: 'WORKING_COPY',
            finishedAt: new Date(),
            warnings: [
              'Versión de trabajo incompleta. No es una entrega oficial ni acredita validación o fidelidad visual. Conserva el renderizador interno y las acciones pendientes responden 501.',
              ...result.warnings,
            ],
          },
        });
        await this.audit.record(
          {
            projectId,
            actorUserId: userId,
            action: 'GENERATION_RUN_FINISHED',
            entityType: 'GENERATION_RUN',
            entityId: run.id,
            metadata: {
              status: 'WORKING_COPY',
              revisions: input.revisions.map(({ endpoint, sourceFileId, expectedSha256 }) => ({
                endpoint,
                sourceFileId,
                expectedSha256,
              })),
              implemented: manifest.implementedEndpoints.length,
              pending: manifest.pendingEndpoints.length,
            },
          },
          tx,
        );
      });
      return this.get(projectId, run.id);
    } catch (error) {
      await this.prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          errorMessage: 'No se pudo preparar la versión de trabajo.',
        },
      });
      await this.audit.record({
        projectId,
        actorUserId: userId,
        action: 'GENERATION_RUN_FINISHED',
        entityType: 'GENERATION_RUN',
        entityId: run.id,
        metadata: { status: 'FAILED', workingCopy: true },
      });
      throw error;
    }
  }

  async start(
    projectId: string,
    userId: string,
    implementationPlanVersionId: string,
  ): Promise<GenerationRunResponse> {
    await this.currency?.assertCurrent(projectId);
    const active = await this.prisma.generationRun.findFirst({
      where: { projectId, status: { in: ['QUEUED', 'GENERATING'] } },
    });
    if (active) {
      throw new ConflictException(
        'Ya existe una generación de código en curso para este proyecto. Espere a que finalice.',
      );
    }
    const plan = await this.approvedPlan(projectId, implementationPlanVersionId);
    await this.designBaselines.assertApproved(projectId, plan.designBaselineId);
    const template = findTargetTemplate(TEMPLATE_IDENTIFIER)!;
    if (template.version >= 2) {
      const problems = implementationReadinessProblems(plan);
      if (problems.length) throw new UnprocessableEntityException(problems.join(' '));
    }
    const run = await this.prisma.$transaction(async (tx) => {
      const created = await tx.generationRun.create({
        data: {
          projectId,
          implementationPlanVersionId,
          designBaselineId: plan.designBaselineId,
          targetTemplateIdentifier: template.identifier,
          targetTemplateVersion: template.version,
          createdByUserId: userId,
        },
        include: { _count: { select: { files: true } } },
      });
      await this.audit.record(
        {
          projectId,
          actorUserId: userId,
          action: 'GENERATION_RUN_STARTED',
          entityType: 'GENERATION_RUN',
          entityId: created.id,
          metadata: { implementationPlanVersionId, designBaselineId: plan.designBaselineId },
        },
        tx,
      );
      return created;
    });
    await this.queue.add(CONSTRUCTION_QUEUE, {
      type: 'generation-run',
      runId: run.id,
      projectId,
    });
    return this.map(run);
  }

  // A run still GENERATING when the API starts was cut off by a restart. It
  // is not repeated automatically: it is audited history and the person
  // decides whether to generate again (BUILD_ONLY retries it once through the
  // workflow run). Validated presentation checkpoints can survive a failure;
  // they are not a completed project or an official snapshot.
  async markInterrupted(bootedAt: Date): Promise<number> {
    const cutoff = new Date(bootedAt.getTime() - 15_000);
    const runs = await this.prisma.generationRun.findMany({
      where: { status: 'GENERATING', startedAt: { lt: cutoff }, ...staleHeartbeat(bootedAt) },
      select: { id: true, projectId: true },
    });
    let marked = 0;
    for (const run of runs)
      await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.generationRun.updateMany({
          where: { id: run.id, status: 'GENERATING' },
          data: { status: 'FAILED', errorMessage: INTERRUPTED_BY_RESTART, finishedAt: new Date() },
        });
        if (!count) return;
        marked++;
        await this.audit.record(
          {
            projectId: run.projectId,
            actorUserId: null,
            action: 'GENERATION_RUN_FINISHED',
            entityType: 'GENERATION_RUN',
            entityId: run.id,
            metadata: { status: 'FAILED', interrupted: true },
          },
          tx,
        );
      });
    return marked;
  }

  // Invoked by the worker's authenticated internal callback. Always leaves the
  // run in a terminal status, so polling never hangs.
  async runJob(projectId: string, runId: string): Promise<void> {
    const { count } = await this.prisma.generationRun.updateMany({
      where: { id: runId, projectId, status: 'QUEUED' },
      data: { status: 'GENERATING', startedAt: new Date(), heartbeatAt: new Date() },
    });
    if (!count) return; // Already picked up (e.g. a retried job): nothing to do.
    const run = await this.prisma.generationRun.findUniqueOrThrow({
      where: { id: runId },
      include: { project: { select: { name: true } } },
    });
    const stopHeartbeat = startHeartbeat(() =>
      this.prisma.generationRun.updateMany({
        where: { id: runId, status: 'GENERATING' },
        data: { heartbeatAt: new Date() },
      }),
    );
    try {
      try {
        const plan = await this.approvedPlan(projectId, run.implementationPlanVersionId);
        const template = findTargetTemplate(
          run.targetTemplateIdentifier,
          run.targetTemplateVersion,
        );
        if (!template)
          throw new PlanGenerationError('La plantilla de la corrida ya no está soportada.');
        if (template.version >= 2) {
          const problems = implementationReadinessProblems(plan);
          if (problems.length) throw new PlanGenerationError(problems.join(' '));
        }
        const {
          implementations,
          warnings,
          checkpoints = [],
        } = await this.businessLogic.implement(projectId, runId, plan, template);
        if (template.version >= 2 && warnings.length) {
          await this.prisma.generationRun.update({ where: { id: runId }, data: { warnings } });
          throw new PlanGenerationError(
            `Hay ${warnings.length} ${warnings.length === 1 ? 'acción de negocio sin implementar' : 'acciones de negocio sin implementar'}. Revise las advertencias de la corrida.`,
          );
        }
        const theme = await this.frozenTheme(projectId, run.designBaselineId);
        let files = generateProject(
          {
            plan,
            template,
            projectName: run.project.name,
            slug: projectSlug(run.project.name),
            theme,
          },
          implementations,
        );
        files.push(...checkpoints);
        if (template.version >= 2) {
          if (!this.frontendDesign)
            throw new PlanGenerationError('El adaptador del diseño aprobado no está disponible.');
          const adapted = await this.frontendDesign.adapt(
            projectId,
            run.designBaselineId,
            plan,
            files,
            run.project.name,
            theme?.content.mode === 'BOTH',
            runId,
          );
          files = adapted.files;
          warnings.push(
            'La composición conserva los controles y usa el boceto aprobado. Revise la fidelidad visual en la aplicación; la comprobación estructural no sustituye esa revisión.',
          );
        }
        const frozen = await this.frozenVersionsByCode(projectId, run.designBaselineId);
        const links = planTraceLinks(files, plan, run.implementationPlanVersionId, frozen);
        await this.prisma.$transaction(async (tx) => {
          const checkpoints = await tx.generatedFile.findMany({
            where: { generationRunId: runId },
            select: { id: true, path: true },
          });
          const existing = new Set(checkpoints.map((item) => item.path));
          const created = await tx.generatedFile.createManyAndReturn({
            data: files
              .filter((item) => !existing.has(item.path))
              .map((f) => ({
                generationRunId: runId,
                path: f.path,
                content: f.content,
                sha256: createHash('sha256').update(f.content).digest('hex'),
                origin: f.origin,
                kind: f.kind,
              })),
            select: { id: true, path: true },
          });
          const idByPath = new Map([...checkpoints, ...created].map((f) => [f.path, f.id]));
          await tx.codeTraceLink.createMany({
            data: links.map((link) => ({
              generatedFileId: idByPath.get(link.path)!,
              sourceArtifactVersionId: link.sourceArtifactVersionId,
              planElement: link.planElement,
              linkType: link.linkType,
            })),
          });
          await tx.generationRun.update({
            where: { id: runId },
            data: { status: 'GENERATED', finishedAt: new Date(), warnings },
          });
          await this.audit.record(
            {
              projectId,
              actorUserId: null,
              action: 'GENERATION_RUN_FINISHED',
              entityType: 'GENERATION_RUN',
              entityId: runId,
              metadata: { status: 'GENERATED', files: files.length, warnings: warnings.length },
            },
            tx,
          );
        });
      } catch (error) {
        const message =
          error instanceof PlanGenerationError || error instanceof UnprocessableEntityException
            ? error.message
            : 'No se pudo generar el proyecto.';
        logger.warn(
          `Generation run "${runId}" failed: ${message}`,
          error instanceof Error ? error.stack : undefined,
        );
        await this.prisma.$transaction(async (tx) => {
          await tx.generationRun.update({
            where: { id: runId },
            data: { status: 'FAILED', errorMessage: message, finishedAt: new Date() },
          });
          await this.audit.record(
            {
              projectId,
              actorUserId: null,
              action: 'GENERATION_RUN_FINISHED',
              entityType: 'GENERATION_RUN',
              entityId: runId,
              metadata: { status: 'FAILED' },
            },
            tx,
          );
        });
      }
    } finally {
      stopHeartbeat();
    }
  }

  async list(projectId: string): Promise<{ items: GenerationRunResponse[] }> {
    const rows = await this.prisma.generationRun.findMany({
      where: { projectId },
      include: { _count: { select: { files: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map((row) => this.map(row)) };
  }

  // A person hides a run from the list (or shows it again). Nothing is
  // deleted: the run, its files, validations and snapshot stay as history.
  async setArchived(
    projectId: string,
    runId: string,
    userId: string,
    archived: boolean,
  ): Promise<GenerationRunResponse> {
    await assertCanGenerate(this.prisma, projectId, userId);
    const run = await this.prisma.generationRun.findFirst({
      where: { id: runId, projectId },
      include: {
        sandboxRuns: { where: { status: { in: ['QUEUED', 'RUNNING'] } }, select: { id: true } },
      },
    });
    if (!run) throw new NotFoundException('Corrida de generación no encontrada.');
    if (
      archived &&
      (run.status === 'QUEUED' || run.status === 'GENERATING' || run.sandboxRuns.length)
    )
      throw new ConflictException(
        'No se puede archivar una generación mientras se genera o se valida.',
      );
    if (Boolean(run.archivedAt) !== archived)
      await this.prisma.$transaction(async (tx) => {
        await tx.generationRun.update({
          where: { id: runId },
          data: { archivedAt: archived ? new Date() : null },
        });
        await this.audit.record(
          {
            projectId,
            actorUserId: userId,
            action: archived ? 'GENERATION_RUN_ARCHIVED' : 'GENERATION_RUN_RESTORED',
            entityType: 'GENERATION_RUN',
            entityId: runId,
            metadata: {},
          },
          tx,
        );
      });
    return this.get(projectId, runId);
  }

  async get(projectId: string, runId: string): Promise<GenerationRunResponse> {
    const row = await this.prisma.generationRun.findFirst({
      where: { id: runId, projectId },
      include: { _count: { select: { files: true } } },
    });
    if (!row) throw new NotFoundException('Corrida de generación no encontrada.');
    return this.map(row);
  }

  async listFiles(projectId: string, runId: string): Promise<{ items: GeneratedFileSummary[] }> {
    await this.get(projectId, runId);
    const files = await this.prisma.generatedFile.findMany({
      where: { generationRunId: runId },
      select: { id: true, path: true, origin: true, kind: true, sha256: true, content: true },
      orderBy: { path: 'asc' },
    });
    return {
      items: files.map(({ content, ...file }) => ({ ...file, size: Buffer.byteLength(content) })),
    };
  }

  async getFile(projectId: string, runId: string, fileId: string): Promise<GeneratedFileResponse> {
    const file = await this.prisma.generatedFile.findFirst({
      where: { id: fileId, generationRunId: runId, generationRun: { projectId } },
      include: {
        traceLinks: {
          include: {
            sourceArtifactVersion: {
              select: { versionNumber: true, artifact: { select: { code: true } } },
            },
          },
          orderBy: { planElement: 'asc' },
        },
      },
    });
    if (!file) throw new NotFoundException('Archivo no encontrado.');
    return {
      id: file.id,
      path: file.path,
      origin: file.origin,
      kind: file.kind,
      sha256: file.sha256,
      size: Buffer.byteLength(file.content),
      content: file.content,
      traceLinks: file.traceLinks.map((link) => ({
        sourceArtifactVersionId: link.sourceArtifactVersionId,
        code: link.sourceArtifactVersion.artifact.code,
        versionNumber: link.sourceArtifactVersion.versionNumber,
        planElement: link.planElement,
        linkType: link.linkType,
      })),
    };
  }

  private async approvedPlan(projectId: string, versionId: string) {
    const version = await this.prisma.artifactVersion.findFirst({
      where: {
        id: versionId,
        projectId,
        status: 'APPROVED',
        artifact: { artifactTypeCode: 'IMPLEMENTATION_PLAN' },
      },
      include: { structuredAnalysisDetail: true },
    });
    if (!version?.structuredAnalysisDetail)
      throw new UnprocessableEntityException(
        'Solo se puede generar código desde un plan de implementación aprobado del proyecto.',
      );
    return implementationPlanContentSchema.parse(version.structuredAnalysisDetail.content);
  }

  // DEC-118: the frontend is painted with the exact theme the baseline froze.
  private async frozenTheme(projectId: string, baselineId: string) {
    const baseline = await this.designBaselines.get(projectId, baselineId);
    const entry = baseline.entries.find((e) => e.role === 'DESIGN_THEME');
    if (!entry) return undefined;
    const detail = await this.prisma.structuredAnalysisDetail.findUniqueOrThrow({
      where: { artifactVersionId: entry.artifactVersionId },
    });
    return { code: entry.code, content: designThemeContentSchema.parse(detail.content) };
  }

  private async frozenVersionsByCode(projectId: string, baselineId: string) {
    const baseline = await this.designBaselines.get(projectId, baselineId);
    return new Map(baseline.entries.map((entry) => [entry.code, entry.artifactVersionId]));
  }

  private map(row: RunRow): GenerationRunResponse {
    return {
      id: row.id,
      projectId: row.projectId,
      implementationPlanVersionId: row.implementationPlanVersionId,
      designBaselineId: row.designBaselineId,
      targetTemplateIdentifier: row.targetTemplateIdentifier,
      targetTemplateVersion: row.targetTemplateVersion,
      status: row.status,
      errorMessage: row.errorMessage,
      warnings: row.warnings,
      fileCount: row._count.files,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
    };
  }
}
