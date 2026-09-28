// Shared between apps/api (enqueues) and apps/worker (consumes) so the
// queue name and payload shape never drift between the two processes.
export const MOCKUP_GENERATION_QUEUE = 'mockup-generation';

export interface MockupGenerationJobPayload {
  jobId: string;
  projectId: string;
}
