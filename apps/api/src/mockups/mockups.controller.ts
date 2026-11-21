import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Request,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createMockupRequestSchema,
  generateMockupScreensRequestSchema,
  importManualMockupRequestSchema,
  mockupScreenHistoryResponseSchema,
  restoreMockupScreenRequestSchema,
  mockupJobResponseSchema,
  mockupListResponseSchema,
  mockupPreviewResponseSchema,
  mockupResponseSchema,
  refineMockupRequestSchema,
  transitionArtifactVersionRequestSchema,
  type ArtifactVersionStatus,
} from '@caseflow-ai/contracts';
import { z } from 'zod';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi';
import { MockupsService } from './mockups.service';
import { MANUAL_MOCKUP_LIMITS } from './manual-mockup-archive';

@ApiTags('mockups')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/mockups')
export class MockupsController {
  constructor(private readonly service: MockupsService) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({
    operationId: 'createMockup',
    summary: 'Encolar la generación de un boceto desde un plano aprobado',
  })
  @ApiZodBody(createMockupRequestSchema)
  @ApiZodResponse(202, 'Mockup generation job.', mockupJobResponseSchema)
  create(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(createMockupRequestSchema))
    body: z.output<typeof createMockupRequestSchema>,
  ) {
    return this.service.create(
      projectId,
      body.uiBlueprintVersionId,
      body.deviceType,
      body.generator,
      body.screenLocalIds ?? [],
    );
  }

  @Post('manual')
  @HttpCode(201)
  @ApiOperation({
    operationId: 'importManualMockup',
    summary: 'Importar un boceto escrito a mano en HTML y CSS, con una imagen por pantalla',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'uiBlueprintVersionId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        uiBlueprintVersionId: { type: 'string', format: 'uuid' },
        deviceType: { type: 'string', enum: ['DESKTOP', 'MOBILE'] },
        mockupId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiZodResponse(201, 'Mockup.', mockupResponseSchema)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MANUAL_MOCKUP_LIMITS.archiveBytes } }),
  )
  importManual(
    @Param('projectId', uuidParamPipe) projectId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(importManualMockupRequestSchema))
    body: z.output<typeof importManualMockupRequestSchema>,
  ) {
    return this.service.importManual(
      projectId,
      body.uiBlueprintVersionId,
      body.deviceType,
      body.mockupId,
      file?.buffer,
    );
  }

  // Declared before 'jobs/:jobId' so "latest" is not read as an identifier.
  @Get('jobs/latest')
  @ApiOperation({
    operationId: 'getLatestMockupJob',
    summary: 'Consultar el último trabajo de bocetos',
  })
  latestJob(@Param('projectId', uuidParamPipe) projectId: string) {
    return this.service.latestJob(projectId);
  }

  @Post('jobs/:jobId/cancel')
  @HttpCode(200)
  @ApiOperation({ operationId: 'cancelMockupJob', summary: 'Cancelar la generación de un boceto' })
  @ApiZodResponse(200, 'Mockup generation job.', mockupJobResponseSchema)
  cancelJob(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('jobId', uuidParamPipe) jobId: string,
    @Request() request: { user: { id: string } },
  ) {
    return this.service.cancelJob(projectId, jobId, request.user.id);
  }

  @Get('jobs/:jobId')
  @ApiOperation({ operationId: 'getMockupJob', summary: 'Consultar el estado de generación' })
  @ApiZodResponse(200, 'Mockup generation job.', mockupJobResponseSchema)
  getJob(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('jobId', uuidParamPipe) jobId: string,
  ) {
    return this.service.getJob(projectId, jobId);
  }

  @Get()
  @ApiOperation({ operationId: 'listMockups', summary: 'Listar mockups' })
  @ApiZodResponse(200, 'Mockups.', mockupListResponseSchema)
  list(@Param('projectId', uuidParamPipe) projectId: string) {
    return this.service.list(projectId);
  }

  @Get(':mockupId')
  @ApiOperation({ operationId: 'getMockup', summary: 'Consultar mockup' })
  @ApiZodResponse(200, 'Mockup.', mockupResponseSchema)
  get(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('mockupId', uuidParamPipe) mockupId: string,
  ) {
    return this.service.get(projectId, mockupId);
  }

  @Get(':mockupId/preview')
  @ApiOperation({ operationId: 'getMockupPreview', summary: 'Obtener vista previa del boceto' })
  @ApiZodResponse(200, 'Mockup preview.', mockupPreviewResponseSchema)
  preview(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('mockupId', uuidParamPipe) mockupId: string,
  ) {
    return this.service.getPreview(projectId, mockupId);
  }

  @Get(':mockupId/screens/:screenId/image')
  @ApiOperation({ operationId: 'getMockupScreenImage', summary: 'Descargar imagen de la pantalla' })
  async screenImage(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('mockupId', uuidParamPipe) mockupId: string,
    @Param('screenId', uuidParamPipe) screenId: string,
    @Res() res: Response,
  ) {
    const { body, contentType, fileName } = await this.service.downloadScreenImage(
      projectId,
      mockupId,
      screenId,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(body);
  }

  @Get(':mockupId/screens/download')
  @ApiOperation({
    operationId: 'downloadMockupScreens',
    summary: 'Descargar todas las pantallas en ZIP',
  })
  async downloadScreens(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('mockupId', uuidParamPipe) mockupId: string,
    @Res() res: Response,
  ) {
    const { body, fileName } = await this.service.downloadMockupScreensZip(projectId, mockupId);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(body);
  }

  @Get(':mockupId/screens/:screenId/html')
  @ApiOperation({
    operationId: 'getMockupScreenHtml',
    summary: 'Descargar HTML fuente de la pantalla',
  })
  async screenHtml(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('mockupId', uuidParamPipe) mockupId: string,
    @Param('screenId', uuidParamPipe) screenId: string,
    @Res() res: Response,
  ) {
    const { body } = await this.service.downloadScreenHtml(projectId, mockupId, screenId);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="pantalla.html"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.send(body);
  }

  @Post(':mockupId/versions')
  @HttpCode(202)
  @ApiOperation({
    operationId: 'createMockupVersion',
    summary: 'Encolar la regeneración de una versión de boceto',
  })
  @ApiZodBody(createMockupRequestSchema)
  @ApiZodResponse(202, 'Mockup generation job.', mockupJobResponseSchema)
  version(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('mockupId', uuidParamPipe) mockupId: string,
    @Body(new ZodValidationPipe(createMockupRequestSchema))
    body: z.output<typeof createMockupRequestSchema>,
  ) {
    return this.service.version(
      projectId,
      mockupId,
      body.uiBlueprintVersionId,
      body.deviceType,
      body.generator,
    );
  }

  @Post(':mockupId/carry-over')
  @ApiOperation({
    operationId: 'carryOverMockup',
    summary: 'Trasladar un boceto aprobado a una versión más reciente del plano sin regenerarlo',
  })
  @ApiZodBody(createMockupRequestSchema)
  @ApiZodResponse(201, 'Mockup.', mockupResponseSchema)
  carryOver(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('mockupId', uuidParamPipe) mockupId: string,
    @Body(new ZodValidationPipe(createMockupRequestSchema))
    body: z.output<typeof createMockupRequestSchema>,
  ) {
    return this.service.carryOver(projectId, mockupId, body.uiBlueprintVersionId);
  }

  @Post(':mockupId/refine')
  @HttpCode(202)
  @ApiOperation({
    operationId: 'refineMockup',
    summary: 'Encolar una nueva versión del boceto aplicando instrucciones de edición',
  })
  @ApiZodBody(refineMockupRequestSchema)
  @ApiZodResponse(202, 'Mockup generation job.', mockupJobResponseSchema)
  refine(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('mockupId', uuidParamPipe) mockupId: string,
    @Body(new ZodValidationPipe(refineMockupRequestSchema))
    body: z.output<typeof refineMockupRequestSchema>,
  ) {
    return this.service.refine(projectId, mockupId, body.prompt);
  }

  @Post(':mockupId/screens/generate')
  @HttpCode(202)
  @ApiOperation({
    operationId: 'generateMockupScreens',
    summary: 'Encolar la generación de algunas pantallas del boceto (ADR-029)',
  })
  @ApiZodBody(generateMockupScreensRequestSchema)
  @ApiZodResponse(202, 'Mockup generation job.', mockupJobResponseSchema)
  generateScreens(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('mockupId', uuidParamPipe) mockupId: string,
    @Body(new ZodValidationPipe(generateMockupScreensRequestSchema))
    body: z.output<typeof generateMockupScreensRequestSchema>,
  ) {
    return this.service.generateScreens(projectId, mockupId, body.screenLocalIds);
  }

  @Get(':mockupId/screen-history/:screenLocalId')
  @ApiOperation({
    operationId: 'getMockupScreenHistory',
    summary: 'Consultar la conversación de una pantalla del boceto (ADR-029)',
  })
  @ApiZodResponse(200, 'Screen history.', mockupScreenHistoryResponseSchema)
  screenHistory(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('mockupId', uuidParamPipe) mockupId: string,
    @Param('screenLocalId') screenLocalId: string,
  ) {
    return this.service.screenHistory(projectId, mockupId, screenLocalId.slice(0, 100));
  }

  @Post(':mockupId/screen-history/:screenLocalId/restore')
  @ApiOperation({
    operationId: 'restoreMockupScreen',
    summary: 'Restaurar una versión anterior de una pantalla del boceto (ADR-029)',
  })
  @ApiZodBody(restoreMockupScreenRequestSchema)
  @ApiZodResponse(201, 'Mockup.', mockupResponseSchema)
  restoreScreen(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('mockupId', uuidParamPipe) mockupId: string,
    @Param('screenLocalId') screenLocalId: string,
    @Body(new ZodValidationPipe(restoreMockupScreenRequestSchema))
    body: z.output<typeof restoreMockupScreenRequestSchema>,
  ) {
    return this.service.restoreScreen(
      projectId,
      mockupId,
      screenLocalId.slice(0, 100),
      body.screenId,
    );
  }

  @Post(':mockupId/screens/:screenId/refine')
  @HttpCode(202)
  @ApiOperation({
    operationId: 'refineMockupScreen',
    summary: 'Encolar una nueva versión del boceto editando una sola pantalla',
  })
  @ApiZodBody(refineMockupRequestSchema)
  @ApiZodResponse(202, 'Mockup generation job.', mockupJobResponseSchema)
  refineScreen(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('mockupId', uuidParamPipe) mockupId: string,
    @Param('screenId', uuidParamPipe) screenId: string,
    @Body(new ZodValidationPipe(refineMockupRequestSchema))
    body: z.output<typeof refineMockupRequestSchema>,
  ) {
    return this.service.refineScreen(projectId, mockupId, screenId, body.prompt);
  }

  @Post(':mockupId/versions/:versionId/transition')
  @ApiOperation({ operationId: 'transitionMockupVersion', summary: 'Cambiar estado del mockup' })
  @ApiZodBody(transitionArtifactVersionRequestSchema)
  transition(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('mockupId', uuidParamPipe) mockupId: string,
    @Param('versionId', uuidParamPipe) versionId: string,
    @Body(new ZodValidationPipe(transitionArtifactVersionRequestSchema))
    body: { status: ArtifactVersionStatus },
  ) {
    return this.service.transition(projectId, mockupId, versionId, body.status);
  }
}
