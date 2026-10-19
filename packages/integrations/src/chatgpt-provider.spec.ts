import { describe, expect, it, vi } from 'vitest';
import type { AIProviderRequest } from '@caseflow-ai/ai';
import {
  CHATGPT_MESSAGES,
  ChatGPTProvider,
  HttpChatGPTBroker,
  type ChatGPTBroker,
} from './chatgpt-provider';

const request: AIProviderRequest = {
  capability: 'STRUCTURED_OUTPUT',
  purpose: 'navigation_generation',
  systemInstructions: 'Política',
  messages: [{ role: 'user', content: '{"sources":[]}' }],
  outputSchema: { type: 'object' },
  schemaName: 'navigation_tree_generation',
  modelProfile: 'BALANCED',
  maxOutputTokens: 4096,
  timeoutMs: 30_000,
};

const sse = (...events: object[]) =>
  new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });

function setup(response: Response) {
  const broker: ChatGPTBroker & Record<string, ReturnType<typeof vi.fn>> = {
    accessToken: vi.fn().mockResolvedValue('token-de-acceso'),
    reportUsageLimit: vi.fn().mockResolvedValue(undefined),
    reportRevoked: vi.fn().mockResolvedValue(undefined),
  };
  const fetchMock = vi.fn().mockResolvedValue(response);
  const provider = new ChatGPTProvider({
    model: 'gpt-x',
    timeoutMs: 60_000,
    broker,
    fetch: fetchMock as unknown as typeof fetch,
  });
  return { provider, broker, fetchMock };
}

// DEC-117: contract of the ChatGPT plan provider, with simulated responses
// (a real account is evaluated outside CI, AGENTS.md §44).
describe('ChatGPTProvider', () => {
  it('sends a streamed, unstored structured request and assembles the JSON', async () => {
    const { provider, fetchMock } = setup(
      sse(
        { type: 'response.output_text.delta', delta: '{"nodes":' },
        { type: 'response.output_text.delta', delta: '[]}' },
        {
          type: 'response.completed',
          response: { usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 } },
        },
      ),
    );
    const result = await provider.generateStructured(request);
    expect(result).toMatchObject({
      provider: 'chatgpt',
      model: 'gpt-x',
      payload: { nodes: [] },
      usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init.headers.authorization).toBe('Bearer token-de-acceso');
    expect(JSON.parse(init.body)).toEqual({
      model: 'gpt-x',
      instructions: 'Política',
      input: [{ role: 'user', content: '{"sources":[]}' }],
      text: {
        format: {
          type: 'json_schema',
          name: 'navigation_tree_generation',
          strict: true,
          schema: { type: 'object' },
        },
      },
      max_output_tokens: 4096,
      store: false,
      stream: true,
    });
  });

  it('writes up to the plan model ceiling and waits as long as that answer takes (DEC-131)', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) =>
            init.signal!.addEventListener('abort', () => reject(new Error('aborted'))),
          ),
      );
      const provider = new ChatGPTProvider({
        model: 'gpt-x',
        timeoutMs: 300_000,
        maxOutputTokens: 64_000,
        broker: {
          accessToken: vi.fn().mockResolvedValue('token'),
          reportUsageLimit: vi.fn(),
          reportRevoked: vi.fn(),
        },
        fetch: fetchMock as unknown as typeof fetch,
      });
      const outcome = provider.generateStructured(request).catch((error: Error) => error);
      await vi.advanceTimersByTimeAsync(0);
      expect(JSON.parse(String(fetchMock.mock.calls[0]![1].body)).max_output_tokens).toBe(64_000);
      // Neither the request's 30 s nor the configured 5 minutes cut it: 64 000
      // tokens at 20 per second take 3 200 s.
      await vi.advanceTimersByTimeAsync(301_000);
      expect(fetchMock.mock.calls[0]![1].signal!.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(2_900_000);
      expect(fetchMock.mock.calls[0]![1].signal!.aborted).toBe(true);
      await outcome;
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports how much of the answer has arrived while it streams (DEC-132)', async () => {
    const { provider } = setup(
      sse(
        { type: 'response.output_text.delta', delta: '{"nodes":' },
        { type: 'response.output_text.delta', delta: '[]}' },
        { type: 'response.completed', response: {} },
      ),
    );
    const onProgress = vi.fn();
    await provider.generateStructured({ ...request, onProgress });
    expect(onProgress.mock.calls).toEqual([[9], [12]]);
  });

  it('pauses the plan on its usage limit and never retries elsewhere', async () => {
    const { provider, broker } = setup(
      new Response(
        JSON.stringify({ error: { code: 'subscription_sharing_usage_limit_exceeded' } }),
        {
          status: 429,
        },
      ),
    );
    await expect(provider.generateStructured(request)).rejects.toMatchObject({
      code: 'AI_RATE_LIMITED',
      message: CHATGPT_MESSAGES.usageLimit,
    });
    expect(broker.reportUsageLimit).toHaveBeenCalledOnce();
    expect(broker.reportRevoked).not.toHaveBeenCalled();
  });

  it('explains ineligibility without pausing or retrying', async () => {
    const { provider, broker } = setup(
      new Response(JSON.stringify({ error: { code: 'subscription_sharing_user_not_eligible' } }), {
        status: 403,
      }),
    );
    await expect(provider.generateStructured(request)).rejects.toMatchObject({
      code: 'AI_NOT_CONFIGURED',
      message: CHATGPT_MESSAGES.notEligible,
    });
    expect(broker.reportUsageLimit).not.toHaveBeenCalled();
  });

  it('forgets revoked credentials and asks to reconnect', async () => {
    const { provider, broker } = setup(
      new Response(JSON.stringify({ error: { code: 'invalid_token' } }), { status: 401 }),
    );
    await expect(provider.generateStructured(request)).rejects.toMatchObject({
      message: CHATGPT_MESSAGES.reconnect,
    });
    expect(broker.reportRevoked).toHaveBeenCalledOnce();
  });

  it('rejects a stream that never completes', async () => {
    const { provider } = setup(sse({ type: 'response.output_text.delta', delta: '{"nodes"' }));
    await expect(provider.generateStructured(request)).rejects.toMatchObject({
      code: 'AI_INVALID_OUTPUT',
      diagnostics: { reason: 'stream_ended', model: 'gpt-x', outputChars: 8 },
    });
  });
  it('records the incomplete reason and counters without accepting partial JSON', async () => {
    const { provider } = setup(
      sse(
        { type: 'response.output_text.delta', delta: '{"nodes":' },
        {
          type: 'response.incomplete',
          response: {
            incomplete_details: { reason: 'max_output_tokens' },
            usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300 },
          },
        },
      ),
    );
    await expect(provider.generateStructured(request)).rejects.toMatchObject({
      code: 'AI_INVALID_OUTPUT',
      diagnostics: {
        reason: 'max_output_tokens',
        model: 'gpt-x',
        outputChars: 9,
        usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      },
    });
  });
  it('does not persist arbitrary provider text in failure diagnostics', async () => {
    const { provider } = setup(
      sse({
        type: 'response.incomplete',
        response: {
          incomplete_details: { reason: 'private-secret' },
          usage: { input_tokens: 'private-secret', output_tokens: -1, total_tokens: 3 },
        },
      }),
    );
    const error = await provider.generateStructured(request).catch((value) => value);
    expect(error.diagnostics).toEqual({
      model: 'gpt-x',
      reason: 'unknown_incomplete',
      outputChars: 0,
      usage: { inputTokens: null, outputTokens: null, totalTokens: 3 },
    });
    expect(JSON.stringify(error.toJSON())).not.toContain('private-secret');
  });
});

describe('HttpChatGPTBroker', () => {
  const broker = (status: number, body: object = {}) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
    return {
      fetchMock,
      broker: new HttpChatGPTBroker(
        'http://127.0.0.1:4803',
        'secreto',
        fetchMock as unknown as typeof fetch,
      ),
    };
  };

  it('asks the desktop for a token with its secret', async () => {
    const { broker: http, fetchMock } = broker(200, { accessToken: 'abc' });
    await expect(http.accessToken()).resolves.toBe('abc');
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:4803/token', {
      method: 'GET',
      headers: { 'x-caseflow-broker-secret': 'secreto' },
    });
  });

  it('keeps a paused plan paused and reports a lost connection', async () => {
    await expect(broker(409).broker.accessToken()).rejects.toMatchObject({
      message: CHATGPT_MESSAGES.usageLimit,
    });
    await expect(broker(401).broker.accessToken()).rejects.toMatchObject({
      message: CHATGPT_MESSAGES.reconnect,
    });
  });
});
