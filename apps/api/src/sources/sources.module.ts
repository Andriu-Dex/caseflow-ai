import { Module } from '@nestjs/common';
import { loadStorageConfig } from '@caseflow-ai/config';
import {
  DisabledStorageProvider,
  S3StorageProvider,
  type StorageProvider,
} from '@caseflow-ai/integrations';
import { AIModule } from '../ai/ai.module';
import { SourceContentExtractor } from './source-content-extractor';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';
import { STORAGE_PROVIDER } from './storage-provider.token';

@Module({
  imports: [AIModule],
  controllers: [SourcesController],
  providers: [
    SourcesService,
    SourceContentExtractor,
    {
      provide: STORAGE_PROVIDER,
      useFactory: (): StorageProvider => {
        const config = loadStorageConfig(process.env);
        return config.configured ? new S3StorageProvider(config) : new DisabledStorageProvider();
      },
    },
  ],
  exports: [SourcesService],
})
export class SourcesModule {}
