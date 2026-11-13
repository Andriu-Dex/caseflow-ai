import { z } from 'zod';

// Code generation runs (spec §197). A run is started from one exact APPROVED
// Implementation Plan version; its files are immutable once generated.

export const GENERATION_RUN_STATUSES = [
  'QUEUED',
  'GENERATING',
  'GENERATED',
  'FAILED',
  'WORKING_COPY',
] as const;
export const GENERATED_FILE_ORIGINS = ['TEMPLATE', 'DETERMINISTIC', 'AI_ASSISTED', 'MANUAL'] as const;
export const GENERATED_FILE_KINDS = ['SOURCE', 'TEST', 'CONFIG', 'DOCUMENTATION'] as const;
export const CODE_TRACE_LINK_TYPES = ['IMPLEMENTS', 'TESTS', 'CONFIGURES'] as const;

export const startGenerationRunRequestSchema = z
  .object({ implementationPlanVersionId: z.uuid() })
  .strict();
export type StartGenerationRunRequest = z.output<typeof startGenerationRunRequestSchema>;

export const createWorkingCopyRequestSchema = z
  .object({
    implementationPlanVersionId: z.uuid(),
    reason: z.string().trim().min(1).max(2000),
    revisions: z
      .array(
        z
          .object({
            endpoint: z.string().min(1).max(500),
            sourceFileId: z.uuid(),
            expectedSha256: z.string().regex(/^[a-f0-9]{64}$/),
            body: z.string().trim().min(1).max(20000),
          })
          .strict(),
      )
      .max(100)
      .default([]),
  })
  .strict();
export type CreateWorkingCopyRequest = z.output<typeof createWorkingCopyRequestSchema>;

// Read-only projection of the stored manifest; not a claim of functional validation.
export const workingCopyManifestSummarySchema = z
  .object({
    formatVersion: z.literal(1),
    officialDelivery: z.literal(false),
    implementationPlanVersionId: z.uuid(),
    designBaselineId: z.uuid(),
    implementedEndpoints: z.array(z.string().max(500)).max(1000),
    pendingEndpoints: z.array(z.string().max(500)).max(1000),
  })
  .refine(
    (value) =>
      new Set([...value.implementedEndpoints, ...value.pendingEndpoints]).size ===
      value.implementedEndpoints.length + value.pendingEndpoints.length,
  );
export type WorkingCopyManifestSummary = z.infer<typeof workingCopyManifestSummarySchema>;

export const generationRunResponseSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  implementationPlanVersionId: z.uuid(),
  designBaselineId: z.uuid(),
  targetTemplateIdentifier: z.string(),
  targetTemplateVersion: z.number().int(),
  status: z.enum(GENERATION_RUN_STATUSES),
  errorMessage: z.string().nullable(),
  warnings: z.array(z.string()),
  fileCount: z.number().int(),
  createdByUserId: z.uuid(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  // Hidden from the list; the run stays as history and can be restored.
  archivedAt: z.iso.datetime().nullable(),
});
export type GenerationRunResponse = z.infer<typeof generationRunResponseSchema>;
export const generationRunListResponseSchema = z.object({
  items: z.array(generationRunResponseSchema),
});

export const generatedFileSummarySchema = z.object({
  id: z.uuid(),
  path: z.string(),
  origin: z.enum(GENERATED_FILE_ORIGINS),
  kind: z.enum(GENERATED_FILE_KINDS),
  sha256: z.string(),
  size: z.number().int(),
});
export type GeneratedFileSummary = z.infer<typeof generatedFileSummarySchema>;

// ADR-020: generated code grouped by construction unit.
export const CONSTRUCTION_UNIT_KINDS = ['SCREEN', 'ACTION', 'ENTITY', 'MODULE', 'PROJECT'] as const;
export const constructionUnitSchema = z.object({
  id: z.string(),
  kind: z.enum(CONSTRUCTION_UNIT_KINDS),
  title: z.string(),
  module: z.string().optional(),
  summary: z.string(),
  origins: z.object({
    TEMPLATE: z.number().int(),
    DETERMINISTIC: z.number().int(),
    AI_ASSISTED: z.number().int(),
    MANUAL: z.number().int(),
  }),
  traces: z.array(z.object({ code: z.string(), versionNumber: z.number().int() })),
  files: z.array(
    z.object({
      id: z.uuid(),
      path: z.string(),
      origin: z.enum(GENERATED_FILE_ORIGINS),
      kind: z.enum(GENERATED_FILE_KINDS),
    }),
  ),
});
export type ConstructionUnit = z.infer<typeof constructionUnitSchema>;
export const constructionUnitListResponseSchema = z.object({ items: z.array(constructionUnitSchema) });
export type ConstructionUnitListResponse = z.infer<typeof constructionUnitListResponseSchema>;
export const generatedFileListResponseSchema = z.object({
  items: z.array(generatedFileSummarySchema),
});

export const generatedFileResponseSchema = generatedFileSummarySchema.extend({
  content: z.string(),
  traceLinks: z.array(
    z.object({
      sourceArtifactVersionId: z.uuid(),
      code: z.string(),
      versionNumber: z.number().int(),
      planElement: z.string(),
      linkType: z.enum(CODE_TRACE_LINK_TYPES),
    }),
  ),
});
export type GeneratedFileResponse = z.infer<typeof generatedFileResponseSchema>;
