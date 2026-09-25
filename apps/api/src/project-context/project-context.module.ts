import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module';
import { ProjectContextController } from './project-context.controller';
import { ProjectContextService } from './project-context.service';

@Module({
  imports: [AIModule],
  controllers: [ProjectContextController],
  providers: [ProjectContextService],
  exports: [ProjectContextService],
})
export class ProjectContextModule {}
