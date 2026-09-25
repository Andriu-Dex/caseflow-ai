import { z } from 'zod';

// Deterministic First Deliverable readiness (requirements.md Phase G).
// Read-only: never creates/approves artifacts, never mutates lifecycle.
export const READINESS_STAGE_KEYS = [
  'SOURCES',
  'CONTEXT',
  'REQUIREMENTS',
  'USE_CASES',
  'USE_CASE_DIAGRAM',
  'DATA_MODEL',
  'ER_DIAGRAM',
  'NAVIGATION',
  'SOFTWARE_ARCHITECTURE',
  'SYSTEM_ARCHITECTURE',
  'UI_BLUEPRINT',
  'MOCKUPS',
  'IMPACT',
] as const;
export type ReadinessStageKey = (typeof READINESS_STAGE_KEYS)[number];

export const readinessStageSchema = z.object({
  key: z.enum(READINESS_STAGE_KEYS),
  label: z.string(),
  satisfied: z.boolean(),
  summary: z.string(),
  counts: z.record(z.string(), z.number().int()).optional(),
  evidence: z.record(z.string(), z.string()).optional(),
  blockers: z.array(z.string()),
  warnings: z.array(z.string()),
  nextAction: z.string().nullable(),
});
export type ReadinessStage = z.infer<typeof readinessStageSchema>;

export const readinessResponseSchema = z.object({
  projectId: z.uuid(),
  generatedAt: z.iso.datetime(),
  ready: z.boolean(),
  stages: z.array(readinessStageSchema),
  blockers: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
