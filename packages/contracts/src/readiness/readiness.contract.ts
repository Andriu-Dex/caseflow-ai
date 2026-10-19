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
  'CLASS_DIAGRAM',
  'NAVIGATION',
  'SOFTWARE_ARCHITECTURE',
  'SYSTEM_ARCHITECTURE',
  'UI_BLUEPRINT',
  'DESIGN_THEME',
  'MOCKUPS',
  'IMPACT',
] as const;
export type ReadinessStageKey = (typeof READINESS_STAGE_KEYS)[number];
export const PIPELINE_ORDER = READINESS_STAGE_KEYS.filter(
  (stage): stage is Exclude<ReadinessStageKey, 'IMPACT'> => stage !== 'IMPACT',
);
export const PIPELINE_LABELS: Record<(typeof PIPELINE_ORDER)[number], string> = {
  SOURCES: 'Fuentes',
  CONTEXT: 'Contexto del proyecto',
  REQUIREMENTS: 'Requisitos',
  USE_CASES: 'Casos de uso',
  USE_CASE_DIAGRAM: 'Diagrama de casos de uso',
  DATA_MODEL: 'Modelo de datos',
  ER_DIAGRAM: 'Diagrama ER',
  CLASS_DIAGRAM: 'Diagrama de clases',
  NAVIGATION: 'Navegación',
  SOFTWARE_ARCHITECTURE: 'Arquitectura de software',
  SYSTEM_ARCHITECTURE: 'Arquitectura de sistema',
  UI_BLUEPRINT: 'Plano de interfaz',
  DESIGN_THEME: 'Tema y colores',
  MOCKUPS: 'Bocetos',
};
export const confirmStageRequestSchema = z
  .object({ note: z.string().trim().max(500).optional() })
  .strict();

export const readinessStageSchema = z.object({
  key: z.enum(READINESS_STAGE_KEYS),
  label: z.string(),
  satisfied: z.boolean(),
  currency: z.enum(['CURRENT', 'OUTDATED', 'BLOCKED']).optional(),
  reviewedAt: z.iso.datetime().optional(),
  outdatedSince: z
    .object({ stage: z.enum(READINESS_STAGE_KEYS), approvedAt: z.iso.datetime() })
    .optional(),
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
