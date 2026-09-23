import { BadRequestException, Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { firstDeliverableExportSchema } from '@caseflow-ai/contracts';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ApiZodResponse } from '../openapi/zod-openapi';
import { renderExportHtml } from './export-html';
import { ExportService } from './export.service';

const EXPORT_FORMATS = ['json', 'html'] as const;
type ExportFormat = (typeof EXPORT_FORMATS)[number];

@ApiTags('export')
@Controller('projects/:projectId/export')
export class ExportController {
  constructor(private readonly service: ExportService) {}

  @Get()
  @ApiOperation({
    operationId: 'getProjectExport',
    summary: 'Exportar el First Deliverable vigente del proyecto',
  })
  @ApiQuery({ name: 'format', enum: EXPORT_FORMATS, required: false })
  @ApiZodResponse(200, 'First Deliverable export (JSON).', firstDeliverableExportSchema)
  async get(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const resolved = this.resolveFormat(format);
    const snapshot = firstDeliverableExportSchema.parse(
      await this.service.buildSnapshot(projectId),
    );
    // Deterministic filename derived only from the projectId, never from the
    // project's own (untrusted) display name — never a filesystem path
    // segment from user-controlled content.
    const filename = `first-deliverable-${projectId}.${resolved}`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (resolved === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return renderExportHtml(snapshot);
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return snapshot;
  }

  private resolveFormat(format: string | undefined): ExportFormat {
    if (format === undefined) return 'json';
    if ((EXPORT_FORMATS as readonly string[]).includes(format)) return format as ExportFormat;
    throw new BadRequestException('El parámetro format debe ser "json" o "html".');
  }
}
