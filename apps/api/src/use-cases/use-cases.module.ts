import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module';
import { UseCasesController } from './use-cases.controller';
import { UseCasesService } from './use-cases.service';
import { UseCaseBulkService } from './use-case-bulk.service';
@Module({
  imports: [AIModule],
  controllers: [UseCasesController],
  providers: [UseCasesService, UseCaseBulkService],
  exports: [UseCasesService],
})
export class UseCasesModule {}
