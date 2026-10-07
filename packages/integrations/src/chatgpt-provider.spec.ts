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
    });
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
