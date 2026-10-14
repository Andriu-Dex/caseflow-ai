import { z } from 'zod';
import { ARTIFACT_VERSION_STATUSES } from '../artifacts/artifact.contract';

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

// FORM and INVOICE were only labels (they were processed like any document);
// they are no longer offered for new sources but remain valid for existing
// ones, whose history cannot change.
export const LEGACY_SOURCE_KINDS = ['FORM', 'INVOICE'] as const satisfies ProjectSourceKind[];
export const SELECTABLE_SOURCE_KINDS = PROJECT_SOURCE_KINDS.filter(
  (kind) => !(LEGACY_SOURCE_KINDS as readonly string[]).includes(kind),
) as Exclude<ProjectSourceKind, (typeof LEGACY_SOURCE_KINDS)[number]>[];

export const SOURCE_FAILURE_REASONS = [
  'TOO_MANY_PAGES',
  'TOO_MANY_SCANNED_PAGES',
  'TEXT_TOO_LONG',
  'EMPTY',
  'OCR_UNAVAILABLE',
  'TRANSCRIPTION_UNAVAILABLE',
  'UNSUPPORTED_FORMAT',
  'UNREADABLE',
] as const;
export type SourceFailureReason = (typeof SOURCE_FAILURE_REASONS)[number];

// Extraction limits, shared so the UI can explain them before uploading.
// The text is kept whole (DEC-127): what reaches the AI is bounded by the
// provider's capacity, not by how much is stored. 500 000 characters only
// guards against absurd files.
export const SOURCE_LIMITS = {
  maxPdfPages: 100,
  maxScannedPdfPages: 10,
  maxExtractedCharacters: 500_000,
} as const;

export const SOURCE_EXTRACTION_STATES = [
  'PENDING',
  'EXTRACTED',
  'MANUAL',
  'UNSUPPORTED',
  'FAILED',
] as const;
export type SourceExtractionState = (typeof SOURCE_EXTRACTION_STATES)[number];

// Deterministically extractable without any AI/OCR/ASR provider (§7.1).
export const LOCALLY_EXTRACTABLE_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
// MIME types accepted at all (upload/classification is always possible even
// when automatic extraction is not — §7.2/§7.3).
export const ALLOWED_SOURCE_MIME_TYPES = [
  ...LOCALLY_EXTRACTABLE_MIME_TYPES,
  'image/png',
  'image/jpeg',
  'image/webp',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/x-m4a',
] as const;
export const SOURCE_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

const PDF_TYPES = ['application/pdf'];
const TEXT_TYPES = [
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a'];

// The file formats each kind accepts: null means any allowed format, an empty
// list means the kind is typed content only (no file).
export const SOURCE_KIND_MIME_TYPES: Record<ProjectSourceKind, readonly string[] | null> = {
  PDF: PDF_TYPES,
  TEXT: TEXT_TYPES,
  IMAGE: IMAGE_TYPES,
  AUDIO: AUDIO_TYPES,
  NOTES: [],
  OTHER: null,
  FORM: null,
  INVOICE: null,
};

export function sourceKindAcceptsMimeType(kind: ProjectSourceKind, mimeType: string): boolean {
  const accepted = SOURCE_KIND_MIME_TYPES[kind];
  return accepted === null
    ? (ALLOWED_SOURCE_MIME_TYPES as readonly string[]).includes(mimeType)
    : accepted.includes(mimeType);
}

// The kind a file of this format belongs to, or null when it is not allowed.
export function sourceKindForMimeType(
  mimeType: string,
): Exclude<ProjectSourceKind, 'NOTES' | 'OTHER' | 'FORM' | 'INVOICE'> | null {
  if (PDF_TYPES.includes(mimeType)) return 'PDF';
  if (TEXT_TYPES.includes(mimeType)) return 'TEXT';
  if (IMAGE_TYPES.includes(mimeType)) return 'IMAGE';
  if (AUDIO_TYPES.includes(mimeType)) return 'AUDIO';
  return null;
}

// What this installation can extract automatically (GET .../sources/capabilities).
export const sourceCapabilitiesResponseSchema = z.object({
  ocr: z.boolean(),
  transcription: z.boolean(),
  maxFileSizeBytes: z.number().int(),
  maxPdfPages: z.number().int(),
  maxScannedPdfPages: z.number().int(),
  maxExtractedCharacters: z.number().int(),
});
export type SourceCapabilitiesResponse = z.infer<typeof sourceCapabilitiesResponseSchema>;

const text = (max: number) => z.string().trim().min(1, 'El valor es obligatorio.').max(max);

export const sourceMetadataInputSchema = z
  .object({
    title: text(200),
    sourceKind: z.enum(PROJECT_SOURCE_KINDS),
    purpose: text(2000),
    businessArea: text(200).optional(),
    // Required by the service only when no file is uploaded. With a file,
    // this is optional context while the original content is extracted.
    description: z.string().trim().max(4000).default(''),
    language: text(20).optional(),
  })
  .strict();
export type SourceMetadataInput = z.output<typeof sourceMetadataInputSchema>;

export const manualTranscriptInputSchema = z
  .object({ transcript: text(SOURCE_LIMITS.maxExtractedCharacters) })
  .strict();
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
  processing: z
    .object({
      id: z.uuid(),
      status: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'UNSUPPORTED']),
      processor: z.string(),
      errorMessage: z.string().nullable(),
      failureReason: z.enum(SOURCE_FAILURE_REASONS).nullable(),
      updatedAt: z.iso.datetime(),
    })
    .nullable(),
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
    extractionFailureReason: z.enum(SOURCE_FAILURE_REASONS).nullable(),
    hasExtractedText: z.boolean(),
    hasReport: z.boolean(),
  }),
});
export type SourceResponse = z.infer<typeof sourceResponseSchema>;
// DEC-137: the Sources page filters and pages its list. Without parameters
// the list is complete, as other screens rely on it.
export const SOURCE_LIST_STATUSES = ['ACTIVE', 'ARCHIVED', 'ALL'] as const;
export const SOURCE_LIST_SORTS = ['CODE', 'RECENT', 'UPDATED', 'TITLE'] as const;
export const listSourcesQuerySchema = z
  .object({
    status: z.enum(SOURCE_LIST_STATUSES).default('ALL'),
    // Status of each source's latest version.
    versionStatus: z.enum(ARTIFACT_VERSION_STATUSES).optional(),
    kind: z.enum(PROJECT_SOURCE_KINDS).optional(),
    // Code or title contains this text, ignoring case and accents.
    search: z.string().trim().max(100).optional(),
    sort: z.enum(SOURCE_LIST_SORTS).default('CODE'),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();
export type ListSourcesQuery = z.input<typeof listSourcesQuerySchema>;
export const sourceListResponseSchema = z.object({
  items: z.array(sourceResponseSchema),
  // Sources matching the filters, before paging.
  total: z.number().int().min(0),
  // Every source of the project by archive status, for the filter labels.
  counts: z.object({
    ACTIVE: z.number().int().min(0),
    ARCHIVED: z.number().int().min(0),
    ALL: z.number().int().min(0),
  }),
});
export type SourceListResponse = z.infer<typeof sourceListResponseSchema>;
export const sourceTextResponseSchema = z.object({
  sourceVersionId: z.uuid(),
  text: z.string(),
});

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

// A report generated in the background (DEC-127): its progress, its error,
// and once done the AI proposal to review.
export const sourceReportJobSchema = z.object({
  id: z.uuid(),
  sourceVersionId: z.uuid(),
  status: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'UNSUPPORTED']),
  totalParts: z.number().int().nullable(),
  completedParts: z.number().int(),
  errorMessage: z.string().nullable(),
  candidate: sourceReportCandidateSchema.nullable(),
  updatedAt: z.iso.datetime(),
});
export type SourceReportJob = z.infer<typeof sourceReportJobSchema>;
export const sourceReportJobResponseSchema = z.object({ job: sourceReportJobSchema.nullable() });

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
