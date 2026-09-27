import { describe, expect, it, vi } from 'vitest';
import { runMockupGenerationJob } from './process-mockup-job';

const config = { apiInternalUrl: 'http://api.internal', internalJobsSecret: 'secret' };
const payload = { jobId: 'job-1', projectId: 'project-1' };

describe('runMockupGenerationJob', () => {
  it('calls the internal run endpoint with the shared secret header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    await runMockupGenerationJob(payload, config, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api.internal/projects/project-1/mockups/jobs/job-1/run',
      { method: 'POST', headers: { 'x-internal-jobs-secret': 'secret' } },
    );
  });

  it('throws when the API rejects the request, so BullMQ retries the job', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    await expect(runMockupGenerationJob(payload, config, fetchImpl)).rejects.toThrow('401');
  });
});
