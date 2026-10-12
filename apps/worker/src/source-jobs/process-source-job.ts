import { sourceJobRunPath, type SourceProcessingJobPayload } from '@caseflow-ai/domain';
import { triggerApiRun } from '../trigger-api-run';

export async function runSourceProcessingJob(
  payload: SourceProcessingJobPayload,
  config: { apiInternalUrl: string; internalJobsSecret: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await triggerApiRun(
    `${config.apiInternalUrl}${sourceJobRunPath(payload)}`,
    {
      method: 'POST',
      headers: { 'x-internal-jobs-secret': config.internalJobsSecret },
      signal: AbortSignal.timeout(720_000),
    },
    fetchImpl,
  );
  if (!response.ok) throw new Error(`Source processing request failed: ${response.status}.`);
}
