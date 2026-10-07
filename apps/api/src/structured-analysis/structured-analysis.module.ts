import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module';
import { DataModelsModule } from '../data-models/data-models.module';
import { ConsistencyEngineModule } from '../consistency-engine/consistency-engine.module';
import {
  NavigationController,
  SoftwareArchitectureController,
  SystemArchitectureController,
  UiBlueprintController,
} from './structured-analysis.controller';
import { StructuredAnalysisService } from './structured-analysis.service';
import {
  ConceptualDomainModelController,
  GenerationPlanController,
  ImplementationPlanController,
} from './construction-kinds.controller';
import { DesignThemeController } from './design-theme.controller';
import { ClassDiagramController } from './class-diagram.controller';

@Module({
  // Reuses DataModelsModule's DiagramEngine/DIAGRAM_PROVIDER wiring — one
  // renderer abstraction, not a parallel one per feature.
  imports: [AIModule, DataModelsModule, ConsistencyEngineModule],
  controllers: [
    NavigationController,
    SoftwareArchitectureController,
    SystemArchitectureController,
    UiBlueprintController,
    DesignThemeController,
    ClassDiagramController,
    GenerationPlanController,
    ConceptualDomainModelController,
    ImplementationPlanController,
  ],
  providers: [StructuredAnalysisService],
  exports: [StructuredAnalysisService],
})
export class StructuredAnalysisModule {}
