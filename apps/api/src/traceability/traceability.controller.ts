import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';

import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  traceabilityDiagramResponseSchema,
  traceabilityGraphResponseSchema,
} from '@caseflow-ai/contracts';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { pngResponse } from '../common/png-response';
import { ApiZodResponse } from '../openapi/zod-openapi';
import { TraceabilityService } from './traceability.service';

@ApiTags('traceability')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/traceability')
export class TraceabilityController {
  constructor(private readonly service: TraceabilityService) {}

  @Get()
  @ApiOperation({
    operationId: 'getProjectTraceability',
    summary: 'Consultar el grafo de trazabilidad del First Deliverable',
  })
  @ApiZodResponse(200, 'Traceability graph.', traceabilityGraphResponseSchema)
  async get(@Param('projectId', uuidParamPipe) projectId: string) {
    const { nodes, edges, truncated } = await this.service.buildGraph(projectId);
    return { projectId, generatedAt: new Date().toISOString(), nodes, edges, truncated };
  }

  @Get('diagram')
  @ApiOperation({
    operationId: 'getProjectTraceabilityDiagram',
    summary: 'Ver el grafo de trazabilidad como diagrama',
  })
  @ApiZodResponse(200, 'Traceability diagram.', traceabilityDiagramResponseSchema)
  diagram(@Param('projectId', uuidParamPipe) projectId: string) {
    return this.service.buildDiagram(projectId);
  }

  @Get('diagram/png')
  @ApiOperation({
    operationId: 'getProjectTraceabilityDiagramPng',
    summary: 'Descargar el grafo de trazabilidad en PNG',
  })
  async diagramPng(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const png = await this.service.getDiagramPng(projectId);
    return pngResponse(response, 'trazabilidad.png', png);
  }
}
