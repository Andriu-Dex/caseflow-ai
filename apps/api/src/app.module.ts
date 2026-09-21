import { Module } from '@nestjs/common';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { ProjectsModule } from './projects/projects.module';

@Module({
  imports: [DatabaseModule.forRoot(), HealthModule, ProjectsModule, ArtifactsModule],
})
export class AppModule {}
