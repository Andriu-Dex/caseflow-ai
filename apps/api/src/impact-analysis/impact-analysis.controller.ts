import { UseGuards, Controller, Get, Param } from '@nestjs/common';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiZodResponse } from '../openapi/zod-openapi';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ImpactAnalysisService } from './impact-analysis.service';
import { impactAnalysisResponseSchema } from '@caseflow-ai/contracts';

@ApiTags('impact-analysis')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/impact-analysis')
export class ImpactAnalysisController {
  constructor(private readonly service: ImpactAnalysisService) {}

  @Get(':artifactVersionId')
  @ApiOperation({
    operationId: 'getImpactAnalysis',
    summary: 'Analizar impacto de un cambio',
  })
  @ApiZodResponse(200, 'Impact analysis results.', impactAnalysisResponseSchema)
  async analyze(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('artifactVersionId', uuidParamPipe) artifactVersionId: string,
  ) {
    return this.service.analyzeImpact(projectId, artifactVersionId);
  }
}
