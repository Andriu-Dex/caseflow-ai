import { Inject, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { Worker } from 'bullmq';
import { SOURCE_PROCESSING_QUEUE, type SourceProcessingJobPayload } from '@caseflow-ai/domain';
import { runSourceProcessingJob } from './process-source-job';

const SOURCE_WORKER = Symbol('SOURCE_WORKER');
const logger = new Logger('SourceJobsModule');

@Module({
  providers: [
    {
      provide: SOURCE_WORKER,
      useFactory: (): Worker<SourceProcessingJobPayload> => {
        const internalJobsSecret = process.env.INTERNAL_JOBS_SECRET;
        if (!internalJobsSecret) throw new Error('INTERNAL_JOBS_SECRET is required.');
        const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
        const worker = new Worker<SourceProcessingJobPayload>(
          SOURCE_PROCESSING_QUEUE,
          (job) => runSourceProcessingJob(job.data, { apiInternalUrl, internalJobsSecret }),
          {
            connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
            concurrency: 1,
          },
        );
        worker.on('failed', (job, error) => {
          logger.warn(`Source job "${job?.id}" failed: ${error.message}`);
        });
        return worker;
      },
    },
  ],
})
export class SourceJobsModule implements OnModuleDestroy {
  constructor(@Inject(SOURCE_WORKER) private readonly worker: Worker) {}

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}
