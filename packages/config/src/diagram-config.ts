import { z } from 'zod';

const disabledSchema = z.object({ DIAGRAM_RENDERER: z.literal('disabled').default('disabled') });
const krokiSchema = z.object({
  DIAGRAM_RENDERER: z.literal('kroki'),
  KROKI_BASE_URL: z.url(),
  DIAGRAM_RENDER_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(10_000),
});

export type DiagramRendererConfig =
  { renderer: 'disabled' } | { renderer: 'kroki'; baseUrl: string; timeoutMs: number };

// No renderer is configured by default so that booting the API without local
// infrastructure never attempts an outbound call; a real deployment sets
// DIAGRAM_RENDERER=kroki (see .env.example) once local Kroki is available.
export function loadDiagramRendererConfig(environment: NodeJS.ProcessEnv): DiagramRendererConfig {
  const renderer = environment.DIAGRAM_RENDERER ?? 'disabled';
  if (renderer === 'disabled') {
    disabledSchema.parse({ DIAGRAM_RENDERER: renderer });
    return { renderer };
  }
  const parsed = krokiSchema.parse({ ...environment, DIAGRAM_RENDERER: renderer });
  return {
    renderer: parsed.DIAGRAM_RENDERER,
    baseUrl: parsed.KROKI_BASE_URL,
    timeoutMs: parsed.DIAGRAM_RENDER_TIMEOUT_MS,
  };
}
