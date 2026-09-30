import { Controller, Headers, HttpCode, Param, Post, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { SourcesService } from './sources.service';

@ApiTags('internal source jobs')
@Controller('projects/:projectId/sources/jobs')
export class InternalSourceJobsController {
  constructor(private readonly service: SourcesService) {}

  @Post(':jobId/run')
  @HttpCode(204)
  @ApiOperation({ operationId: 'runSourceProcessingJob', summary: 'Procesar una fuente (interno)' })
  async runJob(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('jobId', uuidParamPipe) jobId: string,
    @Headers('x-internal-jobs-secret') secret: string | undefined,
  ): Promise<void> {
    const expected = process.env.INTERNAL_JOBS_SECRET;
    if (!expected || secret !== expected) throw new UnauthorizedException();
    await this.service.runProcessingJob(projectId, jobId);
  }
}
