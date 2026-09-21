import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  AIError,
  AIOrchestrator,
  DisabledAIProvider,
  FakeAIProvider,
  PromptRegistry,
  type AIRunRecorder,
} from './index';

const prompt = {
  key: 'foundation.probe',
  version: 1,
  capability: 'STRUCTURED_OUTPUT' as const,
  purpose: 'foundation_probe',
  systemInstructions: 'Return only valid structured data.',
};
const response = {
  provider: 'fake',
  model: 'fake-v1',
  payload: { value: 'ok' },
  usage: null,
  latencyMs: 4,
};
function recorder(): AIRunRecorder & {
  start: ReturnType<typeof vi.fn>;
  succeed: ReturnType<typeof vi.fn>;
  fail: ReturnType<typeof vi.fn>;
} {
  return {
    start: vi.fn().mockResolvedValue('run-1'),
    succeed: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
  };
}
function input() {
  return {
    projectId: 'project-1',
    sourceArtifactVersionId: 'version-1',
    promptKey: prompt.key,
    promptVersion: 1,
    messages: [{ role: 'user' as const, content: 'UNTRUSTED PROJECT CONTENT' }],
    outputSchema: z.object({ value: z.string() }),
    schemaName: 'probe',
  };
}

describe('AIOrchestrator', () => {
  it('validates structured candidates and preserves audit/provenance metadata', async () => {
    const provider = new FakeAIProvider(response);
    const audit = recorder();
    const result = await new AIOrchestrator(
      provider,
      new PromptRegistry([prompt]),
      audit,
    ).generateStructured(input());
    expect(result.data).toEqual({ value: 'ok' });
    expect(result.metadata).toMatchObject({
      promptKey: prompt.key,
      promptVersion: 1,
      provider: 'fake',
      model: 'fake-v1',
      projectId: 'project-1',
      sourceArtifactVersionId: 'version-1',
    });
    expect(provider.lastRequest?.systemInstructions).toBe(prompt.systemInstructions);
    expect(provider.lastRequest?.messages).toEqual(input().messages);
    expect(audit.start).toHaveBeenCalledWith(
      expect.objectContaining({
        inputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        sourceArtifactVersionId: 'version-1',
      }),
    );
    expect(audit.succeed).toHaveBeenCalledOnce();
  });

  it('rejects schema-invalid output and records a normalized failure', async () => {
    const audit = recorder();
    const operation = new AIOrchestrator(
      new FakeAIProvider({ ...response, payload: { value: 3 } }),
      new PromptRegistry([prompt]),
      audit,
    ).generateStructured(input());
    await expect(operation).rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' });
    expect(audit.fail).toHaveBeenCalledWith('run-1', 'AI_INVALID_OUTPUT', expect.any(Number));
  });

  it.each(['AI_PROVIDER_UNAVAILABLE', 'AI_TIMEOUT', 'AI_RATE_LIMITED'] as const)(
    'preserves normalized %s errors',
    async (code) => {
      const audit = recorder();
      await expect(
        new AIOrchestrator(
          new FakeAIProvider(new AIError(code, 'safe')),
          new PromptRegistry([prompt]),
          audit,
        ).generateStructured(input()),
      ).rejects.toMatchObject({ code });
      expect(audit.fail).toHaveBeenCalledWith('run-1', code, expect.any(Number));
    },
  );

  it('handles disabled mode without requiring configuration', async () => {
    const audit = recorder();
    await expect(
      new AIOrchestrator(
        new DisabledAIProvider(),
        new PromptRegistry([prompt]),
        audit,
      ).generateStructured(input()),
    ).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' });
  });

  it('serializes only a safe normalized error', () => {
    expect(
      JSON.stringify(new AIError('AI_PROVIDER_ERROR', 'safe', { cause: new Error('secret-key') })),
    ).toBe('{"code":"AI_PROVIDER_ERROR","message":"safe"}');
  });
});
