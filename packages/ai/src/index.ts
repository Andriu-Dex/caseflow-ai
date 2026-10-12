import { createHash } from 'node:crypto';
import { z } from 'zod';

export const AI_ERROR_CODES = [
  'AI_NOT_CONFIGURED',
  'AI_PROVIDER_UNAVAILABLE',
  'AI_TIMEOUT',
  'AI_RATE_LIMITED',
  'AI_INVALID_OUTPUT',
  'AI_PROVIDER_ERROR',
  // No configured provider accepts a request this large: split the work.
  'AI_INPUT_TOO_LARGE',
] as const;
export type AIErrorCode = (typeof AI_ERROR_CODES)[number];
export type AICapability = 'STRUCTURED_OUTPUT';
export type AIModelProfile = 'FAST' | 'BALANCED' | 'QUALITY' | 'LOCAL';
export type AIGenerationLanguage = 'ES' | 'EN';
const LANGUAGE_NAMES: Record<AIGenerationLanguage, string> = {
  ES: 'español',
  EN: 'English',
};
const MAX_OUTPUT_TOKENS_LIMIT = 1_000_000;

// Which quota a rate limit hit: the per-minute one recovers in seconds, the
// daily one only at the provider's daily reset.
export type AIQuota = 'MINUTE' | 'DAY';
export class AIError extends Error {
  readonly retryAfterMs?: number;
  readonly quota?: AIQuota;
  constructor(
    public readonly code: AIErrorCode,
    message: string,
    options?: { cause?: unknown; retryAfterMs?: number; quota?: AIQuota },
  ) {
    super(message, options);
    this.name = 'AIError';
    this.retryAfterMs = options?.retryAfterMs;
    this.quota = options?.quota;
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
  // The largest request, in input tokens, it can serve right now; undefined
  // when unknown. Callers split longer work into parts that fit.
  readonly maxInputTokens?: number;
  generateStructured(request: AIProviderRequest): Promise<AIProviderResponse>;
}

// Conservative token estimate (about 3 characters per token, below the 3.5-4
// of Spanish and English prose), so a request estimated to fit really does.
export const estimateTokens = (text: string) => Math.ceil(text.length / 3);
export const estimateRequestTokens = (request: AIProviderRequest) =>
  estimateTokens(
    request.systemInstructions +
      request.messages.map((m) => m.content).join('') +
      JSON.stringify(request.outputSchema),
  );

// Bigger requests take longer: 30 s more per 10 000 tokens, up to 3 minutes.
export const MAX_AI_TIMEOUT_MS = 180_000;
export const scaledTimeoutMs = (baseMs: number, inputTokens: number) =>
  Math.min(MAX_AI_TIMEOUT_MS, baseMs + Math.floor(inputTokens / 10_000) * 30_000);

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
  language?: AIGenerationLanguage;
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
  // How much input one request can carry right now (undefined: unknown).
  get maxInputTokens(): number | undefined {
    return this.provider.maxInputTokens;
  }
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
    const inputTokens = estimateTokens(
      prompt.systemInstructions + input.messages.map((m) => m.content).join(''),
    );
    const runId = await this.recorder.start({
      projectId: input.projectId,
      sourceArtifactVersionId: input.sourceArtifactVersionId,
      provider: this.provider.id,
      model: input.model,
      capability: prompt.capability,
      purpose: prompt.purpose,
      promptKey: prompt.key,
      promptVersion: prompt.version,
      inputHash: hash({
        prompt: `${prompt.key}@${prompt.version}`,
        language: input.language ?? null,
        messages: input.messages,
      }),
    });
    try {
      const providerRequest: AIProviderRequest = {
        capability: prompt.capability,
        purpose: prompt.purpose,
        systemInstructions: input.language
          ? `${prompt.systemInstructions}\n\nGenera todo el contenido (etiquetas, nombres, descripciones y textos) en ${LANGUAGE_NAMES[input.language]}.`
          : prompt.systemInstructions,
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
        timeoutMs: input.timeoutMs ?? scaledTimeoutMs(this.defaultTimeoutMs, inputTokens),
      };
      // A model occasionally produces output that fails schema validation
      // (AI_INVALID_OUTPUT) on an otherwise-healthy provider — worth one retry
      // against the same provider before giving up, since the failure is
      // model-nondeterminism, not a provider/network problem other error
      // codes already represent. Bounded to avoid runaway cost/latency; any
      // other error code still fails immediately.
      const maxAttempts = 2;
      let response: AIProviderResponse | undefined;
      let candidate: ReturnType<typeof input.outputSchema.safeParse> | undefined;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        response = await this.provider.generateStructured(providerRequest);
        candidate = input.outputSchema.safeParse(stripNulls(response.payload));
        if (candidate.success || attempt === maxAttempts) break;
      }
      if (!response || !candidate)
        throw new AIError('AI_INVALID_OUTPUT', 'La salida de IA no cumple el esquema requerido.');
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
// What a provider accepts, as configured (DEC-127). Free tiers differ in
// opposite ways: Groq takes many small requests (8 000 tokens per minute),
// Gemini few large ones (20 requests a day, a 1M-token context).
export interface ProviderCapacity {
  // Largest single request, in input tokens.
  maxInputTokens?: number;
  // A request above this is rejected outright, however long one waits.
  tokensPerMinute?: number;
  // Where the daily quota resets, e.g. America/Los_Angeles for Gemini.
  dayResetTimeZone?: string;
}
const capOf = (capacity: ProviderCapacity) =>
  Math.min(capacity.maxInputTokens ?? Infinity, capacity.tokensPerMinute ?? Infinity);

// Milliseconds until the next midnight in a time zone.
export function msUntilMidnight(timeZone: string, now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const elapsedMs = (((get('hour') % 24) * 60 + get('minute')) * 60 + get('second')) * 1000;
  return 86_400_000 - elapsedMs;
}

const MAX_RATE_LIMIT_WAITS = 3;
const MAX_WAIT_MS = 65_000;

// Routes each request by size (DEC-127): providers are tried in order, but
// only those whose capacity fits the request, skipping any whose quota is
// spent; any other failure falls through to the next, as free tiers fail
// often. When every fitting provider is only rate limited for the minute,
// it waits and tries again. The actually-serving provider's own id is what
// ends up on the recorded AIRun (via response.provider), not this one's.
// ponytail: quota state lives in memory, so a restart may spend one request
// rediscovering a spent daily quota.
export class FallbackAIProvider implements AIProvider {
  readonly id = 'fallback';
  private readonly slots: {
    provider: AIProvider;
    capacity: ProviderCapacity;
    cap: number;
    blockedUntil: number;
  }[];
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  constructor(
    providers: ReadonlyArray<AIProvider | { provider: AIProvider; capacity: ProviderCapacity }>,
    options: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
  ) {
    if (providers.length === 0)
      throw new Error('FallbackAIProvider requires at least one provider.');
    this.slots = providers.map((entry) => {
      const { provider, capacity } =
        'generateStructured' in entry ? { provider: entry, capacity: {} } : entry;
      return { provider, capacity, cap: capOf(capacity), blockedUntil: 0 };
    });
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  // The largest request some provider whose daily quota is not spent can take.
  get maxInputTokens(): number | undefined {
    const caps = this.slots
      .filter((slot) => slot.blockedUntil - this.now() <= MAX_WAIT_MS)
      .map((slot) => slot.cap);
    const max = Math.max(...caps);
    return Number.isFinite(max) ? max : undefined;
  }

  // A spent daily quota waits for the configured reset (Gemini suggests
  // retrying in seconds even then); otherwise the provider's own hint.
  private blockFor(capacity: ProviderCapacity, error: AIError): number {
    if (error.quota === 'DAY' && capacity.dayResetTimeZone)
      return msUntilMidnight(capacity.dayResetTimeZone, new Date(this.now()));
    return error.retryAfterMs ?? (error.quota === 'DAY' ? 3_600_000 : 60_000);
  }

  async generateStructured(request: AIProviderRequest): Promise<AIProviderResponse> {
    const tokens = estimateRequestTokens(request);
    const fitting = this.slots.filter((slot) => tokens <= slot.cap);
    if (fitting.length === 0)
      throw new AIError(
        'AI_INPUT_TOO_LARGE',
        'La solicitud es demasiado grande para los proveedores de IA configurados.',
      );
    let lastError: unknown;
    for (let wait = 0; ; wait += 1) {
      for (const slot of fitting) {
        if (slot.blockedUntil > this.now()) continue;
        try {
          return await slot.provider.generateStructured(request);
        } catch (cause) {
          lastError = cause;
          if (!(cause instanceof AIError)) continue;
          if (cause.code === 'AI_INPUT_TOO_LARGE') slot.cap = Math.min(slot.cap, tokens - 1);
          if (cause.code === 'AI_RATE_LIMITED')
            slot.blockedUntil = this.now() + this.blockFor(slot.capacity, cause);
        }
      }
      // Only worth waiting when a fitting provider frees up within a minute.
      const soonest = Math.min(
        ...fitting.filter((slot) => tokens <= slot.cap).map((slot) => slot.blockedUntil),
      );
      const delay = soonest - this.now();
      if (wait >= MAX_RATE_LIMIT_WAITS || delay <= 0 || delay > MAX_WAIT_MS) break;
      await this.sleep(delay);
    }
    if (lastError === undefined)
      throw new AIError(
        'AI_RATE_LIMITED',
        'Se agotó la cuota de los proveedores de IA que admiten esta solicitud.',
        { quota: 'DAY' },
      );
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
