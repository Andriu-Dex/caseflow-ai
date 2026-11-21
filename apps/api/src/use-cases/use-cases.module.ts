import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module';
import { UseCasesController } from './use-cases.controller';
import { UseCasesService } from './use-cases.service';
import { UseCaseBulkService } from './use-case-bulk.service';
import { UseCaseGenerationJobsService } from './use-case-generation-jobs.service';
import { StageCurrencyModule } from '../readiness/stage-currency';
@Module({
  imports: [AIModule, StageCurrencyModule],
  controllers: [UseCasesController],
  providers: [UseCasesService, UseCaseBulkService, UseCaseGenerationJobsService],
  exports: [UseCasesService],
})
export class UseCasesModule {}
