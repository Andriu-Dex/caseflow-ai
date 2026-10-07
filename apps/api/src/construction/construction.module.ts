import { Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { createJobQueue, createStorageProvider, type JobQueue } from '../common/infrastructure';
import { CONSTRUCTION_QUEUE, type ConstructionJobPayload } from '@caseflow-ai/domain';
import {
  DockerSandboxExecutionProvider,
  type SandboxExecutionProvider,
} from '@caseflow-ai/integrations';
import { AIModule } from '../ai/ai.module';
import { STORAGE_PROVIDER } from '../sources/storage-provider.token';
import { AutoRepairService } from './auto-repair.service';
import { BusinessLogicService } from './business-logic.service';
import {
  DependencyProposalsController,
  TargetTemplatesController,
} from './construction-foundation.controller';
import { CONSTRUCTION_QUEUE_TOKEN } from './construction-queue.token';
import { DependencyCatalogService } from './dependency-catalog.service';
import { DependencyProposalsService } from './dependency-proposals.service';
import { DesignBaselinesController } from './design-baselines.controller';
import { DesignBaselinesService } from './design-baselines.service';
import { GeneratedProjectSnapshotsService } from './generated-project-snapshots.service';
import {
  GeneratedProjectSnapshotsController,
  GenerationRunsController,
  InternalConstructionJobsController,
} from './generation-runs.controller';
import { GenerationRunsService } from './generation-runs.service';
import { SandboxRunsService } from './sandbox-runs.service';
import { SANDBOX_EXECUTION_PROVIDER } from './sandbox-provider.token';
import { WorkflowRunsController } from './workflow-runs.controller';
import { SandboxStatusController } from './sandbox-status.controller';
import { WorkflowRunsService } from './workflow-runs.service';
import { SourcesModule } from '../sources/sources.module';
import { ProjectContextModule } from '../project-context/project-context.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { UseCasesModule } from '../use-cases/use-cases.module';
import { DataModelsModule } from '../data-models/data-models.module';
import { StructuredAnalysisModule } from '../structured-analysis/structured-analysis.module';
import { MockupsModule } from '../mockups/mockups.module';

import { ConsistencyEngineModule } from '../consistency-engine/consistency-engine.module';

@Module({
  imports: [
    AIModule,
    // The route orchestrator drives the existing stage services (DEC-116).
    SourcesModule,
    ProjectContextModule,
    RequirementsModule,
    UseCasesModule,
    DataModelsModule,
    StructuredAnalysisModule,
    MockupsModule,
    ConsistencyEngineModule,
  ],
  controllers: [
    TargetTemplatesController,
    DependencyProposalsController,
    DesignBaselinesController,
    GenerationRunsController,
    GeneratedProjectSnapshotsController,
    InternalConstructionJobsController,
    WorkflowRunsController,
    SandboxStatusController,
  ],
  providers: [
    DependencyCatalogService,
    DependencyProposalsService,
    DesignBaselinesService,
    BusinessLogicService,
    GenerationRunsService,
    AutoRepairService,
    SandboxRunsService,
    GeneratedProjectSnapshotsService,
    WorkflowRunsService,
    {
      // Generated code only ever runs in disposable Docker containers (DEC-101).
      provide: SANDBOX_EXECUTION_PROVIDER,
      useFactory: (): SandboxExecutionProvider => new DockerSandboxExecutionProvider(),
    },
    {
      provide: STORAGE_PROVIDER,
      useFactory: createStorageProvider,
    },
    {
      provide: CONSTRUCTION_QUEUE_TOKEN,
      useFactory: () =>
        createJobQueue<ConstructionJobPayload>(
          CONSTRUCTION_QUEUE,
          (job) => `/projects/${job.projectId}/construction-jobs/${job.type}/${job.runId}/run`,
        ),
    },
  ],
  exports: [
    DependencyCatalogService,
    DependencyProposalsService,
    DesignBaselinesService,
    GenerationRunsService,
  ],
})
export class ConstructionModule implements OnModuleDestroy {
  constructor(@Inject(CONSTRUCTION_QUEUE_TOKEN) private readonly queue: JobQueue<unknown>) {}
  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
