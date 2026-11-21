import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createStepRunner } from './structured-step-runner';

describe('structured step runner', () => {
  const schema = z.object({ value: z.string() });
  const request = {
    promptKey: 'implementation-plan.entities',
    promptVersion: 3,
    payload: {},
    schema,
    schemaName: 'test',
    maxOutputTokens: 100,
  };
  const setup = (savedWith: { promptKey: string; promptVersion: number }) => {
    const ai = {
      generateStructured: vi.fn().mockResolvedValue({
        data: { value: 'new' },
        metadata: { runId: 'run-new' },
      }),
    };
    const parts = {
      find: vi.fn().mockResolvedValue({ content: { value: 'saved' }, aiRunId: 'run-old' }),
      save: vi.fn(),
    };
    const prisma = { aIRun: { findUnique: vi.fn().mockResolvedValue(savedWith) } };
    const runner = createStepRunner({
      prisma: prisma as never,
      ai: ai as never,
      projectId: 'p',
      language: 'ES',
      progress: { jobId: 'job', update: vi.fn() },
      parts,
    });
    return { runner, ai };
  };

  it('resumes from a saved answer of the same prompt version', async () => {
    const { runner, ai } = setup({ promptKey: request.promptKey, promptVersion: 3 });
    const seen: string[] = [];
    await runner.run(1, request, (output) => seen.push(output.value));
    expect(seen).toEqual(['saved']);
    expect(ai.generateStructured).not.toHaveBeenCalled();
  });

  it('asks again when the saved answer came from an older prompt', async () => {
    const { runner, ai } = setup({ promptKey: request.promptKey, promptVersion: 2 });
    const seen: string[] = [];
    await runner.run(1, request, (output) => seen.push(output.value));
    expect(seen).toEqual(['new']);
    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
  });
});
