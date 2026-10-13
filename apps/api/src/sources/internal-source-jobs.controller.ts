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
// DEC-127: a report may take minutes; the run starts here and answers at
// once, and the job's state in the database (resumed after a restart) is the
// record of its progress.
@ApiTags('internal source jobs')
@Controller('projects/:projectId/sources/report-jobs')
export class InternalSourceReportJobsController {
  constructor(private readonly service: SourcesService) {}

  @Post(':jobId/run')
  @HttpCode(202)
  @ApiOperation({ operationId: 'runSourceReportJob', summary: 'Generar un informe (interno)' })
  runJob(
    @Param('projectId', uuidParamPipe) projectId: string,
    @Param('jobId', uuidParamPipe) jobId: string,
    @Headers('x-internal-jobs-secret') secret: string | undefined,
  ): void {
    const expected = process.env.INTERNAL_JOBS_SECRET;
    if (!expected || secret !== expected) throw new UnauthorizedException();
    void this.service.runReportJob(projectId, jobId).catch(() => undefined);
  }
}
