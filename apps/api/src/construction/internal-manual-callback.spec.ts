import { afterEach, describe, expect, it, vi } from 'vitest';
import { InternalConstructionJobsController } from './generation-runs.controller';

afterEach(() => vi.unstubAllEnvs());

describe('internal manual callback', () => {
  it('acknowledges an authenticated job while capture is still running instead of holding the worker connection', async () => {
    vi.stubEnv('INTERNAL_JOBS_SECRET', 'capture-worker-test-secret');
    let finish!: () => void;
    const runJob = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new InternalConstructionJobsController(
      {} as never,
      {} as never,
      {} as never,
      { runJob } as never,
    );
    await expect(controller.run('project', 'user-manual', 'job', 'wrong')).rejects.toThrow();
    expect(runJob).not.toHaveBeenCalled();
    await controller.run('project', 'user-manual', 'job', 'capture-worker-test-secret');
    expect(runJob).toHaveBeenCalledWith('project', 'job');
    finish();
  });
});
