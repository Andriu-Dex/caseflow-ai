import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';
import { WorkspaceMembershipGuard } from '../identity/workspace-membership.guard';

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createProjectRequestSchema,
  deleteProjectRequestSchema,
  listProjectsQuerySchema,
  projectListResponseSchema,
  projectResponseSchema,
  updateProjectLanguageRequestSchema,
  updateProjectRequestSchema,
  upgradeWorkflowRouteRequestSchema,
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
import type { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user: { id: string };
}

@ApiTags('projects')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard, WorkspaceMembershipGuard)
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
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectResponse> {
    return this.projects.create(body, req.user.id);
  }

  @Get()
  @ApiOperation({ operationId: 'listProjects', summary: 'List the projects of a workspace' })
  @ApiZodQuery(listProjectsQuerySchema)
  @ApiZodResponse(200, 'A page of projects ordered by creation time.', projectListResponseSchema)
  @ApiErrorResponse(400, 'The query parameters are invalid.')
  list(
    @Query(new ZodValidationPipe(listProjectsQuerySchema))
    query: z.output<typeof listProjectsQuerySchema>,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectListResponse> {
    return this.projects.list(query, req.user.id);
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
    summary: 'Permanently delete a project and all its history, after typing its exact name',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiErrorResponse(400, 'The project identifier is invalid.')
  @ApiErrorResponse(404, 'The project does not exist.')
  @ApiZodBody(deleteProjectRequestSchema)
  @ApiErrorResponse(403, 'Only the project owner or a workspace owner or admin may delete it.')
  @ApiErrorResponse(422, 'The typed name does not match the project name.')
  delete(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(deleteProjectRequestSchema))
    body: z.output<typeof deleteProjectRequestSchema>,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.projects.delete(projectId, body.confirmName, req.user.id);
  }

  @Post(':projectId/archive')
  @ApiOperation({
    operationId: 'archiveProject',
    summary: 'Archive a project: hidden from active use, history kept (alternative to deletion)',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiZodResponse(200, 'The archived project.', projectResponseSchema)
  @ApiErrorResponse(404, 'The project does not exist.')
  @ApiErrorResponse(422, 'The project is already archived.')
  archive(@Param('projectId', uuidParamPipe) projectId: string): Promise<ProjectResponse> {
    return this.projects.archive(projectId);
  }

  @Patch(':projectId')
  @ApiOperation({
    operationId: 'updateProject',
    summary: 'Rename a project or change its description',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiZodBody(updateProjectRequestSchema)
  @ApiZodResponse(200, 'The updated project.', projectResponseSchema)
  @ApiErrorResponse(400, 'The name or description is invalid.')
  @ApiErrorResponse(404, 'The project does not exist.')
  update(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(updateProjectRequestSchema))
    body: z.output<typeof updateProjectRequestSchema>,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectResponse> {
    return this.projects.update(projectId, body, req.user.id);
  }

  @Post(':projectId/unarchive')
  @ApiOperation({ operationId: 'unarchiveProject', summary: 'Restore an archived project' })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiZodResponse(200, 'The restored project.', projectResponseSchema)
  @ApiErrorResponse(404, 'The project does not exist.')
  @ApiErrorResponse(422, 'The project is not archived.')
  unarchive(@Param('projectId', uuidParamPipe) projectId: string): Promise<ProjectResponse> {
    return this.projects.unarchive(projectId);
  }

  @Post(':projectId/language')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'updateProjectLanguage',
    summary: 'Set the AI generation language for a project',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiZodBody(updateProjectLanguageRequestSchema)
  @ApiZodResponse(200, 'The updated project.', projectResponseSchema)
  @ApiErrorResponse(404, 'The project does not exist.')
  updateLanguage(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(updateProjectLanguageRequestSchema))
    body: z.output<typeof updateProjectLanguageRequestSchema>,
  ): Promise<ProjectResponse> {
    return this.projects.updateLanguage(projectId, body.language);
  }

  @Post(':projectId/workflow-route')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'upgradeProjectWorkflowRoute',
    summary: 'Move a project up to a workflow route with more human review',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiZodBody(upgradeWorkflowRouteRequestSchema)
  @ApiZodResponse(200, 'The updated project.', projectResponseSchema)
  @ApiErrorResponse(404, 'The project does not exist.')
  @ApiErrorResponse(422, 'The route would move down or stay the same.')
  upgradeWorkflowRoute(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(upgradeWorkflowRouteRequestSchema))
    body: z.output<typeof upgradeWorkflowRouteRequestSchema>,
    @Req() req: AuthenticatedRequest,
  ): Promise<ProjectResponse> {
    return this.projects.upgradeWorkflowRoute(projectId, body.workflowRoute, req.user.id);
  }
}
