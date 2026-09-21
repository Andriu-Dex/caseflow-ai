export const PACKAGE_NAME = '@caseflow-ai/domain';

export {
  ARTIFACT_ORIGINS,
  ARTIFACT_VERSION_STATUSES,
  canTransitionArtifactVersionStatus,
  initialStatusForOrigin,
  isArtifactVersionFrozen,
} from './artifacts/artifact-lifecycle';
export type { ArtifactOrigin, ArtifactVersionStatus } from './artifacts/artifact-lifecycle';
export {
  FIRST_DELIVERABLE_ARTIFACT_TYPE_CODES,
  formatArtifactCode,
} from './artifacts/artifact-types';
export type { FirstDeliverableArtifactTypeCode } from './artifacts/artifact-types';
