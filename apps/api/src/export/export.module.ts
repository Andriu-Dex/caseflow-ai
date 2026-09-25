import { Module } from '@nestjs/common';
import { DataModelsModule } from '../data-models/data-models.module';
import { FirstDeliverableModule } from '../first-deliverable/first-deliverable.module';
import { MockupsModule } from '../mockups/mockups.module';
import { ProjectContextModule } from '../project-context/project-context.module';
import { ReadinessModule } from '../readiness/readiness.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { SourcesModule } from '../sources/sources.module';
import { StalenessModule } from '../staleness/staleness.module';
import { StructuredAnalysisModule } from '../structured-analysis/structured-analysis.module';
import { TraceabilityModule } from '../traceability/traceability.module';
import { UseCasesModule } from '../use-cases/use-cases.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  imports: [
    SourcesModule,
    ProjectContextModule,
    RequirementsModule,
    UseCasesModule,
    DataModelsModule,
    StructuredAnalysisModule,
    MockupsModule,
    ReadinessModule,
    StalenessModule,
    TraceabilityModule,
    FirstDeliverableModule,
  ],
  controllers: [ExportController],
  providers: [ExportService],
  exports: [ExportService],
})
export class ExportModule {}
