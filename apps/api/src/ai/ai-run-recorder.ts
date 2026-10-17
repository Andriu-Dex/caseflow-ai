import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type {
  AIErrorCode,
  AIRunCompletion,
  AIRunRecorder,
  AIRunStart,
  AIFailureDiagnostics,
} from '@caseflow-ai/ai';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class PrismaAIRunRecorder implements AIRunRecorder, OnApplicationBootstrap {
  private readonly logger = new Logger(PrismaAIRunRecorder.name);
  constructor(private readonly prisma: PrismaService) {}

  // The API process runs every AI call, so a run still marked as running when
  // it starts was cut off by a restart or a crash and will never finish. It is
  // closed as failed instead of being left "running" for good.
  async onApplicationBootstrap(): Promise<void> {
    try {
      const closed = await this.prisma.aIRun.updateMany({
        where: { status: 'RUNNING' },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorCode: 'AI_PROVIDER_ERROR',
          errorDetails: { reason: 'interrupted_by_restart' },
        },
      });
      if (closed.count) this.logger.warn(`Closed ${closed.count} interrupted AI run(s).`);
    } catch {
      this.logger.warn('Could not close interrupted AI runs.');
    }
  }

  async start(input: AIRunStart): Promise<string> {
    const run = await this.prisma.aIRun.create({
      data: {
        projectId: input.projectId,
        sourceArtifactVersionId: input.sourceArtifactVersionId,
        provider: input.provider,
        model: input.model,
        capability: input.capability,
        purpose: input.purpose,
        promptKey: input.promptKey,
        promptVersion: input.promptVersion,
        status: 'RUNNING',
        inputHash: input.inputHash,
      },
    });
    return run.id;
  }

  async succeed(id: string, completion: AIRunCompletion): Promise<void> {
    await this.prisma.aIRun.update({
      where: { id },
      data: {
        provider: completion.provider,
        model: completion.model,
        status: 'SUCCEEDED',
        completedAt: new Date(),
        latencyMs: completion.latencyMs,
        inputTokens: completion.usage?.inputTokens,
        outputTokens: completion.usage?.outputTokens,
        totalTokens: completion.usage?.totalTokens,
        outputHash: completion.outputHash,
        errorCode: null,
      },
    });
  }

  async fail(
    id: string,
    errorCode: AIErrorCode,
    latencyMs: number,
    diagnostics?: AIFailureDiagnostics,
  ): Promise<void> {
    await this.prisma.aIRun.update({
      where: { id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        latencyMs,
        errorCode,
        ...(diagnostics
          ? {
              model: diagnostics.model,
              errorDetails: {
                reason: diagnostics.reason,
                outputChars: diagnostics.outputChars,
                usage: diagnostics.usage ? { ...diagnostics.usage } : null,
              },
            }
          : {}),
      },
    });
  }
}
