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
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import {
  generatedFileListResponseSchema,
  generatedProjectSnapshotListResponseSchema,
  generatedProjectSnapshotResponseSchema,
  generatedFileResponseSchema,
  generationRunListResponseSchema,
  generationRunResponseSchema,
  sandboxRunListResponseSchema,
  sandboxRunResponseSchema,
  startGenerationRunRequestSchema,
} from '@caseflow-ai/contracts';
import { CONSTRUCTION_JOB_TYPES, type ConstructionJobType } from '@caseflow-ai/domain';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi';
import { GeneratedProjectSnapshotsService } from './generated-project-snapshots.service';
import { GenerationRunsService } from './generation-runs.service';
import { SandboxRunsService } from './sandbox-runs.service';
import { WorkflowRunsService } from './workflow-runs.service';

interface AuthenticatedRequest {
  user: { id: string };
}

@ApiTags('construction')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/generation-runs')
export class GenerationRunsController {
  constructor(
    private readonly service: GenerationRunsService,
    private readonly sandboxRuns: SandboxRunsService,
  ) {}

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

  @Post(':runId/archive')
  @HttpCode(200)
  @ApiOperation({ operationId: 'archiveGenerationRun', summary: 'Archivar una generación' })
  @ApiZodResponse(200, 'Generation run.', generationRunResponseSchema)
  archive(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('runId', uuidParamPipe) runId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.setArchived(projectId, runId, req.user.id, true);
  }

  @Post(':runId/restore')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'restoreGenerationRun',
    summary: 'Restaurar una generación archivada',
  })
  @ApiZodResponse(200, 'Generation run.', generationRunResponseSchema)
  restore(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('runId', uuidParamPipe) runId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.setArchived(projectId, runId, req.user.id, false);
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

  @Post(':runId/sandbox-runs')
  @HttpCode(202)
  @ApiOperation({
    operationId: 'startSandboxRun',
    summary: 'Encolar la validación del proyecto generado en el entorno aislado',
  })
  @ApiZodResponse(202, 'Sandbox run.', sandboxRunResponseSchema)
  validate(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('runId', uuidParamPipe) runId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.sandboxRuns.start(projectId, req.user.id, runId);
  }

  @Get(':runId/sandbox-runs')
  @ApiOperation({ operationId: 'listSandboxRuns', summary: 'Listar validaciones de una corrida' })
  @ApiZodResponse(200, 'Sandbox runs.', sandboxRunListResponseSchema)
  validations(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('runId', uuidParamPipe) runId: string,
  ) {
    return this.sandboxRuns.list(projectId, runId);
  }
}

@ApiTags('construction')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/generated-project-snapshots')
export class GeneratedProjectSnapshotsController {
  constructor(private readonly service: GeneratedProjectSnapshotsService) {}

  @Get()
  @ApiOperation({
    operationId: 'listGeneratedProjectSnapshots',
    summary: 'Listar proyectos generados y validados',
  })
  @ApiZodResponse(200, 'Snapshots.', generatedProjectSnapshotListResponseSchema)
  list(@Param('projectId', uuidParamPipe) projectId: string) {
    return this.service.list(projectId);
  }

  @Get(':snapshotId')
  @ApiOperation({ operationId: 'getGeneratedProjectSnapshot', summary: 'Consultar un snapshot' })
  @ApiZodResponse(200, 'Snapshot.', generatedProjectSnapshotResponseSchema)
  get(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('snapshotId', uuidParamPipe) snapshotId: string,
  ) {
    return this.service.get(projectId, snapshotId);
  }

  @Get(':snapshotId/archive')
  @ApiOperation({
    operationId: 'downloadGeneratedProjectSnapshot',
    summary: 'Descargar el ZIP del proyecto generado',
  })
  async archive(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('snapshotId', uuidParamPipe) snapshotId: string,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const { body, filename } = await this.service.archive(projectId, snapshotId, req.user.id);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(body);
  }
}

// Worker callback (never reachable without the internal jobs secret): runs
// the Construction job the queue delivered.
@ApiTags('internal construction jobs')
@Controller('projects/:projectId/construction-jobs')
export class InternalConstructionJobsController {
  constructor(
    private readonly generationRuns: GenerationRunsService,
    private readonly sandboxRuns: SandboxRunsService,
    private readonly workflowRuns: WorkflowRunsService,
  ) {}

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
    // A validation can outlast the worker's HTTP timeout: acknowledge and run
    // it here. runJob always records a terminal status and never throws.
    // ponytail: a crash of the API mid-run leaves it RUNNING; add a stale-run
    // sweeper if that is ever observed.
    if (type === 'sandbox-run') {
      void this.sandboxRuns.runJob(projectId, runId).catch(() => undefined);
      return;
    }
    // A route orchestration takes many minutes: same acknowledge-and-run.
    void this.workflowRuns.runJob(projectId, runId).catch(() => undefined);
  }
}
