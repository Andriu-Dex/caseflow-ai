import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  applyStartingPointResponseSchema,
  saveStartingPointRequestSchema,
  startingPointIdSchema,
  startingPointListResponseSchema,
  startingPointSchema,
} from '@caseflow-ai/contracts';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiErrorResponse, ApiUuidParam, ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi';
import { StartingPointsService } from './starting-points.service';

interface AuthenticatedRequest {
  user: { id: string };
}

// DEC-176: starting points of the project's workspace and the built-in ones.
@ApiTags('starting points')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/starting-points')
export class StartingPointsController {
  constructor(private readonly service: StartingPointsService) {}

  @Get()
  @ApiOperation({ operationId: 'listStartingPoints', summary: 'List the starting points' })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiZodResponse(200, 'Built-in and saved starting points.', startingPointListResponseSchema)
  list(@Param('projectId', uuidParamPipe) projectId: string) {
    return this.service.list(projectId);
  }

  @Post()
  @ApiOperation({
    operationId: 'saveStartingPoint',
    summary: "Save the project's approved requirements, use cases and data model",
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiZodBody(saveStartingPointRequestSchema)
  @ApiZodResponse(201, 'The saved starting point.', startingPointSchema)
  @ApiErrorResponse(422, 'The project has no approved requirements.')
  save(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(saveStartingPointRequestSchema))
    body: z.output<typeof saveStartingPointRequestSchema>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.save(projectId, req.user.id, body);
  }

  @Post(':startingPointId/apply')
  @ApiOperation({
    operationId: 'applyStartingPoint',
    summary: 'Copy a starting point into the project as drafts',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiParam({ name: 'startingPointId', description: 'Saved or built-in starting point.' })
  @ApiZodResponse(201, 'How many artifacts were copied.', applyStartingPointResponseSchema)
  @ApiErrorResponse(404, 'The starting point does not exist in the workspace.')
  apply(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('startingPointId', new ZodValidationPipe(startingPointIdSchema)) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.apply(projectId, req.user.id, id);
  }

  @Delete(':startingPointId')
  @HttpCode(204)
  @ApiOperation({ operationId: 'deleteStartingPoint', summary: 'Delete a saved starting point' })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiParam({ name: 'startingPointId', description: 'Saved starting point.' })
  @ApiErrorResponse(403, 'Built-in starting points cannot be deleted.')
  async remove(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('startingPointId', new ZodValidationPipe(startingPointIdSchema)) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await this.service.remove(projectId, req.user.id, id);
  }
}
