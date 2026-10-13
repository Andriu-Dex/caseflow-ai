import { describe, expect, it, vi } from 'vitest';
import { OpenAICompatibleProvider, rateLimitDetails } from './index';

const request = {
  capability: 'STRUCTURED_OUTPUT' as const,
  purpose: 'probe',
  systemInstructions: 'SYSTEM',
  messages: [{ role: 'user' as const, content: 'UNTRUSTED' }],
  outputSchema: { type: 'object' },
  schemaName: 'probe',
  modelProfile: 'BALANCED' as const,
  maxOutputTokens: 4096,
  timeoutMs: 100,
};
function provider(fetchMock: typeof fetch) {
  return new OpenAICompatibleProvider({
    baseUrl: 'https://provider.test/v1/',
    apiKey: 'top-secret',
    model: 'configured-model',
    timeoutMs: 100,
    fetch: fetchMock,
  });
}

describe('OpenAICompatibleProvider', () => {
  it('defaults its id but accepts an override to identify the underlying provider', () => {
    expect(provider(vi.fn()).id).toBe('openai_compatible');
    expect(
      new OpenAICompatibleProvider({
        id: 'groq',
        baseUrl: 'https://provider.test/v1/',
        apiKey: 'top-secret',
        model: 'configured-model',
        timeoutMs: 100,
      }).id,
    ).toBe('groq');
  });

  it('uses configured URL/model/auth and keeps system and user roles separate', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'configured-model',
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const result = await provider(fetchMock).generateStructured(request);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(url).toBe('https://provider.test/v1/chat/completions');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer top-secret' });
    expect(body).toMatchObject({
      model: 'configured-model',
      messages: [
        { role: 'system', content: 'SYSTEM' },
        { role: 'user', content: 'UNTRUSTED' },
      ],
      max_tokens: 4096,
    });
    expect(result).toMatchObject({ payload: { ok: true }, usage: { totalTokens: 3 } });
  });

  it('writes up to its declared output ceiling (DEC-131)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'configured-model',
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await new OpenAICompatibleProvider({
      baseUrl: 'https://provider.test/v1/',
      apiKey: 'top-secret',
      model: 'configured-model',
      timeoutMs: 100,
      maxOutputTokens: 32_000,
      fetch: fetchMock,
    }).generateStructured(request);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).max_tokens).toBe(32_000);
  });

  it.each([
    [429, 'AI_RATE_LIMITED'],
    // One request above the tokens per minute: only a smaller one can pass.
    [413, 'AI_INPUT_TOO_LARGE'],
    [503, 'AI_PROVIDER_UNAVAILABLE'],
    [400, 'AI_PROVIDER_ERROR'],
  ])('normalizes HTTP %s', async (status, code) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('top-secret provider detail', { status }));
    const operation = provider(fetchMock).generateStructured(request);
    await expect(operation).rejects.toMatchObject({ code });
    await expect(operation).rejects.not.toThrow(/top-secret/);
  });

  it('rejects malformed and truncated provider output without leaking diagnostics', async () => {
    const malformed = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ model: 'm', choices: [] }), { status: 200 }),
      );
    await expect(provider(malformed).generateStructured(request)).rejects.toMatchObject({
      code: 'AI_PROVIDER_ERROR',
    });
    const invalid = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'm',
          choices: [{ message: { content: '{"ok":"top-secret' } }],
        }),
        { status: 200 },
      ),
    );
    const operation = provider(invalid).generateStructured(request);
    await expect(operation).rejects.toMatchObject({
      code: 'AI_INVALID_OUTPUT',
    });
    await expect(operation).rejects.not.toThrow(/top-secret/);
  });

  it('strips only the schema keywords a narrow-dialect provider rejects, keeping a "title" property', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'configured-model',
          choices: [{ message: { content: '{"ok":true}' } }],
        }),
        { status: 200 },
      ),
    );
    const narrowProvider = new OpenAICompatibleProvider({
      baseUrl: 'https://provider.test/v1/',
      apiKey: 'top-secret',
      model: 'configured-model',
      timeoutMs: 100,
      schemaDialect: 'narrow',
      fetch: fetchMock,
    });
    await narrowProvider.generateStructured({
      ...request,
      outputSchema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          items: { type: 'array', minItems: 1, maxItems: 5 },
          kind: { const: 'ER' },
        },
      },
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const schema = JSON.parse(String(init.body)).response_format.json_schema.schema;
    expect(schema).toEqual({
      type: 'object',
      properties: {
        title: { type: 'string' },
        items: { type: 'array' },
        kind: { enum: ['ER'] },
      },
    });
  });

  it('normalizes timeout without retries', async () => {
    const fetchMock = vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          ),
        ),
    ) as unknown as typeof fetch;
    await expect(
      provider(fetchMock).generateStructured({ ...request, timeoutMs: 1 }),
    ).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('says so when the answer was cut at its output limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'm',
          choices: [{ finish_reason: 'length', message: { content: '{"nodes": [{"id": "a"' } }],
        }),
      ),
    );
    await expect(provider(fetchMock).generateStructured(request)).rejects.toMatchObject({
      code: 'AI_INVALID_OUTPUT',
      message: expect.stringContaining('se cortó'),
    });
  });

  it('tells how long to wait and whether the daily quota is spent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('Rate limit reached on tokens per day (TPD)', {
        status: 429,
        headers: { 'retry-after': '7.5' },
      }),
    );
    await expect(provider(fetchMock).generateStructured(request)).rejects.toMatchObject({
      code: 'AI_RATE_LIMITED',
      quota: 'DAY',
      retryAfterMs: 7500,
    });
  });
});

describe('rateLimitDetails', () => {
  it.each([
    [
      null,
      'Rate limit reached for tokens per minute (TPM). Please try again in 7.66s.',
      { retryAfterMs: 7660, quota: 'MINUTE' },
    ],
    ['2', 'tokens per minute', { retryAfterMs: 2000, quota: 'MINUTE' }],
    [
      null,
      'Quota exceeded for metric: generate_content_free_tier_requests, quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier. Please retry in 41.2s.',
      { retryAfterMs: 41200, quota: 'DAY' },
    ],
    [null, 'Please try again in 850ms', { retryAfterMs: 850, quota: 'MINUTE' }],
    [null, 'Too many requests', { quota: 'MINUTE' }],
  ])('reads retry-after %s with body %s', (header, body, expected) =>
    expect(rateLimitDetails(header, body)).toEqual(expected),
  );
});
