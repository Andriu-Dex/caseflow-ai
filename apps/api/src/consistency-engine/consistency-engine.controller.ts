import { Controller, Get, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ConsistencyEngineService } from './consistency-engine.service';
import { JwtAuthGuard } from '../identity/jwt-auth.guard';
import { ProjectMembershipGuard } from '../identity/project-membership.guard';

@UseGuards(JwtAuthGuard, ProjectMembershipGuard)
@Controller('projects/:projectId/consistency')
export class ConsistencyEngineController {
  constructor(private readonly consistencyEngineService: ConsistencyEngineService) {}

  @Get()
  async getConsistencyReport(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    return this.consistencyEngineService.generateReport(projectId);
  }
}
