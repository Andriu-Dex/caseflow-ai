import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';

import { Body, Controller, Get, HttpCode, Param, Post, Request } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  acceptUseCasesRequestSchema,
  generateUseCasesRequestSchema,
  transitionArtifactVersionRequestSchema,
  useCaseAcademicValidationResponseSchema,
  useCaseBulkRequestSchema,
  useCaseBulkResponseSchema,
  startUseCaseGenerationRequestSchema,
  useCaseGenerationJobSchema,
  useCaseInputSchema,
  useCaseListResponseSchema,
  useCaseResponseSchema,
} from '@caseflow-ai/contracts';
import { z } from 'zod';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiUuidParam, ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi';
import { UseCasesService } from './use-cases.service';
import { UseCaseBulkService } from './use-case-bulk.service';
import { UseCaseGenerationJobsService } from './use-case-generation-jobs.service';
@ApiTags('use-cases')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/use-cases')
export class UseCasesController {
  constructor(
    private readonly service: UseCasesService,
    private readonly bulkActions: UseCaseBulkService,
    private readonly jobs: UseCaseGenerationJobsService,
  ) {}
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
  @Post('bulk')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'applyUseCaseBulkAction',
    summary: 'Aprobar, archivar o eliminar varios casos de uso a la vez (todos o ninguno)',
  })
  @ApiZodBody(useCaseBulkRequestSchema)
  @ApiZodResponse(200, 'How many use cases changed.', useCaseBulkResponseSchema)
  bulk(
    @Param('projectId', uuidParamPipe) p: string,
    @Body(new ZodValidationPipe(useCaseBulkRequestSchema))
    body: z.output<typeof useCaseBulkRequestSchema>,
    @Request() request: { user: { id: string } },
  ) {
    return this.bulkActions.apply(p, body.action, body.useCaseIds, request.user.id);
  }
  @Post('generation-jobs')
  @HttpCode(202)
  @ApiOperation({
    operationId: 'startUseCaseGeneration',
    summary: 'Generar casos de uso por lotes en segundo plano',
  })
  @ApiZodBody(startUseCaseGenerationRequestSchema)
  @ApiZodResponse(202, 'Use case generation job.', useCaseGenerationJobSchema)
  startGeneration(
    @Param('projectId', uuidParamPipe) p: string,
    @Body(new ZodValidationPipe(startUseCaseGenerationRequestSchema))
    body: z.output<typeof startUseCaseGenerationRequestSchema>,
    @Request() request: { user: { id: string } },
  ) {
    return this.jobs.start(p, body.requirementVersionIds, request.user.id);
  }
  @Get('generation-jobs/latest')
  @ApiOperation({
    operationId: 'getLatestUseCaseGeneration',
    summary: 'Consultar el último trabajo de casos de uso',
  })
  @ApiZodResponse(
    200,
    'Latest use case generation job.',
    z.object({ job: useCaseGenerationJobSchema.nullable() }),
  )
  latestGeneration(@Param('projectId', uuidParamPipe) p: string) {
    return this.jobs.latest(p);
  }
  @Post('generation-jobs/:jobId/cancel')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'cancelUseCaseGenerationJob',
    summary: 'Cancelar un trabajo de casos de uso',
  })
  @ApiZodResponse(200, 'Use case generation job.', useCaseGenerationJobSchema)
  cancelGeneration(
    @Param('projectId', uuidParamPipe) p: string,
    @Param('jobId', uuidParamPipe) jobId: string,
    @Request() request: { user: { id: string } },
  ) {
    return this.jobs.cancel(p, jobId, request.user.id);
  }
  @Get('generation-jobs/:jobId')
  @ApiOperation({
    operationId: 'getUseCaseGenerationJob',
    summary: 'Consultar avance de un trabajo de casos de uso',
  })
  @ApiZodResponse(200, 'Use case generation job.', useCaseGenerationJobSchema)
  generationJob(
    @Param('projectId', uuidParamPipe) p: string,
    @Param('jobId', uuidParamPipe) jobId: string,
  ) {
    return this.jobs.get(p, jobId);
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
