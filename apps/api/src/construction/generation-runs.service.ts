import { createHash } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  CONSTRUCTION_QUEUE,
  findTargetTemplate,
  type ConstructionJobPayload,
} from '@caseflow-ai/domain';
import {
  implementationPlanContentSchema,
  type GeneratedFileResponse,
  type GeneratedFileSummary,
  type GenerationRunResponse,
} from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PlanGenerationError } from '../code-generation/naming';
import { generateProject, projectSlug } from '../code-generation/engine/project-generator';
import { planTraceLinks } from '../code-generation/engine/trace-links';
import { BusinessLogicService } from './business-logic.service';
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
  ) {}

  async start(
    projectId: string,
    userId: string,
    implementationPlanVersionId: string,
  ): Promise<GenerationRunResponse> {
    const plan = await this.approvedPlan(projectId, implementationPlanVersionId);
    await this.designBaselines.assertApproved(projectId, plan.designBaselineId);
    const template = findTargetTemplate(TEMPLATE_IDENTIFIER)!;
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

  // Invoked by the worker's authenticated internal callback. Always leaves the
  // run in a terminal status, so polling never hangs.
  async runJob(projectId: string, runId: string): Promise<void> {
    const { count } = await this.prisma.generationRun.updateMany({
      where: { id: runId, projectId, status: 'QUEUED' },
      data: { status: 'GENERATING', startedAt: new Date() },
    });
    if (!count) return; // Already picked up (e.g. a retried job): nothing to do.
    const run = await this.prisma.generationRun.findUniqueOrThrow({
      where: { id: runId },
      include: { project: { select: { name: true } } },
    });
    try {
      const plan = await this.approvedPlan(projectId, run.implementationPlanVersionId);
      const template = findTargetTemplate(run.targetTemplateIdentifier, run.targetTemplateVersion);
      if (!template)
        throw new PlanGenerationError('La plantilla de la corrida ya no está soportada.');
      const { implementations, warnings } = await this.businessLogic.implement(
        projectId,
        runId,
        plan,
        template,
      );
      const files = generateProject(
        { plan, template, projectName: run.project.name, slug: projectSlug(run.project.name) },
        implementations,
      );
      const frozen = await this.frozenVersionsByCode(projectId, run.designBaselineId);
      const links = planTraceLinks(files, plan, run.implementationPlanVersionId, frozen);
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.generatedFile.createManyAndReturn({
          data: files.map((f) => ({
            generationRunId: runId,
            path: f.path,
            content: f.content,
            sha256: createHash('sha256').update(f.content).digest('hex'),
            origin: f.origin,
            kind: f.kind,
          })),
          select: { id: true, path: true },
        });
        const idByPath = new Map(created.map((f) => [f.path, f.id]));
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
  }

  async list(projectId: string): Promise<{ items: GenerationRunResponse[] }> {
    const rows = await this.prisma.generationRun.findMany({
      where: { projectId },
      include: { _count: { select: { files: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map((row) => this.map(row)) };
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
    };
  }
}
