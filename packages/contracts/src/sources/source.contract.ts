import { z } from 'zod';

// Semantic source kind (what the object represents), never inferred solely
// from MIME type/extension (requirements.md §6.3).
export const PROJECT_SOURCE_KINDS = [
  'PDF',
  'AUDIO',
  'IMAGE',
  'FORM',
  'INVOICE',
  'TEXT',
  'NOTES',
  'OTHER',
] as const;
export type ProjectSourceKind = (typeof PROJECT_SOURCE_KINDS)[number];

export const SOURCE_EXTRACTION_STATES = [
  'PENDING',
  'EXTRACTED',
  'MANUAL',
  'UNSUPPORTED',
  'FAILED',
] as const;
export type SourceExtractionState = (typeof SOURCE_EXTRACTION_STATES)[number];

// Deterministically extractable without any AI/OCR/ASR provider (§7.1).
export const LOCALLY_EXTRACTABLE_MIME_TYPES = ['text/plain', 'text/markdown', 'application/pdf'];
// MIME types accepted at all (upload/classification is always possible even
// when automatic extraction is not — §7.2/§7.3).
export const ALLOWED_SOURCE_MIME_TYPES = [
  ...LOCALLY_EXTRACTABLE_MIME_TYPES,
  'image/png',
  'image/jpeg',
  'image/webp',
  'audio/mpeg',
  'audio/wav',
  'audio/mp4',
  'audio/x-m4a',
] as const;
export const SOURCE_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

const text = (max: number) => z.string().trim().min(1, 'El valor es obligatorio.').max(max);

export const sourceMetadataInputSchema = z
  .object({
    title: text(200),
    sourceKind: z.enum(PROJECT_SOURCE_KINDS),
    purpose: text(2000),
    businessArea: text(200).optional(),
    // Required: the source's typed content. When no file is uploaded, this
    // becomes the source's sole extractedText (manual-transcript mechanism).
    description: text(4000),
    language: text(20).optional(),
  })
  .strict();
export type SourceMetadataInput = z.output<typeof sourceMetadataInputSchema>;

export const manualTranscriptInputSchema = z.object({ transcript: text(50_000) }).strict();
export type ManualTranscriptInput = z.output<typeof manualTranscriptInputSchema>;

const versionSchema = z.object({
  id: z.uuid(),
  versionNumber: z.number().int(),
  status: z.enum(['DRAFT', 'GENERATED', 'IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED']),
  origin: z.enum(['MANUAL', 'AI_GENERATED', 'AI_ASSISTED', 'SYSTEM_GENERATED', 'IMPORTED']),
  createdAt: z.iso.datetime(),
});

export const sourceResponseSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  code: z.string(),
  createdAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
  // Whether any version of this Source ever reached APPROVED — determines
  // whether it can still be hard-deleted or must be archived instead
  // (spec §87: "fuentes utilizadas → archivar antes que borrar").
  hasApprovedHistory: z.boolean(),
  version: versionSchema,
  source: z.object({
    title: z.string(),
    sourceKind: z.enum(PROJECT_SOURCE_KINDS),
    purpose: z.string(),
    businessArea: z.string().nullable(),
    description: z.string(),
    originalFilename: z.string().nullable(),
    mimeType: z.string().nullable(),
    sizeBytes: z.number().int().nullable(),
    contentHash: z.string().nullable(),
    language: z.string().nullable(),
    extractionState: z.enum(SOURCE_EXTRACTION_STATES),
    hasExtractedText: z.boolean(),
    hasReport: z.boolean(),
  }),
});
export type SourceResponse = z.infer<typeof sourceResponseSchema>;
export const sourceListResponseSchema = z.object({ items: z.array(sourceResponseSchema) });

const reportContentSchema = z
  .object({
    summary: text(4000),
    actors: z.array(text(200)).max(50).default([]),
    businessConcepts: z.array(text(500)).max(100).default([]),
    candidateBusinessRules: z.array(text(1000)).max(100).default([]),
    candidateConstraints: z.array(text(1000)).max(100).default([]),
    needs: z.array(text(1000)).max(100).default([]),
    importantFacts: z.array(text(1000)).max(100).default([]),
    ambiguities: z.array(text(1000)).max(100).default([]),
  })
  .strict();
export type SourceReportContent = z.output<typeof reportContentSchema>;
export const sourceReportContentSchema = reportContentSchema;

export const sourceReportResponseSchema = z.object({
  sourceVersionId: z.uuid(),
  content: reportContentSchema,
  generationCandidateId: z.uuid().nullable(),
  aiRunId: z.uuid().nullable(),
});
export type SourceReportResponse = z.infer<typeof sourceReportResponseSchema>;

// The AI-proposed candidate returned by report/generate — distinct from
// SourceReportResponse (the official, human-accepted report). Never
// auto-persisted; must go through report/accept.
export const sourceReportCandidateSchema = z.object({
  id: z.uuid(),
  sourceVersionId: z.uuid(),
  aiRunId: z.uuid(),
  content: reportContentSchema,
  createdAt: z.string(),
});
export type SourceReportCandidate = z.infer<typeof sourceReportCandidateSchema>;

export const manualSourceReportInputSchema = z.object({ content: reportContentSchema }).strict();

export const sourceReportCandidateResponseSchema = z.object({
  id: z.uuid(),
  sourceVersionId: z.uuid(),
  aiRunId: z.uuid(),
  content: reportContentSchema,
  createdAt: z.iso.datetime(),
});
export const acceptSourceReportCandidateRequestSchema = z
  .object({ candidateId: z.uuid() })
  .strict();
