import { Module } from '@nestjs/common';
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
import { STORAGE_PROVIDER } from './storage-provider.token';

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
        return new FallbackMockupProvider([new StitchMockupProvider(config), internal]);
      },
    },
    {
      provide: STORAGE_PROVIDER,
      useFactory: (): StorageProvider => {
        const config = loadStorageConfig(process.env);
        return config.configured ? new S3StorageProvider(config) : new DisabledStorageProvider();
      },
    },
  ],
  exports: [MockupsService],
})
export class MockupsModule {}
