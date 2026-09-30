export const SOURCE_PROCESSING_QUEUE = 'source-processing';

export interface SourceProcessingJobPayload {
  jobId: string;
  projectId: string;
}
