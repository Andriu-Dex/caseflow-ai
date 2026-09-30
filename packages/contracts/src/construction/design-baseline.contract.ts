import { z } from 'zod';

// Design Gate (spec §160, DEC-094): the exact approved versions an official
// ImplementationPlan and code generation are built from.

export const DESIGN_BASELINE_ROLES = [
  'GENERATION_PLAN',
  'CONCEPTUAL_DOMAIN_MODEL',
  'NAVIGATION_TREE',
  'UI_BLUEPRINT',
  'MOCKUP',
  'SOFTWARE_ARCHITECTURE',
  'SYSTEM_ARCHITECTURE',
] as const;
export type DesignBaselineRole = (typeof DESIGN_BASELINE_ROLES)[number];

export const REQUIRED_DESIGN_BASELINE_ROLES = [
  'GENERATION_PLAN',
  'CONCEPTUAL_DOMAIN_MODEL',
  'NAVIGATION_TREE',
  'UI_BLUEPRINT',
  'MOCKUP',
] as const satisfies readonly DesignBaselineRole[];

export const createDesignBaselineRequestSchema = z
  .object({
    label: z.string().trim().min(1, 'Indique un nombre para la línea base de diseño.').max(100),
    note: z.string().trim().max(2000).optional(),
    versions: z
      .object({
        GENERATION_PLAN: z.uuid(),
        CONCEPTUAL_DOMAIN_MODEL: z.uuid(),
        NAVIGATION_TREE: z.uuid(),
        UI_BLUEPRINT: z.uuid(),
        MOCKUP: z.uuid(),
        SOFTWARE_ARCHITECTURE: z.uuid().optional(),
        SYSTEM_ARCHITECTURE: z.uuid().optional(),
      })
      .strict(),
  })
  .strict();
export type CreateDesignBaselineRequest = z.output<typeof createDesignBaselineRequestSchema>;

export const designBaselineEntryResponseSchema = z.object({
  role: z.enum(DESIGN_BASELINE_ROLES),
  artifactId: z.uuid(),
  artifactVersionId: z.uuid(),
  code: z.string(),
  title: z.string(),
  versionNumber: z.number().int(),
});

export const designBaselineResponseSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  label: z.string(),
  note: z.string().nullable(),
  approvedByUserId: z.uuid(),
  createdAt: z.iso.datetime(),
  entries: z.array(designBaselineEntryResponseSchema),
});
export type DesignBaselineResponse = z.infer<typeof designBaselineResponseSchema>;
export const designBaselineListResponseSchema = z.object({
  items: z.array(designBaselineResponseSchema),
});

// An Implementation Plan is generated from one approved Design Baseline
// (DEC-095): its frozen versions are the only sources.
export const generateImplementationPlanRequestSchema = z
  .object({ designBaselineId: z.uuid() })
  .strict();

// Deterministic, read-only preview of what the plan will generate.
export const implementationPlanArtifactsResponseSchema = z.object({
  databaseSchema: z.string(),
  openApi: z.record(z.string(), z.unknown()),
});
export type ImplementationPlanArtifactsResponse = z.infer<
  typeof implementationPlanArtifactsResponseSchema
>;
