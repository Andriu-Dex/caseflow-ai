import { Module } from '@nestjs/common';
import { DataModelsController, UseCaseDiagramsController } from './data-models.controller';
import { DataModelsService } from './data-models.service';
import { DiagramEngine } from './diagram-engine';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [AIModule],
  controllers: [DataModelsController, UseCaseDiagramsController],
  providers: [DataModelsService, DiagramEngine],
  exports: [DataModelsService],
})
export class DataModelsModule {}
