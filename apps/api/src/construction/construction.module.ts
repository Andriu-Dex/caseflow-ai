import { Module } from '@nestjs/common';
import {
  DependencyProposalsController,
  TargetTemplatesController,
} from './construction-foundation.controller';
import { DependencyCatalogService } from './dependency-catalog.service';
import { DependencyProposalsService } from './dependency-proposals.service';

@Module({
  controllers: [TargetTemplatesController, DependencyProposalsController],
  providers: [DependencyCatalogService, DependencyProposalsService],
  exports: [DependencyCatalogService, DependencyProposalsService],
})
export class ConstructionModule {}
