import { Module } from '@nestjs/common';
import { FirstDeliverableModule } from '../first-deliverable/first-deliverable.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { StalenessModule } from '../staleness/staleness.module';
import { TraceabilityModule } from '../traceability/traceability.module';
import { ReadinessController } from './readiness.controller';
import { ReadinessService } from './readiness.service';

@Module({
  imports: [RequirementsModule, StalenessModule, TraceabilityModule, FirstDeliverableModule],
  controllers: [ReadinessController],
  providers: [ReadinessService],
  exports: [ReadinessService],
})
export class ReadinessModule {}
