import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

interface AuthenticatedRequest extends Request {
  user: { id: string };
}
import {
  acceptSourceReportCandidateRequestSchema,
  listSourcesQuerySchema,
  manualSourceReportInputSchema,
  manualTranscriptInputSchema,
  sourceCapabilitiesResponseSchema,
  sourceListResponseSchema,
  sourceMetadataInputSchema,
  sourceReportJobResponseSchema,
  sourceReportResponseSchema,
  sourceResponseSchema,
  sourceTextResponseSchema,
  SOURCE_MAX_FILE_SIZE_BYTES,
  type SourceMetadataInput,
} from '@caseflow-ai/contracts';
import type { z } from 'zod';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiErrorResponse, ApiZodBody, ApiZodQuery, ApiZodResponse } from '../openapi/zod-openapi';
import { SourcesService } from './sources.service';

@ApiTags('sources')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/sources')
export class SourcesController {
  constructor(private readonly service: SourcesService) {}

  @Post()
  @ApiOperation({ operationId: 'createSource', summary: 'Subir una fuente de proyecto' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'sourceKind', 'purpose'],
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
  // Multer reads multipart file names as latin1 unless told otherwise, which
  // turned "Estándares.pdf" into "EstÃ¡ndares.pdf".
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: SOURCE_MAX_FILE_SIZE_BYTES },
      defParamCharset: 'utf8',
    }),
  )
  create(
    @Param('projectId', uuidParamPipe) projectId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(sourceMetadataInputSchema)) metadata: SourceMetadataInput,
  ) {
    return this.service.create(projectId, metadata, file);
  }

  @Get()
  @ApiOperation({ operationId: 'listSources', summary: 'Listar fuentes del proyecto' })
  @ApiZodQuery(listSourcesQuerySchema)
  @ApiZodResponse(200, 'Project Sources.', sourceListResponseSchema)
  @ApiErrorResponse(400, 'Los filtros no son válidos.')
  list(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Query(new ZodValidationPipe(listSourcesQuerySchema))
    query: z.output<typeof listSourcesQuerySchema>,
  ) {
    return this.service.search(projectId, query);
  }

  // Declared before ':sourceId' so the literal path is not read as an id.
  @Get('capabilities')
  @ApiOperation({
    operationId: 'getSourceCapabilities',
    summary: 'Qué puede extraerse automáticamente y con qué límites',
  })
  @ApiZodResponse(200, 'Source extraction capabilities.', sourceCapabilitiesResponseSchema)
  capabilities() {
    return this.service.capabilities();
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

  @Get(':sourceId/text')
  @ApiOperation({ operationId: 'getSourceText', summary: 'Consultar texto extraído' })
  @ApiZodResponse(200, 'Texto extraído.', sourceTextResponseSchema)
  getText(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('sourceId', uuidParamPipe) sourceId: string,
  ) {
    return this.service.getText(projectId, sourceId);
  }

  @Post(':sourceId/processing/retry')
  @ApiOperation({ operationId: 'retrySourceProcessing', summary: 'Reintentar extracción' })
  @ApiZodResponse(201, 'Project Source.', sourceResponseSchema)
  retryProcessing(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('sourceId', uuidParamPipe) sourceId: string,
  ) {
    return this.service.retryProcessing(projectId, sourceId);
  }

  @Post(':sourceId/re-extract')
  @ApiOperation({
    operationId: 'reExtractSource',
    summary: 'Volver a extraer el texto del archivo original en una nueva versión',
  })
  @ApiZodResponse(201, 'Project Source.', sourceResponseSchema)
  reExtract(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('sourceId', uuidParamPipe) sourceId: string,
  ) {
    return this.service.reExtract(projectId, sourceId);
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
    // RFC 6266: an ASCII fallback plus the exact UTF-8 name for every browser.
    const ascii = filename
      .normalize('NFD')
      .replace(/[^\x20-\x7e]/g, '')
      .replace(/["\\]/g, '');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${ascii || 'archivo'}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
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

  @Post(':sourceId/archive')
  @ApiOperation({
    operationId: 'archiveSource',
    summary: 'Archivar una fuente: deja de mostrarse y de usarse, con su historial (DEC-137)',
  })
  @ApiZodResponse(200, 'Project Source.', sourceResponseSchema)
  @ApiErrorResponse(404, 'La fuente no existe.')
  @ApiErrorResponse(422, 'La fuente ya está archivada.')
  archive(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('sourceId', uuidParamPipe) sourceId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.archive(projectId, sourceId, req.user.id);
  }

  @Post(':sourceId/unarchive')
  @ApiOperation({
    operationId: 'restoreSource',
    summary: 'Restaurar una fuente archivada',
  })
  @ApiZodResponse(200, 'Project Source.', sourceResponseSchema)
  @ApiErrorResponse(404, 'La fuente no existe.')
  @ApiErrorResponse(422, 'La fuente no está archivada.')
  restore(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('sourceId', uuidParamPipe) sourceId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.restore(projectId, sourceId, req.user.id);
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

  // DEC-127: the report is generated in the background, part by part when
  // the source is long; this starts (or resumes) it and answers at once.
  @Post(':sourceId/report/generate')
  @ApiOperation({
    operationId: 'generateSourceReport',
    summary: 'Generar el informe en segundo plano',
  })
  @ApiZodResponse(201, 'Source report job.', sourceReportJobResponseSchema)
  generateReport(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('sourceId', uuidParamPipe) sourceId: string,
  ) {
    return this.service.requestReport(projectId, sourceId);
  }

  @Get(':sourceId/report-job')
  @ApiOperation({
    operationId: 'getSourceReportJob',
    summary: 'Consultar el progreso del informe en segundo plano',
  })
  @ApiZodResponse(200, 'Source report job.', sourceReportJobResponseSchema)
  getReportJob(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('sourceId', uuidParamPipe) sourceId: string,
  ) {
    return this.service.reportJob(projectId, sourceId);
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
