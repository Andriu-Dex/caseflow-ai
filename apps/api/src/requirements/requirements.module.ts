import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module';
import { RequirementsController } from './requirements.controller';
import { RequirementsService } from './requirements.service';
@Module({
  imports: [AIModule],
  controllers: [RequirementsController],
  providers: [RequirementsService],
  exports: [RequirementsService],
})
export class RequirementsModule {}
