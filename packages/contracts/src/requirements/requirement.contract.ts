import { z } from 'zod';
export const REQUIREMENT_TYPES = ['FUNCTIONAL', 'NON_FUNCTIONAL'] as const;
export const REQUIREMENT_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
const text = (max: number) => z.string().trim().min(1, 'El valor es obligatorio.').max(max);
const list = z.array(text(500)).max(25).default([]);
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
  })
  .strict();
export const requirementInputSchema = requirementFieldsSchema.superRefine((v, c) => {
  if (new Set(v.dependencyArtifactIds).size !== v.dependencyArtifactIds.length)
    c.addIssue({
      code: 'custom',
      message: 'Las dependencias no pueden repetirse.',
      path: ['dependencyArtifactIds'],
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
  requirement: requirementFieldsSchema.omit({ dependencyArtifactIds: true }).extend({
    dependencyArtifactIds: z.array(z.uuid()),
    sourceContextVersionId: z.uuid().nullable(),
    aiRunId: z.uuid().nullable(),
  }),
});
export type RequirementResponse = z.infer<typeof requirementResponseSchema>;
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
  })
  .strict();
export const requirementGenerationOutputSchema = z
  .object({ candidates: z.array(generationCandidateSchema).min(1).max(20) })
  .strict()
  .superRefine((v, c) => {
    const ids = new Set(v.candidates.map((x) => x.candidateId));
    if (ids.size !== v.candidates.length)
      c.addIssue({ code: 'custom', message: 'candidateId debe ser único.', path: ['candidates'] });
    v.candidates.forEach((x, i) => {
      if (new Set(x.dependencyCandidateIds).size !== x.dependencyCandidateIds.length)
        c.addIssue({ code: 'custom', message: 'Dependencia duplicada.', path: ['candidates', i] });
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
export const generateRequirementsRequestSchema = z
  .object({ sourceContextVersionId: z.uuid() })
  .strict();
export const acceptRequirementsRequestSchema = z
  .object({ candidateIds: z.array(z.uuid()).min(1).max(20) })
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
