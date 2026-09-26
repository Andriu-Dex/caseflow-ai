import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  artifactResponseSchema,
  artifactVersionResponseSchema,
  createArtifactRequestSchema,
  createArtifactVersionRequestSchema,
  type ArtifactResponse,
  type ArtifactVersionResponse,
} from '@caseflow-ai/contracts';
import type { z } from 'zod';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiErrorResponse, ApiUuidParam, ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi';
import { ArtifactsService } from './artifacts.service';

@ApiTags('artifacts')
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
  ): Promise<{ archivedAt: string }> {
    return this.artifacts.archive(projectId, artifactId);
  }
}
