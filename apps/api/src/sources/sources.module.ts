import { Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { SOURCE_PROCESSING_QUEUE, type SourceProcessingJobPayload } from '@caseflow-ai/domain';
import { loadStorageConfig } from '@caseflow-ai/config';
import {
  DisabledStorageProvider,
  S3StorageProvider,
  DisabledTranscriptionProvider,
  OpenAICompatibleTranscriptionProvider,
  type StorageProvider,
  type TranscriptionProvider,
} from '@caseflow-ai/integrations';
import { AIModule } from '../ai/ai.module';
import { SourceContentExtractor } from './source-content-extractor';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';
import { STORAGE_PROVIDER } from './storage-provider.token';
import { SOURCE_QUEUE } from './source-queue.token';
import { TesseractSourceOcrProvider } from './source-ocr-provider';
import { InternalSourceJobsController } from './internal-source-jobs.controller';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';

@Module({
  imports: [AIModule, KnowledgeBaseModule],
  controllers: [SourcesController, InternalSourceJobsController],
  providers: [
    SourcesService,
    {
      provide: SourceContentExtractor,
      useFactory: (): SourceContentExtractor => {
        const baseUrl = process.env.TRANSCRIPTION_BASE_URL;
        const apiKey = process.env.TRANSCRIPTION_API_KEY;
        const model = process.env.TRANSCRIPTION_MODEL;
        const transcription: TranscriptionProvider =
          baseUrl && apiKey && model
            ? new OpenAICompatibleTranscriptionProvider({
                baseUrl,
                apiKey,
                model,
                timeoutMs: 120_000,
              })
            : new DisabledTranscriptionProvider();
        return new SourceContentExtractor(new TesseractSourceOcrProvider(), transcription);
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
      provide: SOURCE_QUEUE,
      useFactory: (): Queue<SourceProcessingJobPayload> =>
        new Queue<SourceProcessingJobPayload>(SOURCE_PROCESSING_QUEUE, {
          connection: {
            url: process.env.REDIS_URL ?? 'redis://localhost:6379',
            enableOfflineQueue: false,
            maxRetriesPerRequest: 1,
          },
        }),
    },
  ],
  exports: [SourcesService],
})
export class SourcesModule implements OnModuleDestroy {
  constructor(@Inject(SOURCE_QUEUE) private readonly queue: Queue) {}

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
