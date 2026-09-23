import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module';
import { DataModelsModule } from '../data-models/data-models.module';
import {
  NavigationController,
  SoftwareArchitectureController,
  SystemArchitectureController,
  UiBlueprintController,
} from './structured-analysis.controller';
import { StructuredAnalysisService } from './structured-analysis.service';

@Module({
  // Reuses DataModelsModule's DiagramEngine/DIAGRAM_PROVIDER wiring — one
  // renderer abstraction, not a parallel one per feature.
  imports: [AIModule, DataModelsModule],
  controllers: [
    NavigationController,
    SoftwareArchitectureController,
    SystemArchitectureController,
    UiBlueprintController,
  ],
  providers: [StructuredAnalysisService],
  exports: [StructuredAnalysisService],
})
export class StructuredAnalysisModule {}
