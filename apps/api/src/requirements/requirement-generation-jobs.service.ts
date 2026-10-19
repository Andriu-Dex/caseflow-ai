import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  UnprocessableEntityException,
} from '@nestjs/common';
import { requirementGenerationJobSchema } from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import { RequirementsService } from './requirements.service';
import { sourceStatuses } from '../projects/source-statuses';
import { AuditService } from '../audit/audit.service';
import {
  CANCELLED_MESSAGE,
  GenerationCancelledError,
  assertCanGenerate,
} from '../common/generation-cancelled';
import { INTERRUPTED_BY_RESTART } from '../common/interrupted';
import { z } from 'zod';

@Injectable()
export class RequirementGenerationJobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RequirementGenerationJobsService.name);
  private readonly running = new Map<string, Promise<void>>();
  // Jobs the person cancelled whose run has not stopped yet.
  private readonly cancelled = new Set<string>();
  private readonly concurrency = z.coerce
    .number()
    .int()
    .min(1)
    .max(4)
    .parse(process.env.REQUIREMENT_GENERATION_CONCURRENCY ?? 1);
  private active = 0;
  private readonly waiting: Array<() => void> = [];
  constructor(
    private readonly prisma: PrismaService,
    private readonly requirements: RequirementsService,
    private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.prisma.requirementGenerationJob.updateMany({
        where: { status: { in: ['QUEUED', 'RUNNING'] } },
        data: { status: 'FAILED', errorMessage: INTERRUPTED_BY_RESTART },
      });
    } catch {
      this.logger.warn('Could not close interrupted requirement generations.');
    }
  }

  async start(projectId: string, sourceContextVersionId: string, userId: string) {
    const member = await this.prisma.projectMembership.findFirst({
      where: {
        projectId,
        userId,
        role: { in: ['OWNER', 'EDITOR', 'REVIEWER'] },
        project: { workspace: { memberships: { some: { userId } } } },
      },
    });
    if (!member)
      throw new ForbiddenException('No tiene permisos para generar requisitos en este proyecto.');
    const statuses = await sourceStatuses(this.prisma, projectId);
    const context = await this.prisma.artifactVersion.findFirst({
      where: {
        id: sourceContextVersionId,
        projectId,
        status: { in: statuses },
        artifact: { artifactTypeCode: 'PROJECT_CONTEXT', archivedAt: null },
      },
      include: { projectContextDetail: { include: { sources: true } } },
    });
    if (!context?.projectContextDetail?.sources.length)
      throw new UnprocessableEntityException(
        'La generación requiere un contexto aprobado con fuentes del mismo proyecto.',
      );
    const job = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id=${projectId}::uuid FOR NO KEY UPDATE`;
      const active = await tx.requirementGenerationJob.findFirst({
        where: { projectId, status: { in: ['QUEUED', 'RUNNING'] } },
      });
      if (active) {
        if (active.sourceContextVersionId !== sourceContextVersionId)
          throw new ConflictException(
            'Hay una generación en curso de otro contexto. Espere a que termine antes de generar de nuevo.',
          );
        return active;
      }
      const previous = await tx.requirementGenerationJob.findFirst({
        where: { projectId, sourceContextVersionId, status: { in: ['FAILED', 'CANCELLED'] } },
        orderBy: { createdAt: 'desc' },
      });
      // The run of a cancelled job stops at its next batch: resuming it before
      // then would leave the job queued with nothing to run it.
      if (previous && this.running.has(previous.id))
        throw new ConflictException(
          'La cancelación anterior aún se está completando. Espere unos segundos y reanude.',
        );
      // The result and the job's result pointer commit together; recover that result after a restart.
      const row = previous
        ? await tx.requirementGenerationJob.update({
            where: { id: previous.id },
            data: {
              status: previous.generationId ? 'COMPLETED' : 'QUEUED',
              errorMessage: null,
              outputChars: 0,
            },
          })
        : await tx.requirementGenerationJob.create({ data: { projectId, sourceContextVersionId } });
      await this.audit.record(
        {
          projectId,
          actorUserId: userId,
          action: 'REQUIREMENT_GENERATION_STARTED',
          entityType: 'REQUIREMENT_GENERATION_JOB',
          entityId: row.id,
          metadata: { sourceContextVersionId, resumed: !!previous },
        },
        tx,
      );
      return row;
    });
    if (job.status === 'QUEUED' && !this.running.has(job.id)) {
      const task = this.runQueued(job.id, projectId, sourceContextVersionId, userId)
        .catch(() => this.logger.warn('Could not execute a queued requirement generation job.'))
        .finally(() => {
          this.running.delete(job.id);
          this.cancelled.delete(job.id);
        });
      this.running.set(job.id, task);
    }
    return requirementGenerationJobSchema.parse({
      ...job,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    });
  }
  private async runQueued(
    jobId: string,
    projectId: string,
    sourceContextVersionId: string,
    userId: string,
  ) {
    if (this.active >= this.concurrency)
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    else this.active++;
    try {
      if (
        await this.prisma.requirementGenerationJob.findFirst({
          where: { id: jobId, projectId, status: 'QUEUED' },
        })
      )
        await this.run(jobId, projectId, sourceContextVersionId, userId);
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }

  async latest(projectId: string) {
    const job = await this.prisma.requirementGenerationJob.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    return {
      job: job
        ? requirementGenerationJobSchema.parse({
            ...job,
            createdAt: job.createdAt.toISOString(),
            updatedAt: job.updatedAt.toISOString(),
          })
        : null,
    };
  }

  async get(projectId: string, jobId: string) {
    const job = await this.prisma.requirementGenerationJob.findFirst({
      where: { id: jobId, projectId },
    });
    if (!job) throw new NotFoundException('Trabajo no encontrado.');
    return requirementGenerationJobSchema.parse({
      ...job,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    });
  }

  // The person stops the run. What the finished batches saved is kept, so the
  // same generation can be resumed. The run stops at its next batch: a call
  // already made to the AI finishes first.
  async cancel(projectId: string, jobId: string, userId: string) {
    await assertCanGenerate(this.prisma, projectId, userId);
    const { count } = await this.prisma.requirementGenerationJob.updateMany({
      where: { id: jobId, projectId, status: { in: ['QUEUED', 'RUNNING'] } },
      data: { status: 'CANCELLED', errorMessage: CANCELLED_MESSAGE },
    });
    if (count) {
      this.cancelled.add(jobId);
      await this.audit.record({
        projectId,
        actorUserId: userId,
        action: 'REQUIREMENT_GENERATION_FINISHED',
        entityType: 'REQUIREMENT_GENERATION_JOB',
        entityId: jobId,
        metadata: { status: 'CANCELLED' },
      });
    }
    return this.get(projectId, jobId);
  }

  // Same local-process execution boundary as context jobs (DEC-132); checkpoints survive restart.
  private async run(
    jobId: string,
    projectId: string,
    sourceContextVersionId: string,
    userId: string,
  ) {
    let pending: Promise<unknown> = Promise.resolve();
    let lastWrite = 0;
    let lastBatch = -1;
    const update = (completedBatches: number, totalBatches: number, outputChars: number) => {
      if (this.cancelled.has(jobId)) throw new GenerationCancelledError();
      if (completedBatches === lastBatch && Date.now() - lastWrite < 1500) return;
      lastBatch = completedBatches;
      lastWrite = Date.now();
      pending = pending.then(() =>
        this.prisma.requirementGenerationJob.updateMany({
          where: { id: jobId, projectId, status: 'RUNNING' },
          data: { completedBatches, totalBatches, outputChars },
        }),
      );
    };
    try {
      // Claimed atomically: a job cancelled while queued must not start.
      const claimed = await this.prisma.requirementGenerationJob.updateMany({
        where: { id: jobId, projectId, status: 'QUEUED' },
        data: { status: 'RUNNING' },
      });
      if (!claimed.count) return;
      const generation = await this.requirements.generate(projectId, sourceContextVersionId, {
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
            : 'No se pudieron completar los requisitos. Puede reanudar la generación o crearlos manualmente.';
      await this.finish(jobId, projectId, userId, 'FAILED', message.slice(0, 1000)).catch(() =>
        this.logger.warn('Could not finish a requirement generation job.'),
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
      await tx.requirementGenerationJob.update({
        where: { id: jobId },
        data: { status, errorMessage, generationId },
      });
      await this.audit.record(
        {
          projectId,
          actorUserId: userId,
          action: 'REQUIREMENT_GENERATION_FINISHED',
          entityType: 'REQUIREMENT_GENERATION_JOB',
          entityId: jobId,
          metadata: { status },
        },
        tx,
      );
    });
  }
}
