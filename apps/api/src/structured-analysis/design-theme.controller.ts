import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  acceptStructuredAnalysisCandidatesRequestSchema,
  designThemeContentSchema,
  generateStructuredAnalysisRequestSchema,
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
import { BaseStructuredAnalysisController, inputSchema } from './structured-analysis.controller';

// Project theme and palette (DEC-118): same structured-analysis lifecycle;
// the AI proposes three palettes and approvals reach the audit trail.

interface AuthenticatedRequest {
  user: { id: string };
}

const designThemeInput = inputSchema(designThemeContentSchema);

@ApiTags('design-theme')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/design-theme')
export class DesignThemeController extends BaseStructuredAnalysisController {
  protected readonly kind = 'DESIGN_THEME' as const;
  protected readonly contentSchema = designThemeContentSchema;

  constructor(service: StructuredAnalysisService) {
    super(service);
  }

  @Post()
  @ApiOperation({ operationId: 'createDesignTheme', summary: 'Crear tema manual' })
  @ApiZodBody(designThemeInput)
  @ApiZodResponse(201, 'Design Theme.', structuredAnalysisResponseSchema)
  override create(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(designThemeInput)) body: z.output<typeof designThemeInput>,
  ) {
    return super.create(projectId, body);
  }
  @Get()
  @ApiOperation({ operationId: 'listDesignThemes', summary: 'Listar temas' })
  @ApiZodResponse(200, 'Design Themes.', structuredAnalysisListResponseSchema)
  override list(@Param('projectId', uuidParamPipe) projectId: string) {
    return super.list(projectId);
  }
  @Post('generate')
  @ApiOperation({ operationId: 'generateDesignTheme', summary: 'Generar tres paletas candidatas' })
  @ApiZodBody(generateStructuredAnalysisRequestSchema)
  override generate(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(generateStructuredAnalysisRequestSchema))
    body: z.output<typeof generateStructuredAnalysisRequestSchema>,
  ) {
    return super.generate(projectId, body);
  }
  @Get('generations/:generationId')
  @ApiOperation({ operationId: 'getDesignThemeGeneration', summary: 'Consultar candidatos' })
  @ApiZodResponse(200, 'Design Theme batch.', structuredAnalysisGenerationResponseSchema)
  override generation(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('generationId', uuidParamPipe) generationId: string,
  ) {
    return super.generation(projectId, generationId);
  }
  @Post('generations/:generationId/accept')
  @ApiOperation({ operationId: 'acceptDesignThemeCandidates', summary: 'Aceptar candidatos' })
  @ApiZodBody(acceptStructuredAnalysisCandidatesRequestSchema)
  @ApiZodResponse(201, 'Design Themes.', structuredAnalysisListResponseSchema)
  override accept(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('generationId', uuidParamPipe) generationId: string,
    @Body(new ZodValidationPipe(acceptStructuredAnalysisCandidatesRequestSchema))
    body: z.output<typeof acceptStructuredAnalysisCandidatesRequestSchema>,
  ) {
    return super.accept(projectId, generationId, body);
  }
  @Get(':themeId')
  @ApiOperation({ operationId: 'getDesignTheme', summary: 'Consultar tema' })
  @ApiZodResponse(200, 'Design Theme.', structuredAnalysisResponseSchema)
  override get(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('themeId', uuidParamPipe) id: string,
  ) {
    return super.get(projectId, id);
  }
  @Post(':themeId/versions')
  @ApiOperation({ operationId: 'createDesignThemeVersion', summary: 'Crear versión' })
  @ApiZodBody(designThemeInput)
  @ApiZodResponse(201, 'Design Theme.', structuredAnalysisResponseSchema)
  override version(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('themeId', uuidParamPipe) id: string,
    @Body(new ZodValidationPipe(designThemeInput)) body: z.output<typeof designThemeInput>,
  ) {
    return super.version(projectId, id, body);
  }
  @Post(':themeId/versions/:versionId/transition')
  @ApiOperation({ operationId: 'transitionDesignThemeVersion', summary: 'Cambiar estado' })
  @ApiZodBody(transitionArtifactVersionRequestSchema)
  transitionVersion(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('themeId', uuidParamPipe) artifactId: string,
    @Param('versionId', uuidParamPipe) versionId: string,
    @Body(new ZodValidationPipe(transitionArtifactVersionRequestSchema))
    body: z.output<typeof transitionArtifactVersionRequestSchema>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.transition(projectId, artifactId, versionId, body, req.user.id);
  }
}
