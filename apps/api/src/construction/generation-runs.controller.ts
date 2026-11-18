import { TechnicalHandoverService } from './technical-handover.service';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Request,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import {
  deliveryQuerySchema,
  constructionUnitListResponseSchema,
  constructionUnitReviewRequestSchema,
  constructionUnitSchema,
  type ConstructionUnitReviewRequest,
  generatedFileListResponseSchema,
  generatedProjectSnapshotListResponseSchema,
  generatedProjectSnapshotResponseSchema,
  generatedFileResponseSchema,
  generationRunListResponseSchema,
  generationRunResponseSchema,
  sandboxRunListResponseSchema,
  sandboxRunResponseSchema,
  startGenerationRunRequestSchema,
  createWorkingCopyRequestSchema,
  importManualImplementationRequestSchema,
  constructionPreviewResponseSchema,
  generationEstimateResponseSchema,
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
import { UserManualsService } from '../user-manuals/user-manuals.service';
import { MANUAL_IMPORT_LIMITS } from './manual-import';

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

  @Post('working-copies')
  @HttpCode(201)
  @ApiOperation({
    operationId: 'createWorkingCopy',
    summary: 'Integrar una versión de trabajo sin inferencias ni publicación oficial',
  })
  @ApiZodBody(createWorkingCopyRequestSchema)
  @ApiZodResponse(201, 'Working copy.', generationRunResponseSchema)
  workingCopy(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(createWorkingCopyRequestSchema))
    body: z.output<typeof createWorkingCopyRequestSchema>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.createWorkingCopy(projectId, req.user.id, body);
  }

  @Get('preview/:implementationPlanVersionId')
  @ApiOperation({
    operationId: 'previewConstruction',
    summary: 'Consultar los contenedores y archivos que producirá un plan de implementación',
  })
  @ApiZodResponse(200, 'Construction preview.', constructionPreviewResponseSchema)
  preview(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('implementationPlanVersionId', uuidParamPipe) versionId: string,
    @Query(new ZodValidationPipe(deliveryQuerySchema))
    query: z.output<typeof deliveryQuerySchema>,
  ) {
    return this.service.preview(projectId, versionId, query.deliveryId);
  }

  @Get('estimate/:implementationPlanVersionId')
  @ApiOperation({
    operationId: 'estimateGeneration',
    summary: 'Estimar las solicitudes a la IA que haría una generación desde un plan',
  })
  @ApiZodResponse(200, 'Generation estimate.', generationEstimateResponseSchema)
  estimate(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('implementationPlanVersionId', uuidParamPipe) versionId: string,
    @Query(new ZodValidationPipe(deliveryQuerySchema))
    query: z.output<typeof deliveryQuerySchema>,
  ) {
    return this.service.estimate(projectId, versionId, query.deliveryId);
  }

  @Post('manual')
  @HttpCode(201)
  @ApiOperation({
    operationId: 'importManualImplementation',
    summary: 'Importar el código de un proyecto escrito a mano como una corrida de construcción',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'implementationPlanVersionId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        implementationPlanVersionId: { type: 'string', format: 'uuid' },
        deliveryId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiZodResponse(201, 'Generation run.', generationRunResponseSchema)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MANUAL_IMPORT_LIMITS.archiveBytes } }),
  )
  importManual(
    @Param('projectId', uuidParamPipe) projectId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(importManualImplementationRequestSchema))
    body: z.output<typeof importManualImplementationRequestSchema>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.importManual(
      projectId,
      req.user.id,
      body.implementationPlanVersionId,
      file?.buffer,
      body.deliveryId,
    );
  }

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
    return this.service.start(
      projectId,
      req.user.id,
      body.implementationPlanVersionId,
      body.deliveryId,
    );
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

  @Get(':runId/units')
  @ApiOperation({
    operationId: 'listConstructionUnits',
    summary: 'Listar el código generado por unidades de construcción',
  })
  @ApiZodResponse(200, 'Construction units.', constructionUnitListResponseSchema)
  units(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('runId', uuidParamPipe) runId: string,
  ) {
    return this.service.units(projectId, runId);
  }

  @Post(':runId/units/review')
  @ApiOperation({
    operationId: 'reviewConstructionUnit',
    summary: 'Marcar o desmarcar una unidad de construcción como revisada',
  })
  @ApiZodBody(constructionUnitReviewRequestSchema)
  @ApiZodResponse(201, 'Construction unit.', constructionUnitSchema)
  reviewUnit(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('runId', uuidParamPipe) runId: string,
    @Request() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(constructionUnitReviewRequestSchema))
    body: ConstructionUnitReviewRequest,
  ) {
    return this.service.reviewUnit(projectId, runId, req.user.id, body);
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
  constructor(
    private readonly service: GeneratedProjectSnapshotsService,
    private readonly handoverService: TechnicalHandoverService,
  ) {}

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

  // DEC-174: the code with the documentation for whoever maintains it.
  @Get(':snapshotId/handover')
  @ApiOperation({
    operationId: 'downloadTechnicalHandover',
    summary: 'Descargar la entrega técnica del proyecto validado',
  })
  async handover(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('snapshotId', uuidParamPipe) snapshotId: string,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const { body, filename } = await this.handoverService.package(
      projectId,
      snapshotId,
      req.user.id,
    );
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
    private readonly userManuals: UserManualsService,
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
    if (type === 'user-manual') {
      // Image preparation can outlast the worker's HTTP connection.
      void this.userManuals.runJob(projectId, runId).catch(() => undefined);
      return;
    }
    if (type === 'generation-run') {
      // Design adaptation runs one screen at a time and may outlast the worker request.
      void this.generationRuns.runJob(projectId, runId).catch(() => undefined);
      return;
    }
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
