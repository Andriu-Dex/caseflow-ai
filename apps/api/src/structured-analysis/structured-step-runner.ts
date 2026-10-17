import type { AIOrchestrator } from '@caseflow-ai/ai';
import type { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../database/prisma.service';

// Progress and checkpoints of a batched run (DEC-142).
export interface StructuredGenerationProgress {
  jobId: string;
  update: (completedBatches: number, totalBatches: number, outputChars: number) => void;
}

export interface StepRequest<S extends z.ZodType> {
  promptKey: string;
  promptVersion: number;
  payload: unknown;
  schema: S;
  schemaName: string;
  maxOutputTokens: number;
}

// One AI answer of a batched generation, as a unit that can be resumed: its
// validated output is saved under its own part number, so a run that failed
// continues from the last answer that was good instead of starting again.
// The caller says what "good" means in `apply`, which runs before anything is
// saved and refuses the answer by throwing.
export function createStepRunner(deps: {
  prisma: PrismaService;
  ai: AIOrchestrator;
  projectId: string;
  language: 'ES' | 'EN';
  progress?: StructuredGenerationProgress;
}) {
  let lastRunId = '';
  return {
    get lastRunId() {
      return lastRunId;
    },
    async run<S extends z.ZodType>(
      part: number,
      request: StepRequest<S>,
      apply: (output: z.infer<S>) => void,
    ): Promise<void> {
      const { prisma, ai, projectId, language, progress } = deps;
      const cached = progress
        ? await prisma.structuredGenerationPart.findUnique({
            where: { jobId_position: { jobId: progress.jobId, position: part } },
          })
        : null;
      let output: z.infer<S>;
      if (cached) {
        output = request.schema.parse(cached.content) as z.infer<S>;
        lastRunId = cached.aiRunId;
      } else {
        const result = await ai.generateStructured({
          projectId,
          language,
          promptKey: request.promptKey,
          promptVersion: request.promptVersion,
          messages: [{ role: 'user', content: JSON.stringify(request.payload) }],
          outputSchema: request.schema,
          schemaName: request.schemaName,
          maxOutputTokens: request.maxOutputTokens,
        });
        output = result.data as z.infer<S>;
        lastRunId = result.metadata.runId;
      }
      apply(output);
      if (progress && !cached)
        await prisma.structuredGenerationPart.upsert({
          where: { jobId_position: { jobId: progress.jobId, position: part } },
          create: {
            jobId: progress.jobId,
            position: part,
            aiRunId: lastRunId,
            content: output as Prisma.InputJsonValue,
          },
          update: { aiRunId: lastRunId, content: output as Prisma.InputJsonValue },
        });
    },
  };
}
