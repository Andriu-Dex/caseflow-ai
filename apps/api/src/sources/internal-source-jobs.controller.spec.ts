import { UnauthorizedException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  InternalSourceJobsController,
  InternalSourceReportJobsController,
} from './internal-source-jobs.controller';
import type { SourcesService } from './sources.service';

describe('InternalSourceJobsController', () => {
  const previousSecret = process.env.INTERNAL_JOBS_SECRET;
  afterEach(() => {
    process.env.INTERNAL_JOBS_SECRET = previousSecret;
  });

  it('requires the shared secret before processing a project-scoped job', async () => {
    const runProcessingJob = vi.fn().mockResolvedValue(undefined);
    const controller = new InternalSourceJobsController({
      runProcessingJob,
    } as unknown as SourcesService);
    process.env.INTERNAL_JOBS_SECRET = 'shared-secret';
    await expect(controller.runJob('project', 'job', 'wrong')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(runProcessingJob).not.toHaveBeenCalled();
    await controller.runJob('project', 'job', 'shared-secret');
    expect(runProcessingJob).toHaveBeenCalledWith('project', 'job');
  });
});

describe('InternalSourceReportJobsController', () => {
  const previousSecret = process.env.INTERNAL_JOBS_SECRET;
  afterEach(() => {
    process.env.INTERNAL_JOBS_SECRET = previousSecret;
  });

  it('requires the shared secret, then starts the report without waiting for it', () => {
    let finish!: () => void;
    const runReportJob = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const controller = new InternalSourceReportJobsController({
      runReportJob,
    } as unknown as SourcesService);
    process.env.INTERNAL_JOBS_SECRET = 'shared-secret';
    expect(() => controller.runJob('project', 'job', 'wrong')).toThrow(UnauthorizedException);
    expect(runReportJob).not.toHaveBeenCalled();
    // Returns while the report is still running.
    expect(controller.runJob('project', 'job', 'shared-secret')).toBeUndefined();
    expect(runReportJob).toHaveBeenCalledWith('project', 'job');
    finish();
  });
});
