import { Module } from '@nestjs/common';
import { ProjectContextController } from './project-context.controller';
import { ProjectContextService } from './project-context.service';

@Module({
  controllers: [ProjectContextController],
  providers: [ProjectContextService],
  exports: [ProjectContextService],
})
export class ProjectContextModule {}
