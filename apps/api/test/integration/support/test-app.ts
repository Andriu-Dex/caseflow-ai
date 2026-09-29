import { IdentityModule } from '../../../src/identity/identity.module';
import { JwtAuthGuard } from '../../../src/identity/jwt-auth.guard';
import { JwtService } from '@nestjs/jwt';
import {
  UnauthorizedException,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FakeDiagramProvider, FakeStorageProvider } from '@caseflow-ai/integrations';
import { Client } from 'pg';
import { randomUUID } from 'crypto';
import cookieParser from 'cookie-parser';
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
import { ReadinessModule } from '../../../src/readiness/readiness.module';
import { ReadinessService } from '../../../src/readiness/readiness.service';
import { ExportModule } from '../../../src/export/export.module';
import { ExportService } from '../../../src/export/export.service';
import { WorkspacesModule } from '../../../src/workspaces/workspaces.module';
import { ImpactAnalysisModule } from '../../../src/impact-analysis/impact-analysis.module';
import { ConsistencyEngineModule } from '../../../src/consistency-engine/consistency-engine.module';
import { BaselinesModule } from '../../../src/baselines/baselines.module';
import { getTestConnectionString, resetTestData } from './test-database';
import type { CreateProjectRequest, ProjectResponse } from '@caseflow-ai/contracts';

// A minimal, always-valid graphical SVG: ordinary integration tests (Postgres
// only) must not depend on a live renderer (AGENTS.md §23/47). Real
// Mermaid/PlantUML-via-Kroki compatibility is verified separately in
// diagram-rendering.integration.spec.ts against a live local Kroki.
const FAKE_DIAGRAM_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><g><circle cx="1" cy="1" r="1"></circle></g></svg>';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  projects: Omit<ProjectsService, 'create' | 'list'> & {
    create(input: CreateProjectRequest): Promise<ProjectResponse>;
    list(workspaceId: string, limit: number, offset: number): ReturnType<ProjectsService['list']>;
  };
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
  readiness: ReadinessService;
  export: ExportService;
  // Raw connection for asserting database-level rules, bypassing the services.
  sql: Client;
  token: string;
  userId: string;
  jwtService: JwtService;
  close: () => Promise<void>;
}

// Boots the real Nest modules against the isolated test database.
export async function createTestContext(): Promise<TestContext> {
  const connectionString = getTestConnectionString();

  const sql = new Client({ connectionString });
  await sql.connect();
  await resetTestData(sql);

  const authState: {
    jwtService?: JwtService;
    prisma?: PrismaService;
    defaultUserId?: string;
  } = {};
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
      ReadinessModule,
      IdentityModule,
      ExportModule,
      WorkspacesModule,
      ImpactAnalysisModule,
      ConsistencyEngineModule,
      BaselinesModule,
    ],
  })
    .overrideProvider(DIAGRAM_PROVIDER)
    .useValue(new FakeDiagramProvider({ svg: FAKE_DIAGRAM_SVG }))
    .overrideProvider(STORAGE_PROVIDER)
    .useValue(new FakeStorageProvider())
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate: async (context: ExecutionContext) => {
        const request = context.switchToHttp().getRequest();
        const authorization = request.headers.authorization as string | undefined;
        let userId = authState.defaultUserId;
        if (authorization?.startsWith('Bearer ')) {
          try {
            const payload = await authState.jwtService!.verifyAsync<{ sub: string }>(
              authorization.slice('Bearer '.length),
            );
            userId = payload.sub;
          } catch {
            throw new UnauthorizedException();
          }
        }
        const user = userId
          ? await authState.prisma!.user.findUnique({ where: { id: userId } })
          : null;
        if (!user || user.archivedAt) throw new UnauthorizedException();
        request.user = user;
        return true;
      },
    })
    .compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  await app.init();
  const jwtService = app.get(JwtService);
  const prisma = app.get(PrismaService);
  authState.jwtService = jwtService;
  authState.prisma = prisma;
  const user = await prisma.user.create({
    data: {
      email: `test-${randomUUID()}@example.com`,
      passwordHash: 'dummy',
      displayName: 'Test User',
    },
  });
  const token = jwtService.sign({ sub: user.id });
  authState.defaultUserId = user.id;

  return {
    app,
    prisma: app.get(PrismaService),
    projects: new Proxy(app.get(ProjectsService), {
      get(target, property, receiver) {
        if (property === 'create') {
          return async (input: CreateProjectRequest): Promise<ProjectResponse> => {
            const workspace = await prisma.workspace.findUnique({
              where: { id: input.workspaceId },
              select: { id: true },
            });
            if (!workspace) {
              const create = Reflect.get(target, 'create') as ProjectsService['create'];
              return create.call(target, input, user.id);
            }
            await prisma.workspaceMembership.upsert({
              where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: user.id } },
              create: { workspaceId: input.workspaceId, userId: user.id, role: 'OWNER' },
              update: {},
            });
            const create = Reflect.get(target, 'create') as (
              request: CreateProjectRequest,
              ownerId: string,
            ) => Promise<ProjectResponse>;
            return create.call(target, input, user.id);
          };
        }
        if (property === 'list') {
          return (workspaceId: string, limit: number, offset: number) =>
            (Reflect.get(target, 'list') as ProjectsService['list']).call(
              target,
              workspaceId,
              limit,
              offset,
              user.id,
            );
        }
        return Reflect.get(target, property, receiver);
      },
    }),
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
    readiness: app.get(ReadinessService),
    export: app.get(ExportService),
    sql,
    token,
    userId: user.id,
    jwtService,
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

export async function createUnauthorizedUser(
  ctx: TestContext,
): Promise<{ id: string; token: string }> {
  const user = await ctx.prisma.user.create({
    data: {
      email: `intruder-${randomUUID()}@example.com`,
      passwordHash: 'dummy',
      displayName: 'Intruder',
    },
  });
  return { id: user.id, token: ctx.jwtService.sign({ sub: user.id }) };
}

export async function createWorkspaceWithOwner(ctx: TestContext, name = 'Test Workspace') {
  const workspace = await createWorkspace(ctx.prisma, name);
  await ctx.prisma.workspaceMembership.create({
    data: { workspaceId: workspace.id, userId: ctx.userId, role: 'OWNER' },
  });
  return workspace;
}

export async function createProjectWithOwner(
  ctx: TestContext,
  workspaceId: string,
  name = 'Test Project',
) {
  const project = await ctx.projects.create({ workspaceId, name });
  return project;
}
