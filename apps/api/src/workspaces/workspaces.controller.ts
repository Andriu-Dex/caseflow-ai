import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';

import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { workspaceListResponseSchema, type WorkspaceListResponse } from '@caseflow-ai/contracts';
import { ApiZodResponse } from '../openapi/zod-openapi';
import { WorkspacesService } from './workspaces.service';

@ApiTags('workspaces')
@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  @ApiOperation({ operationId: 'listWorkspaces', summary: 'List the existing workspaces' })
  @ApiZodResponse(200, 'Workspaces.', workspaceListResponseSchema)
  list(@Req() request: Request & { user: { id: string } }): Promise<WorkspaceListResponse> {
    return this.workspaces.list(request.user.id);
  }
}
