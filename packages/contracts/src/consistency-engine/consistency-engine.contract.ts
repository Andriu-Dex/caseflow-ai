import { z } from 'zod';

export const consistencyIssueSeveritySchema = z.enum(['ERROR', 'WARNING', 'OBSERVATION']);
export type ConsistencyIssueSeverity = z.infer<typeof consistencyIssueSeveritySchema>;

// The chains whose coverage DEC-121 (ADR-006) requires between stages.
export const COHERENCE_CHAINS = [
  'QUALITY_REQUIREMENT_DESIGN',
  // DEC-126: every need and business rule of the approved context reaches a
  // requirement.
  'CONTEXT_REQUIREMENT',
  'REQUIREMENT_USE_CASE_SCREEN',
  'ENTITY_CLASS_PLAN',
  'NAVIGATION_SCREEN_ROUTE',
  'ACTION_ENDPOINT',
] as const;
export type CoherenceChain = (typeof COHERENCE_CHAINS)[number];

export const consistencyIssueSchema = z.object({
  rule: z.string(),
  severity: consistencyIssueSeveritySchema,
  message: z.string(),
  affectedArtifactIds: z.array(z.string().uuid()),
  // Set on coverage gaps: the chain and the artifact type where it is fixed.
  chain: z.enum(COHERENCE_CHAINS).optional(),
  artifactType: z.string().optional(),
});
export type ConsistencyIssue = z.infer<typeof consistencyIssueSchema>;

export const consistencyReportResponseSchema = z.object({
  standard: z.string(),
  totalArtifacts: z.number().int().nonnegative(),
  // DEC-121: coverage gaps block approvals only where this is true.
  coherenceRequired: z.boolean(),
  issues: z.array(consistencyIssueSchema),
});
export type ConsistencyReportResponse = z.infer<typeof consistencyReportResponseSchema>;
