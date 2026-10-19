import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module';
import { UseCasesController } from './use-cases.controller';
import { UseCasesService } from './use-cases.service';
import { UseCaseBulkService } from './use-case-bulk.service';
import { UseCaseGenerationJobsService } from './use-case-generation-jobs.service';
@Module({
  imports: [AIModule],
  controllers: [UseCasesController],
  providers: [UseCasesService, UseCaseBulkService, UseCaseGenerationJobsService],
  exports: [UseCasesService],
})
export class UseCasesModule {}
