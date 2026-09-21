import { z } from 'zod';

export const ARTIFACT_VERSION_STATUSES = [
  'DRAFT',
  'GENERATED',
  'IN_REVIEW',
  'APPROVED',
  'CHANGES_REQUESTED',
] as const;

export type ArtifactVersionStatus = (typeof ARTIFACT_VERSION_STATUSES)[number];

export const ARTIFACT_ORIGINS = ['MANUAL', 'AI_GENERATED', 'AI_ASSISTED', 'IMPORTED'] as const;

export type ArtifactOrigin = (typeof ARTIFACT_ORIGINS)[number];

const titleSchema = z
  .string({ error: 'El título es obligatorio.' })
  .trim()
  .min(1, 'El título es obligatorio.')
  .max(300, 'El título no puede superar los 300 caracteres.');

// Auxiliary structured metadata only; never a substitute for relational modeling.
const metadataAuxiliarySchema = z
  .record(z.string(), z.unknown(), { error: 'Los metadatos deben ser un objeto.' })
  .default({});

// The artifact code prefix is deliberately NOT part of the public request:
// codes are allocated from the artifact type's default prefix. Choosing another
// prefix (e.g. RNF) is an internal service capability only.
export const createArtifactRequestSchema = z
  .object({
    // Validated against the `artifact_types` reference table by the API, so new
    // types do not require a contract change.
    type: z
      .string({ error: 'El tipo de artefacto es obligatorio.' })
      .regex(/^[A-Z][A-Z0-9_]*$/, 'El tipo de artefacto no es válido.')
      .max(64),
    title: titleSchema,
    metadataAuxiliary: metadataAuxiliarySchema,
  })
  .strict();

export type CreateArtifactRequest = z.input<typeof createArtifactRequestSchema>;

export const createArtifactVersionRequestSchema = z
  .object({
    title: titleSchema,
    metadataAuxiliary: metadataAuxiliarySchema,
  })
  .strict();

export type CreateArtifactVersionRequest = z.input<typeof createArtifactVersionRequestSchema>;

export const artifactVersionResponseSchema = z.object({
  id: z.uuid(),
  artifactId: z.uuid(),
  versionNumber: z.number().int().min(1),
  title: z.string(),
  status: z.enum(ARTIFACT_VERSION_STATUSES),
  origin: z.enum(ARTIFACT_ORIGINS),
  metadataAuxiliary: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
  submittedAt: z.iso.datetime().nullable(),
  approvedAt: z.iso.datetime().nullable(),
});

export type ArtifactVersionResponse = z.infer<typeof artifactVersionResponseSchema>;

export const artifactResponseSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  type: z.string(),
  code: z.string(),
  createdAt: z.iso.datetime(),
  currentVersion: artifactVersionResponseSchema,
});

export type ArtifactResponse = z.infer<typeof artifactResponseSchema>;
