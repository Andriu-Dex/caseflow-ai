import { z } from 'zod';

const disabledSchema = z.object({ AI_PROVIDER: z.literal('disabled').default('disabled') });
const openAICompatibleSchema = z.object({
  AI_PROVIDER: z.literal('openai_compatible'),
  AI_BASE_URL: z.url(),
  AI_API_KEY: z.string().min(1),
  AI_MODEL: z.string().min(1),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().max(300_000).default(30_000),
});

export type AIConfig =
  | { provider: 'disabled' }
  | {
      provider: 'openai_compatible';
      baseUrl: string;
      apiKey: string;
      model: string;
      timeoutMs: number;
    };

export function loadAIConfig(environment: NodeJS.ProcessEnv): AIConfig {
  const provider = environment.AI_PROVIDER ?? 'disabled';
  if (provider === 'disabled') {
    disabledSchema.parse({ AI_PROVIDER: provider });
    return { provider };
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
