import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { createStorageProvider } from '../common/infrastructure';
import { STORAGE_PROVIDER } from '../sources/storage-provider.token';

@Module({
  controllers: [ProjectsController],
  // Deleting a project also deletes its stored files (DEC-134).
  providers: [ProjectsService, { provide: STORAGE_PROVIDER, useFactory: createStorageProvider }],
  exports: [ProjectsService],
})
export class ProjectsModule {}
