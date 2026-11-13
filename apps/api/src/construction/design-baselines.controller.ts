import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  createDesignBaselineRequestSchema,
  createScreenDesignExceptionRequestSchema,
  designBaselineListResponseSchema,
  designBaselineResponseSchema,
  screenDesignExceptionResponseSchema,
  screenFindingsResponseSchema,
} from '@caseflow-ai/contracts';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi';
import { DesignBaselinesService } from './design-baselines.service';

interface AuthenticatedRequest {
  user: { id: string };
}

@ApiTags('construction')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/design-baselines')
export class DesignBaselinesController {
  constructor(private readonly service: DesignBaselinesService) {}

  @Post()
  @ApiOperation({
    operationId: 'createDesignBaseline',
    summary: 'Aprobar y congelar el diseño (Design Gate)',
  })
  @ApiZodBody(createDesignBaselineRequestSchema)
  @ApiZodResponse(201, 'Design Baseline.', designBaselineResponseSchema)
  create(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(createDesignBaselineRequestSchema))
    body: z.output<typeof createDesignBaselineRequestSchema>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.create(projectId, req.user.id, body);
  }

  @Get()
  @ApiOperation({ operationId: 'listDesignBaselines', summary: 'Listar líneas base de diseño' })
  @ApiZodResponse(200, 'Design Baselines.', designBaselineListResponseSchema)
  list(@Param('projectId', uuidParamPipe) projectId: string) {
    return this.service.list(projectId);
  }

  @Get(':baselineId')
  @ApiOperation({ operationId: 'getDesignBaseline', summary: 'Consultar línea base de diseño' })
  @ApiZodResponse(200, 'Design Baseline.', designBaselineResponseSchema)
  get(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('baselineId', uuidParamPipe) id: string,
  ) {
    return this.service.get(projectId, id);
  }

  @Get(':baselineId/screen-findings')
  @ApiOperation({
    operationId: 'listScreenFindings',
    summary: 'Consultar los hallazgos de pantalla del diseño',
  })
  @ApiZodResponse(200, 'Hallazgos por pantalla.', screenFindingsResponseSchema)
  screenFindings(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('baselineId', uuidParamPipe) id: string,
  ) {
    return this.service.screenFindings(projectId, id);
  }

  @Post(':baselineId/screen-exceptions')
  @ApiOperation({
    operationId: 'createScreenDesignException',
    summary: 'Aceptar los hallazgos de una pantalla con justificación',
  })
  @ApiZodBody(createScreenDesignExceptionRequestSchema)
  @ApiZodResponse(201, 'Excepción registrada.', screenDesignExceptionResponseSchema)
  createScreenException(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('baselineId', uuidParamPipe) id: string,
    @Body(new ZodValidationPipe(createScreenDesignExceptionRequestSchema))
    body: z.output<typeof createScreenDesignExceptionRequestSchema>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.createScreenException(projectId, id, req.user.id, body);
  }
}
