import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import {
  BATCHED_STRUCTURED_KINDS,
  structuredGenerationJobSchema,
  type StructuredAnalysisKind,
} from '@caseflow-ai/contracts';
import { AuditService } from '../audit/audit.service';
import { INTERRUPTED_BY_RESTART } from '../common/interrupted';
import { PrismaService } from '../database/prisma.service';
import { StructuredAnalysisService } from './structured-analysis.service';

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

// DEC-142: a structured design artifact generated in batches in the
// background, with a checkpoint per batch (same boundary as DEC-132 and
// DEC-139). One job at a time per project and kind.
@Injectable()
export class StructuredGenerationJobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StructuredGenerationJobsService.name);
  private readonly running = new Map<string, Promise<void>>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly structured: StructuredAnalysisService,
    private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.prisma.structuredGenerationJob.updateMany({
        where: { status: { in: ['QUEUED', 'RUNNING'] } },
        data: { status: 'FAILED', errorMessage: INTERRUPTED_BY_RESTART },
      });
    } catch {
      this.logger.warn('Could not close interrupted structured generations.');
    }
  }

  async start(
    projectId: string,
    kind: StructuredAnalysisKind,
    sourceVersionIds: string[],
    userId: string,
    designBaselineId?: string,
  ) {
    if (!(BATCHED_STRUCTURED_KINDS as readonly string[]).includes(kind))
      throw new BadRequestException('Este tipo de artefacto no se genera por lotes.');
    const member = await this.prisma.projectMembership.findFirst({
      where: {
        projectId,
        userId,
        role: { in: ['OWNER', 'EDITOR', 'REVIEWER'] },
        project: { workspace: { memberships: { some: { userId } } } },
      },
    });
    if (!member) throw new ForbiddenException('No tiene permisos para generar en este proyecto.');
    await this.structured.checkBatchedSources(projectId, kind, sourceVersionIds, designBaselineId);
    const job = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id=${projectId}::uuid FOR NO KEY UPDATE`;
      const active = await tx.structuredGenerationJob.findFirst({
        where: { projectId, kind, status: { in: ['QUEUED', 'RUNNING'] } },
        include: { sources: true },
      });
      if (active) {
        if (
          !sameSet(
            active.sources.map((s) => s.artifactVersionId),
            sourceVersionIds,
          ) ||
          (active.designBaselineId ?? null) !== (designBaselineId ?? null)
        )
          throw new ConflictException(
            'Hay una generación en curso con otra selección. Espere a que termine antes de generar de nuevo.',
          );
        return active;
      }
      const previous = await tx.structuredGenerationJob.findFirst({
        where: { projectId, kind, status: 'FAILED' },
        orderBy: { createdAt: 'desc' },
        include: { sources: true },
      });
      const resumable =
        previous &&
        (previous.designBaselineId ?? null) === (designBaselineId ?? null) &&
        sameSet(
          previous.sources.map((s) => s.artifactVersionId),
          sourceVersionIds,
        )
          ? previous
          : null;
      // The result and the job's result pointer commit together; recover that
      // result after a restart instead of generating it again.
      const row = resumable
        ? await tx.structuredGenerationJob.update({
            where: { id: resumable.id },
            data: {
              status: resumable.generationId ? 'COMPLETED' : 'QUEUED',
              errorMessage: null,
              outputChars: 0,
            },
            include: { sources: true },
          })
        : await tx.structuredGenerationJob.create({
            data: {
              projectId,
              kind,
              designBaselineId,
              sources: {
                create: sourceVersionIds.map((artifactVersionId, position) => ({
                  artifactVersionId,
                  position,
                })),
              },
            },
            include: { sources: true },
          });
      await this.audit.record(
        {
          projectId,
          actorUserId: userId,
          action: 'STRUCTURED_GENERATION_STARTED',
          entityType: 'STRUCTURED_GENERATION_JOB',
          entityId: row.id,
          metadata: { kind, sources: sourceVersionIds.length, resumed: !!resumable },
        },
        tx,
      );
      return row;
    });
    if (job.status === 'QUEUED' && !this.running.has(job.id)) {
      const task = this.run(job.id, projectId, kind, sourceVersionIds, userId, designBaselineId)
        .catch(() => this.logger.warn('Could not execute a queued structured generation job.'))
        .finally(() => this.running.delete(job.id));
      this.running.set(job.id, task);
    }
    return this.present(job);
  }

  // An implementation plan is drawn from what a design baseline froze.
  async startFromBaseline(
    projectId: string,
    kind: StructuredAnalysisKind,
    designBaselineId: string,
    userId: string,
  ) {
    const sourceVersionIds = await this.structured.designBaselineSources(
      projectId,
      kind,
      designBaselineId,
    );
    if (!sourceVersionIds.length)
      throw new BadRequestException('La línea base de diseño no tiene fuentes para este tipo.');
    return this.start(projectId, kind, sourceVersionIds, userId, designBaselineId);
  }

  async latest(projectId: string, kind: StructuredAnalysisKind) {
    const job = await this.prisma.structuredGenerationJob.findFirst({
      where: { projectId, kind },
      orderBy: { createdAt: 'desc' },
      include: { sources: true },
    });
    return { job: job ? this.present(job) : null };
  }

  async get(projectId: string, kind: StructuredAnalysisKind, jobId: string) {
    const job = await this.prisma.structuredGenerationJob.findFirst({
      where: { id: jobId, projectId, kind },
      include: { sources: true },
    });
    if (!job) throw new NotFoundException('Trabajo no encontrado.');
    return this.present(job);
  }

  private present(job: {
    kind: StructuredAnalysisKind;
    createdAt: Date;
    updatedAt: Date;
    sources: { artifactVersionId: string; position: number }[];
  }) {
    return structuredGenerationJobSchema.parse({
      ...job,
      sourceVersionIds: [...job.sources]
        .sort((a, b) => a.position - b.position)
        .map((source) => source.artifactVersionId),
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    });
  }

  private async run(
    jobId: string,
    projectId: string,
    kind: StructuredAnalysisKind,
    sourceVersionIds: string[],
    userId: string,
    designBaselineId?: string,
  ) {
    let pending: Promise<unknown> = Promise.resolve();
    let lastWrite = 0;
    let lastBatch = -1;
    const update = (completedBatches: number, totalBatches: number, outputChars: number) => {
      if (completedBatches === lastBatch && Date.now() - lastWrite < 1500) return;
      lastBatch = completedBatches;
      lastWrite = Date.now();
      pending = pending.then(() =>
        this.prisma.structuredGenerationJob.updateMany({
          where: { id: jobId, projectId, status: 'RUNNING' },
          data: { completedBatches, totalBatches, outputChars },
        }),
      );
    };
    try {
      await this.prisma.structuredGenerationJob.update({
        where: { id: jobId },
        data: { status: 'RUNNING' },
      });
      const generation = await this.structured.generateInBatches(
        projectId,
        kind,
        sourceVersionIds,
        { jobId, update },
        designBaselineId,
      );
      await pending;
      await this.finish(jobId, projectId, userId, 'COMPLETED', null, generation.id);
    } catch (error) {
      await pending.catch(() => undefined);
      const body = error instanceof HttpException ? error.getResponse() : null;
      const message =
        body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
          ? body.message
          : error instanceof HttpException
            ? error.message
            : 'No se pudo completar la generación. Puede reanudarla o crear el artefacto manualmente.';
      await this.finish(jobId, projectId, userId, 'FAILED', message.slice(0, 1000)).catch(() =>
        this.logger.warn('Could not finish a structured generation job.'),
      );
    }
  }

  private async finish(
    jobId: string,
    projectId: string,
    userId: string,
    status: 'COMPLETED' | 'FAILED',
    errorMessage: string | null,
    generationId?: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.structuredGenerationJob.update({
        where: { id: jobId },
        data: { status, errorMessage, generationId },
      });
      await this.audit.record(
        {
          projectId,
          actorUserId: userId,
          action: 'STRUCTURED_GENERATION_FINISHED',
          entityType: 'STRUCTURED_GENERATION_JOB',
          entityId: jobId,
          metadata: { status },
        },
        tx,
      );
    });
  }
}
