import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  acceptRequirementsRequestSchema,
  generateRequirementsRequestSchema,
  requirementInputSchema,
  requirementListResponseSchema,
  requirementQualityReportResponseSchema,
  requirementResponseSchema,
  transitionArtifactVersionRequestSchema,
} from '@caseflow-ai/contracts';
import type { z } from 'zod';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiUuidParam, ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi';
import { RequirementsService } from './requirements.service';
@ApiTags('requirements')
@Controller('projects/:projectId/requirements')
export class RequirementsController {
  constructor(private readonly service: RequirementsService) {}
  @Post()
  @ApiOperation({ operationId: 'createRequirement', summary: 'Crear requisito manual' })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiZodBody(requirementInputSchema)
  @ApiZodResponse(201, 'Requirement.', requirementResponseSchema)
  create(
    @Param('projectId', uuidParamPipe) p: string,
    @Body(new ZodValidationPipe(requirementInputSchema)) b: z.output<typeof requirementInputSchema>,
  ) {
    return this.service.create(p, b);
  }
  @Get()
  @ApiOperation({ operationId: 'listRequirements', summary: 'Listar requisitos' })
  @ApiZodResponse(200, 'Requirements.', requirementListResponseSchema)
  list(@Param('projectId', uuidParamPipe) p: string) {
    return this.service.list(p);
  }
  @Get('quality-report')
  @ApiOperation({
    operationId: 'getRequirementQualityReport',
    summary: 'Informe determinístico de calidad ISO/IEC/IEEE 29148:2018-aligned',
  })
  @ApiZodResponse(200, 'Requirement quality report.', requirementQualityReportResponseSchema)
  qualityReport(@Param('projectId', uuidParamPipe) p: string) {
    return this.service.qualityReport(p);
  }
  @Get(':requirementId')
  @ApiOperation({ operationId: 'getRequirement', summary: 'Consultar requisito' })
  @ApiZodResponse(200, 'Requirement.', requirementResponseSchema)
  get(
    @Param('projectId', uuidParamPipe) p: string,
    @Param('requirementId', uuidParamPipe) id: string,
  ) {
    return this.service.get(p, id);
  }
  @Post(':requirementId/versions')
  @ApiOperation({ operationId: 'createRequirementVersion', summary: 'Crear versión de requisito' })
  @ApiZodBody(requirementInputSchema)
  @ApiZodResponse(201, 'Requirement.', requirementResponseSchema)
  version(
    @Param('projectId', uuidParamPipe) p: string,
    @Param('requirementId', uuidParamPipe) id: string,
    @Body(new ZodValidationPipe(requirementInputSchema)) b: z.output<typeof requirementInputSchema>,
  ) {
    return this.service.version(p, id, b);
  }
  @Post('generate')
  @ApiOperation({
    operationId: 'generateRequirements',
    summary: 'Generar candidatos desde una versión exacta de contexto',
  })
  @ApiZodBody(generateRequirementsRequestSchema)
  generate(
    @Param('projectId', uuidParamPipe) p: string,
    @Body(new ZodValidationPipe(generateRequirementsRequestSchema))
    b: z.output<typeof generateRequirementsRequestSchema>,
  ) {
    return this.service.generate(p, b.sourceContextVersionId);
  }
  @Get('generations/:generationId')
  @ApiOperation({
    operationId: 'getRequirementGeneration',
    summary: 'Consultar candidatos generados',
  })
  generation(
    @Param('projectId', uuidParamPipe) p: string,
    @Param('generationId', uuidParamPipe) id: string,
  ) {
    return this.service.getGeneration(p, id);
  }
  @Post('generations/:generationId/accept')
  @ApiOperation({
    operationId: 'acceptRequirementCandidates',
    summary: 'Aceptar candidatos seleccionados',
  })
  @ApiZodBody(acceptRequirementsRequestSchema)
  accept(
    @Param('projectId', uuidParamPipe) p: string,
    @Param('generationId', uuidParamPipe) id: string,
    @Body(new ZodValidationPipe(acceptRequirementsRequestSchema))
    b: z.output<typeof acceptRequirementsRequestSchema>,
  ) {
    return this.service.accept(p, id, b.candidateIds);
  }
  @Post(':requirementId/versions/:versionId/transition')
  @ApiOperation({ operationId: 'transitionArtifactVersion', summary: 'Cambiar estado de revisión' })
  @ApiZodBody(transitionArtifactVersionRequestSchema)
  transition(
    @Param('projectId', uuidParamPipe) p: string,
    @Param('requirementId', uuidParamPipe) r: string,
    @Param('versionId', uuidParamPipe) v: string,
    @Body(new ZodValidationPipe(transitionArtifactVersionRequestSchema))
    b: z.output<typeof transitionArtifactVersionRequestSchema>,
  ) {
    return this.service.transition(p, r, v, b.status);
  }
}
