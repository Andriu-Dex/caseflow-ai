import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Request,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  acceptStructuredAnalysisCandidatesRequestSchema,
  conceptualDomainModelContentSchema,
  generateStructuredAnalysisRequestSchema,
  generateImplementationPlanRequestSchema,
  startStructuredGenerationRequestSchema,
  structuredGenerationJobSchema,
  generationPlanContentSchema,
  implementationPlanArtifactsResponseSchema,
  implementationPlanContentSchema,
  structuredAnalysisGenerationResponseSchema,
  structuredAnalysisListResponseSchema,
  structuredAnalysisResponseSchema,
  transitionArtifactVersionRequestSchema,
} from '@caseflow-ai/contracts';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi';
import { StructuredAnalysisService } from './structured-analysis.service';
import { StructuredGenerationJobsService } from './structured-generation-jobs.service';
import { BaseStructuredAnalysisController, inputSchema } from './structured-analysis.controller';
import { generateOpenApi } from '../code-generation/openapi.generator';
import { generatePrismaSchema } from '../code-generation/prisma-schema.generator';
import { PlanGenerationError } from '../code-generation/naming';

// Generation Plan and Conceptual Domain Model (spec §156-157): same
// structured-analysis lifecycle as the design kinds, without diagrams, and
// approvals pass the acting user so they reach the audit trail.

interface AuthenticatedRequest {
  user: { id: string };
}

const generationPlanInput = inputSchema(generationPlanContentSchema);
const conceptualModelInput = inputSchema(conceptualDomainModelContentSchema);

@ApiTags('generation-plan')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/generation-plan')
export class GenerationPlanController extends BaseStructuredAnalysisController {
  protected readonly kind = 'GENERATION_PLAN' as const;
  protected readonly contentSchema = generationPlanContentSchema;

  constructor(service: StructuredAnalysisService) {
    super(service);
  }

  @Post()
  @ApiOperation({ operationId: 'createGenerationPlan', summary: 'Crear plan de generación manual' })
  @ApiZodBody(generationPlanInput)
  @ApiZodResponse(201, 'Generation Plan.', structuredAnalysisResponseSchema)
  override create(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(generationPlanInput)) body: z.output<typeof generationPlanInput>,
  ) {
    return super.create(projectId, body);
  }
  @Get()
  @ApiOperation({ operationId: 'listGenerationPlans', summary: 'Listar planes de generación' })
  @ApiZodResponse(200, 'Generation Plans.', structuredAnalysisListResponseSchema)
  override list(@Param('projectId', uuidParamPipe) projectId: string) {
    return super.list(projectId);
  }
  @Post('generate')
  @ApiOperation({ operationId: 'generateGenerationPlan', summary: 'Generar candidato de plan' })
  @ApiZodBody(generateStructuredAnalysisRequestSchema)
  override generate(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(generateStructuredAnalysisRequestSchema))
    body: z.output<typeof generateStructuredAnalysisRequestSchema>,
  ) {
    return super.generate(projectId, body);
  }
  @Get('generations/:generationId')
  @ApiOperation({ operationId: 'getGenerationPlanGeneration', summary: 'Consultar candidatos' })
  @ApiZodResponse(200, 'Generation Plan batch.', structuredAnalysisGenerationResponseSchema)
  override generation(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('generationId', uuidParamPipe) generationId: string,
  ) {
    return super.generation(projectId, generationId);
  }
  @Post('generations/:generationId/accept')
  @ApiOperation({ operationId: 'acceptGenerationPlanCandidates', summary: 'Aceptar candidatos' })
  @ApiZodBody(acceptStructuredAnalysisCandidatesRequestSchema)
  @ApiZodResponse(201, 'Generation Plans.', structuredAnalysisListResponseSchema)
  override accept(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('generationId', uuidParamPipe) generationId: string,
    @Body(new ZodValidationPipe(acceptStructuredAnalysisCandidatesRequestSchema))
    body: z.output<typeof acceptStructuredAnalysisCandidatesRequestSchema>,
  ) {
    return super.accept(projectId, generationId, body);
  }
  @Get(':planId')
  @ApiOperation({ operationId: 'getGenerationPlan', summary: 'Consultar plan de generación' })
  @ApiZodResponse(200, 'Generation Plan.', structuredAnalysisResponseSchema)
  override get(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('planId', uuidParamPipe) id: string,
  ) {
    return super.get(projectId, id);
  }
  @Post(':planId/versions')
  @ApiOperation({ operationId: 'createGenerationPlanVersion', summary: 'Crear versión' })
  @ApiZodBody(generationPlanInput)
  @ApiZodResponse(201, 'Generation Plan.', structuredAnalysisResponseSchema)
  override version(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('planId', uuidParamPipe) id: string,
    @Body(new ZodValidationPipe(generationPlanInput)) body: z.output<typeof generationPlanInput>,
  ) {
    return super.version(projectId, id, body);
  }
  @Post(':planId/versions/:versionId/transition')
  @ApiOperation({ operationId: 'transitionGenerationPlanVersion', summary: 'Cambiar estado' })
  @ApiZodBody(transitionArtifactVersionRequestSchema)
  transitionVersion(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('planId', uuidParamPipe) artifactId: string,
    @Param('versionId', uuidParamPipe) versionId: string,
    @Body(new ZodValidationPipe(transitionArtifactVersionRequestSchema))
    body: z.output<typeof transitionArtifactVersionRequestSchema>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.transition(projectId, artifactId, versionId, body, req.user.id);
  }
}

@ApiTags('conceptual-domain-model')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/conceptual-domain-model')
export class ConceptualDomainModelController extends BaseStructuredAnalysisController {
  protected readonly kind = 'CONCEPTUAL_DOMAIN_MODEL' as const;
  protected readonly contentSchema = conceptualDomainModelContentSchema;

  constructor(
    service: StructuredAnalysisService,
    private readonly jobs: StructuredGenerationJobsService,
  ) {
    super(service);
  }

  // DEC-144: drawn in batches in the background.
  @Post('generation-jobs')
  @HttpCode(202)
  @ApiOperation({
    operationId: 'startConceptualDomainModelGeneration',
    summary: 'Generar el modelo conceptual por lotes en segundo plano',
  })
  @ApiZodBody(startStructuredGenerationRequestSchema)
  @ApiZodResponse(202, 'ConceptualDomainModel generation job.', structuredGenerationJobSchema)
  startGeneration(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(startStructuredGenerationRequestSchema))
    body: z.output<typeof startStructuredGenerationRequestSchema>,
    @Request() request: { user: { id: string } },
  ) {
    return this.jobs.start(projectId, this.kind, body.sourceVersionIds, request.user.id);
  }
  @Get('generation-jobs/latest')
  @ApiOperation({
    operationId: 'getLatestConceptualDomainModelGeneration',
    summary: 'Consultar el último trabajo de el modelo conceptual',
  })
  latestGeneration(@Param('projectId', uuidParamPipe) projectId: string) {
    return this.jobs.latest(projectId, this.kind);
  }
  @Get('generation-jobs/:jobId')
  @ApiOperation({
    operationId: 'getConceptualDomainModelGenerationJob',
    summary: 'Consultar avance de un trabajo de el modelo conceptual',
  })
  @ApiZodResponse(200, 'ConceptualDomainModel generation job.', structuredGenerationJobSchema)
  generationJob(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('jobId', uuidParamPipe) jobId: string,
  ) {
    return this.jobs.get(projectId, this.kind, jobId);
  }

  @Post()
  @ApiOperation({ operationId: 'createConceptualModel', summary: 'Crear modelo conceptual manual' })
  @ApiZodBody(conceptualModelInput)
  @ApiZodResponse(201, 'Conceptual Domain Model.', structuredAnalysisResponseSchema)
  override create(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(conceptualModelInput)) body: z.output<typeof conceptualModelInput>,
  ) {
    return super.create(projectId, body);
  }
  @Get()
  @ApiOperation({ operationId: 'listConceptualModels', summary: 'Listar modelos conceptuales' })
  @ApiZodResponse(200, 'Conceptual Domain Models.', structuredAnalysisListResponseSchema)
  override list(@Param('projectId', uuidParamPipe) projectId: string) {
    return super.list(projectId);
  }
  @Post('generate')
  @ApiOperation({ operationId: 'generateConceptualModel', summary: 'Generar candidato' })
  @ApiZodBody(generateStructuredAnalysisRequestSchema)
  override generate(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(generateStructuredAnalysisRequestSchema))
    body: z.output<typeof generateStructuredAnalysisRequestSchema>,
  ) {
    return super.generate(projectId, body);
  }
  @Get('generations/:generationId')
  @ApiOperation({ operationId: 'getConceptualModelGeneration', summary: 'Consultar candidatos' })
  @ApiZodResponse(200, 'Conceptual model batch.', structuredAnalysisGenerationResponseSchema)
  override generation(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('generationId', uuidParamPipe) generationId: string,
  ) {
    return super.generation(projectId, generationId);
  }
  @Post('generations/:generationId/accept')
  @ApiOperation({ operationId: 'acceptConceptualModelCandidates', summary: 'Aceptar candidatos' })
  @ApiZodBody(acceptStructuredAnalysisCandidatesRequestSchema)
  @ApiZodResponse(201, 'Conceptual Domain Models.', structuredAnalysisListResponseSchema)
  override accept(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('generationId', uuidParamPipe) generationId: string,
    @Body(new ZodValidationPipe(acceptStructuredAnalysisCandidatesRequestSchema))
    body: z.output<typeof acceptStructuredAnalysisCandidatesRequestSchema>,
  ) {
    return super.accept(projectId, generationId, body);
  }
  @Get(':modelId')
  @ApiOperation({ operationId: 'getConceptualModel', summary: 'Consultar modelo conceptual' })
  @ApiZodResponse(200, 'Conceptual Domain Model.', structuredAnalysisResponseSchema)
  override get(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('modelId', uuidParamPipe) id: string,
  ) {
    return super.get(projectId, id);
  }
  @Post(':modelId/versions')
  @ApiOperation({ operationId: 'createConceptualModelVersion', summary: 'Crear versión' })
  @ApiZodBody(conceptualModelInput)
  @ApiZodResponse(201, 'Conceptual Domain Model.', structuredAnalysisResponseSchema)
  override version(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('modelId', uuidParamPipe) id: string,
    @Body(new ZodValidationPipe(conceptualModelInput)) body: z.output<typeof conceptualModelInput>,
  ) {
    return super.version(projectId, id, body);
  }
  @Post(':modelId/versions/:versionId/transition')
  @ApiOperation({ operationId: 'transitionConceptualModelVersion', summary: 'Cambiar estado' })
  @ApiZodBody(transitionArtifactVersionRequestSchema)
  transitionVersion(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('modelId', uuidParamPipe) artifactId: string,
    @Param('versionId', uuidParamPipe) versionId: string,
    @Body(new ZodValidationPipe(transitionArtifactVersionRequestSchema))
    body: z.output<typeof transitionArtifactVersionRequestSchema>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.transition(projectId, artifactId, versionId, body, req.user.id);
  }
}

const implementationPlanInput = inputSchema(implementationPlanContentSchema);

@ApiTags('implementation-plan')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/implementation-plan')
export class ImplementationPlanController extends BaseStructuredAnalysisController {
  protected readonly kind = 'IMPLEMENTATION_PLAN' as const;
  protected readonly contentSchema = implementationPlanContentSchema;

  constructor(service: StructuredAnalysisService) {
    super(service);
  }

  @Post()
  @ApiOperation({
    operationId: 'createImplementationPlan',
    summary: 'Crear plan de implementación manual',
  })
  @ApiZodBody(implementationPlanInput)
  @ApiZodResponse(201, 'Implementation Plan.', structuredAnalysisResponseSchema)
  override create(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(implementationPlanInput))
    body: z.output<typeof implementationPlanInput>,
  ) {
    return super.create(projectId, body);
  }
  @Get()
  @ApiOperation({ operationId: 'listImplementationPlans', summary: 'Listar planes' })
  @ApiZodResponse(200, 'Implementation Plans.', structuredAnalysisListResponseSchema)
  override list(@Param('projectId', uuidParamPipe) projectId: string) {
    return super.list(projectId);
  }
  @Post('generate')
  @ApiOperation({
    operationId: 'generateImplementationPlan',
    summary: 'Generar candidato desde una línea base de diseño aprobada',
  })
  @ApiZodBody(generateImplementationPlanRequestSchema)
  generateFromBaseline(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(generateImplementationPlanRequestSchema))
    body: z.output<typeof generateImplementationPlanRequestSchema>,
  ) {
    return this.service.generateFromDesignBaseline(projectId, this.kind, body.designBaselineId);
  }
  @Get('generations/:generationId')
  @ApiOperation({ operationId: 'getImplementationPlanGeneration', summary: 'Consultar candidatos' })
  @ApiZodResponse(200, 'Implementation Plan batch.', structuredAnalysisGenerationResponseSchema)
  override generation(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('generationId', uuidParamPipe) generationId: string,
  ) {
    return super.generation(projectId, generationId);
  }
  @Post('generations/:generationId/accept')
  @ApiOperation({
    operationId: 'acceptImplementationPlanCandidates',
    summary: 'Aceptar candidatos',
  })
  @ApiZodBody(acceptStructuredAnalysisCandidatesRequestSchema)
  @ApiZodResponse(201, 'Implementation Plans.', structuredAnalysisListResponseSchema)
  override accept(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('generationId', uuidParamPipe) generationId: string,
    @Body(new ZodValidationPipe(acceptStructuredAnalysisCandidatesRequestSchema))
    body: z.output<typeof acceptStructuredAnalysisCandidatesRequestSchema>,
  ) {
    return super.accept(projectId, generationId, body);
  }
  @Get(':planId')
  @ApiOperation({ operationId: 'getImplementationPlan', summary: 'Consultar plan' })
  @ApiZodResponse(200, 'Implementation Plan.', structuredAnalysisResponseSchema)
  override get(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('planId', uuidParamPipe) id: string,
  ) {
    return super.get(projectId, id);
  }
  @Get(':planId/artifacts')
  @ApiOperation({
    operationId: 'getImplementationPlanArtifacts',
    summary: 'Vista previa del esquema de base de datos y del contrato OpenAPI',
  })
  @ApiZodResponse(200, 'Derived artifacts.', implementationPlanArtifactsResponseSchema)
  async artifacts(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('planId', uuidParamPipe) id: string,
  ) {
    const plan = await super.get(projectId, id);
    const content = implementationPlanContentSchema.parse(plan.content);
    try {
      return {
        databaseSchema: generatePrismaSchema(content),
        openApi: generateOpenApi(content, `${plan.code} ${plan.title}`),
      };
    } catch (error) {
      if (error instanceof PlanGenerationError)
        throw new UnprocessableEntityException(error.message);
      throw error;
    }
  }
  @Post(':planId/versions')
  @ApiOperation({ operationId: 'createImplementationPlanVersion', summary: 'Crear versión' })
  @ApiZodBody(implementationPlanInput)
  @ApiZodResponse(201, 'Implementation Plan.', structuredAnalysisResponseSchema)
  override version(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('planId', uuidParamPipe) id: string,
    @Body(new ZodValidationPipe(implementationPlanInput))
    body: z.output<typeof implementationPlanInput>,
  ) {
    return super.version(projectId, id, body);
  }
  @Post(':planId/versions/:versionId/transition')
  @ApiOperation({ operationId: 'transitionImplementationPlanVersion', summary: 'Cambiar estado' })
  @ApiZodBody(transitionArtifactVersionRequestSchema)
  transitionVersion(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('planId', uuidParamPipe) artifactId: string,
    @Param('versionId', uuidParamPipe) versionId: string,
    @Body(new ZodValidationPipe(transitionArtifactVersionRequestSchema))
    body: z.output<typeof transitionArtifactVersionRequestSchema>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.transition(projectId, artifactId, versionId, body, req.user.id);
  }
}
