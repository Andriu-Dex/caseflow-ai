import { Module } from '@nestjs/common';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { ProjectsModule } from './projects/projects.module';
import { ProjectContextModule } from './project-context/project-context.module';

@Module({
  imports: [
    DatabaseModule.forRoot(),
    HealthModule,
    ProjectsModule,
    ArtifactsModule,
    ProjectContextModule,
  ],
})
export class AppModule {}
