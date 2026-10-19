import { Inject, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { createJobQueue, createStorageProvider, type JobQueue } from '../common/infrastructure';
import { MOCKUP_GENERATION_QUEUE, type MockupGenerationJobPayload } from '@caseflow-ai/domain';
import { loadMockupConfig, loadStorageConfig } from '@caseflow-ai/config';
import { FallbackMockupProvider, type MockupProvider } from '@caseflow-ai/integrations';
import { InternalWireframeMockupProvider, MockupRenderer } from './mockup-renderer';
import { MockupsController } from './mockups.controller';
import { InternalMockupJobsController } from './internal-mockup-jobs.controller';
import { MockupsService } from './mockups.service';
import { StitchMockupProvider } from './stitch-mockup-provider';
import { MOCKUP_PROVIDER } from './mockup-provider.token';
import { MOCKUP_QUEUE } from './mockup-queue.token';
import { STORAGE_PROVIDER } from './storage-provider.token';

const logger = new Logger('MockupsModule');

@Module({
  controllers: [MockupsController, InternalMockupJobsController],
  providers: [
    MockupsService,
    MockupRenderer,
    {
      provide: MOCKUP_PROVIDER,
      useFactory: (): MockupProvider => {
        const internal = new InternalWireframeMockupProvider(new MockupRenderer());
        const config = loadMockupConfig(process.env);
        // Stitch screens need somewhere to be stored (S3 or the desktop folder).
        if (
          config.provider === 'disabled' ||
          (!loadStorageConfig(process.env).configured && !process.env.STORAGE_DIR)
        )
          return internal;
        return new FallbackMockupProvider(
          [new StitchMockupProvider(config), internal],
          (id, error) =>
            logger.warn(
              `Mockup provider "${id}" failed, falling back: ${
                error instanceof Error ? error.message : String(error)
              }`,
              error instanceof Error ? error.stack : undefined,
            ),
        );
      },
    },
    {
      provide: STORAGE_PROVIDER,
      useFactory: createStorageProvider,
    },
    {
      provide: MOCKUP_QUEUE,
      useFactory: () =>
        createJobQueue<MockupGenerationJobPayload>(
          MOCKUP_GENERATION_QUEUE,
          (job) => `/projects/${job.projectId}/mockups/jobs/${job.jobId}/run`,
        ),
    },
  ],
  exports: [MockupsService],
})
export class MockupsModule implements OnModuleDestroy {
  constructor(@Inject(MOCKUP_QUEUE) private readonly queue: JobQueue<unknown>) {}
  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
