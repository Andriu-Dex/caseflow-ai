import { Module } from '@nestjs/common';
import { DataModelsModule } from '../data-models/data-models.module';
import { TraceabilityController } from './traceability.controller';
import { TraceabilityService } from './traceability.service';

@Module({
  // Reuses DataModelsModule's DiagramEngine/DIAGRAM_PROVIDER wiring — one
  // renderer abstraction, not a parallel one per feature (same pattern as
  // StructuredAnalysisModule).
  imports: [DataModelsModule],
  controllers: [TraceabilityController],
  providers: [TraceabilityService],
  exports: [TraceabilityService],
})
export class TraceabilityModule {}
