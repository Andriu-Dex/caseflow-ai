import { Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { createJobQueue, createStorageProvider, type JobQueue } from '../common/infrastructure';
import {
  SOURCE_PROCESSING_QUEUE,
  sourceJobRunPath,
  type SourceProcessingJobPayload,
} from '@caseflow-ai/domain';
import {
  DisabledTranscriptionProvider,
  OpenAICompatibleTranscriptionProvider,
  type TranscriptionProvider,
} from '@caseflow-ai/integrations';
import { AIModule } from '../ai/ai.module';
import { SourceContentExtractor } from './source-content-extractor';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';
import { STORAGE_PROVIDER } from './storage-provider.token';
import { SOURCE_QUEUE } from './source-queue.token';
import { TesseractSourceOcrProvider } from './source-ocr-provider';
import {
  InternalSourceJobsController,
  InternalSourceReportJobsController,
} from './internal-source-jobs.controller';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';

@Module({
  imports: [AIModule, KnowledgeBaseModule],
  controllers: [
    SourcesController,
    InternalSourceJobsController,
    InternalSourceReportJobsController,
  ],
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
      useFactory: createStorageProvider,
    },
    {
      provide: SOURCE_QUEUE,
      useFactory: () =>
        createJobQueue<SourceProcessingJobPayload>(SOURCE_PROCESSING_QUEUE, sourceJobRunPath, {
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
        }),
    },
  ],
  exports: [SourcesService],
})
export class SourcesModule implements OnModuleDestroy {
  constructor(@Inject(SOURCE_QUEUE) private readonly queue: JobQueue<unknown>) {}

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
