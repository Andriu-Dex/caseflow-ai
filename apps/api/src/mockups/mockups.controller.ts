import { UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../identity/jwt-auth.guard";
import { ProjectMembershipGuard } from "../identity/project-membership.guard";

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createMockupRequestSchema,
  mockupJobResponseSchema,
  mockupListResponseSchema,
  mockupPreviewResponseSchema,
  mockupResponseSchema,
  transitionArtifactVersionRequestSchema,
  type ArtifactVersionStatus,
} from '@caseflow-ai/contracts';
import { z } from 'zod';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi';
import { MockupsService } from './mockups.service';

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
    return this.service.create(projectId, body.uiBlueprintVersionId, body.deviceType);
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

  // Invoked only by apps/worker after popping the job off the queue — never
  // reachable from the browser. A shared secret (never the projectId/jobId
  // alone, spec §33.1) is the only authorization here since this repo has no
  // end-user session/auth layer yet.
  @Post('jobs/:jobId/run')
  @HttpCode(204)
  @ApiOperation({ operationId: 'runMockupJob', summary: 'Ejecutar un trabajo encolado (interno)' })
  async runJob(
    @Param('jobId', uuidParamPipe) jobId: string,
    @Headers('x-internal-jobs-secret') secret: string | undefined,
  ) {
    const expected = process.env.INTERNAL_JOBS_SECRET;
    if (!expected || secret !== expected) throw new UnauthorizedException();
    await this.service.runJob(jobId);
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
    return this.service.version(projectId, mockupId, body.uiBlueprintVersionId, body.deviceType);
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
