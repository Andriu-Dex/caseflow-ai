import { Module } from '@nestjs/common';
import { DataModelsModule } from '../data-models/data-models.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { UseCasesModule } from '../use-cases/use-cases.module';
import { StartingPointsController } from './starting-points.controller';
import { StartingPointsService } from './starting-points.service';

@Module({
  imports: [RequirementsModule, UseCasesModule, DataModelsModule],
  controllers: [StartingPointsController],
  providers: [StartingPointsService],
})
export class StartingPointsModule {}
