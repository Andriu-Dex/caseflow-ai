import { Module } from '@nestjs/common';
import { FirstDeliverableModule } from '../first-deliverable/first-deliverable.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { StalenessModule } from '../staleness/staleness.module';
import { TraceabilityModule } from '../traceability/traceability.module';
import { ReadinessController } from './readiness.controller';
import { ReadinessService } from './readiness.service';
import { StageCurrencyModule } from './stage-currency';
import { StageConfirmationsController } from './stage-confirmations.controller';
import { ConsistencyEngineModule } from '../consistency-engine/consistency-engine.module';

@Module({
  imports: [
    RequirementsModule,
    StalenessModule,
    TraceabilityModule,
    FirstDeliverableModule,
    StageCurrencyModule,
    ConsistencyEngineModule,
  ],
  controllers: [ReadinessController, StageConfirmationsController],
  providers: [ReadinessService],
  exports: [ReadinessService],
})
export class ReadinessModule {}
