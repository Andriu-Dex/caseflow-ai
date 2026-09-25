import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { workspaceListResponseSchema, type WorkspaceListResponse } from '@caseflow-ai/contracts';
import { ApiZodResponse } from '../openapi/zod-openapi';
import { WorkspacesService } from './workspaces.service';

@ApiTags('workspaces')
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  @ApiOperation({ operationId: 'listWorkspaces', summary: 'List the existing workspaces' })
  @ApiZodResponse(200, 'Workspaces.', workspaceListResponseSchema)
  list(): Promise<WorkspaceListResponse> {
    return this.workspaces.list();
  }
}
