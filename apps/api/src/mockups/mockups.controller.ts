import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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
  @ApiOperation({ operationId: 'createMockup', summary: 'Generar mockup determinístico' })
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
  @ApiOperation({ operationId: 'getMockupPreview', summary: 'Obtener vista previa determinística' })
  @ApiZodResponse(200, 'Mockup preview.', mockupPreviewResponseSchema)
  preview(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('mockupId', uuidParamPipe) mockupId: string,
  ) {
    return this.service.getPreview(projectId, mockupId);
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
