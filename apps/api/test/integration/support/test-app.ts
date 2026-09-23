import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FakeDiagramProvider, FakeStorageProvider } from '@caseflow-ai/integrations';
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
import { DIAGRAM_PROVIDER } from '../../../src/data-models/diagram-provider.token';
import { SourcesModule } from '../../../src/sources/sources.module';
import { SourcesService } from '../../../src/sources/sources.service';
import { STORAGE_PROVIDER } from '../../../src/sources/storage-provider.token';
import { StructuredAnalysisModule } from '../../../src/structured-analysis/structured-analysis.module';
import { StructuredAnalysisService } from '../../../src/structured-analysis/structured-analysis.service';
import { MockupsModule } from '../../../src/mockups/mockups.module';
import { MockupsService } from '../../../src/mockups/mockups.service';
import { StalenessModule } from '../../../src/staleness/staleness.module';
import { StalenessService } from '../../../src/staleness/staleness.service';
import { TraceabilityModule } from '../../../src/traceability/traceability.module';
import { TraceabilityService } from '../../../src/traceability/traceability.service';
import { getTestConnectionString, resetTestData } from './test-database';

// A minimal, always-valid graphical SVG: ordinary integration tests (Postgres
// only) must not depend on a live renderer (AGENTS.md §23/47). Real
// Mermaid/PlantUML-via-Kroki compatibility is verified separately in
// diagram-rendering.integration.spec.ts against a live local Kroki.
const FAKE_DIAGRAM_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><g><circle cx="1" cy="1" r="1"></circle></g></svg>';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  projects: ProjectsService;
  artifacts: ArtifactsService;
  projectContext: ProjectContextService;
  requirements: RequirementsService;
  useCases: UseCasesService;
  dataModels: DataModelsService;
  sources: SourcesService;
  structuredAnalysis: StructuredAnalysisService;
  mockups: MockupsService;
  staleness: StalenessService;
  traceability: TraceabilityService;
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
      SourcesModule,
      StructuredAnalysisModule,
      MockupsModule,
      StalenessModule,
      TraceabilityModule,
    ],
  })
    .overrideProvider(DIAGRAM_PROVIDER)
    .useValue(new FakeDiagramProvider({ svg: FAKE_DIAGRAM_SVG }))
    .overrideProvider(STORAGE_PROVIDER)
    .useValue(new FakeStorageProvider())
    .compile();
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
    sources: app.get(SourcesService),
    structuredAnalysis: app.get(StructuredAnalysisService),
    mockups: app.get(MockupsService),
    staleness: app.get(StalenessService),
    traceability: app.get(TraceabilityService),
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
