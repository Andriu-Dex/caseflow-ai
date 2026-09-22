import { Module } from '@nestjs/common';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { ProjectsModule } from './projects/projects.module';
import { ProjectContextModule } from './project-context/project-context.module';
import { AIModule } from './ai/ai.module';
import { RequirementsModule } from './requirements/requirements.module';

@Module({
  imports: [
    DatabaseModule.forRoot(),
    AIModule,
    HealthModule,
    ProjectsModule,
    ArtifactsModule,
    ProjectContextModule,
    RequirementsModule,
  ],
})
export class AppModule {}
