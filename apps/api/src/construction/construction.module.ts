import { Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { CONSTRUCTION_QUEUE, type ConstructionJobPayload } from '@caseflow-ai/domain';
import { loadStorageConfig } from '@caseflow-ai/config';
import {
  DisabledStorageProvider,
  DockerSandboxExecutionProvider,
  S3StorageProvider,
  type SandboxExecutionProvider,
  type StorageProvider,
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

@Module({
  imports: [AIModule],
  controllers: [
    TargetTemplatesController,
    DependencyProposalsController,
    DesignBaselinesController,
    GenerationRunsController,
    GeneratedProjectSnapshotsController,
    InternalConstructionJobsController,
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
    {
      // Generated code only ever runs in disposable Docker containers (DEC-101).
      provide: SANDBOX_EXECUTION_PROVIDER,
      useFactory: (): SandboxExecutionProvider => new DockerSandboxExecutionProvider(),
    },
    {
      provide: STORAGE_PROVIDER,
      useFactory: (): StorageProvider => {
        const config = loadStorageConfig(process.env);
        return config.configured ? new S3StorageProvider(config) : new DisabledStorageProvider();
      },
    },
    {
      provide: CONSTRUCTION_QUEUE_TOKEN,
      useFactory: (): Queue<ConstructionJobPayload> =>
        new Queue<ConstructionJobPayload>(CONSTRUCTION_QUEUE, {
          connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
        }),
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
  constructor(@Inject(CONSTRUCTION_QUEUE_TOKEN) private readonly queue: Queue) {}
  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
