import {
  AIError,
  outputAllowance,
  writingTimeoutMs,
  type AIProvider,
  type AIProviderRequest,
  type AIProviderResponse,
} from '@caseflow-ai/ai';

// "ChatGPT" provider (DEC-117, desktop edition only): uses the signed-in
// user's ChatGPT plan through the Responses API. OAuth and credentials live
// in the desktop's main process (the broker); this provider only asks it for
// a current access token, and reports what the plan answers.

export const CHATGPT_MESSAGES = {
  usageLimit:
    'Se alcanzó el límite de uso de su plan de ChatGPT para CASEFlow: puede ser el límite de la aplicación, la ventana de cinco horas de Plus o el propio plan. Las solicitudes con ChatGPT quedan en pausa. Revise su uso en ChatGPT o elija otro proveedor en Ajustes de IA.',
  notEligible:
    'Su cuenta o espacio de trabajo de ChatGPT no permite usar el plan en otras aplicaciones. Conecte otra cuenta o configure otro proveedor en Ajustes de IA.',
  reconnect:
    'Su conexión con ChatGPT ya no es válida (puede haberla desconectado desde ChatGPT). Vuelva a conectarla en Ajustes de IA.',
} as const;

export interface ChatGPTBroker {
  // A valid access token, or an error the broker already explains.
  accessToken(): Promise<string>;
  // The plan reported its usage limit: pause every plan-funded request.
  reportUsageLimit(): Promise<void>;
  // The credentials were rejected: forget them and ask to reconnect.
  reportRevoked(): Promise<void>;
}

export interface ChatGPTProviderConfig {
  model: string;
  timeoutMs: number;
  maxInputTokens?: number;
  // What the plan's model may write per answer (DEC-131); unset: the task's own.
  maxOutputTokens?: number;
  broker: ChatGPTBroker;
  fetch?: typeof fetch;
}

const RESPONSES_URL = 'https://api.openai.com/v1/responses';

export class ChatGPTProvider implements AIProvider {
  readonly id = 'chatgpt';
  readonly maxInputTokens?: number;
  private readonly fetchImplementation: typeof fetch;
  constructor(private readonly config: ChatGPTProviderConfig) {
    this.fetchImplementation = config.fetch ?? fetch;
    this.maxInputTokens = config.maxInputTokens;
  }

  async generateStructured(request: AIProviderRequest): Promise<AIProviderResponse> {
    const started = Date.now();
    const token = await this.config.broker.accessToken();
    const controller = new AbortController();
    const maxOutputTokens = outputAllowance(request.maxOutputTokens, this.config.maxOutputTokens);
    // The configured timeout is the floor; a larger request, or a longer answer
    // the provider may write (DEC-131), may need more.
    const timeout = setTimeout(
      () => controller.abort(),
      Math.max(request.timeoutMs, this.config.timeoutMs, writingTimeoutMs(maxOutputTokens)),
    );
    const abort = () => controller.abort();
    request.signal?.addEventListener('abort', abort, { once: true });
    try {
      const model = request.model ?? this.config.model;
      const response = await this.fetchImplementation(RESPONSES_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          accept: 'text/event-stream',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          instructions: request.systemInstructions,
          input: request.messages.map((message) => ({ role: 'user', content: message.content })),
          text: {
            format: {
              type: 'json_schema',
              name: request.schemaName,
              strict: true,
              schema: request.outputSchema,
            },
          },
          ...(maxOutputTokens === undefined ? {} : { max_output_tokens: maxOutputTokens }),
          // Plan usage requires streamed, unstored responses.
          store: false,
          stream: true,
        }),
      });
      if (!response.ok) throw await this.failure(response.status, await response.text());
      const { text, usage } = await this.readStream(response);
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new AIError('AI_INVALID_OUTPUT', 'La salida de IA no cumple el esquema requerido.');
      }
      return {
        provider: this.id,
        model,
        payload,
        rawText: text,
        usage,
        latencyMs: Date.now() - started,
      };
    } catch (cause) {
      if (cause instanceof AIError) throw cause;
      if (controller.signal.aborted)
        throw new AIError('AI_TIMEOUT', 'El proveedor de IA excedió el tiempo límite.');
      throw new AIError('AI_PROVIDER_UNAVAILABLE', 'El proveedor de IA no está disponible.');
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener('abort', abort);
    }
  }

  // The plan's own error codes decide what happens (DEC-117): a usage limit
  // pauses the plan and never falls back silently to a paid provider;
  // ineligibility is explained without retrying; revocation asks to reconnect.
  private async failure(status: number, body: string): Promise<AIError> {
    let code: unknown;
    try {
      code = (JSON.parse(body) as { error?: { code?: unknown } }).error?.code;
    } catch {
      code = undefined;
    }
    if (code === 'subscription_sharing_usage_limit_exceeded') {
      await this.config.broker.reportUsageLimit();
      return new AIError('AI_RATE_LIMITED', CHATGPT_MESSAGES.usageLimit);
    }
    if (code === 'subscription_sharing_user_not_eligible')
      return new AIError('AI_NOT_CONFIGURED', CHATGPT_MESSAGES.notEligible);
    if (status === 401) {
      await this.config.broker.reportRevoked();
      return new AIError('AI_NOT_CONFIGURED', CHATGPT_MESSAGES.reconnect);
    }
    if (status === 429)
      return new AIError(
        'AI_RATE_LIMITED',
        'El proveedor de IA limitó temporalmente las solicitudes.',
      );
    if (status >= 500)
      return new AIError('AI_PROVIDER_UNAVAILABLE', 'El proveedor de IA no está disponible.');
    return new AIError('AI_PROVIDER_ERROR', 'El proveedor de IA rechazó la solicitud.');
  }

  // Server-sent events: text deltas until response.completed.
  private async readStream(response: Response) {
    if (!response.body)
      throw new AIError('AI_PROVIDER_ERROR', 'El proveedor devolvió una respuesta no válida.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let text = '';
    let usage: AIProviderResponse['usage'] = null;
    let completed = false;
    const handle = async (data: string) => {
      if (!data || data === '[DONE]') return;
      let event: { type?: string; delta?: unknown; response?: Record<string, unknown> };
      try {
        event = JSON.parse(data);
      } catch {
        throw new AIError('AI_PROVIDER_ERROR', 'El proveedor devolvió una respuesta no válida.');
      }
      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string')
        text += event.delta;
      else if (event.type === 'response.completed') {
        completed = true;
        const raw = event.response?.usage as
          { input_tokens?: number; output_tokens?: number; total_tokens?: number } | undefined;
        if (raw)
          usage = {
            inputTokens: raw.input_tokens ?? null,
            outputTokens: raw.output_tokens ?? null,
            totalTokens: raw.total_tokens ?? null,
          };
      } else if (event.type === 'response.failed' || event.type === 'error')
        throw await this.failure(200, JSON.stringify(event.response ?? event));
      else if (event.type === 'response.incomplete')
        throw new AIError('AI_INVALID_OUTPUT', 'La respuesta de IA quedó incompleta.');
    };
    for (;;) {
      const chunk = await reader.read();
      pending += decoder.decode(chunk.value, { stream: !chunk.done });
      const events = pending.split(/\r?\n\r?\n/);
      pending = chunk.done ? '' : events.pop()!;
      for (const block of events)
        await handle(
          block
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).replace(/^ /, ''))
            .join('\n'),
        );
      if (chunk.done) break;
    }
    if (!completed) throw new AIError('AI_INVALID_OUTPUT', 'La respuesta de IA quedó incompleta.');
    return { text, usage };
  }
}

// The desktop broker over loopback, authenticated with a per-session secret.
export class HttpChatGPTBroker implements ChatGPTBroker {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async accessToken(): Promise<string> {
    let response: Response;
    try {
      response = await this.call('GET', '/token');
    } catch {
      throw new AIError('AI_PROVIDER_UNAVAILABLE', 'La conexión con ChatGPT no está disponible.');
    }
    if (response.status === 409) throw new AIError('AI_RATE_LIMITED', CHATGPT_MESSAGES.usageLimit);
    if (response.status === 401) throw new AIError('AI_NOT_CONFIGURED', CHATGPT_MESSAGES.reconnect);
    if (!response.ok)
      throw new AIError('AI_PROVIDER_UNAVAILABLE', 'La conexión con ChatGPT no está disponible.');
    return ((await response.json()) as { accessToken: string }).accessToken;
  }
  async reportUsageLimit(): Promise<void> {
    await this.call('POST', '/usage-limit').catch(() => undefined);
  }
  async reportRevoked(): Promise<void> {
    await this.call('POST', '/revoked').catch(() => undefined);
  }
  private call(method: string, path: string) {
    return this.fetchImplementation(`${this.baseUrl}${path}`, {
      method,
      headers: { 'x-caseflow-broker-secret': this.secret },
    });
  }
}
