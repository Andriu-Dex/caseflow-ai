import { Controller, Headers, HttpCode, Param, Post, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { MockupsService } from './mockups.service';

@ApiTags('internal mockup jobs')
@Controller('projects/:projectId/mockups')
export class InternalMockupJobsController {
  constructor(private readonly service: MockupsService) {}

  @Post('jobs/:jobId/run')
  @HttpCode(204)
  @ApiOperation({ operationId: 'runMockupJob', summary: 'Ejecutar un trabajo encolado (interno)' })
  async runJob(
    @Param('jobId', uuidParamPipe) jobId: string,
    @Headers('x-internal-jobs-secret') secret: string | undefined,
  ): Promise<void> {
    const expected = process.env.INTERNAL_JOBS_SECRET;
    if (!expected || secret !== expected) throw new UnauthorizedException();
    await this.service.runJob(jobId);
  }
}
