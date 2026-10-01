// Shared between apps/api (enqueues) and apps/worker (consumes): one queue for
// the long-running Construction work (spec §40) — generating a run's files and
// validating them in the sandbox.
export const CONSTRUCTION_QUEUE = 'construction';

export const CONSTRUCTION_JOB_TYPES = ['generation-run', 'sandbox-run'] as const;
export type ConstructionJobType = (typeof CONSTRUCTION_JOB_TYPES)[number];

export interface ConstructionJobPayload {
  type: ConstructionJobType;
  runId: string;
  projectId: string;
}
