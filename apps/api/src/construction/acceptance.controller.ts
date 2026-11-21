import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { acceptanceReportResponseSchema } from '@caseflow-ai/contracts';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ApiErrorResponse, ApiUuidParam, ApiZodResponse } from '../openapi/zod-openapi';
import { AcceptanceService } from './acceptance.service';

@ApiTags('construction')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/generation-runs/:runId/acceptance')
export class AcceptanceController {
  constructor(private readonly service: AcceptanceService) {}

  @Get()
  @ApiOperation({
    operationId: 'getAcceptanceReport',
    summary: "Acceptance criteria of a run and each requirement's result (ADR-025)",
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiUuidParam('runId', 'Construction run.')
  @ApiZodResponse(200, 'Criteria, results and requirements.', acceptanceReportResponseSchema)
  @ApiErrorResponse(404, 'The run does not exist in the project.')
  report(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('runId', uuidParamPipe) runId: string,
  ) {
    return this.service.report(projectId, runId);
  }
}
