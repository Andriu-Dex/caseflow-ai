import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import {
  editUserManualSchema,
  transitionArtifactVersionRequestSchema,
  userManualResponseSchema,
  userManualStateSchema,
} from '@caseflow-ai/contracts';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ApiZodBody, ApiZodResponse } from '../openapi/zod-openapi';
import { UserManualsService } from './user-manuals.service';

@ApiTags('user-manuals')
@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/generated-project-snapshots/:snapshotId/user-manual')
export class UserManualsController {
  constructor(private readonly manuals: UserManualsService) {}
  @Get()
  @ApiOperation({
    operationId: 'getUserManualState',
    summary: 'Consultar manual y estado de generación',
  })
  @ApiZodResponse(200, 'Manual state.', userManualStateSchema)
  state(
    @Param('projectId', uuidParamPipe) p: string,
    @Param('snapshotId', uuidParamPipe) s: string,
  ) {
    return this.manuals.state(p, s);
  }

  @Post('generate')
  @HttpCode(202)
  @ApiOperation({
    operationId: 'generateUserManual',
    summary: 'Generar o reintentar manual sin reconstruir el software',
  })
  generate(
    @Param('projectId', uuidParamPipe) p: string,
    @Param('snapshotId', uuidParamPipe) s: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.manuals.enqueue(p, s, req.user.id);
  }

  @Get('versions/:versionId')
  @ApiOperation({
    operationId: 'getUserManualVersion',
    summary: 'Consultar una versión histórica del manual',
  })
  @ApiZodResponse(200, 'Manual.', userManualResponseSchema)
  version(
    @Param('projectId', uuidParamPipe) p: string,
    @Param('snapshotId', uuidParamPipe) s: string,
    @Param('versionId', uuidParamPipe) v: string,
  ) {
    return this.manuals.get(p, s, v);
  }

  @Post('versions')
  @ApiOperation({ operationId: 'editUserManual', summary: 'Guardar una nueva versión del manual' })
  @ApiZodBody(editUserManualSchema)
  @ApiZodResponse(201, 'Manual.', userManualResponseSchema)
  edit(
    @Param('projectId', uuidParamPipe) p: string,
    @Param('snapshotId', uuidParamPipe) s: string,
    @Request() req: { user: { id: string } },
    @Body(new ZodValidationPipe(editUserManualSchema)) input: z.output<typeof editUserManualSchema>,
  ) {
    return this.manuals.edit(p, s, req.user.id, input);
  }

  @Post('versions/:versionId/transition')
  @ApiOperation({
    operationId: 'reviewUserManual',
    summary: 'Enviar, aprobar o solicitar cambios al manual',
  })
  @ApiZodBody(transitionArtifactVersionRequestSchema)
  @ApiZodResponse(201, 'Manual.', userManualResponseSchema)
  transition(
    @Param('projectId', uuidParamPipe) p: string,
    @Param('snapshotId', uuidParamPipe) s: string,
    @Param('versionId', uuidParamPipe) v: string,
    @Request() req: { user: { id: string } },
    @Body(new ZodValidationPipe(transitionArtifactVersionRequestSchema))
    input: z.output<typeof transitionArtifactVersionRequestSchema>,
  ) {
    return this.manuals.transition(p, s, v, req.user.id, input.status);
  }

  @Get('versions/:versionId/download')
  @ApiOperation({
    operationId: 'downloadUserManual',
    summary: 'Descargar manual visual o entrega completa',
  })
  async download(
    @Param('projectId', uuidParamPipe) p: string,
    @Param('snapshotId', uuidParamPipe) s: string,
    @Param('versionId', uuidParamPipe) v: string,
    @Request() req: { user: { id: string } },
    @Query('format', new ZodValidationPipe(z.enum(['html', 'pdf', 'zip'])))
    format: 'html' | 'pdf' | 'zip',
    @Res() res: Response,
  ) {
    const result = await this.manuals.download(p, s, v, req.user.id, format);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(result.body);
  }
}
