import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module';
import { UseCasesController } from './use-cases.controller';
import { UseCasesService } from './use-cases.service';
@Module({
  imports: [AIModule],
  controllers: [UseCasesController],
  providers: [UseCasesService],
  exports: [UseCasesService],
})
export class UseCasesModule {}
