import { z } from 'zod';

export { loadDiagramRendererConfig } from './diagram-config';
export type { DiagramRendererConfig } from './diagram-config';
export { loadMockupConfig } from './mockup-config';
export type { MockupProviderConfig } from './mockup-config';
export { loadStorageConfig } from './storage-config';
export type { StorageConfig } from './storage-config';

const disabledSchema = z.object({ AI_PROVIDER: z.literal('disabled').default('disabled') });
const openAICompatibleSchema = z.object({
  AI_PROVIDER: z.literal('openai_compatible'),
  AI_BASE_URL: z.url(),
  AI_API_KEY: z.string().min(1),
  AI_MODEL: z.string().min(1),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().max(300_000).default(30_000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
});
const fallbackTimeoutSchema = z.object({
  AI_TIMEOUT_MS: z.coerce.number().int().positive().max(300_000).default(30_000),
});
const fallbackSlotSchema = z.object({
  id: z.string().min(1),
  baseUrl: z.url(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  schemaDialect: z.enum(['strict', 'narrow']).default('strict'),
  // What the provider's plan accepts (DEC-127); unset means unknown.
  maxInputTokens: z.coerce.number().int().positive().optional(),
  tokensPerMinute: z.coerce.number().int().positive().optional(),
  // What it may write per answer (DEC-131); unset: each task's own budget.
  maxOutputTokens: z.coerce.number().int().positive().optional(),
  dayResetTimeZone: z
    .string()
    .refine((zone) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    }, 'Zona horaria no válida.')
    .optional(),
});
const MAX_AI_FALLBACK_PROVIDERS = 5;

export type AIProviderSlot = {
  id: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  schemaDialect: 'strict' | 'narrow';
  maxInputTokens?: number;
  tokensPerMinute?: number;
  maxOutputTokens?: number;
  dayResetTimeZone?: string;
};
// DEC-117: the user's ChatGPT plan, desktop edition only. The desktop main
// process holds the OAuth credentials and serves short-lived access tokens
// to the API over loopback (the broker).
const chatgptSchema = z.object({
  AI_PROVIDER: z.literal('chatgpt'),
  AI_MODEL: z.string().min(1),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().max(300_000).default(120_000),
  // The broker only ever lives on this machine (ADR-002, DEC-128).
  CHATGPT_BROKER_URL: z
    .url()
    .refine((url) => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname), {
      message: 'CHATGPT_BROKER_URL debe apuntar a este equipo (127.0.0.1).',
    }),
  CHATGPT_BROKER_SECRET: z.string().min(32),
  // The plan's model context, in input tokens (DEC-127); unset means unknown.
  AI_MAX_INPUT_TOKENS: z.coerce.number().int().positive().optional(),
  // What the plan's model may write per answer (DEC-131).
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
});

export type AIConfig =
  | { provider: 'disabled' }
  | {
      provider: 'chatgpt';
      model: string;
      timeoutMs: number;
      maxInputTokens?: number;
      maxOutputTokens?: number;
      brokerUrl: string;
      brokerSecret: string;
    }
  | {
      provider: 'openai_compatible';
      baseUrl: string;
      apiKey: string;
      model: string;
      timeoutMs: number;
      maxOutputTokens?: number;
    }
  | { provider: 'fallback'; chain: AIProviderSlot[] };

// Chains free-tier providers (e.g. Groq then Gemini) behind one AI_PROVIDER
// mode, since a single paid provider isn't an option here. Slots are
// numbered AI_PROVIDER_1_*, AI_PROVIDER_2_*, ... and read until one has no
// AI_PROVIDER_N_BASE_URL set.
export function loadAIConfig(environment: NodeJS.ProcessEnv): AIConfig {
  const provider = environment.AI_PROVIDER ?? 'disabled';
  if (provider === 'disabled') {
    disabledSchema.parse({ AI_PROVIDER: provider });
    return { provider };
  }
  if (provider === 'chatgpt') {
    const parsed = chatgptSchema.parse(environment);
    return {
      provider,
      model: parsed.AI_MODEL,
      timeoutMs: parsed.AI_TIMEOUT_MS,
      maxInputTokens: parsed.AI_MAX_INPUT_TOKENS,
      maxOutputTokens: parsed.AI_MAX_OUTPUT_TOKENS,
      brokerUrl: parsed.CHATGPT_BROKER_URL,
      brokerSecret: parsed.CHATGPT_BROKER_SECRET,
    };
  }
  if (provider === 'fallback') {
    const { AI_TIMEOUT_MS: timeoutMs } = fallbackTimeoutSchema.parse(environment);
    const chain: AIProviderSlot[] = [];
    for (let index = 1; index <= MAX_AI_FALLBACK_PROVIDERS; index += 1) {
      const baseUrl = environment[`AI_PROVIDER_${index}_BASE_URL`];
      if (!baseUrl) break;
      const slot = fallbackSlotSchema.parse({
        id: environment[`AI_PROVIDER_${index}_ID`] ?? `provider_${index}`,
        baseUrl,
        apiKey: environment[`AI_PROVIDER_${index}_API_KEY`],
        model: environment[`AI_PROVIDER_${index}_MODEL`],
        schemaDialect: environment[`AI_PROVIDER_${index}_SCHEMA_DIALECT`],
        maxInputTokens: environment[`AI_PROVIDER_${index}_MAX_INPUT_TOKENS`] || undefined,
        tokensPerMinute: environment[`AI_PROVIDER_${index}_TOKENS_PER_MINUTE`] || undefined,
        maxOutputTokens: environment[`AI_PROVIDER_${index}_MAX_OUTPUT_TOKENS`] || undefined,
        dayResetTimeZone: environment[`AI_PROVIDER_${index}_DAY_RESET_TIMEZONE`] || undefined,
      });
      chain.push({ ...slot, timeoutMs });
    }
    if (chain.length === 0)
      throw new Error('AI_PROVIDER=fallback requires at least AI_PROVIDER_1_BASE_URL.');
    return { provider: 'fallback', chain };
  }
  const parsed = openAICompatibleSchema.parse({ ...environment, AI_PROVIDER: provider });
  return {
    provider: parsed.AI_PROVIDER,
    baseUrl: parsed.AI_BASE_URL,
    apiKey: parsed.AI_API_KEY,
    model: parsed.AI_MODEL,
    timeoutMs: parsed.AI_TIMEOUT_MS,
    maxOutputTokens: parsed.AI_MAX_OUTPUT_TOKENS,
  };
}
