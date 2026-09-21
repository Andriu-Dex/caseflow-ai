import { z } from 'zod';
import { ARTIFACT_ORIGINS, ARTIFACT_VERSION_STATUSES } from '../artifacts/artifact.contract';

export const PROJECT_CONTEXT_COLLECTION_LIMIT = 100;
export const PROJECT_CONTEXT_SCOPE_TYPES = ['IN_SCOPE', 'OUT_OF_SCOPE'] as const;

const narrative = (max: number) => z.string().trim().min(1).max(max);
const orderedDescriptionInputSchema = z.object({ description: narrative(2_000) }).strict();

export const projectContextActorInputSchema = z
  .object({ name: narrative(200), description: narrative(2_000).optional() })
  .strict();

export const projectContextScopeItemInputSchema = z
  .object({ type: z.enum(PROJECT_CONTEXT_SCOPE_TYPES), description: narrative(2_000) })
  .strict();

export const projectContextRequestSchema = z
  .object({
    problemStatement: narrative(10_000),
    objective: narrative(5_000),
    scopeItems: z.array(projectContextScopeItemInputSchema).max(PROJECT_CONTEXT_COLLECTION_LIMIT),
    actors: z.array(projectContextActorInputSchema).max(PROJECT_CONTEXT_COLLECTION_LIMIT),
    needs: z.array(orderedDescriptionInputSchema).max(PROJECT_CONTEXT_COLLECTION_LIMIT),
    constraints: z.array(orderedDescriptionInputSchema).max(PROJECT_CONTEXT_COLLECTION_LIMIT),
    businessRules: z.array(orderedDescriptionInputSchema).max(PROJECT_CONTEXT_COLLECTION_LIMIT),
    additionalContext: narrative(10_000).optional(),
  })
  .strict();

export type ProjectContextRequest = z.infer<typeof projectContextRequestSchema>;

const positionedDescriptionSchema = z.object({
  id: z.uuid(),
  position: z.number().int().min(0),
  description: z.string(),
});

const projectContextVersionMetadataSchema = z.object({
  id: z.uuid(),
  versionNumber: z.number().int().min(1),
  title: z.string(),
  status: z.enum(ARTIFACT_VERSION_STATUSES),
  origin: z.enum(ARTIFACT_ORIGINS),
  createdAt: z.iso.datetime(),
});

export const projectContextResponseSchema = z.object({
  artifactId: z.uuid(),
  projectId: z.uuid(),
  type: z.literal('PROJECT_CONTEXT'),
  code: z.string(),
  version: projectContextVersionMetadataSchema,
  problemStatement: z.string(),
  objective: z.string(),
  scopeItems: z.array(
    positionedDescriptionSchema.extend({ type: z.enum(PROJECT_CONTEXT_SCOPE_TYPES) }),
  ),
  actors: z.array(
    z.object({
      id: z.uuid(),
      position: z.number().int().min(0),
      name: z.string(),
      description: z.string().nullable(),
    }),
  ),
  needs: z.array(positionedDescriptionSchema),
  constraints: z.array(positionedDescriptionSchema),
  businessRules: z.array(positionedDescriptionSchema),
  additionalContext: z.string().nullable(),
});

export type ProjectContextResponse = z.infer<typeof projectContextResponseSchema>;
