import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createProjectRequestSchema,
  listProjectsQuerySchema,
  projectListResponseSchema,
  projectResponseSchema,
  type ProjectListResponse,
  type ProjectResponse,
} from '@caseflow-ai/contracts';
import type { z } from 'zod';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  ApiErrorResponse,
  ApiUuidParam,
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
} from '../openapi/zod-openapi';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  @ApiOperation({ operationId: 'createProject', summary: 'Create a project in a workspace' })
  @ApiZodBody(createProjectRequestSchema)
  @ApiZodResponse(201, 'The project was created.', projectResponseSchema)
  @ApiErrorResponse(400, 'The request body is invalid.')
  @ApiErrorResponse(404, 'The workspace does not exist.')
  create(
    @Body(new ZodValidationPipe(createProjectRequestSchema))
    body: z.output<typeof createProjectRequestSchema>,
  ): Promise<ProjectResponse> {
    return this.projects.create(body);
  }

  @Get()
  @ApiOperation({ operationId: 'listProjects', summary: 'List the projects of a workspace' })
  @ApiZodQuery(listProjectsQuerySchema)
  @ApiZodResponse(200, 'A page of projects ordered by creation time.', projectListResponseSchema)
  @ApiErrorResponse(400, 'The query parameters are invalid.')
  list(
    @Query(new ZodValidationPipe(listProjectsQuerySchema))
    query: z.output<typeof listProjectsQuerySchema>,
  ): Promise<ProjectListResponse> {
    return this.projects.list(query.workspaceId, query.limit, query.offset);
  }

  @Get(':projectId')
  @ApiOperation({ operationId: 'getProject', summary: 'Get a project' })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiZodResponse(200, 'The project.', projectResponseSchema)
  @ApiErrorResponse(400, 'The project identifier is invalid.')
  @ApiErrorResponse(404, 'The project does not exist.')
  get(@Param('projectId', uuidParamPipe) projectId: string): Promise<ProjectResponse> {
    return this.projects.get(projectId);
  }

  @Delete(':projectId')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'deleteProject',
    summary: 'Permanently delete a project that has never had anything approved',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiErrorResponse(400, 'The project identifier is invalid.')
  @ApiErrorResponse(404, 'The project does not exist.')
  @ApiErrorResponse(422, 'The project has approved history and cannot be deleted.')
  delete(@Param('projectId', uuidParamPipe) projectId: string): Promise<void> {
    return this.projects.delete(projectId);
  }

  @Post(':projectId/archive')
  @ApiOperation({
    operationId: 'archiveProject',
    summary: 'Archive a project that has approved history (alternative to deletion)',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiZodResponse(200, 'The archived project.', projectResponseSchema)
  @ApiErrorResponse(404, 'The project does not exist.')
  @ApiErrorResponse(422, 'The project is already archived.')
  archive(@Param('projectId', uuidParamPipe) projectId: string): Promise<ProjectResponse> {
    return this.projects.archive(projectId);
  }
}
