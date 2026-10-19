import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { useCaseGenerationJobSchema } from '@caseflow-ai/contracts';
import { AuditService } from '../audit/audit.service';
import {
  CANCELLED_MESSAGE,
  GenerationCancelledError,
  assertCanGenerate,
} from '../common/generation-cancelled';
import { INTERRUPTED_BY_RESTART } from '../common/interrupted';
import { PrismaService } from '../database/prisma.service';
import { UseCasesService } from './use-cases.service';

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

// DEC-139: use cases are generated in the background, a few requirements per
// batch, with a checkpoint per batch (same boundary as DEC-132 for context and
// requirements). One job at a time per project.
@Injectable()
export class UseCaseGenerationJobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UseCaseGenerationJobsService.name);
  private readonly running = new Map<string, Promise<void>>();
  // Jobs the person cancelled whose run has not stopped yet.
  private readonly cancelled = new Set<string>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly useCases: UseCasesService,
    private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.prisma.useCaseGenerationJob.updateMany({
        where: { status: { in: ['QUEUED', 'RUNNING'] } },
        data: { status: 'FAILED', errorMessage: INTERRUPTED_BY_RESTART },
      });
    } catch {
      this.logger.warn('Could not close interrupted use case generations.');
    }
  }

  async start(projectId: string, requirementVersionIds: string[], userId: string) {
    const member = await this.prisma.projectMembership.findFirst({
      where: {
        projectId,
        userId,
        role: { in: ['OWNER', 'EDITOR', 'REVIEWER'] },
        project: { workspace: { memberships: { some: { userId } } } },
      },
    });
    if (!member)
      throw new ForbiddenException('No tiene permisos para generar casos de uso en este proyecto.');
    await this.useCases.checkGenerationSources(projectId, requirementVersionIds);
    const job = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id=${projectId}::uuid FOR NO KEY UPDATE`;
      const active = await tx.useCaseGenerationJob.findFirst({
        where: { projectId, status: { in: ['QUEUED', 'RUNNING'] } },
        include: { sources: true },
      });
      if (active) {
        if (
          !sameSet(
            active.sources.map((s) => s.requirementVersionId),
            requirementVersionIds,
          )
        )
          throw new ConflictException(
            'Hay una generación de casos de uso en curso con otra selección. Espere a que termine antes de generar de nuevo.',
          );
        return active;
      }
      const previous = await tx.useCaseGenerationJob.findFirst({
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
          previous.sources.map((s) => s.requirementVersionId),
          requirementVersionIds,
        )
          ? previous
          : null;
      // The result and the job's result pointer commit together; recover that
      // result after a restart instead of generating it again.
      const row = resumable
        ? await tx.useCaseGenerationJob.update({
            where: { id: resumable.id },
            data: {
              status: resumable.generationId ? 'COMPLETED' : 'QUEUED',
              errorMessage: null,
              outputChars: 0,
            },
            include: { sources: true },
          })
        : await tx.useCaseGenerationJob.create({
            data: {
              projectId,
              sources: {
                create: requirementVersionIds.map((requirementVersionId, position) => ({
                  requirementVersionId,
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
          action: 'USE_CASE_GENERATION_STARTED',
          entityType: 'USE_CASE_GENERATION_JOB',
          entityId: row.id,
          metadata: { requirements: requirementVersionIds.length, resumed: !!resumable },
        },
        tx,
      );
      return row;
    });
    if (job.status === 'QUEUED' && !this.running.has(job.id)) {
      const task = this.run(job.id, projectId, requirementVersionIds, userId)
        .catch(() => this.logger.warn('Could not execute a queued use case generation job.'))
        .finally(() => {
          this.running.delete(job.id);
          this.cancelled.delete(job.id);
        });
      this.running.set(job.id, task);
    }
    return this.present(job);
  }

  async latest(projectId: string) {
    const job = await this.prisma.useCaseGenerationJob.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: { sources: true },
    });
    return { job: job ? this.present(job) : null };
  }

  async get(projectId: string, jobId: string) {
    const job = await this.prisma.useCaseGenerationJob.findFirst({
      where: { id: jobId, projectId },
      include: { sources: true },
    });
    if (!job) throw new NotFoundException('Trabajo no encontrado.');
    return this.present(job);
  }

  private present(job: {
    createdAt: Date;
    updatedAt: Date;
    sources: { requirementVersionId: string; position: number }[];
  }) {
    return useCaseGenerationJobSchema.parse({
      ...job,
      requirementVersionIds: [...job.sources]
        .sort((a, b) => a.position - b.position)
        .map((source) => source.requirementVersionId),
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    });
  }

  // The person stops the run. What the finished batches saved is kept, so the
  // same generation can be resumed. The run stops at its next batch: a call
  // already made to the AI finishes first.
  async cancel(projectId: string, jobId: string, userId: string) {
    await assertCanGenerate(this.prisma, projectId, userId);
    const { count } = await this.prisma.useCaseGenerationJob.updateMany({
      where: { id: jobId, projectId, status: { in: ['QUEUED', 'RUNNING'] } },
      data: { status: 'CANCELLED', errorMessage: CANCELLED_MESSAGE },
    });
    if (count) {
      this.cancelled.add(jobId);
      await this.audit.record({
        projectId,
        actorUserId: userId,
        action: 'USE_CASE_GENERATION_FINISHED',
        entityType: 'USE_CASE_GENERATION_JOB',
        entityId: jobId,
        metadata: { status: 'CANCELLED' },
      });
    }
    return this.get(projectId, jobId);
  }

  private async run(
    jobId: string,
    projectId: string,
    requirementVersionIds: string[],
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
        this.prisma.useCaseGenerationJob.updateMany({
          where: { id: jobId, projectId, status: 'RUNNING' },
          data: { completedBatches, totalBatches, outputChars },
        }),
      );
    };
    try {
      await this.prisma.useCaseGenerationJob.update({
        where: { id: jobId },
        data: { status: 'RUNNING' },
      });
      const generation = await this.useCases.generateInBatches(projectId, requirementVersionIds, {
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
            : 'No se pudieron completar los casos de uso. Puede reanudar la generación o crearlos manualmente.';
      await this.finish(jobId, projectId, userId, 'FAILED', message.slice(0, 1000)).catch(() =>
        this.logger.warn('Could not finish a use case generation job.'),
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
      await tx.useCaseGenerationJob.update({
        where: { id: jobId },
        data: { status, errorMessage, generationId },
      });
      await this.audit.record(
        {
          projectId,
          actorUserId: userId,
          action: 'USE_CASE_GENERATION_FINISHED',
          entityType: 'USE_CASE_GENERATION_JOB',
          entityId: jobId,
          metadata: { status },
        },
        tx,
      );
    });
  }
}
