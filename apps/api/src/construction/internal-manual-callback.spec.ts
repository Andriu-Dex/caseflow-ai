import { afterEach, describe, expect, it, vi } from 'vitest';
import { InternalConstructionJobsController } from './generation-runs.controller';

afterEach(() => vi.unstubAllEnvs());

describe('internal manual callback', () => {
  it.each(['user-manual', 'generation-run'])(
    'acknowledges an authenticated %s job while work is running instead of holding the worker connection',
    async (type) => {
      vi.stubEnv('INTERNAL_JOBS_SECRET', 'capture-worker-test-secret');
      let finish!: () => void;
      const runJob = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      const controller = new InternalConstructionJobsController(
        { runJob } as never,
        {} as never,
        {} as never,
        { runJob } as never,
      );
      await expect(controller.run('project', type, 'job', 'wrong')).rejects.toThrow();
      expect(runJob).not.toHaveBeenCalled();
      await controller.run('project', type, 'job', 'capture-worker-test-secret');
      expect(runJob).toHaveBeenCalledWith('project', 'job');
      finish();
    },
  );
});
