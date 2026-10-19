import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';

import { Body, Controller, Get, Param, Post, Query, Request } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  archivedArtifactsResponseSchema,
  artifactResponseSchema,
  artifactVersionResponseSchema,
  createArtifactRequestSchema,
  createArtifactVersionRequestSchema,
  listArchivedArtifactsQuerySchema,
  restoreArtifactResponseSchema,
  type ArtifactResponse,
  type ArtifactVersionResponse,
} from '@caseflow-ai/contracts';
import type { z } from 'zod';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiErrorResponse, ApiUuidParam, ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi';
import { ArtifactsService } from './artifacts.service';

@ApiTags('artifacts')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/artifacts')
export class ArtifactsController {
  constructor(private readonly artifacts: ArtifactsService) {}

  @Post()
  @ApiOperation({
    operationId: 'createArtifact',
    summary: 'Create a manual artifact with its first version',
    description:
      'Creates the artifact identity and version 1 (origin MANUAL, status DRAFT). The artifact code is allocated from the artifact type.',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiZodBody(createArtifactRequestSchema)
  @ApiZodResponse(201, 'The artifact and its first version.', artifactResponseSchema)
  @ApiErrorResponse(400, 'The project identifier or request body is invalid.')
  @ApiErrorResponse(404, 'The project does not exist.')
  @ApiErrorResponse(422, 'The artifact type does not exist.')
  create(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(createArtifactRequestSchema))
    body: z.output<typeof createArtifactRequestSchema>,
  ): Promise<ArtifactResponse> {
    return this.artifacts.createArtifact(projectId, body);
  }

  // Declared before ':artifactId' so "archived" is not read as an identifier.
  @Get('archived')
  @ApiOperation({
    operationId: 'listArchivedArtifacts',
    summary: 'List archived artifacts, optionally of some types (comma separated)',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiZodResponse(200, 'Archived artifacts.', archivedArtifactsResponseSchema)
  listArchived(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Query(new ZodValidationPipe(listArchivedArtifactsQuerySchema))
    query: z.output<typeof listArchivedArtifactsQuerySchema>,
  ) {
    return this.artifacts.listArchived(projectId, query.types);
  }

  @Get(':artifactId')
  @ApiOperation({
    operationId: 'getArtifact',
    summary: 'Get an artifact with its current version',
    description: 'The current version is the one with the highest version number.',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiUuidParam('artifactId', 'Artifact identifier.')
  @ApiZodResponse(200, 'The artifact and its current version.', artifactResponseSchema)
  @ApiErrorResponse(400, 'An identifier is invalid.')
  @ApiErrorResponse(404, 'The artifact does not exist in the given project.')
  get(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('artifactId', uuidParamPipe) artifactId: string,
  ): Promise<ArtifactResponse> {
    return this.artifacts.getArtifact(projectId, artifactId);
  }

  @Post(':artifactId/versions')
  @ApiOperation({
    operationId: 'createArtifactVersion',
    summary: 'Create a new version of an artifact',
    description:
      'Editing an artifact creates a new version (origin MANUAL, status DRAFT); earlier versions are never modified.',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiUuidParam('artifactId', 'Artifact identifier.')
  @ApiZodBody(createArtifactVersionRequestSchema)
  @ApiZodResponse(201, 'The new version.', artifactVersionResponseSchema)
  @ApiErrorResponse(400, 'An identifier or the request body is invalid.')
  @ApiErrorResponse(404, 'The artifact does not exist in the given project.')
  createVersion(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('artifactId', uuidParamPipe) artifactId: string,
    @Body(new ZodValidationPipe(createArtifactVersionRequestSchema))
    body: z.output<typeof createArtifactVersionRequestSchema>,
  ): Promise<ArtifactVersionResponse> {
    return this.artifacts.createVersion(projectId, artifactId, body);
  }

  @Post(':artifactId/archive')
  @ApiOperation({
    operationId: 'archiveArtifact',
    summary: 'Archive an artifact, retiring it from active work without deleting history',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiUuidParam('artifactId', 'Artifact identifier.')
  @ApiErrorResponse(404, 'The artifact does not exist in the given project.')
  @ApiErrorResponse(422, 'The artifact type cannot be archived here, or is already archived.')
  archive(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('artifactId', uuidParamPipe) artifactId: string,
    @Request() request: { user: { id: string } },
  ): Promise<{ archivedAt: string }> {
    return this.artifacts.archive(projectId, artifactId, request.user.id);
  }

  @Post(':artifactId/restore')
  @ApiOperation({
    operationId: 'restoreArtifact',
    summary: 'Restore an archived artifact to active work',
    description:
      'Never refused because of what changed meanwhile: the stage is marked as changed. The response warns when another approved artifact of a type used once exists.',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiUuidParam('artifactId', 'Artifact identifier.')
  @ApiZodResponse(201, 'The artifact is active again.', restoreArtifactResponseSchema)
  @ApiErrorResponse(404, 'The artifact does not exist in the given project.')
  @ApiErrorResponse(422, 'The artifact type cannot be restored here, or is not archived.')
  restore(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('artifactId', uuidParamPipe) artifactId: string,
    @Request() request: { user: { id: string } },
  ) {
    return this.artifacts.restore(projectId, artifactId, request.user.id);
  }
}
