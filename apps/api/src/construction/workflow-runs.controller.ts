import { Body, Controller, Get, HttpCode, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  createWorkflowRunRequestSchema,
  workflowReviewResponseSchema,
  workflowRunListResponseSchema,
  workflowRunResponseSchema,
} from '@caseflow-ai/contracts';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi';
import { WorkflowRunsService } from './workflow-runs.service';

interface AuthenticatedRequest {
  user: { id: string };
}

@ApiTags('workflow-runs')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/workflow-runs')
export class WorkflowRunsController {
  constructor(private readonly service: WorkflowRunsService) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({
    operationId: 'startWorkflowRun',
    summary: 'Encolar la planificación y construcción desde un prompt (Exprés o Solo construcción)',
  })
  @ApiZodBody(createWorkflowRunRequestSchema)
  @ApiZodResponse(202, 'Workflow run.', workflowRunResponseSchema)
  start(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(createWorkflowRunRequestSchema))
    body: z.output<typeof createWorkflowRunRequestSchema>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.start(projectId, req.user.id, body.prompt);
  }

  @Get()
  @ApiOperation({ operationId: 'listWorkflowRuns', summary: 'Listar construcciones automáticas' })
  @ApiZodResponse(200, 'Workflow runs.', workflowRunListResponseSchema)
  list(@Param('projectId', uuidParamPipe) projectId: string) {
    return this.service.list(projectId);
  }

  @Get(':runId')
  @ApiOperation({ operationId: 'getWorkflowRun', summary: 'Consultar construcción automática' })
  @ApiZodResponse(200, 'Workflow run.', workflowRunResponseSchema)
  get(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('runId', uuidParamPipe) runId: string,
  ) {
    return this.service.get(projectId, runId);
  }

  @Get(':runId/review')
  @ApiOperation({
    operationId: 'getWorkflowRunReview',
    summary: 'Elementos de la revisión en bloque en curso (ruta Exprés)',
  })
  @ApiZodResponse(200, 'Review items.', workflowReviewResponseSchema)
  review(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('runId', uuidParamPipe) runId: string,
  ) {
    return this.service.reviewItems(projectId, runId);
  }

  @Post(':runId/approve')
  @HttpCode(202)
  @ApiOperation({
    operationId: 'approveWorkflowRunReview',
    summary: 'Aprobar en bloque la revisión en curso y continuar (ruta Exprés)',
  })
  @ApiZodResponse(202, 'Workflow run.', workflowRunResponseSchema)
  approve(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('runId', uuidParamPipe) runId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.approve(projectId, runId, req.user.id);
  }

  @Post(':runId/retry')
  @HttpCode(202)
  @ApiOperation({
    operationId: 'retryWorkflowRun',
    summary: 'Reanudar una construcción automática desde la etapa que falló',
  })
  @ApiZodResponse(202, 'Workflow run.', workflowRunResponseSchema)
  retry(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('runId', uuidParamPipe) runId: string,
  ) {
    return this.service.retry(projectId, runId);
  }
}
