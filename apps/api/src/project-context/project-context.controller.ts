import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  projectContextRequestSchema,
  projectContextResponseSchema,
  transitionArtifactVersionRequestSchema,
  type ProjectContextRequest,
  type ProjectContextResponse,
} from '@caseflow-ai/contracts';
import type { z } from 'zod';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiErrorResponse, ApiUuidParam, ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi';
import { ProjectContextService } from './project-context.service';

@ApiTags('project-context')
@Controller('projects/:projectId/context')
export class ProjectContextController {
  constructor(private readonly projectContext: ProjectContextService) {}

  @Post()
  @ApiOperation({
    operationId: 'createProjectContext',
    summary: 'Create the canonical project context',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiZodBody(projectContextRequestSchema)
  @ApiZodResponse(201, 'The canonical context and version 1.', projectContextResponseSchema)
  @ApiErrorResponse(400, 'The project identifier or request body is invalid.')
  @ApiErrorResponse(404, 'The project does not exist.')
  @ApiErrorResponse(409, 'The project already has a canonical context.')
  create(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(projectContextRequestSchema)) body: ProjectContextRequest,
  ): Promise<ProjectContextResponse> {
    return this.projectContext.create(projectId, body);
  }

  @Get()
  @ApiOperation({
    operationId: 'getProjectContext',
    summary: 'Get the latest project context version',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiZodResponse(200, 'The latest complete context snapshot.', projectContextResponseSchema)
  @ApiErrorResponse(400, 'The project identifier is invalid.')
  @ApiErrorResponse(404, 'The project context does not exist.')
  get(@Param('projectId', uuidParamPipe) projectId: string): Promise<ProjectContextResponse> {
    return this.projectContext.getCurrent(projectId);
  }

  @Post('versions')
  @ApiOperation({
    operationId: 'createProjectContextVersion',
    summary: 'Create a complete new context version',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiZodBody(projectContextRequestSchema)
  @ApiZodResponse(201, 'The new immutable context snapshot.', projectContextResponseSchema)
  @ApiErrorResponse(400, 'The project identifier or request body is invalid.')
  @ApiErrorResponse(404, 'The project context does not exist.')
  createVersion(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(projectContextRequestSchema)) body: ProjectContextRequest,
  ): Promise<ProjectContextResponse> {
    return this.projectContext.createVersion(projectId, body);
  }

  @Post('versions/:versionId/transition')
  @ApiOperation({
    operationId: 'transitionProjectContextVersion',
    summary: 'Change the review/approval status of a context version',
  })
  @ApiZodBody(transitionArtifactVersionRequestSchema)
  transition(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('versionId', uuidParamPipe) versionId: string,
    @Body(new ZodValidationPipe(transitionArtifactVersionRequestSchema))
    body: z.output<typeof transitionArtifactVersionRequestSchema>,
  ) {
    return this.projectContext.transition(projectId, versionId, body.status);
  }
}
