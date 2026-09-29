import { Controller, Get, Post, Body, Param, UseGuards, Query, Res, Request } from '@nestjs/common';
import type { Response } from 'express';
import { BaselinesService } from './baselines.service';
import { ExportService } from '../export/export.service';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';
import { createBaselineRequestSchema } from '@caseflow-ai/contracts';

interface AuthenticatedRequest {
  user: { id: string };
}

@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/baselines')
export class BaselinesController {
  constructor(
    private readonly baselinesService: BaselinesService,
    private readonly exportService: ExportService,
  ) {}

  @Post()
  async create(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @Request() req: AuthenticatedRequest,
  ) {
    const data = createBaselineRequestSchema.parse(body);
    return this.baselinesService.create(
      projectId,
      data.label,
      data.description || undefined,
      req.user.id,
    );
  }

  @Get()
  async findAll(@Param('projectId') projectId: string) {
    return this.baselinesService.findAll(projectId);
  }

  @Get(':id')
  async findOne(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.baselinesService.findOne(projectId, id);
  }

  @Get(':id/export')
  async export(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const baseline = await this.baselinesService.findOne(projectId, id);
    const artifactVersionIds: Record<string, string> = {};
    for (const entry of baseline.entries) {
      artifactVersionIds[entry.artifactId] = entry.artifactVersionId;
    }
    const rawSnapshot = await this.exportService.buildSnapshot(projectId, { artifactVersionIds });
    const { firstDeliverableExportSchema } = await import('@caseflow-ai/contracts');
    const snapshot = firstDeliverableExportSchema.parse(rawSnapshot);

    const resolved = format === 'html' ? 'html' : 'json';
    const filename = `baseline-${id}.${resolved}`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    if (resolved === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      // Require renderExportHtml
      const { renderExportHtml } = await import('../export/export-html');
      return renderExportHtml(snapshot, await this.exportService.mockupImageDataUrls(snapshot));
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return snapshot;
  }
}
