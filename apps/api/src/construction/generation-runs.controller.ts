import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import {
  generatedFileListResponseSchema,
  generatedFileResponseSchema,
  generationRunListResponseSchema,
  generationRunResponseSchema,
  startGenerationRunRequestSchema,
} from '@caseflow-ai/contracts';
import { CONSTRUCTION_JOB_TYPES, type ConstructionJobType } from '@caseflow-ai/domain';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi';
import { GenerationRunsService } from './generation-runs.service';

interface AuthenticatedRequest {
  user: { id: string };
}

@ApiTags('construction')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/generation-runs')
export class GenerationRunsController {
  constructor(private readonly service: GenerationRunsService) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({
    operationId: 'startGenerationRun',
    summary: 'Encolar la generación de código desde un plan de implementación aprobado',
  })
  @ApiZodBody(startGenerationRunRequestSchema)
  @ApiZodResponse(202, 'Generation run.', generationRunResponseSchema)
  start(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(startGenerationRunRequestSchema))
    body: z.output<typeof startGenerationRunRequestSchema>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.start(projectId, req.user.id, body.implementationPlanVersionId);
  }

  @Get()
  @ApiOperation({ operationId: 'listGenerationRuns', summary: 'Listar corridas de generación' })
  @ApiZodResponse(200, 'Generation runs.', generationRunListResponseSchema)
  list(@Param('projectId', uuidParamPipe) projectId: string) {
    return this.service.list(projectId);
  }

  @Get(':runId')
  @ApiOperation({ operationId: 'getGenerationRun', summary: 'Consultar una corrida' })
  @ApiZodResponse(200, 'Generation run.', generationRunResponseSchema)
  get(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('runId', uuidParamPipe) runId: string,
  ) {
    return this.service.get(projectId, runId);
  }

  @Get(':runId/files')
  @ApiOperation({ operationId: 'listGeneratedFiles', summary: 'Listar archivos generados' })
  @ApiZodResponse(200, 'Generated files.', generatedFileListResponseSchema)
  files(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('runId', uuidParamPipe) runId: string,
  ) {
    return this.service.listFiles(projectId, runId);
  }

  @Get(':runId/files/:fileId')
  @ApiOperation({ operationId: 'getGeneratedFile', summary: 'Consultar un archivo generado' })
  @ApiZodResponse(200, 'Generated file.', generatedFileResponseSchema)
  file(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('runId', uuidParamPipe) runId: string,
    @Param('fileId', uuidParamPipe) fileId: string,
  ) {
    return this.service.getFile(projectId, runId, fileId);
  }
}

// Worker callback (never reachable without the internal jobs secret): runs
// the Construction job the queue delivered.
@ApiTags('internal construction jobs')
@Controller('projects/:projectId/construction-jobs')
export class InternalConstructionJobsController {
  constructor(private readonly generationRuns: GenerationRunsService) {}

  @Post(':type/:runId/run')
  @HttpCode(204)
  @ApiOperation({ operationId: 'runConstructionJob', summary: 'Ejecutar un trabajo (interno)' })
  async run(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('type') type: string,
    @Param('runId', uuidParamPipe) runId: string,
    @Headers('x-internal-jobs-secret') secret: string | undefined,
  ): Promise<void> {
    const expected = process.env.INTERNAL_JOBS_SECRET;
    if (
      !expected ||
      !secret ||
      secret.length !== expected.length ||
      !timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
    )
      throw new UnauthorizedException();
    if (!(CONSTRUCTION_JOB_TYPES as readonly string[]).includes(type))
      throw new NotFoundException();
    await this.dispatch(type as ConstructionJobType, projectId, runId);
  }

  private async dispatch(type: ConstructionJobType, projectId: string, runId: string) {
    if (type === 'generation-run') return this.generationRuns.runJob(projectId, runId);
    throw new NotFoundException();
  }
}
