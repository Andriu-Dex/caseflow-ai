import { Inject, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { Worker } from 'bullmq';
import { MOCKUP_GENERATION_QUEUE, type MockupGenerationJobPayload } from '@caseflow-ai/domain';
import { runMockupGenerationJob } from './process-mockup-job';

const MOCKUP_WORKER = Symbol('MOCKUP_WORKER');
const logger = new Logger('MockupJobsModule');

@Module({
  providers: [
    {
      provide: MOCKUP_WORKER,
      useFactory: (): Worker<MockupGenerationJobPayload> => {
        const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
        const internalJobsSecret = process.env.INTERNAL_JOBS_SECRET;
        if (!internalJobsSecret)
          throw new Error('INTERNAL_JOBS_SECRET must be set for apps/worker to run mockup jobs.');
        const worker = new Worker<MockupGenerationJobPayload>(
          MOCKUP_GENERATION_QUEUE,
          (job) => runMockupGenerationJob(job.data, { apiInternalUrl, internalJobsSecret }),
          { connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' } },
        );
        worker.on('failed', (job, error) => {
          logger.warn(`Mockup job "${job?.id}" failed: ${error.message}`, error.stack);
        });
        return worker;
      },
    },
  ],
})
export class MockupJobsModule implements OnModuleDestroy {
  constructor(@Inject(MOCKUP_WORKER) private readonly worker: Worker) {}
  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}
