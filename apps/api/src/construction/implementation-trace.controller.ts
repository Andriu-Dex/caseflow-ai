import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { implementationTraceResponseSchema } from '@caseflow-ai/contracts';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiErrorResponse, ApiUuidParam, ApiZodResponse } from '../openapi/zod-openapi';
import { z } from 'zod';
import { ImplementationTraceService } from './implementation-trace.service';

const artifactCode = z
  .string()
  .trim()
  .regex(/^[A-Z]{1,8}-\d{1,6}$/, 'Código no válido.');

@ApiTags('construction')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/implementation-trace')
export class ImplementationTraceController {
  constructor(private readonly service: ImplementationTraceService) {}

  @Get(':code')
  @ApiOperation({
    operationId: 'getImplementationTrace',
    summary: 'Where a requirement or use case is implemented (DEC-172)',
  })
  @ApiUuidParam('projectId', 'Project identifier.')
  @ApiParam({
    name: 'code',
    description: 'Requirement or use case code, such as RF-001 or CU-003.',
  })
  @ApiZodResponse(
    200,
    'Use cases, screens, actions, files and results.',
    implementationTraceResponseSchema,
  )
  @ApiErrorResponse(404, 'No approved requirement or use case has that code.')
  trace(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('code', new ZodValidationPipe(artifactCode)) code: string,
  ) {
    return this.service.trace(projectId, code);
  }
}
