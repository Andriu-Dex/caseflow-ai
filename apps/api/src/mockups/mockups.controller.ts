import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createMockupRequestSchema,
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
@Controller('projects/:projectId/mockups')
export class MockupsController {
  constructor(private readonly service: MockupsService) {}

  @Post()
  @ApiOperation({ operationId: 'createMockup', summary: 'Generar boceto desde un plano aprobado' })
  @ApiZodBody(createMockupRequestSchema)
  @ApiZodResponse(201, 'Mockup.', mockupResponseSchema)
  create(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(createMockupRequestSchema))
    body: z.output<typeof createMockupRequestSchema>,
  ) {
    return this.service.create(projectId, body.uiBlueprintVersionId);
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
    const { body, contentType } = await this.service.downloadScreenImage(
      projectId,
      mockupId,
      screenId,
    );
    res.setHeader('Content-Type', contentType);
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
  @ApiOperation({ operationId: 'createMockupVersion', summary: 'Regenerar versión de mockup' })
  @ApiZodBody(createMockupRequestSchema)
  @ApiZodResponse(201, 'Mockup.', mockupResponseSchema)
  version(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('mockupId', uuidParamPipe) mockupId: string,
    @Body(new ZodValidationPipe(createMockupRequestSchema))
    body: z.output<typeof createMockupRequestSchema>,
  ) {
    return this.service.version(projectId, mockupId, body.uiBlueprintVersionId);
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
