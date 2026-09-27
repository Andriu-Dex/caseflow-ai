import { z } from 'zod';
import { ARTIFACT_ORIGINS, ARTIFACT_VERSION_STATUSES } from '../artifacts/artifact.contract';

// A Mockup derives from an exact APPROVED UI_BLUEPRINT version. Stitch can
// generate screen assets; the internal deterministic wireframe is the fallback.
export const createMockupRequestSchema = z.object({ uiBlueprintVersionId: z.uuid() }).strict();
export type CreateMockupRequest = z.output<typeof createMockupRequestSchema>;

export const MOCKUP_GENERATOR_KINDS = ['INTERNAL_WIREFRAME', 'STITCH'] as const;
export type MockupGeneratorKind = (typeof MOCKUP_GENERATOR_KINDS)[number];

const mockupScreenSchema = z.object({
  id: z.uuid(),
  screenLocalId: z.string(),
  screenName: z.string(),
  imageUrl: z.string(),
  htmlUrl: z.string(),
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
  version: mockupVersionSchema,
  createdAt: z.iso.datetime(),
});
export type MockupResponse = z.infer<typeof mockupResponseSchema>;

export const mockupListResponseSchema = z.object({ items: z.array(mockupResponseSchema) });

export const mockupPreviewResponseSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  code: z.string(),
  versionId: z.uuid(),
  uiBlueprintVersionId: z.uuid(),
  generatorKind: z.enum(MOCKUP_GENERATOR_KINDS),
  svg: z.string().nullable(),
  screens: z.array(mockupScreenSchema).nullable(),
  createdAt: z.iso.datetime(),
});
export type MockupPreviewResponse = z.infer<typeof mockupPreviewResponseSchema>;
