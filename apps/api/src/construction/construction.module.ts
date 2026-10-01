import { Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { CONSTRUCTION_QUEUE, type ConstructionJobPayload } from '@caseflow-ai/domain';
import { AIModule } from '../ai/ai.module';
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
import {
  GenerationRunsController,
  InternalConstructionJobsController,
} from './generation-runs.controller';
import { GenerationRunsService } from './generation-runs.service';

@Module({
  imports: [AIModule],
  controllers: [
    TargetTemplatesController,
    DependencyProposalsController,
    DesignBaselinesController,
    GenerationRunsController,
    InternalConstructionJobsController,
  ],
  providers: [
    DependencyCatalogService,
    DependencyProposalsService,
    DesignBaselinesService,
    BusinessLogicService,
    GenerationRunsService,
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
