import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { dataModelGenerationJobSchema } from '@caseflow-ai/contracts';
import { AuditService } from '../audit/audit.service';
import {
  CANCELLED_MESSAGE,
  GenerationCancelledError,
  assertCanGenerate,
} from '../common/generation-cancelled';
import { INTERRUPTED_BY_RESTART } from '../common/interrupted';
import { PrismaService } from '../database/prisma.service';
import { DataModelsService } from './data-models.service';

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

// DEC-144: the data model is generated in the background (discovery, then a few
// entities per batch), with a checkpoint per answer (same boundary as DEC-139).
// One job at a time per project.
@Injectable()
export class DataModelGenerationJobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DataModelGenerationJobsService.name);
  private readonly running = new Map<string, Promise<void>>();
  // Jobs the person cancelled whose run has not stopped yet.
  private readonly cancelled = new Set<string>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataModels: DataModelsService,
    private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.prisma.dataModelGenerationJob.updateMany({
        where: { status: { in: ['QUEUED', 'RUNNING'] } },
        data: { status: 'FAILED', errorMessage: INTERRUPTED_BY_RESTART },
      });
    } catch {
      this.logger.warn('Could not close interrupted data model generations.');
    }
  }

  async start(projectId: string, sourceVersionIds: string[], userId: string) {
    const member = await this.prisma.projectMembership.findFirst({
      where: {
        projectId,
        userId,
        role: { in: ['OWNER', 'EDITOR', 'REVIEWER'] },
        project: { workspace: { memberships: { some: { userId } } } },
      },
    });
    if (!member)
      throw new ForbiddenException('No tiene permisos para generar el modelo en este proyecto.');
    await this.dataModels.checkBatchedSources(projectId, sourceVersionIds);
    const job = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id=${projectId}::uuid FOR NO KEY UPDATE`;
      const active = await tx.dataModelGenerationJob.findFirst({
        where: { projectId, status: { in: ['QUEUED', 'RUNNING'] } },
        include: { sources: true },
      });
      if (active) {
        if (
          !sameSet(
            active.sources.map((s) => s.artifactVersionId),
            sourceVersionIds,
          )
        )
          throw new ConflictException(
            'Hay una generación del modelo de datos en curso con otra selección. Espere a que termine antes de generar de nuevo.',
          );
        return active;
      }
      const previous = await tx.dataModelGenerationJob.findFirst({
        where: { projectId, status: { in: ['FAILED', 'CANCELLED'] } },
        orderBy: { createdAt: 'desc' },
        include: { sources: true },
      });
      // The run of a cancelled job stops at its next batch: resuming it before
      // then would leave the job queued with nothing to run it.
      if (previous && this.running.has(previous.id))
        throw new ConflictException(
          'La cancelación anterior aún se está completando. Espere unos segundos y reanude.',
        );
      const resumable =
        previous &&
        sameSet(
          previous.sources.map((s) => s.artifactVersionId),
          sourceVersionIds,
        )
          ? previous
          : null;
      // The result and the job's result pointer commit together; recover that
      // result after a restart instead of generating it again.
      const row = resumable
        ? await tx.dataModelGenerationJob.update({
            where: { id: resumable.id },
            data: {
              status: resumable.generationId ? 'COMPLETED' : 'QUEUED',
              errorMessage: null,
              outputChars: 0,
            },
            include: { sources: true },
          })
        : await tx.dataModelGenerationJob.create({
            data: {
              projectId,
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
          action: 'DATA_MODEL_GENERATION_STARTED',
          entityType: 'DATA_MODEL_GENERATION_JOB',
          entityId: row.id,
          metadata: { sources: sourceVersionIds.length, resumed: !!resumable },
        },
        tx,
      );
      return row;
    });
    if (job.status === 'QUEUED' && !this.running.has(job.id)) {
      const task = this.run(job.id, projectId, sourceVersionIds, userId)
        .catch(() => this.logger.warn('Could not execute a queued data model generation job.'))
        .finally(() => {
          this.running.delete(job.id);
          this.cancelled.delete(job.id);
        });
      this.running.set(job.id, task);
    }
    return this.present(job);
  }

  async latest(projectId: string) {
    const job = await this.prisma.dataModelGenerationJob.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: { sources: true },
    });
    return { job: job ? this.present(job) : null };
  }

  async get(projectId: string, jobId: string) {
    const job = await this.prisma.dataModelGenerationJob.findFirst({
      where: { id: jobId, projectId },
      include: { sources: true },
    });
    if (!job) throw new NotFoundException('Trabajo no encontrado.');
    return this.present(job);
  }

  private present(job: {
    createdAt: Date;
    updatedAt: Date;
    sources: { artifactVersionId: string; position: number }[];
  }) {
    return dataModelGenerationJobSchema.parse({
      ...job,
      sourceVersionIds: [...job.sources]
        .sort((a, b) => a.position - b.position)
        .map((source) => source.artifactVersionId),
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    });
  }

  // The person stops the run. What the finished batches saved is kept, so the
  // same generation can be resumed. The run stops at its next batch: a call
  // already made to the AI finishes first.
  async cancel(projectId: string, jobId: string, userId: string) {
    await assertCanGenerate(this.prisma, projectId, userId);
    const { count } = await this.prisma.dataModelGenerationJob.updateMany({
      where: { id: jobId, projectId, status: { in: ['QUEUED', 'RUNNING'] } },
      data: { status: 'CANCELLED', errorMessage: CANCELLED_MESSAGE },
    });
    if (count) {
      this.cancelled.add(jobId);
      await this.audit.record({
        projectId,
        actorUserId: userId,
        action: 'DATA_MODEL_GENERATION_FINISHED',
        entityType: 'DATA_MODEL_GENERATION_JOB',
        entityId: jobId,
        metadata: { status: 'CANCELLED' },
      });
    }
    return this.get(projectId, jobId);
  }

  private async run(jobId: string, projectId: string, sourceVersionIds: string[], userId: string) {
    let pending: Promise<unknown> = Promise.resolve();
    let lastWrite = 0;
    let lastBatch = -1;
    const update = (completedBatches: number, totalBatches: number, outputChars: number) => {
      if (this.cancelled.has(jobId)) throw new GenerationCancelledError();
      if (completedBatches === lastBatch && Date.now() - lastWrite < 1500) return;
      lastBatch = completedBatches;
      lastWrite = Date.now();
      pending = pending.then(() =>
        this.prisma.dataModelGenerationJob.updateMany({
          where: { id: jobId, projectId, status: 'RUNNING' },
          data: { completedBatches, totalBatches, outputChars },
        }),
      );
    };
    try {
      // Claimed atomically: a job cancelled while queued must not start.
      const claimed = await this.prisma.dataModelGenerationJob.updateMany({
        where: { id: jobId, projectId, status: 'QUEUED' },
        data: { status: 'RUNNING' },
      });
      if (!claimed.count) return;
      const generation = await this.dataModels.generateInBatches(projectId, sourceVersionIds, {
        jobId,
        update,
      });
      await pending;
      await this.finish(jobId, projectId, userId, 'COMPLETED', null, generation.id);
    } catch (error) {
      if (error instanceof GenerationCancelledError) return;
      await pending.catch(() => undefined);
      const body = error instanceof HttpException ? error.getResponse() : null;
      const message =
        body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
          ? body.message
          : error instanceof HttpException
            ? error.message
            : 'No se pudo completar el modelo de datos. Puede reanudar la generación o crearlo manualmente.';
      await this.finish(jobId, projectId, userId, 'FAILED', message.slice(0, 1000)).catch(() =>
        this.logger.warn('Could not finish a data model generation job.'),
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
      await tx.dataModelGenerationJob.update({
        where: { id: jobId },
        data: { status, errorMessage, generationId },
      });
      await this.audit.record(
        {
          projectId,
          actorUserId: userId,
          action: 'DATA_MODEL_GENERATION_FINISHED',
          entityType: 'DATA_MODEL_GENERATION_JOB',
          entityId: jobId,
          metadata: { status },
        },
        tx,
      );
    });
  }
}
