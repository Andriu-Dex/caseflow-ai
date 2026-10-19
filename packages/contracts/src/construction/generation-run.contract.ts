import { z } from 'zod';

// Code generation runs (spec §197). A run is started from one exact APPROVED
// Implementation Plan version; its files are immutable once generated.

export const GENERATION_RUN_STATUSES = ['QUEUED', 'GENERATING', 'GENERATED', 'FAILED'] as const;
export const GENERATED_FILE_ORIGINS = ['TEMPLATE', 'DETERMINISTIC', 'AI_ASSISTED'] as const;
export const GENERATED_FILE_KINDS = ['SOURCE', 'TEST', 'CONFIG', 'DOCUMENTATION'] as const;
export const CODE_TRACE_LINK_TYPES = ['IMPLEMENTS', 'TESTS', 'CONFIGURES'] as const;

export const startGenerationRunRequestSchema = z
  .object({ implementationPlanVersionId: z.uuid() })
  .strict();
export type StartGenerationRunRequest = z.output<typeof startGenerationRunRequestSchema>;

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
