import { Body, Controller, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  PIPELINE_ORDER,
  confirmStageRequestSchema,
  readinessResponseSchema,
} from '@caseflow-ai/contracts';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi';
import { ReadinessService } from './readiness.service';

@ApiTags('readiness')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/stages')
export class StageConfirmationsController {
  constructor(private readonly readiness: ReadinessService) {}

  @Post(':stage/confirm')
  @ApiOperation({
    operationId: 'confirmStageCurrent',
    summary: 'Confirmar que un paso sigue vigente',
  })
  @ApiZodBody(confirmStageRequestSchema)
  @ApiZodResponse(201, 'Readiness after review.', readinessResponseSchema)
  confirm(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('stage', new ZodValidationPipe(z.enum(PIPELINE_ORDER)))
    stage: (typeof PIPELINE_ORDER)[number],
    @Body(new ZodValidationPipe(confirmStageRequestSchema))
    body: z.output<typeof confirmStageRequestSchema>,
    @Request() request: { user: { id: string } },
  ) {
    return this.readiness.confirmCurrent(projectId, stage, request.user.id, body.note);
  }
}
