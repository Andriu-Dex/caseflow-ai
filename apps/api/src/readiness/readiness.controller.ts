import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';

import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { readinessResponseSchema } from '@caseflow-ai/contracts';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ApiZodResponse } from '../openapi/zod-openapi';
import { ReadinessService } from './readiness.service';

@ApiTags('readiness')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/readiness')
export class ReadinessController {
  constructor(private readonly service: ReadinessService) {}

  @Get()
  @ApiOperation({
    operationId: 'getProjectReadiness',
    summary: 'Consultar el estado de preparación del First Deliverable',
  })
  @ApiZodResponse(200, 'Readiness.', readinessResponseSchema)
  async get(@Param('projectId', uuidParamPipe) projectId: string) {
    const { ready, stages, blockers, warnings } = await this.service.evaluate(projectId);
    return { projectId, generatedAt: new Date().toISOString(), ready, stages, blockers, warnings };
  }
}
