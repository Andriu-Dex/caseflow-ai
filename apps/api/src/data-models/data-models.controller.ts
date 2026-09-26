import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  acceptDataModelCandidatesRequestSchema,
  dataModelGenerationResponseSchema,
  dataModelInputSchema,
  dataModelListResponseSchema,
  dataModelResponseSchema,
  diagramResponseSchema,
  generateDataModelRequestSchema,
  generateDiagramRequestSchema,
  manualDiagramVersionRequestSchema,
  transitionArtifactVersionRequestSchema,
} from '@caseflow-ai/contracts';
import type { z } from 'zod';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiUuidParam, ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi';
import { DataModelsService } from './data-models.service';

@ApiTags('data-models')
@Controller('projects/:projectId/data-models')
export class DataModelsController {
  constructor(private readonly service: DataModelsService) {}
  @Post()
  @ApiOperation({
    operationId: 'createDataModel',
    summary: 'Crear modelo de datos conceptual manual',
  })
  @ApiZodBody(dataModelInputSchema)
  @ApiZodResponse(201, 'Data Model.', dataModelResponseSchema)
  create(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(dataModelInputSchema)) body: z.output<typeof dataModelInputSchema>,
  ) {
    return this.service.create(projectId, body);
  }
  @Get()
  @ApiOperation({ operationId: 'listDataModels', summary: 'Listar modelos de datos' })
  @ApiZodResponse(200, 'Data Models.', dataModelListResponseSchema)
  list(@Param('projectId', uuidParamPipe) projectId: string) {
    return this.service.list(projectId);
  }
  @Post('generate')
  @ApiOperation({
    operationId: 'generateDataModels',
    summary: 'Generar candidatos de modelo conceptual',
  })
  @ApiZodBody(generateDataModelRequestSchema)
  @ApiZodResponse(201, 'Data Model generation batch.', dataModelGenerationResponseSchema)
  generate(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(generateDataModelRequestSchema))
    body: z.output<typeof generateDataModelRequestSchema>,
  ) {
    return this.service.generate(projectId, body.requirementVersionIds, body.useCaseVersionIds);
  }
  @Get('generations/:generationId')
  @ApiOperation({
    operationId: 'getDataModelGeneration',
    summary: 'Consultar candidatos de modelo',
  })
  @ApiZodResponse(200, 'Data Model generation batch.', dataModelGenerationResponseSchema)
  generation(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('generationId', uuidParamPipe) generationId: string,
  ) {
    return this.service.getGeneration(projectId, generationId);
  }
  @Post('generations/:generationId/accept')
  @ApiOperation({
    operationId: 'acceptDataModelCandidates',
    summary: 'Aceptar candidatos de modelo',
  })
  @ApiZodBody(acceptDataModelCandidatesRequestSchema)
  @ApiZodResponse(201, 'Data Models.', dataModelListResponseSchema)
  accept(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('generationId', uuidParamPipe) generationId: string,
    @Body(new ZodValidationPipe(acceptDataModelCandidatesRequestSchema))
    body: z.output<typeof acceptDataModelCandidatesRequestSchema>,
  ) {
    return this.service.accept(projectId, generationId, body.candidateIds);
  }
  @Get(':dataModelId')
  @ApiOperation({ operationId: 'getDataModel', summary: 'Consultar modelo de datos' })
  @ApiZodResponse(200, 'Data Model.', dataModelResponseSchema)
  get(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('dataModelId', uuidParamPipe) dataModelId: string,
  ) {
    return this.service.get(projectId, dataModelId);
  }
  @Post(':dataModelId/versions')
  @ApiOperation({ operationId: 'createDataModelVersion', summary: 'Crear versión del modelo' })
  @ApiZodBody(dataModelInputSchema)
  @ApiZodResponse(201, 'Data Model.', dataModelResponseSchema)
  version(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('dataModelId', uuidParamPipe) dataModelId: string,
    @Body(new ZodValidationPipe(dataModelInputSchema)) body: z.output<typeof dataModelInputSchema>,
  ) {
    return this.service.version(projectId, dataModelId, body);
  }
  @Post(':dataModelId/versions/:versionId/transition')
  @ApiOperation({ operationId: 'transitionDataModelVersion', summary: 'Cambiar estado del modelo' })
  @ApiZodBody(transitionArtifactVersionRequestSchema)
  transition(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('dataModelId', uuidParamPipe) dataModelId: string,
    @Param('versionId', uuidParamPipe) versionId: string,
    @Body(new ZodValidationPipe(transitionArtifactVersionRequestSchema))
    body: z.output<typeof transitionArtifactVersionRequestSchema>,
  ) {
    return this.service.transition(projectId, dataModelId, versionId, body.status);
  }
  @Get(':dataModelId/diagram')
  @ApiOperation({
    operationId: 'getDataModelDiagram',
    summary: 'Obtener diagrama ER determinístico',
  })
  @ApiZodResponse(200, 'ER Diagram.', diagramResponseSchema)
  diagram(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('dataModelId', uuidParamPipe) dataModelId: string,
  ) {
    return this.service.getERDiagram(projectId, dataModelId);
  }
}

@ApiTags('diagrams')
@Controller('projects/:projectId/diagrams/use-cases')
export class UseCaseDiagramsController {
  constructor(private readonly service: DataModelsService) {}
  @Post()
  @ApiOperation({
    operationId: 'generateUseCaseDiagram',
    summary: 'Generar diagrama UML desde casos aprobados',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiZodBody(generateDiagramRequestSchema)
  @ApiZodResponse(201, 'Use Case Diagram.', diagramResponseSchema)
  generate(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(generateDiagramRequestSchema))
    body: z.output<typeof generateDiagramRequestSchema>,
  ) {
    return this.service.generateUseCaseDiagram(projectId, body.sourceVersionIds);
  }
  @Get(':diagramId')
  @ApiOperation({ operationId: 'getUseCaseDiagram', summary: 'Consultar diagrama UML' })
  @ApiZodResponse(200, 'Use Case Diagram.', diagramResponseSchema)
  get(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('diagramId', uuidParamPipe) diagramId: string,
  ) {
    return this.service.getUseCaseDiagram(projectId, diagramId);
  }
  @Post(':diagramId/versions')
  @ApiOperation({
    operationId: 'createManualUseCaseDiagramVersion',
    summary: 'Editar manualmente el código UML del diagrama y volver a renderizarlo',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiZodBody(manualDiagramVersionRequestSchema)
  @ApiZodResponse(201, 'Use Case Diagram.', diagramResponseSchema)
  createManualVersion(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('diagramId', uuidParamPipe) diagramId: string,
    @Body(new ZodValidationPipe(manualDiagramVersionRequestSchema))
    body: z.output<typeof manualDiagramVersionRequestSchema>,
  ) {
    return this.service.createManualUseCaseDiagramVersion(projectId, diagramId, body.source);
  }
}
