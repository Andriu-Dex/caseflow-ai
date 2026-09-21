import type { ArtifactResponse, ArtifactVersionResponse } from '@caseflow-ai/contracts';
import type { Artifact, ArtifactVersion } from '../generated/prisma/client';

export function toArtifactVersionResponse(version: ArtifactVersion): ArtifactVersionResponse {
  return {
    id: version.id,
    artifactId: version.artifactId,
    versionNumber: version.versionNumber,
    title: version.title,
    status: version.status,
    origin: version.origin,
    metadataAuxiliary: version.metadataAuxiliary as Record<string, unknown>,
    createdAt: version.createdAt.toISOString(),
    submittedAt: version.submittedAt?.toISOString() ?? null,
    approvedAt: version.approvedAt?.toISOString() ?? null,
  };
}

export function toArtifactResponse(
  artifact: Artifact,
  currentVersion: ArtifactVersion,
): ArtifactResponse {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    type: artifact.artifactTypeCode,
    code: artifact.code,
    createdAt: artifact.createdAt.toISOString(),
    currentVersion: toArtifactVersionResponse(currentVersion),
  };
}
