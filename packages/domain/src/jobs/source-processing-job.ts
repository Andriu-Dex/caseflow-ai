export const SOURCE_PROCESSING_QUEUE = 'source-processing';

export interface SourceProcessingJobPayload {
  jobId: string;
  projectId: string;
  // A report job (DEC-127) rather than text extraction, the default.
  kind?: 'REPORT';
}

// Where the API runs each kind of source job.
export const sourceJobRunPath = (job: SourceProcessingJobPayload) =>
  `/projects/${job.projectId}/sources/${job.kind === 'REPORT' ? 'report-jobs' : 'jobs'}/${job.jobId}/run`;
