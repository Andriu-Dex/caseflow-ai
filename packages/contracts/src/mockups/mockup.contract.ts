import { z } from 'zod';
import { ARTIFACT_ORIGINS, ARTIFACT_VERSION_STATUSES } from '../artifacts/artifact.contract';

export const MOCKUP_DEVICE_TYPES = ['DESKTOP', 'MOBILE'] as const;
export type MockupDeviceType = (typeof MOCKUP_DEVICE_TYPES)[number];

// A Mockup derives from an exact APPROVED UI_BLUEPRINT version. Stitch can
// generate screen assets; the internal deterministic wireframe is the fallback.
// DEC-167: who draws the screens. STITCH is the image provider; HTML_CSS has
// the project's AI write each screen as HTML on CASEFlow's own page.
export const MOCKUP_GENERATORS = ['STITCH', 'HTML_CSS'] as const;
export type MockupGenerator = (typeof MOCKUP_GENERATORS)[number];

export const createMockupRequestSchema = z
  .object({
    uiBlueprintVersionId: z.uuid(),
    deviceType: z.enum(MOCKUP_DEVICE_TYPES).default('DESKTOP'),
    generator: z.enum(MOCKUP_GENERATORS).default('STITCH'),
    // ADR-029: draw only these blueprint screens; absent = every screen.
    screenLocalIds: z.array(z.string().min(1).max(100)).min(1).max(200).optional(),
  })
  .strict();
export type CreateMockupRequest = z.output<typeof createMockupRequestSchema>;

// ADR-029: screen by screen. The chosen screens of the blueprint are drawn (or
// drawn again) into the next version; the others are kept as they are.
export const generateMockupScreensRequestSchema = z
  .object({ screenLocalIds: z.array(z.string().min(1).max(100)).min(1).max(200) })
  .strict();
export type GenerateMockupScreensRequest = z.output<typeof generateMockupScreensRequestSchema>;

// A screen's conversation: each version of the mockup in which it changed, with
// the instruction that produced it (none for its first drawing).
export const mockupScreenHistoryResponseSchema = z
  .object({
    items: z.array(
      z
        .object({
          screenId: z.uuid(),
          versionNumber: z.number().int(),
          instruction: z.string().nullable(),
          createdAt: z.string(),
          current: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();
export type MockupScreenHistoryResponse = z.output<typeof mockupScreenHistoryResponseSchema>;

// Going back to an earlier drawing of a screen: a new version with that drawing.
export const restoreMockupScreenRequestSchema = z.object({ screenId: z.uuid() }).strict();
export type RestoreMockupScreenRequest = z.output<typeof restoreMockupScreenRequestSchema>;

// DEC-166: a mockup written by people as HTML and CSS, sent as a ZIP (multipart)
// with these fields. With mockupId it becomes the next version of that mockup.
export const importManualMockupRequestSchema = z
  .object({
    uiBlueprintVersionId: z.uuid(),
    deviceType: z.enum(MOCKUP_DEVICE_TYPES).default('DESKTOP'),
    mockupId: z.uuid().optional(),
  })
  .strict();
export type ImportManualMockupRequest = z.output<typeof importManualMockupRequestSchema>;

// Refinement produces a new mockup version from a free-text instruction and
// never overwrites: either the whole mockup is regenerated from the same
// approved UI Blueprint, or one screen is edited in place at Stitch while the
// other screens are carried over unchanged. Same body for both endpoints.
export const MOCKUP_REFINEMENT_PROMPT_MAX_LENGTH = 1000;
export const refineMockupRequestSchema = z
  .object({ prompt: z.string().trim().min(3).max(MOCKUP_REFINEMENT_PROMPT_MAX_LENGTH) })
  .strict();
export type RefineMockupRequest = z.output<typeof refineMockupRequestSchema>;

export const MOCKUP_GENERATOR_KINDS = [
  'INTERNAL_WIREFRAME',
  'STITCH',
  'MANUAL',
  'HTML_CSS',
] as const;
export type MockupGeneratorKind = (typeof MOCKUP_GENERATOR_KINDS)[number];

const mockupScreenSchema = z.object({
  id: z.uuid(),
  screenLocalId: z.string(),
  screenName: z.string(),
  imageUrl: z.string(),
  htmlUrl: z.string(),
  // False for screens generated before their Stitch identity was recorded.
  editable: z.boolean(),
  refinementPrompt: z.string().nullable(),
});

const mockupVersionSchema = z.object({
  id: z.uuid(),
  versionNumber: z.number().int().min(1),
  status: z.enum(ARTIFACT_VERSION_STATUSES),
  origin: z.enum(ARTIFACT_ORIGINS),
  createdAt: z.iso.datetime(),
});

export const mockupResponseSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  code: z.string(),
  uiBlueprintVersionId: z.uuid(),
  // Approved theme the mockup was painted with (DEC-118); null = standard design.
  designThemeVersionId: z.uuid().nullable(),
  deviceType: z.enum(MOCKUP_DEVICE_TYPES),
  version: mockupVersionSchema,
  createdAt: z.iso.datetime(),
});
export type MockupResponse = z.infer<typeof mockupResponseSchema>;

export const mockupListResponseSchema = z.object({ items: z.array(mockupResponseSchema) });

export const MOCKUP_JOB_STATUSES = [
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export type MockupJobStatus = (typeof MOCKUP_JOB_STATUSES)[number];

// The synchronous create/version calls now only enqueue the real
// generation — the client polls this until it
// reaches a terminal status instead of blocking the original request.
export const mockupJobResponseSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  status: z.enum(MOCKUP_JOB_STATUSES),
  resultArtifactId: z.uuid().nullable(),
  errorMessage: z.string().nullable(),
  // DEC-146: screens drawn so far out of the mockup's total (0 of 0 when the
  // provider draws the whole mockup at once).
  // What the job was asked to generate, so a stopped one can be resumed.
  uiBlueprintVersionId: z.uuid().optional(),
  deviceType: z.enum(['DESKTOP', 'MOBILE']).optional(),
  // DEC-167: who draws the screens; a stopped job is resumed with the same one.
  generator: z.enum(MOCKUP_GENERATORS).optional(),
  completedScreens: z.number().int().nonnegative().default(0),
  totalScreens: z.number().int().nonnegative().default(0),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type MockupJobResponse = z.infer<typeof mockupJobResponseSchema>;

export const mockupFidelityReviewSchema = z.object({
  requirementVersionIds: z.array(z.string()),
  contextVersionIds: z.array(z.string()),
  findings: z.array(
    z.object({
      screenLocalId: z.string(),
      severity: z.enum(['ERROR', 'WARNING']),
      code: z.enum([
        'CONTRADICTORY_LIMIT',
        'CONTRADICTORY_RETENTION',
        'UNSUPPORTED_QUANTITY',
        'HTML_UNAVAILABLE',
        'NO_APPROVED_REQUIREMENTS',
      ]),
      message: z.string(),
      expected: z.string().nullable(),
      observed: z.string().nullable(),
    }),
  ),
  scope: z.literal('HTML_HEURISTIC'),
});
export type MockupFidelityReview = z.infer<typeof mockupFidelityReviewSchema>;

export const mockupPreviewResponseSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  code: z.string(),
  versionId: z.uuid(),
  uiBlueprintVersionId: z.uuid(),
  deviceType: z.enum(MOCKUP_DEVICE_TYPES),
  generatorKind: z.enum(MOCKUP_GENERATOR_KINDS),
  svg: z.string().nullable(),
  screens: z.array(mockupScreenSchema).nullable(),
  refinementPrompt: z.string().nullable(),
  createdAt: z.iso.datetime(),
  fidelityReview: mockupFidelityReviewSchema.optional(),
  // The latest earlier version with screens, to compare a screen with what it was.
  previousVersion: z
    .object({
      versionNumber: z.number().int().positive(),
      generatorKind: z.enum(MOCKUP_GENERATOR_KINDS),
      screens: z.array(z.object({ id: z.uuid(), screenLocalId: z.string() })),
    })
    .nullable()
    .optional(),
  // ADR-029: blueprint screens the mockup has not drawn yet.
  missingScreens: z.array(z.object({ localId: z.string(), name: z.string() })).optional(),
});
export type MockupPreviewResponse = z.infer<typeof mockupPreviewResponseSchema>;
