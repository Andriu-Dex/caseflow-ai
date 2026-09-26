import {
  AIError,
  type AIProvider,
  type AIProviderRequest,
  type AIProviderResponse,
  type AIUsage,
} from '@caseflow-ai/ai';

export {
  DIAGRAM_PROVIDER_ERROR_CODES,
  DiagramProviderError,
  DisabledDiagramProvider,
  FakeDiagramProvider,
} from './diagram-provider';
export type {
  DiagramFormat,
  DiagramProvider,
  DiagramProviderErrorCode,
  DiagramProviderRequest,
  DiagramProviderResponse,
} from './diagram-provider';
export { KrokiDiagramProvider, KROKI_ENGINE_VERSION } from './kroki-diagram-provider';
export type { KrokiDiagramProviderConfig } from './kroki-diagram-provider';

export {
  STORAGE_PROVIDER_ERROR_CODES,
  StorageProviderError,
  DisabledStorageProvider,
  FakeStorageProvider,
} from './storage-provider';
export type { PutObjectInput, StorageProvider, StorageProviderErrorCode } from './storage-provider';
export { S3StorageProvider } from './s3-storage-provider';
export type { S3StorageProviderConfig } from './s3-storage-provider';

export interface OpenAICompatibleProviderConfig {
  id?: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  fetch?: typeof fetch;
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly id: string;
  private readonly fetchImplementation: typeof fetch;
  constructor(private readonly config: OpenAICompatibleProviderConfig) {
    this.id = config.id ?? 'openai_compatible';
    this.fetchImplementation = config.fetch ?? fetch;
  }

  async generateStructured(request: AIProviderRequest): Promise<AIProviderResponse> {
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(request.timeoutMs, this.config.timeoutMs),
    );
    const abort = () => controller.abort();
    request.signal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await this.fetchImplementation(
        `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: request.model ?? this.config.model,
            messages: [
              { role: 'system', content: request.systemInstructions },
              ...request.messages,
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: request.schemaName,
                ...(this.id.toLowerCase() === 'gemini'
                  ? { schema: toGeminiCompatibleSchema(request.outputSchema) }
                  : { strict: true, schema: request.outputSchema }),
              },
            },
            ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
            ...(request.maxOutputTokens === undefined
              ? {}
              : { max_tokens: request.maxOutputTokens }),
          }),
        },
      );
      if (!response.ok) throw statusError(response.status);
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new AIError('AI_PROVIDER_ERROR', 'El proveedor devolvió una respuesta no válida.');
      }
      const parsed = parseResponse(body);
      return {
        provider: this.id,
        model: parsed.model,
        payload: parsed.payload,
        rawText: parsed.rawText,
        usage: parsed.usage,
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
}

function statusError(status: number): AIError {
  if (status === 429 || status === 413)
    return new AIError(
      'AI_RATE_LIMITED',
      status === 413
        ? 'La solicitud superó el límite de tokens del proveedor de IA.'
        : 'El proveedor de IA limitó temporalmente las solicitudes.',
    );
  if (status === 408 || status === 504)
    return new AIError('AI_TIMEOUT', 'El proveedor de IA excedió el tiempo límite.');
  if (status >= 500)
    return new AIError('AI_PROVIDER_UNAVAILABLE', 'El proveedor de IA no está disponible.');
  return new AIError('AI_PROVIDER_ERROR', 'El proveedor de IA rechazó la solicitud.');
}

// Gemini accepts an OpenAI-compatible chat endpoint but supports a narrower
// JSON Schema dialect. Keep domain validation in the orchestrator and remove
// schema keywords that Gemini does not document/support at its provider
// boundary; this leaves the canonical Zod schema untouched for validation.
function toGeminiCompatibleSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toGeminiCompatibleSchema);
  if (value === null || typeof value !== 'object') return value;
  const schema = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(schema)) {
    if (['$schema', '$id', 'default', 'minLength', 'maxLength', 'title'].includes(key)) continue;
    if (key === 'const') {
      result.enum = [item];
      continue;
    }
    result[key] = toGeminiCompatibleSchema(item);
  }
  return result;
}

function parseResponse(value: unknown): {
  model: string;
  payload: unknown;
  rawText: string;
  usage: AIUsage | null;
} {
  if (!value || typeof value !== 'object')
    throw new AIError('AI_PROVIDER_ERROR', 'El proveedor devolvió una respuesta no válida.');
  const body = value as Record<string, unknown>;
  const choices = body.choices;
  const first = Array.isArray(choices)
    ? (choices[0] as Record<string, unknown> | undefined)
    : undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  if (typeof body.model !== 'string' || typeof message?.content !== 'string')
    throw new AIError('AI_PROVIDER_ERROR', 'El proveedor devolvió una respuesta incompleta.');
  let payload: unknown;
  try {
    payload = JSON.parse(message.content);
  } catch {
    throw new AIError('AI_INVALID_OUTPUT', 'La salida de IA no contiene JSON válido.');
  }
  const usage = body.usage as Record<string, unknown> | undefined;
  return {
    model: body.model,
    payload,
    rawText: message.content,
    usage: usage
      ? {
          inputTokens: numberOrNull(usage.prompt_tokens),
          outputTokens: numberOrNull(usage.completion_tokens),
          totalTokens: numberOrNull(usage.total_tokens),
        }
      : null,
  };
}
function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
