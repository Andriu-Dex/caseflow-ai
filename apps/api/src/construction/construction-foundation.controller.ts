import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import {
  createDependencyProposalRequestSchema,
  decideDependencyProposalRequestSchema,
  dependencyProposalListResponseSchema,
  dependencyProposalResponseSchema,
  targetTemplateListResponseSchema,
  targetTemplateResponseSchema,
  type TargetTemplateResponse,
} from '@caseflow-ai/contracts';
import {
  TARGET_TEMPLATES,
  findTargetTemplate,
  type TargetTemplateVersion,
} from '@caseflow-ai/domain';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi';
import { DependencyProposalsService } from './dependency-proposals.service';

interface AuthenticatedRequest {
  user: { id: string };
}

const toResponse = (t: TargetTemplateVersion): TargetTemplateResponse => ({
  identifier: t.identifier,
  version: t.version,
  name: t.name,
  language: t.language,
  architecture: t.architecture,
  apiStyle: t.apiStyle,
  frontend: t.frontend,
  backend: t.backend,
  persistence: t.persistence,
  workspace: t.workspace,
  designSystemProfile: { ...t.designSystemProfile },
  dependencies: t.dependencies.map((d) => ({ ...d })),
  validationStages: t.validationCommands.map((c) => c.stage),
});

// Read-only: templates are versioned constants, not editable through the API.
@ApiTags('construction')
@UseGuards(JwtAuthGuard)
@Controller('target-templates')
export class TargetTemplatesController {
  @Get()
  @ApiOperation({ operationId: 'listTargetTemplates', summary: 'Listar plantillas de proyecto' })
  @ApiZodResponse(200, 'Target templates.', targetTemplateListResponseSchema)
  list() {
    return { items: TARGET_TEMPLATES.map(toResponse) };
  }

  @Get(':identifier/versions/:version')
  @ApiOperation({ operationId: 'getTargetTemplate', summary: 'Consultar una versión de plantilla' })
  @ApiZodResponse(200, 'Target template.', targetTemplateResponseSchema)
  get(@Param('identifier') identifier: string, @Param('version', ParseIntPipe) version: number) {
    const template = findTargetTemplate(identifier, version);
    if (!template) throw new NotFoundException('Plantilla no encontrada.');
    return toResponse(template);
  }
}

@ApiTags('construction')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/dependency-proposals')
export class DependencyProposalsController {
  constructor(private readonly service: DependencyProposalsService) {}

  @Post()
  @ApiOperation({
    operationId: 'createDependencyProposal',
    summary: 'Proponer una dependencia fuera del catálogo aprobado',
  })
  @ApiZodBody(createDependencyProposalRequestSchema)
  @ApiZodResponse(201, 'Dependency proposal.', dependencyProposalResponseSchema)
  create(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Body(new ZodValidationPipe(createDependencyProposalRequestSchema))
    body: z.output<typeof createDependencyProposalRequestSchema>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.create(projectId, req.user.id, body);
  }

  @Get()
  @ApiOperation({ operationId: 'listDependencyProposals', summary: 'Listar propuestas' })
  @ApiZodResponse(200, 'Dependency proposals.', dependencyProposalListResponseSchema)
  list(@Param('projectId', uuidParamPipe) projectId: string) {
    return this.service.list(projectId);
  }

  @Post(':proposalId/decide')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'decideDependencyProposal',
    summary: 'Aprobar o rechazar una propuesta de dependencia',
  })
  @ApiZodBody(decideDependencyProposalRequestSchema)
  @ApiZodResponse(200, 'Dependency proposal.', dependencyProposalResponseSchema)
  decide(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('proposalId', uuidParamPipe) proposalId: string,
    @Body(new ZodValidationPipe(decideDependencyProposalRequestSchema))
    body: z.output<typeof decideDependencyProposalRequestSchema>,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.service.decide(projectId, proposalId, req.user.id, body);
  }
}
