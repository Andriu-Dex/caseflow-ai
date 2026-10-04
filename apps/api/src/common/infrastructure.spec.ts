import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilesystemStorageProvider } from '@caseflow-ai/integrations';
import { createJobQueue, createStorageProvider } from './infrastructure';

// Desktop edition (DEC-120): a folder instead of S3, no Redis.
describe('desktop infrastructure', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('stores objects on disk when STORAGE_DIR is set', () => {
    vi.stubEnv('STORAGE_DIR', 'C:/datos/caseflow/objetos');
    expect(createStorageProvider()).toBeInstanceOf(FilesystemStorageProvider);
  });

  it('runs a job in process through the authenticated internal endpoint', async () => {
    vi.stubEnv('CASEFLOW_QUEUE_MODE', 'in-process');
    vi.stubEnv('API_INTERNAL_URL', 'http://127.0.0.1:4100');
    vi.stubEnv('INTERNAL_JOBS_SECRET', 'secreto');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const queue = createJobQueue<{ projectId: string; jobId: string }>(
      'mockups',
      (job) => `/projects/${job.projectId}/mockups/jobs/${job.jobId}/run`,
    );
    await queue.add('mockups', { projectId: 'p1', jobId: 'j1' });
    // After the current request, never inside it.
    expect(fetchMock).not.toHaveBeenCalled();
    await new Promise((resolve) => setImmediate(resolve));
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:4100/projects/p1/mockups/jobs/j1/run',
      {
        method: 'POST',
        headers: { 'x-internal-jobs-secret': 'secreto' },
      },
    );
    await queue.close();
  });
});
