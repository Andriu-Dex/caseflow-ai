import { z } from 'zod';

const stitchSchema = z.object({
  STITCH_API_KEY: z.string().min(1),
  // Generation now runs as a background job (never blocks a browser
  // request), so this can be as generous as the text-generation AI
  // timeout (AI_TIMEOUT_MS, packages/config/src/index.ts) instead of the
  // tighter ceiling a synchronous HTTP call would need.
  STITCH_TIMEOUT_MS: z.coerce.number().int().positive().max(300_000).default(30_000),
});

export type MockupProviderConfig =
  { provider: 'disabled' } | { provider: 'stitch'; apiKey: string; timeoutMs: number };

export function loadMockupConfig(environment: NodeJS.ProcessEnv): MockupProviderConfig {
  const provider = environment.MOCKUP_PROVIDER ?? 'disabled';
  if (provider === 'disabled') return { provider };
  if (provider !== 'stitch') throw new Error('Invalid MOCKUP_PROVIDER.');
  const parsed = stitchSchema.parse(environment);
  return { provider, apiKey: parsed.STITCH_API_KEY, timeoutMs: parsed.STITCH_TIMEOUT_MS };
}
