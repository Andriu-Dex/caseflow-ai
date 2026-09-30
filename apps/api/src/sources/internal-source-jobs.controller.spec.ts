import { UnauthorizedException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InternalSourceJobsController } from './internal-source-jobs.controller';
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
