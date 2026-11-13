import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { createStorageProvider } from '../common/infrastructure';
import { STORAGE_PROVIDER } from '../sources/storage-provider.token';
import { DEPLOYMENT_PROVIDER, DockerTunnelDeploymentProvider } from '@caseflow-ai/integrations';

@Module({
  controllers: [ProjectsController],
  // Deleting a project also deletes its stored files (DEC-134).
  providers: [
    ProjectsService,
    { provide: STORAGE_PROVIDER, useFactory: createStorageProvider },
    { provide: DEPLOYMENT_PROVIDER, useFactory: () => new DockerTunnelDeploymentProvider() },
  ],
  exports: [ProjectsService],
})
export class ProjectsModule {}
