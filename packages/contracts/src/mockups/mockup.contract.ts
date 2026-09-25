import { z } from 'zod';
import { ARTIFACT_ORIGINS, ARTIFACT_VERSION_STATUSES } from '../artifacts/artifact.contract';

// A Mockup is a deterministic derivation from an exact APPROVED UI_BLUEPRINT
// version — never an AI-generated raster image, never candidate-first
// (spec §18). Only the source version reference is user input.
export const createMockupRequestSchema = z.object({ uiBlueprintVersionId: z.uuid() }).strict();
export type CreateMockupRequest = z.output<typeof createMockupRequestSchema>;

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
  svg: z.string(),
  createdAt: z.iso.datetime(),
});
export type MockupPreviewResponse = z.infer<typeof mockupPreviewResponseSchema>;
