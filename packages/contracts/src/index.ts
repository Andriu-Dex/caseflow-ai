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
} from './projects/project.contract';
export type {
  CreateProjectRequest,
  ListProjectsQuery,
  ProjectListResponse,
  ProjectResponse,
} from './projects/project.contract';

export {
  ARTIFACT_ORIGINS,
  ARTIFACT_VERSION_STATUSES,
  artifactResponseSchema,
  artifactVersionResponseSchema,
  createArtifactRequestSchema,
  createArtifactVersionRequestSchema,
} from './artifacts/artifact.contract';
export * from './requirements/requirement.contract';
export * from './use-cases/use-case.contract';
export * from './data-models/data-model.contract';
export * from './sources/source.contract';
export * from './structured-analysis/structured-analysis.contract';
export * from './mockups/mockup.contract';
export * from './staleness/staleness.contract';
export * from './traceability/traceability.contract';
export * from './readiness/readiness.contract';
export * from './export/export.contract';
export * from './workspaces/workspace.contract';

export {
  PROJECT_CONTEXT_COLLECTION_LIMIT,
  PROJECT_CONTEXT_SCOPE_TYPES,
  projectContextActorInputSchema,
  projectContextRequestSchema,
  projectContextResponseSchema,
  projectContextScopeItemInputSchema,
} from './project-context/project-context.contract';
export type {
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
