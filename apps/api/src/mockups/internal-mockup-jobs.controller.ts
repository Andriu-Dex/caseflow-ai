import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { uuidParamPipe } from '../common/uuid-param.pipe';
import { MockupsService } from './mockups.service';

@ApiTags('internal mockup jobs')
@Controller('projects/:projectId/mockups')
export class InternalMockupJobsController {
  constructor(private readonly service: MockupsService) {}

  // DEC-146: a mockup of many screens takes far longer than an HTTP request
  // may wait, so the run starts and the call returns at once (202). runJob
  // always leaves the job finished or failed, and a restart marks it failed.
  @Post('jobs/:jobId/run')
  @HttpCode(202)
  @ApiOperation({ operationId: 'runMockupJob', summary: 'Ejecutar un trabajo encolado (interno)' })
  async runJob(
    @Param('jobId', uuidParamPipe) jobId: string,
    @Headers('x-internal-jobs-secret') secret: string | undefined,
  ): Promise<void> {
    const expected = process.env.INTERNAL_JOBS_SECRET;
    if (!expected || secret !== expected) throw new UnauthorizedException();
    void this.service
      .runJob(jobId)
      .catch((error: unknown) =>
        new Logger(InternalMockupJobsController.name).warn(
          `Mockup job "${jobId}" could not run: ${error instanceof Error ? error.message : error}`,
        ),
      );
  }
}
