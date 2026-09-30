import type { SourceProcessingJobPayload } from '@caseflow-ai/domain';

export async function runSourceProcessingJob(
  payload: SourceProcessingJobPayload,
  config: { apiInternalUrl: string; internalJobsSecret: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(
    `${config.apiInternalUrl}/projects/${payload.projectId}/sources/jobs/${payload.jobId}/run`,
    {
      method: 'POST',
      headers: { 'x-internal-jobs-secret': config.internalJobsSecret },
      signal: AbortSignal.timeout(720_000),
    },
  );
  if (!response.ok) throw new Error(`Source processing request failed: ${response.status}.`);
}
