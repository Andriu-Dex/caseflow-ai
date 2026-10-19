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
  CONSTRUCTION_ARTIFACT_TYPE_CODES,
  FIRST_DELIVERABLE_ARTIFACT_TYPE_CODES,
  formatArtifactCode,
} from './artifacts/artifact-types';
export type { FirstDeliverableArtifactTypeCode } from './artifacts/artifact-types';
export { MOCKUP_GENERATION_QUEUE } from './jobs/mockup-generation-job';
export type { MockupGenerationJobPayload } from './jobs/mockup-generation-job';
export { SOURCE_PROCESSING_QUEUE, sourceJobRunPath } from './jobs/source-processing-job';
export { CONSTRUCTION_JOB_TYPES, CONSTRUCTION_QUEUE } from './jobs/construction-job';
export type { ConstructionJobPayload, ConstructionJobType } from './jobs/construction-job';
export {
  CASEFLOW_STANDARD_WEB_V1,
  CASEFLOW_WEB_TS_V1,
  DEPENDENCY_CATEGORIES,
  DEPENDENCY_LAYERS,
  MAX_AUTO_REPAIR_ROUNDS,
  TARGET_TEMPLATES,
  VALIDATION_STAGES,
  findCatalogDependency,
  findTargetTemplate,
} from './construction/target-templates';
export type {
  CatalogDependency,
  DependencyCategory,
  DependencyLayer,
  DesignSystemProfile,
  TargetTemplateVersion,
  ToolchainSettings,
  ValidationCommand,
  ValidationStage,
} from './construction/target-templates';
export type { SourceProcessingJobPayload } from './jobs/source-processing-job';
