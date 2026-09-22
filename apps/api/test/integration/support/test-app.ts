import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import { ArtifactsModule } from '../../../src/artifacts/artifacts.module';
import { ArtifactsService } from '../../../src/artifacts/artifacts.service';
import { DatabaseModule } from '../../../src/database/database.module';
import { PrismaService } from '../../../src/database/prisma.service';
import { ProjectsModule } from '../../../src/projects/projects.module';
import { ProjectsService } from '../../../src/projects/projects.service';
import { ProjectContextModule } from '../../../src/project-context/project-context.module';
import { ProjectContextService } from '../../../src/project-context/project-context.service';
import { RequirementsModule } from '../../../src/requirements/requirements.module';
import { RequirementsService } from '../../../src/requirements/requirements.service';
import { UseCasesModule } from '../../../src/use-cases/use-cases.module';
import { UseCasesService } from '../../../src/use-cases/use-cases.service';
import { DataModelsModule } from '../../../src/data-models/data-models.module';
import { DataModelsService } from '../../../src/data-models/data-models.service';
import { getTestConnectionString, resetTestData } from './test-database';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  projects: ProjectsService;
  artifacts: ArtifactsService;
  projectContext: ProjectContextService;
  requirements: RequirementsService;
  useCases: UseCasesService;
  dataModels: DataModelsService;
  // Raw connection for asserting database-level rules, bypassing the services.
  sql: Client;
  close: () => Promise<void>;
}

// Boots the real Nest modules against the isolated test database.
export async function createTestContext(): Promise<TestContext> {
  const connectionString = getTestConnectionString();

  const sql = new Client({ connectionString });
  await sql.connect();
  await resetTestData(sql);

  const moduleRef = await Test.createTestingModule({
    imports: [
      DatabaseModule.forRoot({ connectionString }),
      ProjectsModule,
      ArtifactsModule,
      ProjectContextModule,
      RequirementsModule,
      UseCasesModule,
      DataModelsModule,
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();

  return {
    app,
    prisma: app.get(PrismaService),
    projects: app.get(ProjectsService),
    artifacts: app.get(ArtifactsService),
    projectContext: app.get(ProjectContextService),
    requirements: app.get(RequirementsService),
    useCases: app.get(UseCasesService),
    dataModels: app.get(DataModelsService),
    sql,
    close: async () => {
      await app.close();
      await sql.end();
    },
  };
}

let workspaceCounter = 0;

export async function createWorkspace(prisma: PrismaService, name = 'Test Workspace') {
  workspaceCounter += 1;
  return prisma.workspace.create({ data: { slug: `test-workspace-${workspaceCounter}`, name } });
}
