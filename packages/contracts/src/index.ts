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
export type {
  ArtifactOrigin,
  ArtifactResponse,
  ArtifactVersionResponse,
  ArtifactVersionStatus,
  CreateArtifactRequest,
  CreateArtifactVersionRequest,
} from './artifacts/artifact.contract';
