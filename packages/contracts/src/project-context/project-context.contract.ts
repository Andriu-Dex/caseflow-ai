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
    // Exact APPROVED PROJECT_SOURCE versions of the same project that support
    // this context snapshot (requirements.md Phase B). Optional: a context
    // may still be authored before any source is approved.
    sourceVersionIds: z.array(z.uuid()).max(PROJECT_CONTEXT_COLLECTION_LIMIT).default([]),
  })
  .strict();

// z.input (not z.infer): sourceVersionIds has a default, so callers/fixtures
// may omit it, matching the existing CreateArtifactRequest convention.
export type ProjectContextRequest = z.input<typeof projectContextRequestSchema>;

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

// AI-proposed pre-fill (spec §5 human-in-the-loop): mirrors only the fields
// the Context form actually exposes for editing before submission — never a
// separate "accept" path, the reviewer edits and submits it through the same
// projectContextRequestSchema create/createVersion endpoints as any
// hand-authored context.
export const projectContextGenerationContentSchema = z
  .object({
    problemStatement: narrative(10_000),
    objective: narrative(5_000),
    additionalContext: narrative(10_000).optional(),
    actors: z.array(narrative(200)).max(PROJECT_CONTEXT_COLLECTION_LIMIT).default([]),
    needs: z.array(narrative(2_000)).max(PROJECT_CONTEXT_COLLECTION_LIMIT).default([]),
    constraints: z.array(narrative(2_000)).max(PROJECT_CONTEXT_COLLECTION_LIMIT).default([]),
    businessRules: z.array(narrative(2_000)).max(PROJECT_CONTEXT_COLLECTION_LIMIT).default([]),
  })
  .strict();
export type ProjectContextGenerationContent = z.output<
  typeof projectContextGenerationContentSchema
>;

export const projectContextCandidateSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  aiRunId: z.uuid(),
  content: projectContextGenerationContentSchema,
  sourceVersionIds: z.array(z.uuid()),
  createdAt: z.iso.datetime(),
});
export type ProjectContextCandidate = z.infer<typeof projectContextCandidateSchema>;

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
  // Answers "which approved source versions support this context?" (Phase B).
  sources: z.array(
    z.object({ id: z.uuid(), versionId: z.uuid(), code: z.string(), title: z.string() }),
  ),
});

export type ProjectContextResponse = z.infer<typeof projectContextResponseSchema>;
