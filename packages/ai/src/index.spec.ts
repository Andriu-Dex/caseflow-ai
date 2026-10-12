import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  AIError,
  AIOrchestrator,
  DisabledAIProvider,
  FakeAIProvider,
  FallbackAIProvider,
  PromptRegistry,
  msUntilMidnight,
  scaledTimeoutMs,
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
    maxOutputTokens: 4096,
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
    expect(provider.lastRequest?.maxOutputTokens).toBe(4096);
    expect(audit.start).toHaveBeenCalledWith(
      expect.objectContaining({
        inputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        sourceArtifactVersionId: 'version-1',
      }),
    );
    expect(audit.succeed).toHaveBeenCalledOnce();
  });

  it('adds the project language to provider instructions without changing the registered prompt', async () => {
    const provider = new FakeAIProvider(response);
    const audit = recorder();
    const orchestrator = new AIOrchestrator(provider, new PromptRegistry([prompt]), audit);

    await orchestrator.generateStructured(input());
    expect(provider.lastRequest?.systemInstructions).toBe(prompt.systemInstructions);

    await orchestrator.generateStructured({ ...input(), language: 'EN' });
    expect(provider.lastRequest?.systemInstructions).toContain('English');
    expect(provider.lastRequest?.systemInstructions).toContain(prompt.systemInstructions);
    expect(prompt.systemInstructions).toBe('Return only valid structured data.');
    expect(audit.start.mock.calls[0]?.[0].inputHash).not.toBe(
      audit.start.mock.calls[1]?.[0].inputHash,
    );
  });

  it('sends every property as required (nullable when originally optional) for strict json_schema providers', async () => {
    const provider = new FakeAIProvider(response);
    const audit = recorder();
    await new AIOrchestrator(provider, new PromptRegistry([prompt]), audit).generateStructured({
      ...input(),
      outputSchema: z.object({ value: z.string(), extra: z.string().optional() }),
    });
    const sent = provider.lastRequest?.outputSchema as {
      required: string[];
      properties: Record<string, { type: unknown }>;
    };
    expect(sent.required.sort()).toEqual(['extra', 'value']);
    expect(sent.properties.extra?.type).toEqual(['string', 'null']);
    expect(sent.properties.value?.type).toBe('string');
  });

  it('treats an explicit null from a strict provider as an absent optional field', async () => {
    const audit = recorder();
    const result = await new AIOrchestrator(
      new FakeAIProvider({ ...response, payload: { value: 'ok', extra: null } }),
      new PromptRegistry([prompt]),
      audit,
    ).generateStructured({
      ...input(),
      outputSchema: z.object({ value: z.string(), extra: z.string().optional() }),
    });
    expect(result.data).toEqual({ value: 'ok' });
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

  it.each([0, -1, Number.NaN, 1.5, 1_000_001])(
    'rejects invalid output token budget %s before provider execution',
    async (maxOutputTokens) => {
      const provider = new FakeAIProvider(response);
      const audit = recorder();
      await expect(
        new AIOrchestrator(provider, new PromptRegistry([prompt]), audit).generateStructured({
          ...input(),
          maxOutputTokens,
        }),
      ).rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR' });
      expect(provider.lastRequest).toBeUndefined();
      expect(audit.start).not.toHaveBeenCalled();
    },
  );

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

const providerRequest = {
  capability: 'STRUCTURED_OUTPUT' as const,
  purpose: 'foundation_probe',
  systemInstructions: prompt.systemInstructions,
  messages: [{ role: 'user' as const, content: 'UNTRUSTED PROJECT CONTENT' }],
  outputSchema: { type: 'object' },
  schemaName: 'probe',
  modelProfile: 'BALANCED' as const,
  timeoutMs: 1_000,
};

describe('FallbackAIProvider', () => {
  it('rejects an empty chain', () => {
    expect(() => new FallbackAIProvider([])).toThrow();
  });

  it('returns the first provider that succeeds', async () => {
    const groq = new FakeAIProvider(new AIError('AI_RATE_LIMITED', 'groq exhausted'));
    const gemini = new FakeAIProvider(response);
    const result = await new FallbackAIProvider([groq, gemini]).generateStructured(providerRequest);
    expect(result).toEqual(response);
  });

  it('throws the last error when every provider in the chain fails', async () => {
    const groq = new FakeAIProvider(new AIError('AI_RATE_LIMITED', 'groq exhausted'));
    const gemini = new FakeAIProvider(new AIError('AI_PROVIDER_UNAVAILABLE', 'gemini down'));
    await expect(
      new FallbackAIProvider([groq, gemini]).generateStructured(providerRequest),
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_UNAVAILABLE' });
  });

  it('reports the actually-serving provider through AIOrchestrator, not "fallback"', async () => {
    const groq = new FakeAIProvider(new AIError('AI_TIMEOUT', 'groq timed out'));
    const gemini = new FakeAIProvider(response);
    const audit = recorder();
    const result = await new AIOrchestrator(
      new FallbackAIProvider([groq, gemini]),
      new PromptRegistry([prompt]),
      audit,
    ).generateStructured(input());
    expect(result.metadata.provider).toBe('fake');
    expect(audit.succeed).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ provider: 'fake' }),
    );
  });
});

describe('FallbackAIProvider routing by capacity (DEC-127)', () => {
  // A provider answering with the given results in order.
  const scripted = (id: string, ...results: (AIError | 'ok')[]) => {
    const generateStructured = vi.fn(async () => {
      const next = results.shift() ?? 'ok';
      if (next instanceof AIError) throw next;
      return { ...response, provider: id };
    });
    return { id, generateStructured };
  };
  const sized = (tokens: number) => ({
    ...providerRequest,
    messages: [{ role: 'user' as const, content: 'x'.repeat(tokens * 3) }],
  });
  const clock = () => {
    let now = Date.UTC(2026, 9, 12, 15, 0, 0);
    return {
      now: () => now,
      sleep: vi.fn(async (ms: number) => {
        now += ms;
      }),
      advance: (ms: number) => (now += ms),
    };
  };

  it('sends a large request straight to the provider it fits in', async () => {
    const groq = scripted('groq');
    const gemini = scripted('gemini');
    const router = new FallbackAIProvider([
      { provider: groq, capacity: { tokensPerMinute: 8_000 } },
      { provider: gemini, capacity: { maxInputTokens: 1_048_576 } },
    ]);
    await expect(router.generateStructured(sized(12_000))).resolves.toMatchObject({
      provider: 'gemini',
    });
    expect(groq.generateStructured).not.toHaveBeenCalled();
    await expect(router.generateStructured(sized(1_000))).resolves.toMatchObject({
      provider: 'groq',
    });
    expect(router.maxInputTokens).toBe(1_048_576);
  });

  it('asks the caller to split work no provider can take', async () => {
    const router = new FallbackAIProvider([
      { provider: scripted('groq'), capacity: { tokensPerMinute: 8_000 } },
    ]);
    await expect(router.generateStructured(sized(9_000))).rejects.toMatchObject({
      code: 'AI_INPUT_TOO_LARGE',
    });
  });

  it('stops asking a provider whose daily quota is spent until it resets', async () => {
    const time = clock();
    const gemini = scripted(
      'gemini',
      new AIError('AI_RATE_LIMITED', 'day', { quota: 'DAY', retryAfterMs: 41_000 }),
    );
    const groq = scripted('groq');
    const router = new FallbackAIProvider(
      [
        {
          provider: gemini,
          capacity: { maxInputTokens: 1_048_576, dayResetTimeZone: 'America/Los_Angeles' },
        },
        { provider: groq, capacity: { tokensPerMinute: 8_000 } },
      ],
      time,
    );
    await expect(router.generateStructured(sized(100))).resolves.toMatchObject({
      provider: 'groq',
    });
    // Its own "retry in 41 s" is ignored: the quota is spent for the day.
    time.advance(60_000);
    await router.generateStructured(sized(100));
    expect(gemini.generateStructured).toHaveBeenCalledOnce();
    expect(router.maxInputTokens).toBe(8_000);
    await expect(router.generateStructured(sized(20_000))).rejects.toMatchObject({
      code: 'AI_RATE_LIMITED',
    });
    // 15:00 UTC is 08:00 in Los Angeles: free again at its midnight.
    time.advance(16 * 3_600_000);
    await expect(router.generateStructured(sized(20_000))).resolves.toMatchObject({
      provider: 'gemini',
    });
  });

  it('waits out a per-minute limit when no other provider fits', async () => {
    const time = clock();
    const groq = scripted(
      'groq',
      new AIError('AI_RATE_LIMITED', 'minute', { quota: 'MINUTE', retryAfterMs: 7_660 }),
    );
    const router = new FallbackAIProvider(
      [{ provider: groq, capacity: { tokensPerMinute: 8_000 } }],
      time,
    );
    await expect(router.generateStructured(sized(5_000))).resolves.toMatchObject({
      provider: 'groq',
    });
    expect(time.sleep).toHaveBeenCalledWith(7_660);
  });

  it('learns from a provider that rejects a request as too large', async () => {
    const groq = scripted('groq', new AIError('AI_INPUT_TOO_LARGE', 'too large'));
    const gemini = scripted('gemini');
    const router = new FallbackAIProvider([groq, gemini]);
    await router.generateStructured(sized(6_000));
    await router.generateStructured(sized(6_000));
    expect(groq.generateStructured).toHaveBeenCalledOnce();
    expect(gemini.generateStructured).toHaveBeenCalledTimes(2);
  });

  it('gives a large request more time', async () => {
    const provider = new FakeAIProvider(response);
    await new AIOrchestrator(provider, new PromptRegistry([prompt]), recorder()).generateStructured(
      { ...input(), messages: [{ role: 'user', content: 'x'.repeat(90_000) }] },
    );
    expect(provider.lastRequest?.timeoutMs).toBe(120_000);
    expect(scaledTimeoutMs(30_000, 1_000_000)).toBe(180_000);
  });

  it('counts the time left until midnight in a time zone', () =>
    expect(msUntilMidnight('America/Los_Angeles', new Date(Date.UTC(2026, 9, 12, 15, 0, 0)))).toBe(
      16 * 3_600_000,
    ));
});

describe('FallbackAIProvider status (DEC-127)', () => {
  it('reports what each provider takes and when a spent quota comes back', async () => {
    let now = Date.UTC(2026, 9, 12, 15, 0, 0);
    const gemini = new FakeAIProvider(
      new AIError('AI_RATE_LIMITED', 'day', { quota: 'DAY', retryAfterMs: 1_000 }),
    );
    const groq = new FakeAIProvider(response);
    const router = new FallbackAIProvider(
      [
        { provider: groq, capacity: { tokensPerMinute: 8_000 } },
        {
          provider: gemini,
          capacity: { maxInputTokens: 1_048_576, dayResetTimeZone: 'America/Los_Angeles' },
        },
      ],
      { now: () => now },
    );
    expect(router.status()).toEqual([
      { id: 'fake', maxInputTokens: 8_000 },
      { id: 'fake', maxInputTokens: 1_048_576 },
    ]);
    await router
      .generateStructured({
        ...providerRequest,
        messages: [{ role: 'user', content: 'x'.repeat(30_000) }],
      })
      .catch(() => undefined);
    expect(router.status()[1]).toEqual({
      id: 'fake',
      maxInputTokens: 1_048_576,
      unavailableUntil: '2026-10-13T07:00:00.000Z',
      quota: 'DAY',
    });
    now += 17 * 3_600_000;
    expect(router.status()[1]).not.toHaveProperty('unavailableUntil');
  });
});
