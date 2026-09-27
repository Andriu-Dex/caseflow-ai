import { Inject, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { MOCKUP_GENERATION_QUEUE, type MockupGenerationJobPayload } from '@caseflow-ai/domain';
import { loadMockupConfig, loadStorageConfig } from '@caseflow-ai/config';
import {
  DisabledStorageProvider,
  FallbackMockupProvider,
  S3StorageProvider,
  type MockupProvider,
  type StorageProvider,
} from '@caseflow-ai/integrations';
import { InternalWireframeMockupProvider, MockupRenderer } from './mockup-renderer';
import { MockupsController } from './mockups.controller';
import { MockupsService } from './mockups.service';
import { StitchMockupProvider } from './stitch-mockup-provider';
import { MOCKUP_PROVIDER } from './mockup-provider.token';
import { MOCKUP_QUEUE } from './mockup-queue.token';
import { STORAGE_PROVIDER } from './storage-provider.token';

const logger = new Logger('MockupsModule');

@Module({
  controllers: [MockupsController],
  providers: [
    MockupsService,
    MockupRenderer,
    {
      provide: MOCKUP_PROVIDER,
      useFactory: (): MockupProvider => {
        const internal = new InternalWireframeMockupProvider(new MockupRenderer());
        const config = loadMockupConfig(process.env);
        if (config.provider === 'disabled' || !loadStorageConfig(process.env).configured)
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
      useFactory: (): StorageProvider => {
        const config = loadStorageConfig(process.env);
        return config.configured ? new S3StorageProvider(config) : new DisabledStorageProvider();
      },
    },
    {
      provide: MOCKUP_QUEUE,
      useFactory: (): Queue<MockupGenerationJobPayload> =>
        new Queue<MockupGenerationJobPayload>(MOCKUP_GENERATION_QUEUE, {
          connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
        }),
    },
  ],
  exports: [MockupsService],
})
export class MockupsModule implements OnModuleDestroy {
  constructor(@Inject(MOCKUP_QUEUE) private readonly queue: Queue) {}
  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
