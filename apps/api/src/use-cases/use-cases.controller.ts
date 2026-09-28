import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  acceptUseCasesRequestSchema,
  generateUseCasesRequestSchema,
  transitionArtifactVersionRequestSchema,
  useCaseAcademicValidationResponseSchema,
  useCaseInputSchema,
  useCaseListResponseSchema,
  useCaseResponseSchema,
} from '@caseflow-ai/contracts';
import type { z } from 'zod';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiUuidParam, ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi';
import { UseCasesService } from './use-cases.service';
@ApiTags('use-cases')
@Controller('projects/:projectId/use-cases')
export class UseCasesController {
  constructor(private readonly service: UseCasesService) {}
  @Post()
  @ApiOperation({ operationId: 'createUseCase', summary: 'Crear caso de uso manual' })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiZodBody(useCaseInputSchema)
  @ApiZodResponse(201, 'Use Case.', useCaseResponseSchema)
  create(
    @Param('projectId', uuidParamPipe) p: string,
    @Body(new ZodValidationPipe(useCaseInputSchema)) b: z.output<typeof useCaseInputSchema>,
  ) {
    return this.service.create(p, b);
  }
  @Get()
  @ApiOperation({ operationId: 'listUseCases', summary: 'Listar casos de uso' })
  @ApiZodResponse(200, 'Use Cases.', useCaseListResponseSchema)
  list(@Param('projectId', uuidParamPipe) p: string) {
    return this.service.list(p);
  }
  @Get('academic-validation')
  @ApiOperation({
    operationId: 'validateAcademicUseCases',
    summary: 'Validar mínimo académico de cuatro casos de uso',
  })
  @ApiZodResponse(200, 'Academic validation.', useCaseAcademicValidationResponseSchema)
  academic(@Param('projectId', uuidParamPipe) p: string) {
    return this.service.academicValidation(p);
  }
  @Post('generate')
  @ApiOperation({
    operationId: 'generateUseCases',
    summary: 'Generar candidatos desde requisitos aprobados exactos',
  })
  @ApiZodBody(generateUseCasesRequestSchema)
  generate(
    @Param('projectId', uuidParamPipe) p: string,
    @Body(new ZodValidationPipe(generateUseCasesRequestSchema))
    b: z.output<typeof generateUseCasesRequestSchema>,
  ) {
    return this.service.generate(p, b.requirementVersionIds);
  }
  @Get('generations/:generationId')
  @ApiOperation({ operationId: 'getUseCaseGeneration', summary: 'Consultar candidatos generados' })
  generation(
    @Param('projectId', uuidParamPipe) p: string,
    @Param('generationId', uuidParamPipe) id: string,
  ) {
    return this.service.getGeneration(p, id);
  }
  @Post('generations/:generationId/accept')
  @ApiOperation({
    operationId: 'acceptUseCaseCandidates',
    summary: 'Aceptar candidatos seleccionados',
  })
  @ApiZodBody(acceptUseCasesRequestSchema)
  accept(
    @Param('projectId', uuidParamPipe) p: string,
    @Param('generationId', uuidParamPipe) id: string,
    @Body(new ZodValidationPipe(acceptUseCasesRequestSchema))
    b: z.output<typeof acceptUseCasesRequestSchema>,
  ) {
    return this.service.accept(p, id, b.candidateIds);
  }
  @Get(':useCaseId')
  @ApiOperation({ operationId: 'getUseCase', summary: 'Consultar caso de uso' })
  @ApiZodResponse(200, 'Use Case.', useCaseResponseSchema)
  get(@Param('projectId', uuidParamPipe) p: string, @Param('useCaseId', uuidParamPipe) id: string) {
    return this.service.get(p, id);
  }
  @Post(':useCaseId/versions')
  @ApiOperation({ operationId: 'createUseCaseVersion', summary: 'Crear versión de caso de uso' })
  @ApiZodBody(useCaseInputSchema)
  @ApiZodResponse(201, 'Use Case.', useCaseResponseSchema)
  version(
    @Param('projectId', uuidParamPipe) p: string,
    @Param('useCaseId', uuidParamPipe) id: string,
    @Body(new ZodValidationPipe(useCaseInputSchema)) b: z.output<typeof useCaseInputSchema>,
  ) {
    return this.service.version(p, id, b);
  }
  @Post(':useCaseId/versions/:versionId/transition')
  @ApiOperation({ operationId: 'transitionUseCaseVersion', summary: 'Cambiar estado de revisión' })
  @ApiZodBody(transitionArtifactVersionRequestSchema)
  transition(
    @Param('projectId', uuidParamPipe) p: string,
    @Param('useCaseId', uuidParamPipe) id: string,
    @Param('versionId', uuidParamPipe) v: string,
    @Body(new ZodValidationPipe(transitionArtifactVersionRequestSchema))
    b: z.output<typeof transitionArtifactVersionRequestSchema>,
  ) {
    return this.service.transition(p, id, v, b.status);
  }
}
