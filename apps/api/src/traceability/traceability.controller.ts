import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { traceabilityGraphResponseSchema } from '@caseflow-ai/contracts';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ApiZodResponse } from '../openapi/zod-openapi';
import { TraceabilityService } from './traceability.service';

@ApiTags('traceability')
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
}
