import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  acceptSourceReportCandidateRequestSchema,
  manualSourceReportInputSchema,
  manualTranscriptInputSchema,
  sourceListResponseSchema,
  sourceMetadataInputSchema,
  sourceReportCandidateSchema,
  sourceReportResponseSchema,
  sourceResponseSchema,
  SOURCE_MAX_FILE_SIZE_BYTES,
  type SourceMetadataInput,
} from '@caseflow-ai/contracts';
import type { z } from 'zod';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiErrorResponse, ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi';
import { SourcesService } from './sources.service';

@ApiTags('sources')
@Controller('projects/:projectId/sources')
export class SourcesController {
  constructor(private readonly service: SourcesService) {}

  @Post()
  @ApiOperation({ operationId: 'createSource', summary: 'Subir una fuente de proyecto' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'sourceKind', 'purpose', 'description'],
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
        sourceKind: { type: 'string' },
        purpose: { type: 'string' },
        businessArea: { type: 'string' },
        description: { type: 'string' },
        language: { type: 'string' },
      },
    },
  })
  @ApiZodResponse(201, 'Project Source.', sourceResponseSchema)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: SOURCE_MAX_FILE_SIZE_BYTES } }))
  create(
    @Param('projectId', uuidParamPipe) projectId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(sourceMetadataInputSchema)) metadata: SourceMetadataInput,
  ) {
    return this.service.create(projectId, metadata, file);
  }

  @Get()
  @ApiOperation({ operationId: 'listSources', summary: 'Listar fuentes del proyecto' })
  @ApiZodResponse(200, 'Project Sources.', sourceListResponseSchema)
  list(@Param('projectId', uuidParamPipe) projectId: string) {
    return this.service.list(projectId);
  }

  @Get(':sourceId')
  @ApiOperation({ operationId: 'getSource', summary: 'Consultar una fuente' })
  @ApiZodResponse(200, 'Project Source.', sourceResponseSchema)
  get(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('sourceId', uuidParamPipe) sourceId: string,
  ) {
    return this.service.get(projectId, sourceId);
  }

  @Get(':sourceId/download')
  @ApiOperation({ operationId: 'downloadSource', summary: 'Descargar el archivo original' })
  async download(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('sourceId', uuidParamPipe) sourceId: string,
    @Res() res: Response,
  ) {
    const { body, mimeType, filename } = await this.service.download(projectId, sourceId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(body);
  }

  @Post(':sourceId/manual-transcript')
  @ApiOperation({
    operationId: 'submitSourceManualTranscript',
    summary: 'Registrar transcripción/interpretación manual',
  })
  @ApiZodBody(manualTranscriptInputSchema)
  @ApiZodResponse(201, 'Project Source.', sourceResponseSchema)
  manualTranscript(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('sourceId', uuidParamPipe) sourceId: string,
    @Body(new ZodValidationPipe(manualTranscriptInputSchema))
    body: z.output<typeof manualTranscriptInputSchema>,
  ) {
    return this.service.submitManualTranscript(projectId, sourceId, body.transcript);
  }

  @Post(':sourceId/edit')
  @ApiOperation({
    operationId: 'editSourceMetadata',
    summary: 'Editar metadatos (crea una nueva versión)',
  })
  @ApiZodBody(sourceMetadataInputSchema)
  @ApiZodResponse(201, 'Project Source.', sourceResponseSchema)
  edit(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('sourceId', uuidParamPipe) sourceId: string,
    @Body(new ZodValidationPipe(sourceMetadataInputSchema)) metadata: SourceMetadataInput,
  ) {
    return this.service.editMetadata(projectId, sourceId, metadata);
  }

  @Delete(':sourceId')
  @HttpCode(204)
  @ApiOperation({
    operationId: 'deleteSource',
    summary: 'Eliminar una fuente que nunca fue aprobada',
  })
  @ApiErrorResponse(404, 'La fuente no existe.')
  @ApiErrorResponse(422, 'La fuente tiene versiones aprobadas y no puede eliminarse.')
  delete(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('sourceId', uuidParamPipe) sourceId: string,
  ) {
    return this.service.delete(projectId, sourceId);
  }

  @Post(':sourceId/versions/:versionId/transition')
  @ApiOperation({ operationId: 'transitionSourceVersion', summary: 'Transicionar el estado' })
  transition(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('sourceId', uuidParamPipe) sourceId: string,
    @Param('versionId', uuidParamPipe) versionId: string,
    @Body('status') status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED',
  ) {
    return this.service.transition(projectId, sourceId, versionId, status);
  }

  @Post(':sourceId/report/generate')
  @ApiOperation({ operationId: 'generateSourceReport', summary: 'Generar informe/interpretación' })
  @ApiZodResponse(201, 'Source Report Candidate.', sourceReportCandidateSchema)
  generateReport(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('sourceId', uuidParamPipe) sourceId: string,
  ) {
    return this.service.generateReport(projectId, sourceId);
  }

  @Get(':sourceId/report')
  @ApiOperation({ operationId: 'getSourceReport', summary: 'Consultar el informe aprobado' })
  @ApiZodResponse(200, 'Source Report.', sourceReportResponseSchema)
  getReport(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('sourceId', uuidParamPipe) sourceId: string,
  ) {
    return this.service.getReport(projectId, sourceId);
  }

  @Post(':sourceId/report/accept')
  @ApiOperation({ operationId: 'acceptSourceReport', summary: 'Aceptar un candidato de informe' })
  @ApiZodBody(acceptSourceReportCandidateRequestSchema)
  @ApiZodResponse(201, 'Source Report.', sourceReportResponseSchema)
  acceptReport(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('sourceId', uuidParamPipe) sourceId: string,
    @Body(new ZodValidationPipe(acceptSourceReportCandidateRequestSchema))
    body: z.output<typeof acceptSourceReportCandidateRequestSchema>,
  ) {
    return this.service.acceptReport(projectId, sourceId, body.candidateId);
  }

  @Post(':sourceId/report/manual')
  @ApiOperation({ operationId: 'submitManualSourceReport', summary: 'Registrar informe manual' })
  @ApiZodBody(manualSourceReportInputSchema)
  @ApiZodResponse(201, 'Source Report.', sourceReportResponseSchema)
  manualReport(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('sourceId', uuidParamPipe) sourceId: string,
    @Body(new ZodValidationPipe(manualSourceReportInputSchema))
    body: z.output<typeof manualSourceReportInputSchema>,
  ) {
    return this.service.submitManualReport(projectId, sourceId, body.content);
  }
}
