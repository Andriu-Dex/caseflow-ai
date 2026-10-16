import { z } from 'zod';

export const USE_CASE_CANDIDATE_LIMIT = 20;

// DEC-138: one action over several use cases, all of them or none.
export const USE_CASE_BULK_ACTIONS = ['APPROVE', 'ARCHIVE', 'DELETE'] as const;
export type UseCaseBulkAction = (typeof USE_CASE_BULK_ACTIONS)[number];
export const useCaseBulkRequestSchema = z
  .object({
    action: z.enum(USE_CASE_BULK_ACTIONS),
    useCaseIds: z
      .array(z.uuid())
      .min(1)
      .max(500)
      .refine((ids) => new Set(ids).size === ids.length, 'Los casos de uso no pueden repetirse.'),
  })
  .strict();
export const useCaseBulkResponseSchema = z.object({
  // Use cases the action changed, and those it left as they were (already
  // approved or already archived).
  affected: z.number().int().min(0),
  skipped: z.number().int().min(0),
});
export type UseCaseBulkResponse = z.infer<typeof useCaseBulkResponseSchema>;
export const USE_CASE_FLOW_STEP_LIMIT = 100;
const text = (max: number) => z.string().trim().min(1, 'El valor es obligatorio.').max(max);
const orderedText = z.array(text(2000)).max(50).default([]);
const flowStepSchema = z.object({ actor: text(200), action: text(2000) }).strict();
const alternativeFlowSchema = z
  .object({ name: text(200), condition: text(2000), steps: z.array(flowStepSchema).min(1).max(50) })
  .strict();

// UML relationships between use cases (DEC-129). The use case that carries
// the relation is its origin: an INCLUDE points to the behaviour it always
// reuses, an EXTEND to the base use case it optionally extends.
export const USE_CASE_RELATION_KINDS = ['INCLUDE', 'EXTEND'] as const;
export type UseCaseRelationKind = (typeof USE_CASE_RELATION_KINDS)[number];
const relationKind = z.enum(USE_CASE_RELATION_KINDS);
const relationSchema = z.object({ kind: relationKind, targetUseCaseId: z.uuid() }).strict();
const candidateRelationSchema = z
  .object({ kind: relationKind, targetCandidateId: text(80) })
  .strict();
const uniqueTargets =
  <T>(key: (item: T) => string, message: string) =>
  (items: T[], context: z.RefinementCtx) => {
    const keys = items.map(key);
    if (new Set(keys).size !== keys.length) context.addIssue({ code: 'custom', message });
  };

const useCaseFieldsSchema = z
  .object({
    name: text(200),
    objective: text(4000),
    primaryActor: text(200),
    secondaryActors: z.array(text(200)).max(25).default([]),
    preconditions: orderedText,
    postconditions: orderedText,
    mainFlow: z.array(flowStepSchema).min(1).max(USE_CASE_FLOW_STEP_LIMIT),
    alternativeFlows: z.array(alternativeFlowSchema).max(25).default([]),
    relatedRequirementVersionIds: z.array(z.uuid()).min(1).max(50),
    relations: z
      .array(relationSchema)
      .max(25)
      .default([])
      .superRefine(
        uniqueTargets(
          (r) => r.targetUseCaseId,
          'Un caso de uso solo puede relacionarse una vez con otro.',
        ),
      ),
  })
  .strict();

export const useCaseInputSchema = useCaseFieldsSchema.superRefine((value, context) => {
  if (
    new Set(value.relatedRequirementVersionIds).size !== value.relatedRequirementVersionIds.length
  )
    context.addIssue({
      code: 'custom',
      message: 'Los requisitos no pueden repetirse.',
      path: ['relatedRequirementVersionIds'],
    });
});
export type UseCaseInput = z.output<typeof useCaseInputSchema>;

const versionSchema = z.object({
  id: z.uuid(),
  versionNumber: z.number().int(),
  status: z.enum(['DRAFT', 'GENERATED', 'IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED']),
  origin: z.enum(['MANUAL', 'AI_GENERATED', 'AI_ASSISTED', 'IMPORTED']),
  createdAt: z.iso.datetime(),
});
export const useCaseResponseSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  code: z.string(),
  createdAt: z.iso.datetime(),
  version: versionSchema,
  useCase: useCaseFieldsSchema.extend({
    generationId: z.uuid().nullable(),
    candidateId: z.uuid().nullable(),
    aiRunId: z.uuid().nullable(),
  }),
});
export type UseCaseResponse = z.infer<typeof useCaseResponseSchema>;
export const useCaseListResponseSchema = z.object({ items: z.array(useCaseResponseSchema) });

export const useCaseGenerationCandidateSchema = useCaseFieldsSchema
  .omit({ relatedRequirementVersionIds: true, relations: true })
  .extend({
    candidateId: text(80),
    relatedRequirementSourceIds: z.array(text(80)).min(1).max(50),
    relations: z.array(candidateRelationSchema).max(25).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new Set(value.relatedRequirementSourceIds).size !== value.relatedRequirementSourceIds.length
    )
      context.addIssue({
        code: 'custom',
        message: 'Las referencias no pueden repetirse.',
        path: ['relatedRequirementSourceIds'],
      });
  });
export const useCaseGenerationOutputSchema = z
  .object({
    candidates: z.array(useCaseGenerationCandidateSchema).min(1).max(USE_CASE_CANDIDATE_LIMIT),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.candidates.map((candidate) => candidate.candidateId);
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: 'custom',
        message: 'candidateId debe ser único.',
        path: ['candidates'],
      });
    value.candidates.forEach((candidate, index) => {
      const targets = candidate.relations.map((r) => r.targetCandidateId);
      if (
        new Set(targets).size !== targets.length ||
        targets.some((target) => target === candidate.candidateId || !ids.includes(target))
      )
        context.addIssue({
          code: 'custom',
          message:
            'Cada relación debe apuntar, una sola vez, a otro candidato de la misma respuesta.',
          path: ['candidates', index, 'relations'],
        });
    });
  });
// DEC-139: a batch proposes use cases for a few requirements and may relate
// them to proposals of earlier batches, so a relation target is checked
// against the whole accumulated set, not against this response alone.
export const useCaseBatchOutputSchema = z
  .object({ candidates: z.array(useCaseGenerationCandidateSchema).max(USE_CASE_CANDIDATE_LIMIT) })
  .strict()
  .superRefine((value, context) => {
    const ids = value.candidates.map((candidate) => candidate.candidateId);
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: 'custom',
        message: 'candidateId debe ser único.',
        path: ['candidates'],
      });
  });
export const USE_CASE_GENERATION_SELECTION_LIMIT = 500;
export const startUseCaseGenerationRequestSchema = z
  .object({
    requirementVersionIds: z
      .array(z.uuid())
      .min(1)
      .max(USE_CASE_GENERATION_SELECTION_LIMIT)
      .refine((ids) => new Set(ids).size === ids.length, 'Los requisitos no pueden repetirse.'),
  })
  .strict();
export const useCaseGenerationJobSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  status: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED']),
  completedBatches: z.number().int().nonnegative(),
  totalBatches: z.number().int().nonnegative(),
  outputChars: z.number().int().nonnegative(),
  generationId: z.uuid().nullable(),
  errorMessage: z.string().nullable(),
  requirementVersionIds: z.array(z.uuid()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type UseCaseGenerationJob = z.infer<typeof useCaseGenerationJobSchema>;
export const generateUseCasesRequestSchema = z
  .object({ requirementVersionIds: z.array(z.uuid()).min(1).max(50) })
  .strict();
export const acceptUseCasesRequestSchema = z
  .object({ candidateIds: z.array(z.uuid()).min(1).max(USE_CASE_GENERATION_SELECTION_LIMIT) })
  .strict();
export const useCaseAcademicValidationResponseSchema = z.object({
  acceptedCount: z.number().int().nonnegative(),
  minimumRequired: z.literal(4),
  satisfied: z.boolean(),
});
