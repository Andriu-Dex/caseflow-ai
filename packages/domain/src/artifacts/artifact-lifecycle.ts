// Artifact lifecycle rules (spec §5.2). Framework-free.

export const ARTIFACT_VERSION_STATUSES = [
  'DRAFT',
  'GENERATED',
  'IN_REVIEW',
  'APPROVED',
  'CHANGES_REQUESTED',
] as const;

export type ArtifactVersionStatus = (typeof ARTIFACT_VERSION_STATUSES)[number];

// SYSTEM_GENERATED identifies a version CASEFlow derives deterministically from
// already-approved/structured CASE data (e.g. a Use Case Diagram), with no
// manual authoring and no AI involvement — distinct from both MANUAL and
// AI_GENERATED.
export const ARTIFACT_ORIGINS = [
  'MANUAL',
  'AI_GENERATED',
  'AI_ASSISTED',
  'SYSTEM_GENERATED',
  'IMPORTED',
] as const;

export type ArtifactOrigin = (typeof ARTIFACT_ORIGINS)[number];

const ALLOWED_TRANSITIONS: Readonly<
  Record<ArtifactVersionStatus, readonly ArtifactVersionStatus[]>
> = {
  DRAFT: ['GENERATED', 'IN_REVIEW'],
  GENERATED: ['IN_REVIEW'],
  IN_REVIEW: ['APPROVED', 'CHANGES_REQUESTED'],
  CHANGES_REQUESTED: ['DRAFT'],
  APPROVED: [],
};

export function canTransitionArtifactVersionStatus(
  from: ArtifactVersionStatus,
  to: ArtifactVersionStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

// AI generation and deterministic system generation both produce a version
// that starts as GENERATED (no manual drafting step occurred); every other
// origin starts as an editable DRAFT.
export function initialStatusForOrigin(origin: ArtifactOrigin): ArtifactVersionStatus {
  return origin === 'AI_GENERATED' || origin === 'SYSTEM_GENERATED' ? 'GENERATED' : 'DRAFT';
}

// Approved versions are immutable history (spec §5.3).
export function isArtifactVersionFrozen(status: ArtifactVersionStatus): boolean {
  return status === 'APPROVED';
}
