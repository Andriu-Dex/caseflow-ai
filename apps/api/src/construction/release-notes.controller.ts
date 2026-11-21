import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { releaseNotesResponseSchema } from '@caseflow-ai/contracts';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ApiErrorResponse, ApiUuidParam, ApiZodResponse } from '../openapi/zod-openapi';
import { ReleaseNotesService } from './release-notes.service';

@ApiTags('construction')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/generation-runs/:runId/release-notes')
export class ReleaseNotesController {
  constructor(private readonly service: ReleaseNotesService) {}

  @Get()
  @ApiOperation({
    operationId: 'getReleaseNotes',
    summary: 'Plain-language notes of a delivery or construction (DEC-173)',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiUuidParam('runId', 'Construction run.')
  @ApiZodResponse(200, 'The notes, also as Markdown.', releaseNotesResponseSchema)
  @ApiErrorResponse(404, 'The run does not exist in the project.')
  notes(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('runId', uuidParamPipe) runId: string,
  ) {
    return this.service.notes(projectId, runId);
  }
}
