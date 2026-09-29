import { UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../identity/jwt-auth.guard";
import { ProjectMembershipGuard } from "../identity/project-membership.guard";

import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { stalenessAnalysisResponseSchema } from '@caseflow-ai/contracts';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ApiZodResponse } from '../openapi/zod-openapi';
import { StalenessService } from './staleness.service';

@ApiTags('staleness')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/staleness')
export class StalenessController {
  constructor(private readonly service: StalenessService) {}

  @Get()
  @ApiOperation({
    operationId: 'getProjectStaleness',
    summary: 'Consultar impacto potencial por conocimiento de fuente más reciente',
  })
  @ApiZodResponse(200, 'Staleness analysis.', stalenessAnalysisResponseSchema)
  async get(@Param('projectId', uuidParamPipe) projectId: string) {
    const { entries } = await this.service.analyzeProject(projectId);
    return { projectId, generatedAt: new Date().toISOString(), entries };
  }
}
