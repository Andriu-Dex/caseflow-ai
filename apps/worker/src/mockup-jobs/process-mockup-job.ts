import type { MockupGenerationJobPayload } from '@caseflow-ai/domain';

export interface MockupJobRunnerConfig {
  apiInternalUrl: string;
  internalJobsSecret: string;
}

// apps/api already owns the reviewed Prisma/StorageProvider/MockupProvider
// generation logic (MockupsService.runJob) — this worker is only a trigger,
// not a second implementation of it, so it stays a thin authenticated call.
export async function runMockupGenerationJob(
  payload: MockupGenerationJobPayload,
  config: MockupJobRunnerConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(
    `${config.apiInternalUrl}/projects/${payload.projectId}/mockups/jobs/${payload.jobId}/run`,
    {
      method: 'POST',
      headers: { 'x-internal-jobs-secret': config.internalJobsSecret },
    },
  );
  if (!response.ok) {
    throw new Error(
      `Mockup generation job "${payload.jobId}" run request failed with status ${response.status}.`,
    );
  }
}
