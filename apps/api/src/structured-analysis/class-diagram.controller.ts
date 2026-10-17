import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  acceptStructuredAnalysisCandidatesRequestSchema,
  classDiagramContentSchema,
  generateStructuredAnalysisRequestSchema,
  startStructuredGenerationRequestSchema,
  structuredGenerationJobSchema,
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

// Domain class diagram (DEC-121): same structured-analysis lifecycle; each
// class names the data-model entity it represents.

interface AuthenticatedRequest {
  user: { id: string };
}

const classDiagramInput = inputSchema(classDiagramContentSchema);

@ApiTags('class-diagram')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/class-diagram')
export class ClassDiagramController extends BaseStructuredAnalysisController {
  protected readonly kind = 'CLASS_DIAGRAM' as const;
  protected readonly contentSchema = classDiagramContentSchema;

  constructor(
    service: StructuredAnalysisService,
    private readonly jobs: StructuredGenerationJobsService,
  ) {
    super(service);
  }

  // DEC-142: the class diagram is drawn in batches in the background.
  @Post('generation-jobs')
  @HttpCode(202)
  @ApiOperation({
    operationId: 'startClassDiagramGeneration',
    summary: 'Generar el diagrama de clases por lotes en segundo plano',
  })
  @ApiZodBody(startStructuredGenerationRequestSchema)
  @ApiZodResponse(202, 'Class diagram generation job.', structuredGenerationJobSchema)
  startGeneration(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(startStructuredGenerationRequestSchema))
    body: z.output<typeof startStructuredGenerationRequestSchema>,
    @Request() request: AuthenticatedRequest,
  ) {
    return this.jobs.start(projectId, this.kind, body.sourceVersionIds, request.user.id);
  }
  @Get('generation-jobs/latest')
  @ApiOperation({
    operationId: 'getLatestClassDiagramGeneration',
    summary: 'Consultar el último trabajo del diagrama de clases',
  })
  latestGeneration(@Param('projectId', uuidParamPipe) projectId: string) {
    return this.jobs.latest(projectId, this.kind);
  }
  @Get('generation-jobs/:jobId')
  @ApiOperation({
    operationId: 'getClassDiagramGenerationJob',
    summary: 'Consultar avance de un trabajo del diagrama de clases',
  })
  @ApiZodResponse(200, 'Class diagram generation job.', structuredGenerationJobSchema)
  generationJob(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('jobId', uuidParamPipe) jobId: string,
  ) {
    return this.jobs.get(projectId, this.kind, jobId);
  }

  @Post()
  @ApiOperation({ operationId: 'createClassDiagram', summary: 'Crear diagrama de clases manual' })
  @ApiZodBody(classDiagramInput)
  @ApiZodResponse(201, 'Class Diagram.', structuredAnalysisResponseSchema)
  override create(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(classDiagramInput)) body: z.output<typeof classDiagramInput>,
  ) {
    return super.create(projectId, body);
  }
  @Get()
  @ApiOperation({ operationId: 'listClassDiagrams', summary: 'Listar diagramas de clases' })
  @ApiZodResponse(200, 'Class Diagrams.', structuredAnalysisListResponseSchema)
  override list(@Param('projectId', uuidParamPipe) projectId: string) {
    return super.list(projectId);
  }
  @Post('generate')
  @ApiOperation({
    operationId: 'generateClassDiagram',
    summary: 'Generar diagrama de clases candidato',
  })
  @ApiZodBody(generateStructuredAnalysisRequestSchema)
  override generate(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(generateStructuredAnalysisRequestSchema))
    body: z.output<typeof generateStructuredAnalysisRequestSchema>,
  ) {
    return super.generate(projectId, body);
  }
  @Get('generations/:generationId')
  @ApiOperation({ operationId: 'getClassDiagramGeneration', summary: 'Consultar candidatos' })
  @ApiZodResponse(200, 'Class Diagram batch.', structuredAnalysisGenerationResponseSchema)
  override generation(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('generationId', uuidParamPipe) generationId: string,
  ) {
    return super.generation(projectId, generationId);
  }
  @Post('generations/:generationId/accept')
  @ApiOperation({ operationId: 'acceptClassDiagramCandidates', summary: 'Aceptar candidatos' })
  @ApiZodBody(acceptStructuredAnalysisCandidatesRequestSchema)
  @ApiZodResponse(201, 'Class Diagrams.', structuredAnalysisListResponseSchema)
  override accept(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('generationId', uuidParamPipe) generationId: string,
    @Body(new ZodValidationPipe(acceptStructuredAnalysisCandidatesRequestSchema))
    body: z.output<typeof acceptStructuredAnalysisCandidatesRequestSchema>,
  ) {
    return super.accept(projectId, generationId, body);
  }
  @Get(':classDiagramId')
  @ApiOperation({ operationId: 'getClassDiagram', summary: 'Consultar diagrama de clases' })
  @ApiZodResponse(200, 'Class Diagram.', structuredAnalysisResponseSchema)
  override get(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('classDiagramId', uuidParamPipe) id: string,
  ) {
    return super.get(projectId, id);
  }
  @Post(':classDiagramId/versions')
  @ApiOperation({ operationId: 'createClassDiagramVersion', summary: 'Crear versión' })
  @ApiZodBody(classDiagramInput)
  @ApiZodResponse(201, 'Class Diagram.', structuredAnalysisResponseSchema)
  override version(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('classDiagramId', uuidParamPipe) id: string,
    @Body(new ZodValidationPipe(classDiagramInput)) body: z.output<typeof classDiagramInput>,
  ) {
    return super.version(projectId, id, body);
  }
  @Post(':classDiagramId/versions/:versionId/transition')
  @ApiOperation({ operationId: 'transitionClassDiagramVersion', summary: 'Cambiar estado' })
  @ApiZodBody(transitionArtifactVersionRequestSchema)
  transitionVersion(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('classDiagramId', uuidParamPipe) artifactId: string,
    @Param('versionId', uuidParamPipe) versionId: string,
    @Body(new ZodValidationPipe(transitionArtifactVersionRequestSchema))
    body: z.output<typeof transitionArtifactVersionRequestSchema>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.transition(projectId, artifactId, versionId, body, req.user.id);
  }
  // The rendered diagram, like the other diagram-backed kinds; without these
  // routes "Ver diagrama" answered 404.
  @Get(':classDiagramId/diagram')
  @ApiOperation({ operationId: 'getClassDiagramDiagram', summary: 'Obtener el diagrama de clases' })
  override diagram(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('classDiagramId', uuidParamPipe) id: string,
  ) {
    return super.diagram(projectId, id);
  }
  @Get(':classDiagramId/diagram/png')
  @ApiOperation({
    operationId: 'getClassDiagramDiagramPng',
    summary: 'Obtener el diagrama de clases en PNG',
  })
  override diagramPng(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('classDiagramId', uuidParamPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return super.diagramPng(projectId, id, response);
  }
}
