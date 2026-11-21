import { loadApprovedPlan } from './approved-plan';
import { DeliveriesService } from './deliveries.service';
import { deferredPages, deliveryScope, planForRun, scopePlan } from './delivery-scope';
import { getProjectLanguage } from '../projects/project-language';
import { implementationReadinessProblems } from './implementation-readiness';
import { FrontendDesignService } from './frontend-design.service';
import { DemoDataService } from './demo-data.service';
import { constructionUnits, screenDesigns } from './construction-units';
import { assertCanGenerate } from '../common/generation-cancelled';
import { INTERRUPTED_BY_RESTART, startHeartbeat, staleHeartbeat } from '../common/interrupted';
import { createHash } from 'node:crypto';
import {
  ConflictException,
  ServiceUnavailableException,
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
  type ConstructionUnit,
  type ConstructionUnitReviewRequest,
  type GeneratedFileResponse,
  type GeneratedFileSummary,
  type GenerationRunResponse,
  type ConstructionPreviewResponse,
  type GenerationEstimateResponse,
  type ImplementationPlanContent,
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
import { ManualImportError, readManualArchive } from './manual-import';
import { constructionPreview } from './construction-preview';
import { endpointKey } from '../code-generation/engine/backend.templates';
import type { GeneratedProjectFile } from '../code-generation/engine/types';

const TEMPLATE_IDENTIFIER = 'CASEFLOW_WEB_TS_V1';
const logger = new Logger('GenerationRunsService');

type RunRow = {
  id: string;
  projectId: string;
  implementationPlanVersionId: string;
  deliveryId: string | null;
  designBaselineId: string;
  targetTemplateIdentifier: string;
  targetTemplateVersion: number;
  status: GenerationRunResponse['status'];
  origin: GenerationRunResponse['origin'];
  errorMessage: string | null;
  warnings: string[];
  createdByUserId: string;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  archivedAt: Date | null;
  _count: { files: number };
};

// Official code generation (DEC-111): an approved Implementation
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
    @Optional() private readonly demoData?: DemoDataService,
    @Optional() private readonly deliveries?: DeliveriesService,
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

  // What a plan version will produce, before it is approved or generated: the
  // deterministic generator runs without AI and only paths and purposes leave.
  async preview(
    projectId: string,
    versionId: string,
    deliveryId?: string,
  ): Promise<ConstructionPreviewResponse> {
    const version = await this.prisma.artifactVersion.findFirst({
      where: { id: versionId, projectId, artifact: { artifactTypeCode: 'IMPLEMENTATION_PLAN' } },
      select: { structuredAnalysisDetail: { select: { content: true } } },
    });
    if (!version?.structuredAnalysisDetail)
      throw new NotFoundException('Plan de implementación no encontrado.');
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { name: true },
    });
    const plan = await this.deliveryView(
      projectId,
      versionId,
      implementationPlanContentSchema.parse(version.structuredAnalysisDetail.content),
      deliveryId,
    );
    try {
      const files = generateProject({
        plan,
        template: findTargetTemplate(TEMPLATE_IDENTIFIER)!,
        projectName: project.name,
        slug: projectSlug(project.name),
      });
      return { implementationPlanVersionId: versionId, ...constructionPreview(plan, files) };
    } catch (error) {
      if (error instanceof PlanGenerationError)
        throw new UnprocessableEntityException(error.message);
      throw error;
    }
  }

  // DEC-168: what a generation from this plan would ask the AI for, before it
  // starts. Actions and demonstration data are exact: what has a checkpoint
  // under the same inputs is reused. Screens are an upper bound, every screen the
  // AI composes from the approved mockup; one whose inputs did not change is
  // reused, but that is only known once the actions it calls are implemented.
  async estimate(
    projectId: string,
    versionId: string,
    deliveryId?: string,
  ): Promise<GenerationEstimateResponse> {
    const version = await this.prisma.artifactVersion.findFirst({
      where: { id: versionId, projectId, artifact: { artifactTypeCode: 'IMPLEMENTATION_PLAN' } },
      select: { structuredAnalysisDetail: { select: { content: true } } },
    });
    if (!version?.structuredAnalysisDetail)
      throw new NotFoundException('Plan de implementación no encontrado.');
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { name: true },
    });
    const fullPlan = implementationPlanContentSchema.parse(
      version.structuredAnalysisDetail.content,
    );
    const plan = await this.deliveryView(projectId, versionId, fullPlan, deliveryId);
    const template = findTargetTemplate(TEMPLATE_IDENTIFIER)!;
    const actions = await this.businessLogic.estimate(projectId, plan, template, fullPlan);
    const demo =
      template.version >= 2 && this.demoData
        ? await this.demoData.isCached(projectId, plan.designBaselineId, project.name, plan)
        : null;
    const screens = template.version >= 2 ? await this.composedScreens(projectId, plan) : 0;
    const atLeast = actions.total - actions.reused + (demo === false ? 1 : 0);
    return {
      implementationPlanVersionId: versionId,
      businessActions: actions,
      demoData: demo === null ? 'NONE' : demo ? 'REUSED' : 'REQUESTED',
      screens: { atMost: screens },
      requests: { atLeast, atMost: atLeast + screens },
    };
  }

  // The routes whose screen the AI composes: none with an internal wireframe,
  // and never one replaced by a hand-written screen (DEC-161).
  private async composedScreens(projectId: string, plan: ImplementationPlanContent) {
    const mockup = await this.prisma.designBaselineEntry.findFirst({
      where: { baselineId: plan.designBaselineId, role: 'MOCKUP', baseline: { projectId } },
      select: {
        artifactVersion: { select: { mockupDetail: { select: { generatorKind: true } } } },
      },
    });
    if (mockup?.artifactVersion.mockupDetail?.generatorKind === 'INTERNAL_WIREFRAME') return 0;
    const overridden = new Set(
      (
        await this.prisma.screenDesignOverride.findMany({
          where: { projectId, designBaselineId: plan.designBaselineId },
          select: { routePath: true },
        })
      ).map((item) => item.routePath),
    );
    return plan.routes.filter((route) => !overridden.has(route.path)).length;
  }

  // ADR-023: a project written by people comes in as a run of its own, with the
  // same preconditions as a generation and no AI. It is stored, never executed
  // here: validation happens in the sandbox like for any other run.
  async importManual(
    projectId: string,
    userId: string,
    implementationPlanVersionId: string,
    archive: Buffer | undefined,
    deliveryId?: string,
  ): Promise<GenerationRunResponse> {
    await assertCanGenerate(this.prisma, projectId, userId);
    await this.currency?.assertCurrent(projectId);
    if (!archive?.length)
      throw new UnprocessableEntityException('Adjunte el ZIP del proyecto que desea importar.');
    const { plan } = await this.buildablePlan(projectId, implementationPlanVersionId, deliveryId);
    await this.designBaselines.assertApproved(projectId, plan.designBaselineId);
    const template = findTargetTemplate(TEMPLATE_IDENTIFIER)!;
    const problems = implementationReadinessProblems(plan);
    if (problems.length) throw new UnprocessableEntityException(problems.join(' '));
    let imported: Awaited<ReturnType<typeof readManualArchive>>;
    try {
      imported = await readManualArchive(archive);
    } catch (error) {
      if (error instanceof ManualImportError) throw new UnprocessableEntityException(error.message);
      throw error;
    }
    const frozen = await this.frozenVersionsByCode(projectId, plan.designBaselineId);
    // The archive's manifest is untrusted: only elements the approved plan
    // defines, or sources frozen in its baseline, are kept.
    const known = new Set([
      'project',
      ...plan.modules.map((item) => `module:${item.localId}`),
      ...plan.entities.map((item) => `entity:${item.localId}`),
      ...plan.routes.map((item) => `route:${item.path}`),
      ...plan.customEndpoints.map((item) => `endpoint:${endpointKey(item)}`),
      ...[...frozen.values()].map((id) => `design-source:${id}`),
    ]);
    // A file identical to the latest run of the same design keeps its origin
    // and kind, so only what a person changed or added is marked as manual.
    const base = await this.prisma.generationRun.findFirst({
      where: {
        projectId,
        designBaselineId: plan.designBaselineId,
        status: { in: ['GENERATED', 'WORKING_COPY'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { files: { select: { path: true, sha256: true, origin: true, kind: true } } },
    });
    const previous = new Map(base?.files.map((file) => [file.path, file]) ?? []);
    let unchanged = 0;
    const files = imported.files.map((file): GeneratedProjectFile & { sha256: string } => {
      const sha256 = createHash('sha256').update(file.content).digest('hex');
      const before = previous.get(file.path);
      const same = before?.sha256 === sha256;
      if (same) unchanged++;
      return {
        path: file.path,
        content: file.content,
        sha256,
        kind: before?.kind ?? file.kind,
        origin: same ? before.origin : 'MANUAL',
        planElements: (imported.declaredElements.get(file.path) ?? []).filter((element) =>
          known.has(element),
        ),
      };
    });
    const links = planTraceLinks(files, plan, implementationPlanVersionId, frozen);
    const run = await this.prisma.$transaction(
      async (tx) => {
        const now = new Date();
        const created = await tx.generationRun.create({
          data: {
            projectId,
            implementationPlanVersionId,
            designBaselineId: plan.designBaselineId,
            targetTemplateIdentifier: template.identifier,
            targetTemplateVersion: template.version,
            createdByUserId: userId,
            origin: 'MANUAL',
            // The database only accepts files while a run is generating.
            status: 'GENERATING',
            startedAt: now,
            warnings: [
              `Implementación manual: ${files.length} archivos importados, ${files.length - unchanged} nuevos o modificados respecto a la corrida anterior. La fidelidad visual no se comprueba automáticamente.`,
            ],
          },
        });
        const stored = await tx.generatedFile.createManyAndReturn({
          data: files.map(({ path, content, kind, origin, sha256 }) => ({
            generationRunId: created.id,
            path,
            content,
            kind,
            origin,
            sha256,
          })),
          select: { id: true, path: true },
        });
        const ids = new Map(stored.map((file) => [file.path, file.id]));
        await tx.codeTraceLink.createMany({
          data: links.map(({ path, ...link }) => ({ ...link, generatedFileId: ids.get(path)! })),
        });
        await tx.generationRun.update({
          where: { id: created.id },
          data: { status: 'GENERATED', finishedAt: new Date() },
        });
        await this.audit.record(
          {
            projectId,
            actorUserId: userId,
            action: 'GENERATION_RUN_FINISHED',
            entityType: 'GENERATION_RUN',
            entityId: created.id,
            metadata: {
              status: 'GENERATED',
              origin: 'MANUAL',
              implementationPlanVersionId,
              designBaselineId: plan.designBaselineId,
              files: files.length,
              changed: files.length - unchanged,
              skipped: imported.skipped,
            },
          },
          tx,
        );
        return created;
      },
      { timeout: 60_000 },
    );
    return this.get(projectId, run.id);
  }

  async start(
    projectId: string,
    userId: string,
    implementationPlanVersionId: string,
    deliveryId?: string,
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
    const { plan } = await this.buildablePlan(projectId, implementationPlanVersionId, deliveryId);
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
          deliveryId: deliveryId ?? null,
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
          metadata: {
            implementationPlanVersionId,
            designBaselineId: plan.designBaselineId,
            ...(deliveryId ? { deliveryId } : {}),
          },
        },
        tx,
      );
      return created;
    });
    // A run that never reached the queue would stay QUEUED and block every
    // later generation of the project, so it fails instead.
    try {
      await Promise.race([
        this.queue.add(CONSTRUCTION_QUEUE, { type: 'generation-run', runId: run.id, projectId }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Queue unavailable.')), 30_000).unref(),
        ),
      ]);
    } catch {
      await this.prisma.generationRun.updateMany({
        where: { id: run.id, status: 'QUEUED' },
        data: {
          status: 'FAILED',
          errorMessage: 'No se pudo poner en cola la generación. Inténtelo de nuevo.',
        },
      });
      throw new ServiceUnavailableException(
        'No se pudo poner en cola la generación. Inténtelo de nuevo.',
      );
    }
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
        const fullPlan = await this.approvedPlan(projectId, run.implementationPlanVersionId);
        const scope = run.deliveryId
          ? await deliveryScope(this.prisma, projectId, run.deliveryId)
          : null;
        const plan = scope ? scopePlan(fullPlan, scope.modules) : fullPlan;
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
        } = await this.businessLogic.implement(projectId, runId, plan, template, {
          contextPlan: fullPlan,
        });
        if (template.version >= 2 && warnings.length) {
          await this.prisma.generationRun.update({ where: { id: runId }, data: { warnings } });
          throw new PlanGenerationError(
            `Hay ${warnings.length} ${warnings.length === 1 ? 'acción de negocio sin implementar' : 'acciones de negocio sin implementar'}. Revise las advertencias de la corrida.`,
          );
        }
        const theme = await this.frozenTheme(projectId, run.designBaselineId);
        const demo =
          template.version >= 2 && this.demoData
            ? await this.demoData.propose(
                projectId,
                run.designBaselineId,
                runId,
                run.project.name,
                plan,
              )
            : {};
        if (demo.warning) warnings.push(demo.warning);
        let files = generateProject(
          {
            plan,
            template,
            projectName: run.project.name,
            slug: projectSlug(run.project.name),
            theme,
            demoValues: demo.values,
          },
          implementations,
        );
        files.push(...checkpoints, ...(demo.checkpoint ? [demo.checkpoint] : []));
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
        if (scope) {
          const present = new Set(files.map((file) => file.path));
          const language = await getProjectLanguage(this.prisma, projectId);
          files.push(
            ...deferredPages(fullPlan, scope.modules, language).filter(
              (file) => !present.has(file.path),
            ),
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

  // ADR-020: the run's files grouped by construction unit, without contents,
  // with the changes against the previous run of the same plan and the
  // review marks that still match each unit's content.
  async units(projectId: string, runId: string): Promise<{ items: ConstructionUnit[] }> {
    const run = await this.prisma.generationRun.findFirst({
      where: { id: runId, projectId },
      select: { implementationPlanVersionId: true, deliveryId: true, createdAt: true },
    });
    if (!run) throw new NotFoundException('Corrida de generación no encontrada.');
    const plan = await planForRun(this.prisma, projectId, run);
    const unitsOf = async (id: string) => {
      const files = await this.prisma.generatedFile.findMany({
        where: { generationRunId: id },
        select: {
          id: true,
          path: true,
          origin: true,
          kind: true,
          sha256: true,
          traceLinks: {
            select: {
              planElement: true,
              sourceArtifactVersion: {
                select: { versionNumber: true, artifact: { select: { code: true } } },
              },
            },
          },
        },
        orderBy: { path: 'asc' },
      });
      return constructionUnits(
        plan,
        files.map(({ traceLinks, ...file }) => ({
          ...file,
          planElements: [...new Set(traceLinks.map((link) => link.planElement))],
          traces: traceLinks
            .filter((link) => link.sourceArtifactVersion.artifact.code)
            .map((link) => ({
              code: link.sourceArtifactVersion.artifact.code!,
              versionNumber: link.sourceArtifactVersion.versionNumber,
            })),
        })),
      );
    };
    const items = await unitsOf(runId);
    const design = screenDesigns(
      (
        await this.prisma.generatedFile.findFirst({
          where: { generationRunId: runId, path: 'docs/design-fidelity.json' },
          select: { content: true },
        })
      )?.content,
    );
    const previous = await this.prisma.generationRun.findFirst({
      where: {
        projectId,
        implementationPlanVersionId: run.implementationPlanVersionId,
        status: { in: ['GENERATED', 'WORKING_COPY'] },
        createdAt: { lt: run.createdAt },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const before = previous
      ? new Map((await unitsOf(previous.id)).map((unit) => [unit.id, unit]))
      : undefined;
    const reviews = await this.prisma.constructionUnitReview.findMany({
      where: { projectId, contentSha256: { in: items.map((unit) => unit.contentSha256) } },
      select: {
        unitKey: true,
        contentSha256: true,
        createdAt: true,
        reviewedBy: { select: { displayName: true } },
      },
    });
    return {
      items: items.map((unit) => {
        const review = reviews.find(
          (item) => item.unitKey === unit.id && item.contentSha256 === unit.contentSha256,
        );
        const old = before?.get(unit.id);
        const oldFiles = new Map(old?.files.map((file) => [file.path, file.sha256]) ?? []);
        const files = unit.files.map((file) => ({
          ...file,
          ...(before
            ? {
                change: !oldFiles.has(file.path)
                  ? ('ADDED' as const)
                  : oldFiles.get(file.path) === file.sha256
                    ? ('UNCHANGED' as const)
                    : ('CHANGED' as const),
              }
            : {}),
        }));
        return {
          ...unit,
          ...(design.has(unit.id) ? { design: design.get(unit.id) } : {}),
          files,
          // Evidence files are process records, not code to compare.
          changes:
            before && unit.id !== 'evidence'
              ? {
                  previousRunId: previous!.id,
                  added: files.filter((file) => file.change === 'ADDED').length,
                  changed: files.filter((file) => file.change === 'CHANGED').length,
                  removed: (old?.files ?? [])
                    .map((file) => file.path)
                    .filter((path) => !unit.files.some((file) => file.path === path)),
                }
              : null,
          review: review
            ? {
                reviewedAt: review.createdAt.toISOString(),
                reviewerName: review.reviewedBy.displayName,
              }
            : null,
        };
      }),
    };
  }

  // Marks or unmarks a unit's current content as reviewed. A mark never
  // changes READY or validation; it only records the person's review.
  async reviewUnit(
    projectId: string,
    runId: string,
    userId: string,
    input: ConstructionUnitReviewRequest,
  ) {
    await assertCanGenerate(this.prisma, projectId, userId);
    const unit = (await this.units(projectId, runId)).items.find(
      (item) => item.id === input.unitKey,
    );
    if (!unit || unit.contentSha256 !== input.contentSha256)
      throw new ConflictException(
        'La unidad cambió o no pertenece a esta corrida. Actualice la vista.',
      );
    const where = { projectId, unitKey: input.unitKey, contentSha256: input.contentSha256 };
    await this.prisma.$transaction(async (tx) => {
      if (input.reviewed)
        await tx.constructionUnitReview.upsert({
          where: { projectId_unitKey_contentSha256: where },
          update: {},
          create: { ...where, reviewedByUserId: userId },
        });
      else await tx.constructionUnitReview.deleteMany({ where });
      await this.audit.record(
        {
          projectId,
          actorUserId: userId,
          action: input.reviewed
            ? 'CONSTRUCTION_UNIT_REVIEWED'
            : 'CONSTRUCTION_UNIT_REVIEW_WITHDRAWN',
          entityType: 'GENERATION_RUN',
          entityId: runId,
          metadata: { unitKey: input.unitKey, contentSha256: input.contentSha256 },
        },
        tx,
      );
    });
    return (await this.units(projectId, runId)).items.find((item) => item.id === input.unitKey)!;
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

  // ADR-024: the plan a run builds. A delivery is built from its scoped plan,
  // only on approved earlier deliveries, none of them affected.
  private async buildablePlan(projectId: string, versionId: string, deliveryId?: string) {
    const full = await this.approvedPlan(projectId, versionId);
    if (!deliveryId) return { plan: full };
    const scope = await deliveryScope(this.prisma, projectId, deliveryId);
    if (scope.implementationPlanVersionId !== versionId)
      throw new UnprocessableEntityException('La entrega pertenece a otro plan de implementación.');
    if (!this.deliveries)
      throw new ServiceUnavailableException('La construcción por entregas no está disponible.');
    await this.deliveries.assertCanBuild(projectId, versionId, deliveryId);
    return { plan: scopePlan(full, scope.modules) };
  }

  // A delivery's view of a plan version, for the preview and the estimate.
  private async deliveryView(
    projectId: string,
    versionId: string,
    plan: ImplementationPlanContent,
    deliveryId?: string,
  ) {
    if (!deliveryId) return plan;
    const scope = await deliveryScope(this.prisma, projectId, deliveryId);
    if (scope.implementationPlanVersionId !== versionId)
      throw new UnprocessableEntityException('La entrega pertenece a otro plan de implementación.');
    return scopePlan(plan, scope.modules);
  }

  private approvedPlan(projectId: string, versionId: string) {
    return loadApprovedPlan(this.prisma, projectId, versionId);
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
      deliveryId: row.deliveryId,
      designBaselineId: row.designBaselineId,
      targetTemplateIdentifier: row.targetTemplateIdentifier,
      targetTemplateVersion: row.targetTemplateVersion,
      status: row.status,
      origin: row.origin,
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
