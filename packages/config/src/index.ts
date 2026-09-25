import { z } from 'zod';

export { loadDiagramRendererConfig } from './diagram-config';
export type { DiagramRendererConfig } from './diagram-config';
export { loadStorageConfig } from './storage-config';
export type { StorageConfig } from './storage-config';

const disabledSchema = z.object({ AI_PROVIDER: z.literal('disabled').default('disabled') });
const openAICompatibleSchema = z.object({
  AI_PROVIDER: z.literal('openai_compatible'),
  AI_BASE_URL: z.url(),
  AI_API_KEY: z.string().min(1),
  AI_MODEL: z.string().min(1),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().max(300_000).default(30_000),
});
const fallbackTimeoutSchema = z.object({
  AI_TIMEOUT_MS: z.coerce.number().int().positive().max(300_000).default(30_000),
});
const fallbackSlotSchema = z.object({
  id: z.string().min(1),
  baseUrl: z.url(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
});
const MAX_AI_FALLBACK_PROVIDERS = 5;

export type AIProviderSlot = {
  id: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
};
export type AIConfig =
  | { provider: 'disabled' }
  | {
      provider: 'openai_compatible';
      baseUrl: string;
      apiKey: string;
      model: string;
      timeoutMs: number;
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
  };
}
