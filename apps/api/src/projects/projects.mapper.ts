import type { ProjectResponse } from '@caseflow-ai/contracts';
import type { Project } from '../generated/prisma/client';

export function toProjectResponse(
  project: Project,
  hasApprovedArtifacts: boolean,
): ProjectResponse {
  return {
    id: project.id,
    workspaceId: project.workspaceId,
    name: project.name,
    description: project.description,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    archivedAt: project.archivedAt ? project.archivedAt.toISOString() : null,
    hasApprovedArtifacts,
  };
}
