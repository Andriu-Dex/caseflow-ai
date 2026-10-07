export const PACKAGE_NAME = '@caseflow-ai/contracts';

export { healthLiveResponseSchema } from './health/health-live.contract';
export type { HealthLiveResponse } from './health/health-live.contract';

export { apiErrorResponseSchema } from './common/api-error.contract';
export type { ApiErrorResponse } from './common/api-error.contract';

export {
  createProjectRequestSchema,
  listProjectsQuerySchema,
  projectListResponseSchema,
  projectResponseSchema,
  PROJECT_LANGUAGES,
  updateProjectLanguageRequestSchema,
  upgradeWorkflowRouteRequestSchema,
  WORKFLOW_ROUTES,
} from './projects/project.contract';
export type {
  CreateProjectRequest,
  ListProjectsQuery,
  ProjectListResponse,
  ProjectResponse,
  ProjectLanguage,
  UpdateProjectLanguageRequest,
  UpgradeWorkflowRouteRequest,
  WorkflowRoute,
} from './projects/project.contract';

export {
  APPROVAL_ORIGINS,
  ARTIFACT_ORIGINS,
  ARTIFACT_VERSION_STATUSES,
  artifactResponseSchema,
  artifactVersionResponseSchema,
  createArtifactRequestSchema,
  createArtifactVersionRequestSchema,
} from './artifacts/artifact.contract';
export type { ApprovalOrigin } from './artifacts/artifact.contract';
export * from './requirements/requirement.contract';
export * from './use-cases/use-case.contract';
export * from './data-models/data-model.contract';
export * from './sources/source.contract';
export * from './structured-analysis/structured-analysis.contract';
export * from './structured-analysis/design-theme.contract';
export * from './structured-analysis/class-diagram.contract';
export * from './mockups/mockup.contract';
export * from './staleness/staleness.contract';
export * from './traceability/traceability.contract';
export * from './readiness/readiness.contract';
export * from './export/export.contract';
export * from './workspaces/workspace.contract';
export * from './knowledge-base/knowledge-base.contract';
export * from './impact-analysis/impact-analysis.contract';
export * from './consistency-engine/consistency-engine.contract';
export * from './baselines/baselines.contract';
export * from './construction/construction-foundation.contract';
export * from './construction/design-baseline.contract';
export * from './construction/generation-run.contract';
export * from './construction/sandbox-run.contract';
export * from './construction/workflow-run.contract';

export {
  PROJECT_CONTEXT_COLLECTION_LIMIT,
  PROJECT_CONTEXT_SCOPE_TYPES,
  projectContextActorInputSchema,
  projectContextCandidateSchema,
  projectContextGenerationContentSchema,
  projectContextRequestSchema,
  projectContextResponseSchema,
  projectContextScopeItemInputSchema,
} from './project-context/project-context.contract';
export type {
  ProjectContextCandidate,
  ProjectContextGenerationContent,
  ProjectContextRequest,
  ProjectContextResponse,
} from './project-context/project-context.contract';
export type {
  ArtifactOrigin,
  ArtifactResponse,
  ArtifactVersionResponse,
  ArtifactVersionStatus,
  CreateArtifactRequest,
  CreateArtifactVersionRequest,
} from './artifacts/artifact.contract';

export * from './identity/identity.contract';
