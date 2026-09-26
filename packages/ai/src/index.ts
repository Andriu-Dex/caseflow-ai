import { createHash } from 'node:crypto';
import { z } from 'zod';

export const AI_ERROR_CODES = [
  'AI_NOT_CONFIGURED',
  'AI_PROVIDER_UNAVAILABLE',
  'AI_TIMEOUT',
  'AI_RATE_LIMITED',
  'AI_INVALID_OUTPUT',
  'AI_PROVIDER_ERROR',
] as const;
export type AIErrorCode = (typeof AI_ERROR_CODES)[number];
export type AICapability = 'STRUCTURED_OUTPUT';
export type AIModelProfile = 'FAST' | 'BALANCED' | 'QUALITY' | 'LOCAL';
const MAX_OUTPUT_TOKENS_LIMIT = 1_000_000;

export class AIError extends Error {
  constructor(
    public readonly code: AIErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AIError';
  }
  toJSON(): { code: AIErrorCode; message: string } {
    return { code: this.code, message: this.message };
  }
}

export interface AIUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}
export interface AIProviderRequest {
  capability: AICapability;
  purpose: string;
  systemInstructions: string;
  messages: ReadonlyArray<{ role: 'user'; content: string }>;
  outputSchema: Record<string, unknown>;
  schemaName: string;
  modelProfile: AIModelProfile;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs: number;
  signal?: AbortSignal;
}
export interface AIProviderResponse {
  provider: string;
  model: string;
  payload: unknown;
  rawText?: string;
  usage: AIUsage | null;
  latencyMs: number;
}
export interface AIProvider {
  readonly id: string;
  generateStructured(request: AIProviderRequest): Promise<AIProviderResponse>;
}

export interface PromptDefinition {
  key: string;
  version: number;
  capability: AICapability;
  purpose: string;
  systemInstructions: string;
}
export class PromptRegistry {
  private readonly prompts = new Map<string, PromptDefinition>();
  constructor(definitions: ReadonlyArray<PromptDefinition>) {
    for (const definition of definitions) {
      const identity = `${definition.key}@${definition.version}`;
      if (this.prompts.has(identity)) throw new Error(`Duplicate prompt: ${identity}`);
      this.prompts.set(identity, Object.freeze({ ...definition }));
    }
  }
  get(key: string, version: number): PromptDefinition {
    const prompt = this.prompts.get(`${key}@${version}`);
    if (!prompt) throw new AIError('AI_PROVIDER_ERROR', 'La definición de prompt no existe.');
    return prompt;
  }
}

export interface AIRunStart {
  projectId?: string;
  sourceArtifactVersionId?: string;
  provider: string;
  model?: string;
  capability: AICapability;
  purpose: string;
  promptKey: string;
  promptVersion: number;
  inputHash: string;
}
export interface AIRunCompletion {
  provider: string;
  model: string;
  latencyMs: number;
  usage: AIUsage | null;
  outputHash: string;
}
export interface AIRunRecorder {
  start(input: AIRunStart): Promise<string>;
  succeed(id: string, completion: AIRunCompletion): Promise<void>;
  fail(id: string, errorCode: AIErrorCode, latencyMs: number): Promise<void>;
}
export interface ValidatedGenerationCandidate<T> {
  data: T;
  metadata: {
    runId: string;
    provider: string;
    model: string;
    promptKey: string;
    promptVersion: number;
    projectId?: string;
    sourceArtifactVersionId?: string;
    usage: AIUsage | null;
    latencyMs: number;
  };
}
export interface StructuredGenerationInput<T> {
  projectId?: string;
  sourceArtifactVersionId?: string;
  promptKey: string;
  promptVersion: number;
  messages: ReadonlyArray<{ role: 'user'; content: string }>;
  outputSchema: z.ZodType<T>;
  schemaName: string;
  modelProfile?: AIModelProfile;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export class AIOrchestrator {
  constructor(
    private readonly provider: AIProvider,
    private readonly prompts: PromptRegistry,
    private readonly recorder: AIRunRecorder,
    private readonly defaultTimeoutMs = 30_000,
  ) {}
  async generateStructured<T>(
    input: StructuredGenerationInput<T>,
  ): Promise<ValidatedGenerationCandidate<T>> {
    if (
      input.maxOutputTokens !== undefined &&
      (!Number.isInteger(input.maxOutputTokens) ||
        input.maxOutputTokens <= 0 ||
        input.maxOutputTokens > MAX_OUTPUT_TOKENS_LIMIT)
    )
      throw new AIError(
        'AI_PROVIDER_ERROR',
        'El presupuesto de salida debe ser un entero positivo válido.',
      );
    if (input.sourceArtifactVersionId && !input.projectId)
      throw new AIError('AI_PROVIDER_ERROR', 'La procedencia de contexto requiere un proyecto.');
    const prompt = this.prompts.get(input.promptKey, input.promptVersion);
    const started = Date.now();
    const runId = await this.recorder.start({
      projectId: input.projectId,
      sourceArtifactVersionId: input.sourceArtifactVersionId,
      provider: this.provider.id,
      model: input.model,
      capability: prompt.capability,
      purpose: prompt.purpose,
      promptKey: prompt.key,
      promptVersion: prompt.version,
      inputHash: hash({ prompt: `${prompt.key}@${prompt.version}`, messages: input.messages }),
    });
    try {
      const response = await this.provider.generateStructured({
        capability: prompt.capability,
        purpose: prompt.purpose,
        systemInstructions: prompt.systemInstructions,
        messages: input.messages,
        outputSchema: toStrictJsonSchema(z.toJSONSchema(input.outputSchema)) as Record<
          string,
          unknown
        >,
        schemaName: input.schemaName,
        modelProfile: input.modelProfile ?? 'BALANCED',
        model: input.model,
        temperature: input.temperature,
        maxOutputTokens: input.maxOutputTokens,
        timeoutMs: input.timeoutMs ?? this.defaultTimeoutMs,
      });
      const candidate = input.outputSchema.safeParse(stripNulls(response.payload));
      if (!candidate.success)
        throw new AIError('AI_INVALID_OUTPUT', 'La salida de IA no cumple el esquema requerido.');
      await this.recorder.succeed(runId, {
        provider: response.provider,
        model: response.model,
        latencyMs: response.latencyMs,
        usage: response.usage,
        outputHash: hash(candidate.data),
      });
      return {
        data: candidate.data,
        metadata: {
          runId,
          provider: response.provider,
          model: response.model,
          promptKey: prompt.key,
          promptVersion: prompt.version,
          projectId: input.projectId,
          sourceArtifactVersionId: input.sourceArtifactVersionId,
          usage: response.usage,
          latencyMs: response.latencyMs,
        },
      };
    } catch (cause) {
      const error = normalizeAIError(cause);
      await this.recorder.fail(runId, error.code, Date.now() - started);
      throw error;
    }
  }
}

export class DisabledAIProvider implements AIProvider {
  readonly id = 'disabled';
  async generateStructured(): Promise<never> {
    throw new AIError('AI_NOT_CONFIGURED', 'La generación con IA no está configurada.');
  }
}
// Tries each free-tier provider in order (e.g. Groq, then Gemini) and falls
// through to the next on any failure — including rate limits, since free
// tiers are the whole point. The actually-serving provider's own id is what
// ends up on the recorded AIRun (via response.provider), not this one's.
export class FallbackAIProvider implements AIProvider {
  readonly id = 'fallback';
  constructor(private readonly providers: readonly AIProvider[]) {
    if (providers.length === 0)
      throw new Error('FallbackAIProvider requires at least one provider.');
  }
  async generateStructured(request: AIProviderRequest): Promise<AIProviderResponse> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        return await provider.generateStructured(request);
      } catch (cause) {
        lastError = cause;
      }
    }
    throw normalizeAIError(lastError);
  }
}
export class FakeAIProvider implements AIProvider {
  readonly id = 'fake';
  lastRequest?: AIProviderRequest;
  constructor(private readonly result: AIProviderResponse | AIError) {}
  async generateStructured(request: AIProviderRequest): Promise<AIProviderResponse> {
    this.lastRequest = request;
    if (this.result instanceof AIError) throw this.result;
    return this.result;
  }
}
// OpenAI/Groq strict json_schema mode rejects any object schema whose
// `required` doesn't list every key in `properties` — but z.toJSONSchema()
// only lists keys that aren't `.optional()`. Without this, every strict
// provider (Groq confirmed; others likely) rejects every structured-output
// request with a 400, silently forcing every generation prompt onto
// whichever fallback provider tolerates a non-conformant schema. Fields that
// were optional become nullable instead of absent, since strict mode has no
// other way to represent "not provided".
function toStrictJsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toStrictJsonSchema);
  if (node === null || typeof node !== 'object') return node;
  const schema = { ...(node as Record<string, unknown>) };
  if (schema.type === 'object' && schema.properties && typeof schema.properties === 'object') {
    const properties = schema.properties as Record<string, unknown>;
    const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
    const nextProperties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      const converted = toStrictJsonSchema(value);
      nextProperties[key] = required.has(key) ? converted : asNullable(converted);
    }
    schema.properties = nextProperties;
    schema.required = Object.keys(properties);
  }
  if (schema.items !== undefined) schema.items = toStrictJsonSchema(schema.items);
  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    if (Array.isArray(schema[key]))
      schema[key] = (schema[key] as unknown[]).map(toStrictJsonSchema);
  }
  if (schema.$defs && typeof schema.$defs === 'object') {
    const defs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.$defs as Record<string, unknown>))
      defs[key] = toStrictJsonSchema(value);
    schema.$defs = defs;
  }
  return schema;
}
function asNullable(schema: unknown): unknown {
  if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
    const node = schema as Record<string, unknown>;
    if (typeof node.type === 'string') return { ...node, type: [node.type, 'null'] };
  }
  return { anyOf: [schema, { type: 'null' }] };
}
// Reverses asNullable's effect on the parsed response before zod validation,
// so every existing `.optional()` contract keeps meaning "absent", not
// "explicit null" — the provider now returns null for fields it chose to
// skip, since strict mode has no other way to omit a required key.
function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === null) continue;
      result[key] = stripNulls(entry);
    }
    return result;
  }
  return value;
}

export function normalizeAIError(cause: unknown): AIError {
  return cause instanceof AIError
    ? cause
    : new AIError('AI_PROVIDER_ERROR', 'El proveedor de IA no pudo completar la solicitud.', {
        cause,
      });
}
function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
