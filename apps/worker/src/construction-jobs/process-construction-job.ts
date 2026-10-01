import type { ConstructionJobPayload } from '@caseflow-ai/domain';

export interface ConstructionJobRunnerConfig {
  apiInternalUrl: string;
  internalJobsSecret: string;
}

// Thin authenticated trigger, like the mockup jobs: apps/api owns generation.
// Generated code is never executed here (AGENTS.md §26).
export async function runConstructionJob(
  payload: ConstructionJobPayload,
  config: ConstructionJobRunnerConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(
    `${config.apiInternalUrl}/projects/${payload.projectId}/construction-jobs/${payload.type}/${payload.runId}/run`,
    {
      method: 'POST',
      headers: { 'x-internal-jobs-secret': config.internalJobsSecret },
    },
  );
  if (!response.ok) {
    throw new Error(
      `Construction job "${payload.type}/${payload.runId}" run request failed with status ${response.status}.`,
    );
  }
}
