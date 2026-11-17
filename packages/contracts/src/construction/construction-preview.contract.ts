import { z } from 'zod';
import { GENERATED_FILE_KINDS, GENERATED_FILE_ORIGINS } from './generation-run.contract';

// What an implementation plan will produce, computed without AI before any
// code exists: the containers that run the project and its tree of files.
export const CONTAINER_ENVIRONMENTS = ['DEPLOYMENT', 'LOCAL'] as const;

const previewContainerSchema = z.object({
  // DEPLOYMENT: the demonstration CASEFlow publishes. LOCAL: the Docker
  // Compose file the project ships for a person's own machine.
  environment: z.enum(CONTAINER_ENVIRONMENTS),
  name: z.string(),
  image: z.string(),
  responsibility: z.string(),
  // What runs inside, with the port it listens on in the container network.
  services: z.array(z.object({ name: z.string(), port: z.number().int().nullable() })),
  // Names of the plan modules the container serves.
  modules: z.array(z.string()),
  volumes: z.array(z.string()),
  // How the container is reached from outside, if at all.
  exposure: z.string().nullable(),
  limits: z.string().nullable(),
  dependsOn: z.array(z.string()),
});

const previewFileSchema = z.object({
  path: z.string(),
  kind: z.enum(GENERATED_FILE_KINDS),
  origin: z.enum(GENERATED_FILE_ORIGINS),
  purpose: z.string(),
  moduleLocalId: z.string().nullable(),
  // Web route or API action the file implements, when it implements one.
  routePath: z.string().nullable(),
  endpoint: z.string().nullable(),
});

export const constructionPreviewResponseSchema = z.object({
  implementationPlanVersionId: z.uuid(),
  containers: z.array(previewContainerSchema),
  modules: z.array(
    z.object({
      localId: z.string(),
      name: z.string(),
      description: z.string(),
      entities: z.number().int(),
      routes: z.number().int(),
      endpoints: z.number().int(),
      files: z.number().int(),
    }),
  ),
  files: z.array(previewFileSchema),
});
export type ConstructionPreviewResponse = z.infer<typeof constructionPreviewResponseSchema>;

// DEC-168: what a generation from a plan would ask the AI for, before it starts.
// Screens are an upper bound: one whose inputs did not change is reused, which is
// only known once the actions it calls are implemented.
export const generationEstimateResponseSchema = z.object({
  implementationPlanVersionId: z.uuid(),
  businessActions: z.object({
    total: z.number().int().nonnegative(),
    reused: z.number().int().nonnegative(),
  }),
  demoData: z.enum(['NONE', 'REUSED', 'REQUESTED']),
  screens: z.object({ atMost: z.number().int().nonnegative() }),
  requests: z.object({
    atLeast: z.number().int().nonnegative(),
    atMost: z.number().int().nonnegative(),
  }),
});
export type GenerationEstimateResponse = z.infer<typeof generationEstimateResponseSchema>;
