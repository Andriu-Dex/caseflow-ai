import { z } from 'zod';
import { ARTIFACT_ORIGINS, ARTIFACT_VERSION_STATUSES } from '../artifacts/artifact.contract';

export const MOCKUP_DEVICE_TYPES = ['DESKTOP', 'MOBILE'] as const;
export type MockupDeviceType = (typeof MOCKUP_DEVICE_TYPES)[number];

// A Mockup derives from an exact APPROVED UI_BLUEPRINT version. Stitch can
// generate screen assets; the internal deterministic wireframe is the fallback.
export const createMockupRequestSchema = z
  .object({
    uiBlueprintVersionId: z.uuid(),
    deviceType: z.enum(MOCKUP_DEVICE_TYPES).default('DESKTOP'),
  })
  .strict();
export type CreateMockupRequest = z.output<typeof createMockupRequestSchema>;

// Refinement produces a new mockup version from a free-text instruction and
// never overwrites: either the whole mockup is regenerated from the same
// approved UI Blueprint, or one screen is edited in place at Stitch while the
// other screens are carried over unchanged. Same body for both endpoints.
export const MOCKUP_REFINEMENT_PROMPT_MAX_LENGTH = 1000;
export const refineMockupRequestSchema = z
  .object({ prompt: z.string().trim().min(3).max(MOCKUP_REFINEMENT_PROMPT_MAX_LENGTH) })
  .strict();
export type RefineMockupRequest = z.output<typeof refineMockupRequestSchema>;

export const MOCKUP_GENERATOR_KINDS = ['INTERNAL_WIREFRAME', 'STITCH'] as const;
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
  deviceType: z.enum(MOCKUP_DEVICE_TYPES),
  version: mockupVersionSchema,
  createdAt: z.iso.datetime(),
});
export type MockupResponse = z.infer<typeof mockupResponseSchema>;

export const mockupListResponseSchema = z.object({ items: z.array(mockupResponseSchema) });

export const MOCKUP_JOB_STATUSES = ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'] as const;
export type MockupJobStatus = (typeof MOCKUP_JOB_STATUSES)[number];

// The synchronous create/version calls now only enqueue the real
// generation (spec §40 async jobs) — the client polls this until it
// reaches a terminal status instead of blocking the original request.
export const mockupJobResponseSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  status: z.enum(MOCKUP_JOB_STATUSES),
  resultArtifactId: z.uuid().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type MockupJobResponse = z.infer<typeof mockupJobResponseSchema>;

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
});
export type MockupPreviewResponse = z.infer<typeof mockupPreviewResponseSchema>;
