import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  acceptStructuredAnalysisCandidatesRequestSchema,
  generateStructuredAnalysisRequestSchema,
  navigationTreeContentSchema,
  softwareArchitectureContentSchema,
  structuredAnalysisGenerationResponseSchema,
  structuredAnalysisListResponseSchema,
  structuredAnalysisResponseSchema,
  systemArchitectureContentSchema,
  transitionArtifactVersionRequestSchema,
  uiBlueprintContentSchema,
  type StructuredAnalysisKind,
} from '@caseflow-ai/contracts';
import { z, type ZodType } from 'zod';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi';
import { StructuredAnalysisService } from './structured-analysis.service';

function inputSchema<T extends ZodType>(contentSchema: T) {
  return z.object({ title: z.string().trim().min(1).max(200), content: contentSchema }).strict();
}

abstract class BaseStructuredAnalysisController {
  protected abstract readonly kind: StructuredAnalysisKind;
  protected abstract readonly contentSchema: ZodType;
  constructor(protected readonly service: StructuredAnalysisService) {}

  create(projectId: string, body: { title: string; content: Record<string, unknown> }) {
    return this.service.create(projectId, this.kind, body.title, body.content);
  }
  list(projectId: string) {
    return this.service.list(projectId, this.kind);
  }
  get(projectId: string, id: string) {
    return this.service.get(projectId, this.kind, id);
  }
  version(
    projectId: string,
    id: string,
    body: { title: string; content: Record<string, unknown> },
  ) {
    return this.service.version(projectId, this.kind, id, body.title, body.content);
  }
  generate(projectId: string, body: { sourceVersionIds: string[] }) {
    return this.service.generate(projectId, this.kind, body.sourceVersionIds);
  }
  generation(projectId: string, generationId: string) {
    return this.service.getGeneration(projectId, this.kind, generationId);
  }
  accept(projectId: string, generationId: string, body: { candidateIds: string[] }) {
    return this.service.accept(projectId, this.kind, generationId, body.candidateIds);
  }
  transition(
    projectId: string,
    artifactId: string,
    versionId: string,
    body: { status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED' },
  ) {
    return this.service.transition(projectId, this.kind, artifactId, versionId, body.status);
  }
  diagram(projectId: string, id: string) {
    return this.service.getDiagram(projectId, this.kind, id);
  }
}

@ApiTags('navigation')
@Controller('projects/:projectId/navigation')
export class NavigationController extends BaseStructuredAnalysisController {
  protected readonly kind = 'NAVIGATION_TREE' as const;
  protected readonly contentSchema = navigationTreeContentSchema;

  @Post()
  @ApiOperation({ operationId: 'createNavigation', summary: 'Crear árbol de navegación manual' })
  @ApiZodBody(inputSchema(navigationTreeContentSchema))
  @ApiZodResponse(201, 'Navigation Tree.', structuredAnalysisResponseSchema)
  override create(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(inputSchema(navigationTreeContentSchema)))
    body: z.output<ReturnType<typeof inputSchema<typeof navigationTreeContentSchema>>>,
  ) {
    return super.create(projectId, body);
  }
  @Get()
  @ApiOperation({ operationId: 'listNavigation', summary: 'Listar árboles de navegación' })
  @ApiZodResponse(200, 'Navigation Trees.', structuredAnalysisListResponseSchema)
  override list(@Param('projectId', uuidParamPipe) projectId: string) {
    return super.list(projectId);
  }
  @Post('generate')
  @ApiOperation({ operationId: 'generateNavigation', summary: 'Generar candidatos de navegación' })
  @ApiZodBody(generateStructuredAnalysisRequestSchema)
  override generate(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(generateStructuredAnalysisRequestSchema))
    body: z.output<typeof generateStructuredAnalysisRequestSchema>,
  ) {
    return super.generate(projectId, body);
  }
  @Get('generations/:generationId')
  @ApiOperation({ operationId: 'getNavigationGeneration', summary: 'Consultar candidatos' })
  @ApiZodResponse(200, 'Navigation generation batch.', structuredAnalysisGenerationResponseSchema)
  override generation(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('generationId', uuidParamPipe) generationId: string,
  ) {
    return super.generation(projectId, generationId);
  }
  @Post('generations/:generationId/accept')
  @ApiOperation({ operationId: 'acceptNavigationCandidates', summary: 'Aceptar candidatos' })
  @ApiZodBody(acceptStructuredAnalysisCandidatesRequestSchema)
  @ApiZodResponse(201, 'Navigation Trees.', structuredAnalysisListResponseSchema)
  override accept(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('generationId', uuidParamPipe) generationId: string,
    @Body(new ZodValidationPipe(acceptStructuredAnalysisCandidatesRequestSchema))
    body: z.output<typeof acceptStructuredAnalysisCandidatesRequestSchema>,
  ) {
    return super.accept(projectId, generationId, body);
  }
  @Get(':navigationId')
  @ApiOperation({ operationId: 'getNavigation', summary: 'Consultar árbol de navegación' })
  @ApiZodResponse(200, 'Navigation Tree.', structuredAnalysisResponseSchema)
  override get(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('navigationId', uuidParamPipe) id: string,
  ) {
    return super.get(projectId, id);
  }
  @Post(':navigationId/versions')
  @ApiOperation({ operationId: 'createNavigationVersion', summary: 'Crear versión' })
  @ApiZodBody(inputSchema(navigationTreeContentSchema))
  @ApiZodResponse(201, 'Navigation Tree.', structuredAnalysisResponseSchema)
  override version(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('navigationId', uuidParamPipe) id: string,
    @Body(new ZodValidationPipe(inputSchema(navigationTreeContentSchema)))
    body: z.output<ReturnType<typeof inputSchema<typeof navigationTreeContentSchema>>>,
  ) {
    return super.version(projectId, id, body);
  }
  @Post(':navigationId/versions/:versionId/transition')
  @ApiOperation({ operationId: 'transitionNavigationVersion', summary: 'Cambiar estado' })
  @ApiZodBody(transitionArtifactVersionRequestSchema)
  override transition(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('navigationId', uuidParamPipe) artifactId: string,
    @Param('versionId', uuidParamPipe) versionId: string,
    @Body(new ZodValidationPipe(transitionArtifactVersionRequestSchema))
    body: z.output<typeof transitionArtifactVersionRequestSchema>,
  ) {
    return super.transition(projectId, artifactId, versionId, body);
  }
  @Get(':navigationId/diagram')
  @ApiOperation({ operationId: 'getNavigationDiagram', summary: 'Obtener diagrama de flujo' })
  override diagram(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('navigationId', uuidParamPipe) id: string,
  ) {
    return super.diagram(projectId, id);
  }
}

@ApiTags('software-architecture')
@Controller('projects/:projectId/software-architecture')
export class SoftwareArchitectureController extends BaseStructuredAnalysisController {
  protected readonly kind = 'SOFTWARE_ARCHITECTURE' as const;
  protected readonly contentSchema = softwareArchitectureContentSchema;

  @Post()
  @ApiOperation({
    operationId: 'createSoftwareArchitecture',
    summary: 'Crear arquitectura de software manual',
  })
  @ApiZodBody(inputSchema(softwareArchitectureContentSchema))
  @ApiZodResponse(201, 'Software Architecture.', structuredAnalysisResponseSchema)
  override create(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(inputSchema(softwareArchitectureContentSchema)))
    body: z.output<ReturnType<typeof inputSchema<typeof softwareArchitectureContentSchema>>>,
  ) {
    return super.create(projectId, body);
  }
  @Get()
  @ApiOperation({
    operationId: 'listSoftwareArchitectures',
    summary: 'Listar arquitecturas de software',
  })
  @ApiZodResponse(200, 'Software Architectures.', structuredAnalysisListResponseSchema)
  override list(@Param('projectId', uuidParamPipe) projectId: string) {
    return super.list(projectId);
  }
  @Post('generate')
  @ApiOperation({ operationId: 'generateSoftwareArchitecture', summary: 'Generar candidatos' })
  @ApiZodBody(generateStructuredAnalysisRequestSchema)
  override generate(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(generateStructuredAnalysisRequestSchema))
    body: z.output<typeof generateStructuredAnalysisRequestSchema>,
  ) {
    return super.generate(projectId, body);
  }
  @Get('generations/:generationId')
  @ApiOperation({
    operationId: 'getSoftwareArchitectureGeneration',
    summary: 'Consultar candidatos',
  })
  @ApiZodResponse(
    200,
    'Software Architecture generation batch.',
    structuredAnalysisGenerationResponseSchema,
  )
  override generation(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('generationId', uuidParamPipe) generationId: string,
  ) {
    return super.generation(projectId, generationId);
  }
  @Post('generations/:generationId/accept')
  @ApiOperation({
    operationId: 'acceptSoftwareArchitectureCandidates',
    summary: 'Aceptar candidatos',
  })
  @ApiZodBody(acceptStructuredAnalysisCandidatesRequestSchema)
  @ApiZodResponse(201, 'Software Architectures.', structuredAnalysisListResponseSchema)
  override accept(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('generationId', uuidParamPipe) generationId: string,
    @Body(new ZodValidationPipe(acceptStructuredAnalysisCandidatesRequestSchema))
    body: z.output<typeof acceptStructuredAnalysisCandidatesRequestSchema>,
  ) {
    return super.accept(projectId, generationId, body);
  }
  @Get(':architectureId')
  @ApiOperation({
    operationId: 'getSoftwareArchitecture',
    summary: 'Consultar arquitectura de software',
  })
  @ApiZodResponse(200, 'Software Architecture.', structuredAnalysisResponseSchema)
  override get(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('architectureId', uuidParamPipe) id: string,
  ) {
    return super.get(projectId, id);
  }
  @Post(':architectureId/versions')
  @ApiOperation({ operationId: 'createSoftwareArchitectureVersion', summary: 'Crear versión' })
  @ApiZodBody(inputSchema(softwareArchitectureContentSchema))
  @ApiZodResponse(201, 'Software Architecture.', structuredAnalysisResponseSchema)
  override version(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('architectureId', uuidParamPipe) id: string,
    @Body(new ZodValidationPipe(inputSchema(softwareArchitectureContentSchema)))
    body: z.output<ReturnType<typeof inputSchema<typeof softwareArchitectureContentSchema>>>,
  ) {
    return super.version(projectId, id, body);
  }
  @Post(':architectureId/versions/:versionId/transition')
  @ApiOperation({ operationId: 'transitionSoftwareArchitectureVersion', summary: 'Cambiar estado' })
  @ApiZodBody(transitionArtifactVersionRequestSchema)
  override transition(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('architectureId', uuidParamPipe) artifactId: string,
    @Param('versionId', uuidParamPipe) versionId: string,
    @Body(new ZodValidationPipe(transitionArtifactVersionRequestSchema))
    body: z.output<typeof transitionArtifactVersionRequestSchema>,
  ) {
    return super.transition(projectId, artifactId, versionId, body);
  }
  @Get(':architectureId/diagram')
  @ApiOperation({
    operationId: 'getSoftwareArchitectureDiagram',
    summary: 'Obtener diagrama de componentes',
  })
  override diagram(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('architectureId', uuidParamPipe) id: string,
  ) {
    return super.diagram(projectId, id);
  }
}

@ApiTags('system-architecture')
@Controller('projects/:projectId/system-architecture')
export class SystemArchitectureController extends BaseStructuredAnalysisController {
  protected readonly kind = 'SYSTEM_ARCHITECTURE' as const;
  protected readonly contentSchema = systemArchitectureContentSchema;

  @Post()
  @ApiOperation({
    operationId: 'createSystemArchitecture',
    summary: 'Crear arquitectura de sistema manual',
  })
  @ApiZodBody(inputSchema(systemArchitectureContentSchema))
  @ApiZodResponse(201, 'System Architecture.', structuredAnalysisResponseSchema)
  override create(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(inputSchema(systemArchitectureContentSchema)))
    body: z.output<ReturnType<typeof inputSchema<typeof systemArchitectureContentSchema>>>,
  ) {
    return super.create(projectId, body);
  }
  @Get()
  @ApiOperation({
    operationId: 'listSystemArchitectures',
    summary: 'Listar arquitecturas de sistema',
  })
  @ApiZodResponse(200, 'System Architectures.', structuredAnalysisListResponseSchema)
  override list(@Param('projectId', uuidParamPipe) projectId: string) {
    return super.list(projectId);
  }
  @Post('generate')
  @ApiOperation({ operationId: 'generateSystemArchitecture', summary: 'Generar candidatos' })
  @ApiZodBody(generateStructuredAnalysisRequestSchema)
  override generate(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(generateStructuredAnalysisRequestSchema))
    body: z.output<typeof generateStructuredAnalysisRequestSchema>,
  ) {
    return super.generate(projectId, body);
  }
  @Get('generations/:generationId')
  @ApiOperation({ operationId: 'getSystemArchitectureGeneration', summary: 'Consultar candidatos' })
  @ApiZodResponse(
    200,
    'System Architecture generation batch.',
    structuredAnalysisGenerationResponseSchema,
  )
  override generation(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('generationId', uuidParamPipe) generationId: string,
  ) {
    return super.generation(projectId, generationId);
  }
  @Post('generations/:generationId/accept')
  @ApiOperation({
    operationId: 'acceptSystemArchitectureCandidates',
    summary: 'Aceptar candidatos',
  })
  @ApiZodBody(acceptStructuredAnalysisCandidatesRequestSchema)
  @ApiZodResponse(201, 'System Architectures.', structuredAnalysisListResponseSchema)
  override accept(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('generationId', uuidParamPipe) generationId: string,
    @Body(new ZodValidationPipe(acceptStructuredAnalysisCandidatesRequestSchema))
    body: z.output<typeof acceptStructuredAnalysisCandidatesRequestSchema>,
  ) {
    return super.accept(projectId, generationId, body);
  }
  @Get(':architectureId')
  @ApiOperation({
    operationId: 'getSystemArchitecture',
    summary: 'Consultar arquitectura de sistema',
  })
  @ApiZodResponse(200, 'System Architecture.', structuredAnalysisResponseSchema)
  override get(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('architectureId', uuidParamPipe) id: string,
  ) {
    return super.get(projectId, id);
  }
  @Post(':architectureId/versions')
  @ApiOperation({ operationId: 'createSystemArchitectureVersion', summary: 'Crear versión' })
  @ApiZodBody(inputSchema(systemArchitectureContentSchema))
  @ApiZodResponse(201, 'System Architecture.', structuredAnalysisResponseSchema)
  override version(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('architectureId', uuidParamPipe) id: string,
    @Body(new ZodValidationPipe(inputSchema(systemArchitectureContentSchema)))
    body: z.output<ReturnType<typeof inputSchema<typeof systemArchitectureContentSchema>>>,
  ) {
    return super.version(projectId, id, body);
  }
  @Post(':architectureId/versions/:versionId/transition')
  @ApiOperation({ operationId: 'transitionSystemArchitectureVersion', summary: 'Cambiar estado' })
  @ApiZodBody(transitionArtifactVersionRequestSchema)
  override transition(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('architectureId', uuidParamPipe) artifactId: string,
    @Param('versionId', uuidParamPipe) versionId: string,
    @Body(new ZodValidationPipe(transitionArtifactVersionRequestSchema))
    body: z.output<typeof transitionArtifactVersionRequestSchema>,
  ) {
    return super.transition(projectId, artifactId, versionId, body);
  }
  @Get(':architectureId/diagram')
  @ApiOperation({
    operationId: 'getSystemArchitectureDiagram',
    summary: 'Obtener diagrama de despliegue',
  })
  override diagram(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('architectureId', uuidParamPipe) id: string,
  ) {
    return super.diagram(projectId, id);
  }
}

@ApiTags('ui-blueprint')
@Controller('projects/:projectId/ui-blueprint')
export class UiBlueprintController extends BaseStructuredAnalysisController {
  protected readonly kind = 'UI_BLUEPRINT' as const;
  protected readonly contentSchema = uiBlueprintContentSchema;

  @Post()
  @ApiOperation({ operationId: 'createUiBlueprint', summary: 'Crear UI Blueprint manual' })
  @ApiZodBody(inputSchema(uiBlueprintContentSchema))
  @ApiZodResponse(201, 'UI Blueprint.', structuredAnalysisResponseSchema)
  override create(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(inputSchema(uiBlueprintContentSchema)))
    body: z.output<ReturnType<typeof inputSchema<typeof uiBlueprintContentSchema>>>,
  ) {
    return super.create(projectId, body);
  }
  @Get()
  @ApiOperation({ operationId: 'listUiBlueprints', summary: 'Listar UI Blueprints' })
  @ApiZodResponse(200, 'UI Blueprints.', structuredAnalysisListResponseSchema)
  override list(@Param('projectId', uuidParamPipe) projectId: string) {
    return super.list(projectId);
  }
  @Post('generate')
  @ApiOperation({ operationId: 'generateUiBlueprint', summary: 'Generar candidatos' })
  @ApiZodBody(generateStructuredAnalysisRequestSchema)
  override generate(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(generateStructuredAnalysisRequestSchema))
    body: z.output<typeof generateStructuredAnalysisRequestSchema>,
  ) {
    return super.generate(projectId, body);
  }
  @Get('generations/:generationId')
  @ApiOperation({ operationId: 'getUiBlueprintGeneration', summary: 'Consultar candidatos' })
  @ApiZodResponse(200, 'UI Blueprint generation batch.', structuredAnalysisGenerationResponseSchema)
  override generation(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('generationId', uuidParamPipe) generationId: string,
  ) {
    return super.generation(projectId, generationId);
  }
  @Post('generations/:generationId/accept')
  @ApiOperation({ operationId: 'acceptUiBlueprintCandidates', summary: 'Aceptar candidatos' })
  @ApiZodBody(acceptStructuredAnalysisCandidatesRequestSchema)
  @ApiZodResponse(201, 'UI Blueprints.', structuredAnalysisListResponseSchema)
  override accept(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('generationId', uuidParamPipe) generationId: string,
    @Body(new ZodValidationPipe(acceptStructuredAnalysisCandidatesRequestSchema))
    body: z.output<typeof acceptStructuredAnalysisCandidatesRequestSchema>,
  ) {
    return super.accept(projectId, generationId, body);
  }
  @Get(':blueprintId')
  @ApiOperation({ operationId: 'getUiBlueprint', summary: 'Consultar UI Blueprint' })
  @ApiZodResponse(200, 'UI Blueprint.', structuredAnalysisResponseSchema)
  override get(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('blueprintId', uuidParamPipe) id: string,
  ) {
    return super.get(projectId, id);
  }
  @Post(':blueprintId/versions')
  @ApiOperation({ operationId: 'createUiBlueprintVersion', summary: 'Crear versión' })
  @ApiZodBody(inputSchema(uiBlueprintContentSchema))
  @ApiZodResponse(201, 'UI Blueprint.', structuredAnalysisResponseSchema)
  override version(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('blueprintId', uuidParamPipe) id: string,
    @Body(new ZodValidationPipe(inputSchema(uiBlueprintContentSchema)))
    body: z.output<ReturnType<typeof inputSchema<typeof uiBlueprintContentSchema>>>,
  ) {
    return super.version(projectId, id, body);
  }
  @Post(':blueprintId/versions/:versionId/transition')
  @ApiOperation({ operationId: 'transitionUiBlueprintVersion', summary: 'Cambiar estado' })
  @ApiZodBody(transitionArtifactVersionRequestSchema)
  override transition(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('blueprintId', uuidParamPipe) artifactId: string,
    @Param('versionId', uuidParamPipe) versionId: string,
    @Body(new ZodValidationPipe(transitionArtifactVersionRequestSchema))
    body: z.output<typeof transitionArtifactVersionRequestSchema>,
  ) {
    return super.transition(projectId, artifactId, versionId, body);
  }
}
