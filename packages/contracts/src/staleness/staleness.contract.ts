import { z } from 'zod';
import { ARTIFACT_VERSION_STATUSES } from '../artifacts/artifact.contract';

// Deterministic, bounded potential-impact analysis (requirements.md Phase E).
// This is NOT semantic impact analysis: it only reports that newer approved
// project knowledge exists which was not part of the exact approved
// provenance an artifact was derived from. Historical APPROVED
// ArtifactVersions are never mutated or reinterpreted as invalid.
export const STALENESS_IMPACT_STATES = [
  'CURRENT',
  'NEWER_APPROVED_KNOWLEDGE_AVAILABLE',
  'POTENTIALLY_AFFECTED',
] as const;
export type StalenessImpactState = (typeof STALENESS_IMPACT_STATES)[number];

export const STALENESS_REASON_TYPES = [
  // A source version already linked to the current approved Project Context
  // has a newer APPROVED version that is not the one linked.
  'NEWER_APPROVED_SOURCE_VERSION',
  // An APPROVED Project Source exists that is not linked to the current
  // approved Project Context at all.
  'NEW_APPROVED_SOURCE_NOT_LINKED',
  // Propagated one hop: this Requirement was generated from a Project
  // Context version that is itself NEWER_APPROVED_KNOWLEDGE_AVAILABLE.
  'CONTEXT_POTENTIALLY_AFFECTED',
  // Propagated one more hop: this Use Case links to a Requirement version
  // that is POTENTIALLY_AFFECTED.
  'REQUIREMENT_POTENTIALLY_AFFECTED',
] as const;
export type StalenessReasonType = (typeof STALENESS_REASON_TYPES)[number];

export const stalenessReasonSchema = z.object({
  type: z.enum(STALENESS_REASON_TYPES),
  sourceArtifactId: z.uuid().nullable(),
  sourceVersionId: z.uuid().nullable(),
  message: z.string(),
});
export type StalenessReason = z.infer<typeof stalenessReasonSchema>;

export const stalenessEntrySchema = z.object({
  artifactId: z.uuid(),
  artifactVersionId: z.uuid(),
  artifactType: z.string(),
  code: z.string(),
  versionNumber: z.number().int(),
  status: z.enum(ARTIFACT_VERSION_STATUSES),
  impactState: z.enum(STALENESS_IMPACT_STATES),
  reasons: z.array(stalenessReasonSchema),
});
export type StalenessEntry = z.infer<typeof stalenessEntrySchema>;

export const stalenessAnalysisResponseSchema = z.object({
  projectId: z.uuid(),
  generatedAt: z.iso.datetime(),
  entries: z.array(stalenessEntrySchema),
});
export type StalenessAnalysisResponse = z.infer<typeof stalenessAnalysisResponseSchema>;
