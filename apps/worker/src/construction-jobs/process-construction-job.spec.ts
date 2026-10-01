import { describe, expect, it, vi } from 'vitest';
import { runConstructionJob } from './process-construction-job';

const config = { apiInternalUrl: 'http://api.internal', internalJobsSecret: 'secret' };
const payload = { type: 'generation-run' as const, runId: 'run-1', projectId: 'project-1' };

describe('runConstructionJob', () => {
  it('calls the internal run endpoint with the shared secret header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    await runConstructionJob(payload, config, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api.internal/projects/project-1/construction-jobs/generation-run/run-1/run',
      { method: 'POST', headers: { 'x-internal-jobs-secret': 'secret' } },
    );
  });

  it('throws when the API rejects the request, so BullMQ retries the job', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    await expect(runConstructionJob(payload, config, fetchImpl)).rejects.toThrow('401');
  });
});
