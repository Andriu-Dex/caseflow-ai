import { Module } from '@nestjs/common';
import { loadDiagramRendererConfig } from '@caseflow-ai/config';
import {
  DisabledDiagramProvider,
  KrokiDiagramProvider,
  type DiagramProvider,
} from '@caseflow-ai/integrations';
import { DataModelsController, UseCaseDiagramsController } from './data-models.controller';
import { DataModelsService } from './data-models.service';
import { DiagramEngine } from './diagram-engine';
import { DIAGRAM_PROVIDER } from './diagram-provider.token';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [AIModule],
  controllers: [DataModelsController, UseCaseDiagramsController],
  providers: [
    DataModelsService,
    DiagramEngine,
    {
      provide: DIAGRAM_PROVIDER,
      useFactory: (): DiagramProvider => {
        const config = loadDiagramRendererConfig(process.env);
        return config.renderer === 'disabled'
          ? new DisabledDiagramProvider()
          : new KrokiDiagramProvider(config);
      },
    },
  ],
  // DiagramEngine/DIAGRAM_PROVIDER are also reused by StructuredAnalysisModule
  // (Navigation/Software/System Architecture diagrams) — one renderer wiring.
  exports: [DataModelsService, DiagramEngine, DIAGRAM_PROVIDER],
})
export class DataModelsModule {}
