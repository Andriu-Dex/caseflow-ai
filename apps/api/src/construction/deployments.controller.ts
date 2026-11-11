import { Body, Controller, Get, HttpCode, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  deploymentListResponseSchema,
  deploymentResponseSchema,
  resumeDeploymentRequestSchema,
  startDeploymentRequestSchema,
} from '@caseflow-ai/contracts';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi';
import { DeploymentsService } from './deployments.service';

interface AuthenticatedRequest {
  user: { id: string };
}

@ApiTags('construction')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/deployments')
export class DeploymentsController {
  constructor(private readonly service: DeploymentsService) {}

  @Get()
  @ApiOperation({ operationId: 'listDeployments', summary: 'Listar despliegues del software' })
  @ApiZodResponse(200, 'Despliegues.', deploymentListResponseSchema)
  list(@Param('projectId', uuidParamPipe) projectId: string) {
    return this.service.list(projectId);
  }

  @Post()
  @HttpCode(202)
  @ApiOperation({ operationId: 'startDeployment', summary: 'Desplegar una versión validada' })
  @ApiZodBody(startDeploymentRequestSchema)
  @ApiZodResponse(202, 'Despliegue en preparación.', deploymentResponseSchema)
  start(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(startDeploymentRequestSchema))
    body: z.output<typeof startDeploymentRequestSchema>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.start(projectId, req.user.id, body);
  }

  @Post(':deploymentId/stop')
  @HttpCode(200)
  @ApiOperation({ operationId: 'stopDeployment', summary: 'Detener un despliegue' })
  @ApiZodResponse(200, 'Despliegue detenido.', deploymentResponseSchema)
  stop(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('deploymentId', uuidParamPipe) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.stop(projectId, req.user.id, id);
  }

  @Post(':deploymentId/start')
  @HttpCode(200)
  @ApiOperation({ operationId: 'resumeDeployment', summary: 'Iniciar de nuevo un despliegue' })
  @ApiZodBody(resumeDeploymentRequestSchema)
  @ApiZodResponse(200, 'Despliegue en ejecución.', deploymentResponseSchema)
  resume(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('deploymentId', uuidParamPipe) id: string,
    @Body(new ZodValidationPipe(resumeDeploymentRequestSchema))
    body: z.output<typeof resumeDeploymentRequestSchema>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.resume(projectId, req.user.id, id, body);
  }
}
