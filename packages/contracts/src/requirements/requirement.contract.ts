import { z } from 'zod';
export const REQUIREMENT_TYPES = ['FUNCTIONAL', 'NON_FUNCTIONAL'] as const;
export type RequirementType = (typeof REQUIREMENT_TYPES)[number];
export const REQUIREMENT_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type RequirementPriority = (typeof REQUIREMENT_PRIORITIES)[number];
const text = (max: number) => z.string().trim().min(1, 'El valor es obligatorio.').max(max);
const list = z.array(text(500)).max(25).default([]);

// Project Context items are cited by a code derived from their position in
// the context version (DEC-126): N-1 (need), RES-1 (constraint), RN-1
// (business rule).
export const CONTEXT_ITEM_KINDS = ['NEED', 'CONSTRAINT', 'BUSINESS_RULE'] as const;
export type ContextItemKind = (typeof CONTEXT_ITEM_KINDS)[number];
export const CONTEXT_ITEM_PREFIXES: Record<ContextItemKind, string> = {
  NEED: 'N',
  CONSTRAINT: 'RES',
  BUSINESS_RULE: 'RN',
};
export const contextItemCode = (kind: ContextItemKind, position: number) =>
  `${CONTEXT_ITEM_PREFIXES[kind]}-${position + 1}`;
// Needs and business rules must be covered by some requirement; constraints
// are shown but do not block.
export const isMandatoryContextItem = (kind: ContextItemKind) => kind !== 'CONSTRAINT';
export const contextItemRefSchema = z.object({
  id: z.uuid(),
  kind: z.enum(CONTEXT_ITEM_KINDS),
  code: z.string(),
  description: z.string(),
  contextVersionId: z.uuid(),
});
export type ContextItemRef = z.infer<typeof contextItemRefSchema>;

// Why a requirement exists: the context items it answers, or the user's own
// decision with a justification.
export const REQUIREMENT_ORIGIN_KINDS = ['CONTEXT', 'USER_DECISION'] as const;
export const requirementOriginInputSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('CONTEXT'),
      contextItemIds: z
        .array(z.uuid())
        .min(1, 'Seleccione al menos un elemento del contexto.')
        .max(300),
    })
    .strict(),
  z
    .object({
      kind: z.literal('USER_DECISION'),
      justification: text(1000),
    })
    .strict(),
]);
export type RequirementOriginInput = z.output<typeof requirementOriginInputSchema>;
export const requirementOriginSchema = z.object({
  kind: z.enum(REQUIREMENT_ORIGIN_KINDS),
  justification: z.string().nullable(),
  contextItems: z.array(contextItemRefSchema),
});
export type RequirementOrigin = z.infer<typeof requirementOriginSchema>;
const requirementFieldsSchema = z
  .object({
    requirementType: z.enum(REQUIREMENT_TYPES),
    name: text(200),
    description: text(4000),
    priority: z.enum(REQUIREMENT_PRIORITIES),
    actors: z.array(text(200)).max(25).default([]),
    preconditions: list,
    postconditions: list,
    dependencyArtifactIds: z.array(z.uuid()).max(25).default([]),
    // Null only while the requirement is a draft without a declared origin.
    origin: requirementOriginInputSchema.nullable().default(null),
  })
  .strict();
export const requirementInputSchema = requirementFieldsSchema.superRefine((v, c) => {
  if (new Set(v.dependencyArtifactIds).size !== v.dependencyArtifactIds.length)
    c.addIssue({
      code: 'custom',
      message: 'Las dependencias no pueden repetirse.',
      path: ['dependencyArtifactIds'],
    });
  if (
    v.origin?.kind === 'CONTEXT' &&
    new Set(v.origin.contextItemIds).size !== v.origin.contextItemIds.length
  )
    c.addIssue({
      code: 'custom',
      message: 'Los elementos del contexto no pueden repetirse.',
      path: ['origin', 'contextItemIds'],
    });
});
export type RequirementInput = z.output<typeof requirementInputSchema>;
export const requirementResponseSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  code: z.string(),
  createdAt: z.iso.datetime(),
  version: z.object({
    id: z.uuid(),
    versionNumber: z.number().int(),
    status: z.enum(['DRAFT', 'GENERATED', 'IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED']),
    origin: z.enum(['MANUAL', 'AI_GENERATED', 'AI_ASSISTED', 'IMPORTED']),
    createdAt: z.iso.datetime(),
  }),
  requirement: requirementFieldsSchema.omit({ dependencyArtifactIds: true, origin: true }).extend({
    dependencyArtifactIds: z.array(z.uuid()),
    sourceContextVersionId: z.uuid().nullable(),
    aiRunId: z.uuid().nullable(),
    origin: requirementOriginSchema.nullable(),
  }),
});
export type RequirementResponse = z.infer<typeof requirementResponseSchema>;

// How the context items are covered by requirements: by the proposals of a
// generation, or by the project's current requirements.
export const requirementCoverageItemSchema = contextItemRefSchema.extend({
  mandatory: z.boolean(),
  coveredBy: z.array(z.string()),
});
export type RequirementCoverageItem = z.infer<typeof requirementCoverageItemSchema>;
export const requirementContextCoverageResponseSchema = z.object({
  // The latest approved Project Context version, if any.
  context: z
    .object({
      artifactId: z.uuid(),
      versionId: z.uuid(),
      versionNumber: z.number().int(),
      code: z.string(),
    })
    .nullable(),
  items: z.array(requirementCoverageItemSchema),
  // Requirements that declare no origin yet (written before DEC-126).
  withoutOrigin: z.array(z.object({ id: z.uuid(), code: z.string() })),
});
export type RequirementContextCoverageResponse = z.infer<
  typeof requirementContextCoverageResponseSchema
>;
export const requirementListResponseSchema = z.object({
  items: z.array(requirementResponseSchema),
});
export const generationCandidateSchema = z
  .object({
    candidateId: text(80),
    requirementType: z.enum(REQUIREMENT_TYPES),
    name: text(200),
    description: text(4000),
    priority: z.enum(REQUIREMENT_PRIORITIES),
    actors: z.array(text(200)).max(25).default([]),
    preconditions: list,
    postconditions: list,
    dependencyCandidateIds: z.array(text(80)).max(20).default([]),
    // Codes of the context items this requirement answers (N-1, RES-2, RN-3).
    contextItemCodes: z.array(text(20)).max(15).default([]),
  })
  .strict();
// An idea beyond the context that would improve the software; the user
// decides whether to include it (DEC-126).
export const generationSuggestionSchema = z
  .object({
    candidateId: text(80),
    requirementType: z.enum(REQUIREMENT_TYPES),
    name: text(200),
    description: text(4000),
    priority: z.enum(REQUIREMENT_PRIORITIES),
    actors: z.array(text(200)).max(25).default([]),
    preconditions: list,
    postconditions: list,
    dependencyCandidateIds: z.array(text(80)).max(20).default([]),
    rationale: text(1000),
  })
  .strict();
export const MAX_REQUIREMENT_SUGGESTIONS = 5;
export const MAX_GENERATED_REQUIREMENTS = 500;
const generationOutput = (limit: number) =>
  z
    .object({
      candidates: z
        .array(
          generationCandidateSchema.extend({
            contextItemCodes: z.array(text(20)).max(300).default([]),
          }),
        )
        .min(1)
        .max(limit),
      suggestions: z.array(generationSuggestionSchema).max(MAX_REQUIREMENT_SUGGESTIONS).default([]),
    })
    .strict()
    .superRefine((output, c) => {
      const suggested = new Set(output.suggestions.map((x) => x.candidateId));
      const v = { candidates: [...output.candidates, ...output.suggestions] };
      const ids = new Set(v.candidates.map((x) => x.candidateId));
      if (ids.size !== v.candidates.length)
        c.addIssue({
          code: 'custom',
          message: 'candidateId debe ser único.',
          path: ['candidates'],
        });
      // A requirement derived from the context never needs an optional idea.
      output.candidates.forEach((x, i) => {
        if (x.dependencyCandidateIds.some((d) => suggested.has(d)))
          c.addIssue({
            code: 'custom',
            message: 'Un requisito no puede depender de una sugerencia.',
            path: ['candidates', i],
          });
      });
      v.candidates.forEach((x, i) => {
        if (new Set(x.dependencyCandidateIds).size !== x.dependencyCandidateIds.length)
          c.addIssue({
            code: 'custom',
            message: 'Dependencia duplicada.',
            path: ['candidates', i],
          });
        for (const d of x.dependencyCandidateIds) {
          if (d === x.candidateId)
            c.addIssue({
              code: 'custom',
              message: 'Autodependencia no permitida.',
              path: ['candidates', i],
            });
          else if (!ids.has(d))
            c.addIssue({
              code: 'custom',
              message: 'Dependencia inexistente.',
              path: ['candidates', i],
            });
        }
      });
      const graph = new Map(v.candidates.map((x) => [x.candidateId, x.dependencyCandidateIds]));
      const visiting = new Set<string>();
      const visited = new Set<string>();
      const cyclic = (id: string): boolean => {
        if (visiting.has(id)) return true;
        if (visited.has(id)) return false;
        visiting.add(id);
        for (const next of graph.get(id) ?? []) if (cyclic(next)) return true;
        visiting.delete(id);
        visited.add(id);
        return false;
      };
      if (v.candidates.some((x) => cyclic(x.candidateId)))
        c.addIssue({
          code: 'custom',
          message: 'Las dependencias no pueden formar ciclos.',
          path: ['candidates'],
        });
    });
// The historical single-response contract remains bounded to twenty.
export const requirementGenerationOutputSchema = generationOutput(20);
export const completeRequirementGenerationOutputSchema = generationOutput(
  MAX_GENERATED_REQUIREMENTS,
);
export const requirementBatchOutputSchema = z
  .object({
    candidates: z.array(generationCandidateSchema).max(20),
    suggestions: z.array(generationSuggestionSchema).max(MAX_REQUIREMENT_SUGGESTIONS).default([]),
    coverageUpdates: z
      .array(
        z
          .object({
            candidateId: text(80),
            contextItemCodes: z.array(text(20)).min(1).max(15),
            description: text(4000),
          })
          .strict(),
      )
      .max(20)
      .default([]),
  })
  .strict();
export const requirementDependencyOutputSchema = z
  .object({
    dependencies: z
      .array(z.object({ candidateId: text(80), dependsOnCandidateId: text(80) }).strict())
      .max(2000),
  })
  .strict();
export const requirementGenerationJobSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  sourceContextVersionId: z.uuid(),
  status: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED']),
  completedBatches: z.number().int().nonnegative(),
  totalBatches: z.number().int().nonnegative(),
  outputChars: z.number().int().nonnegative(),
  generationId: z.uuid().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type RequirementGenerationJob = z.infer<typeof requirementGenerationJobSchema>;
export const generateRequirementsRequestSchema = z
  .object({ sourceContextVersionId: z.uuid() })
  .strict();
export const acceptRequirementsRequestSchema = z
  .object({
    candidateIds: z
      .array(z.uuid())
      .min(1)
      .max(MAX_GENERATED_REQUIREMENTS + MAX_REQUIREMENT_SUGGESTIONS),
  })
  .strict();
export const transitionArtifactVersionRequestSchema = z
  .object({ status: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED']) })
  .strict();

export const REQUIREMENT_QUALITY_RULES = [
  'BLANK_DESCRIPTION',
  'PLACEHOLDER_TEXT',
  'DUPLICATE_DEPENDENCY',
  'SELF_DEPENDENCY',
  'UNRESOLVED_DEPENDENCY',
  'MISSING_PROVENANCE',
  'POSSIBLE_MULTI_OBLIGATION',
  'DUPLICATE_NAME',
] as const;
// Deterministic checks only, never a standards-certification claim (spec §4.3).
export const requirementQualityReportResponseSchema = z.object({
  standard: z.literal('ISO/IEC/IEEE 29148:2018-aligned'),
  totalRequirements: z.number().int().nonnegative(),
  issues: z.array(
    z.object({
      requirementId: z.uuid(),
      code: z.string(),
      rule: z.enum(REQUIREMENT_QUALITY_RULES),
      message: z.string(),
    }),
  ),
});
