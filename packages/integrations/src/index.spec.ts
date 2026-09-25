import { describe, expect, it, vi } from 'vitest';
import { OpenAICompatibleProvider } from './index';

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

  it.each([
    [429, 'AI_RATE_LIMITED'],
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
});
