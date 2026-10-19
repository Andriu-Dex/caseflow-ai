import type { AIOrchestrator } from '@caseflow-ai/ai';
import type { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../database/prisma.service';

// Progress and checkpoints of a batched run (DEC-142).
export interface StructuredGenerationProgress {
  jobId: string;
  update: (completedBatches: number, totalBatches: number, outputChars: number) => void;
}

// Where the validated answers of a job are kept. Each kind of job has its own
// table; the structured design artifacts share one.
export interface PartsStore {
  find: (jobId: string, position: number) => Promise<{ content: unknown; aiRunId: string } | null>;
  save: (jobId: string, position: number, aiRunId: string, content: unknown) => Promise<void>;
}

export const structuredPartsStore = (prisma: PrismaService): PartsStore => ({
  find: (jobId, position) =>
    prisma.structuredGenerationPart.findUnique({
      where: { jobId_position: { jobId, position } },
    }),
  save: async (jobId, position, aiRunId, content) => {
    await prisma.structuredGenerationPart.upsert({
      where: { jobId_position: { jobId, position } },
      create: { jobId, position, aiRunId, content: content as Prisma.InputJsonValue },
      update: { aiRunId, content: content as Prisma.InputJsonValue },
    });
  },
});

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
  parts?: PartsStore;
}) {
  const parts = deps.parts ?? structuredPartsStore(deps.prisma);
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
      const { ai, projectId, language, progress } = deps;
      const cached = progress ? await parts.find(progress.jobId, part) : null;
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
      if (progress && !cached) await parts.save(progress.jobId, part, lastRunId, output);
    },
  };
}
