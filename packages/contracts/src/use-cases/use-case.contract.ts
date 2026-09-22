import { z } from 'zod';

export const USE_CASE_CANDIDATE_LIMIT = 20;
export const USE_CASE_FLOW_STEP_LIMIT = 100;
const text = (max: number) => z.string().trim().min(1, 'El valor es obligatorio.').max(max);
const orderedText = z.array(text(2000)).max(50).default([]);
const flowStepSchema = z.object({ actor: text(200), action: text(2000) }).strict();
const alternativeFlowSchema = z
  .object({ name: text(200), condition: text(2000), steps: z.array(flowStepSchema).min(1).max(50) })
  .strict();

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
  .omit({ relatedRequirementVersionIds: true })
  .extend({ candidateId: text(80), relatedRequirementSourceIds: z.array(text(80)).min(1).max(50) })
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
  });
export const generateUseCasesRequestSchema = z
  .object({ requirementVersionIds: z.array(z.uuid()).min(1).max(50) })
  .strict();
export const acceptUseCasesRequestSchema = z
  .object({ candidateIds: z.array(z.uuid()).min(1).max(USE_CASE_CANDIDATE_LIMIT) })
  .strict();
export const useCaseAcademicValidationResponseSchema = z.object({
  acceptedCount: z.number().int().nonnegative(),
  minimumRequired: z.literal(4),
  satisfied: z.boolean(),
});
