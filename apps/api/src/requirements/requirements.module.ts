import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module';
import { RequirementsController } from './requirements.controller';
import { RequirementsService } from './requirements.service';
import { RequirementDocumentExportService } from './requirement-document-export.service';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { RequirementGenerationJobsService } from './requirement-generation-jobs.service';
import { RequirementBulkService } from './requirement-bulk.service';
import { StageCurrencyModule } from '../readiness/stage-currency';

@Module({
  imports: [AIModule, KnowledgeBaseModule, StageCurrencyModule],
  controllers: [RequirementsController],
  providers: [
    RequirementsService,
    RequirementDocumentExportService,
    RequirementGenerationJobsService,
    RequirementBulkService,
  ],
  exports: [RequirementsService],
})
export class RequirementsModule {}
