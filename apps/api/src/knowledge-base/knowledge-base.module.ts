import { Module } from '@nestjs/common';
import { KnowledgeBaseService } from './knowledge-base.service';
import { DatabaseModule } from '../database/database.module';
import { FakeEmbeddingProvider } from '@caseflow-ai/integrations';

@Module({
  imports: [DatabaseModule],
  providers: [
    KnowledgeBaseService,
    {
      provide: 'EMBEDDING_PROVIDER',
      useClass: FakeEmbeddingProvider,
    },
  ],
  exports: [KnowledgeBaseService, 'EMBEDDING_PROVIDER'],
})
export class KnowledgeBaseModule {}
