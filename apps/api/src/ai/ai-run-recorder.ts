import { Injectable } from '@nestjs/common';
import type { AIErrorCode, AIRunCompletion, AIRunRecorder, AIRunStart } from '@caseflow-ai/ai';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class PrismaAIRunRecorder implements AIRunRecorder {
  constructor(private readonly prisma: PrismaService) {}

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

  async fail(id: string, errorCode: AIErrorCode, latencyMs: number): Promise<void> {
    await this.prisma.aIRun.update({
      where: { id },
      data: { status: 'FAILED', completedAt: new Date(), latencyMs, errorCode },
    });
  }
}
