import { Inject, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { Worker } from 'bullmq';
import { stopWaitingForApi } from '../trigger-api-run';
import { CONSTRUCTION_QUEUE, type ConstructionJobPayload } from '@caseflow-ai/domain';
import { runConstructionJob } from './process-construction-job';

const CONSTRUCTION_WORKER = Symbol('CONSTRUCTION_WORKER');
const logger = new Logger('ConstructionJobsModule');

@Module({
  providers: [
    {
      provide: CONSTRUCTION_WORKER,
      useFactory: (): Worker<ConstructionJobPayload> => {
        const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
        const internalJobsSecret = process.env.INTERNAL_JOBS_SECRET;
        if (!internalJobsSecret)
          throw new Error(
            'INTERNAL_JOBS_SECRET must be set for apps/worker to run construction jobs.',
          );
        const worker = new Worker<ConstructionJobPayload>(
          CONSTRUCTION_QUEUE,
          (job) => runConstructionJob(job.data, { apiInternalUrl, internalJobsSecret }),
          { connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' } },
        );
        worker.on('failed', (job, error) => {
          logger.warn(`Construction job "${job?.id}" failed: ${error.message}`, error.stack);
        });
        return worker;
      },
    },
  ],
})
export class ConstructionJobsModule implements OnModuleDestroy {
  constructor(@Inject(CONSTRUCTION_WORKER) private readonly worker: Worker) {}
  async onModuleDestroy(): Promise<void> {
    stopWaitingForApi();
    await this.worker.close();
  }
}
