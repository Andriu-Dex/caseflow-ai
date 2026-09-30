import { Module } from '@nestjs/common';
import { ImpactAnalysisService } from './impact-analysis.service';
import { ImpactAnalysisController } from './impact-analysis.controller';
import { TraceabilityModule } from '../traceability/traceability.module';
import { DatabaseModule } from '../database/database.module';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [DatabaseModule, TraceabilityModule, IdentityModule],
  controllers: [ImpactAnalysisController],
  providers: [ImpactAnalysisService],
})
export class ImpactAnalysisModule {}
