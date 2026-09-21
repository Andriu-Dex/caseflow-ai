// Artifact lifecycle rules (spec §5.2). Framework-free.

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

// Only AI generation produces a version that starts as GENERATED; every other
// origin starts as an editable DRAFT.
export function initialStatusForOrigin(origin: ArtifactOrigin): ArtifactVersionStatus {
  return origin === 'AI_GENERATED' ? 'GENERATED' : 'DRAFT';
}

// Approved versions are immutable history (spec §5.3).
export function isArtifactVersionFrozen(status: ArtifactVersionStatus): boolean {
  return status === 'APPROVED';
}
