import { Module } from '@nestjs/common';
import {
  DependencyProposalsController,
  TargetTemplatesController,
} from './construction-foundation.controller';
import { DependencyCatalogService } from './dependency-catalog.service';
import { DependencyProposalsService } from './dependency-proposals.service';
import { DesignBaselinesController } from './design-baselines.controller';
import { DesignBaselinesService } from './design-baselines.service';

@Module({
  controllers: [
    TargetTemplatesController,
    DependencyProposalsController,
    DesignBaselinesController,
  ],
  providers: [DependencyCatalogService, DependencyProposalsService, DesignBaselinesService],
  exports: [DependencyCatalogService, DependencyProposalsService, DesignBaselinesService],
})
export class ConstructionModule {}
