import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AIOrchestrator, FakeAIProvider, PromptRegistry } from '@caseflow-ai/ai';
import { FakeDiagramProvider } from '@caseflow-ai/integrations';
import { firstDeliverableExportSchema } from '@caseflow-ai/contracts';
import { PrismaAIRunRecorder } from '../../src/ai/ai-run-recorder';
import { DataModelsService } from '../../src/data-models/data-models.service';
import { DiagramEngine } from '../../src/data-models/diagram-engine';
import { renderExportHtml } from '../../src/export/export-html';
import { StructuredAnalysisService } from '../../src/structured-analysis/structured-analysis.service';
import { UseCasesService } from '../../src/use-cases/use-cases.service';
import { createTestContext, createWorkspace, type TestContext } from './support/test-app';

const FAKE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><g></g></svg>';

function fakeAi(ctx: TestContext, promptKey: string, promptVersion: number, payload: unknown) {
  const provider = new FakeAIProvider({
    provider: 'fake',
    model: 'fake-v1',
    payload,
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    latencyMs: 5,
  });
  return new AIOrchestrator(
    provider,
    new PromptRegistry([
      {
        key: promptKey,
        version: promptVersion,
        capability: 'STRUCTURED_OUTPUT',
        purpose: promptKey,
        systemInstructions: 'policy',
      },
    ]),
    new PrismaAIRunRecorder(ctx.prisma),
  );
}

async function approveSource(ctx: TestContext, projectId: string, title = 'Notas') {
  const source = await ctx.sources.create(
    projectId,
    {
      title,
      sourceKind: 'NOTES',
      purpose: 'Conocimiento del proyecto',
      description: 'Contenido de prueba.',
    },
    { originalname: 'n.txt', mimetype: 'text/plain', size: 4, buffer: Buffer.from('abcd') },
  );
  await ctx.sources.transition(projectId, source.id, source.version.id, 'IN_REVIEW');
  return ctx.sources.transition(projectId, source.id, source.version.id, 'APPROVED');
}

async function approveContext(ctx: TestContext, projectId: string, sourceVersionIds: string[]) {
  const context = await ctx.projectContext.create(projectId, {
    problemStatement: 'p',
    objective: 'o',
    scopeItems: [],
    actors: [{ name: 'Usuario' }],
    needs: [],
    constraints: [],
    businessRules: [],
    sourceVersionIds,
  });
  await ctx.projectContext.transition(projectId, context.version.id, 'IN_REVIEW');
  return ctx.projectContext.transition(projectId, context.version.id, 'APPROVED');
}

describe('Export (First Deliverable, Phase H)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('produces a coherent export for an empty project', async () => {
    const workspace = await createWorkspace(ctx.prisma, 'Export Empty');
    const projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Vacío' })).id;

    const snapshot = await ctx.export.buildSnapshot(projectId);
    expect(snapshot.sources).toEqual([]);
    expect(snapshot.context).toBeNull();
    expect(snapshot.requirements).toEqual([]);
    expect(snapshot.dataModel).toBeNull();
    expect(snapshot.readiness.ready).toBe(false);
  });

  it("never leaks another project's sources into this project's export (isolation)", async () => {
    const workspace = await createWorkspace(ctx.prisma, 'Export Isolation');
    const projectA = (await ctx.projects.create({ workspaceId: workspace.id, name: 'A' })).id;
    const projectB = (await ctx.projects.create({ workspaceId: workspace.id, name: 'B' })).id;

    await approveSource(ctx, projectA, 'Fuente de A');
    const exportB = await ctx.export.buildSnapshot(projectB);
    expect(exportB.sources).toEqual([]);
  });

  it('excludes a newer DRAFT context version and keeps the previously APPROVED one authoritative', async () => {
    const workspace = await createWorkspace(ctx.prisma, 'Export Draft Not Displacing');
    const projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;
    const source = await approveSource(ctx, projectId);
    const context = await approveContext(ctx, projectId, [source.id]);
    // A newer DRAFT version must not displace the APPROVED one in the export.
    await ctx.projectContext.createVersion(projectId, {
      problemStatement: 'draft más nuevo',
      objective: 'o',
      scopeItems: [],
      actors: [{ name: 'Usuario' }],
      needs: [],
      constraints: [],
      businessRules: [],
      sourceVersionIds: [source.id],
    });

    const snapshot = await ctx.export.buildSnapshot(projectId);
    expect(snapshot.context?.version.versionNumber).toBe(context.versionNumber);
    expect(snapshot.context?.problemStatement).toBe('p');
  });

  it('contains no binary source bodies in the JSON export', async () => {
    const workspace = await createWorkspace(ctx.prisma, 'Export No Binary');
    const projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;
    await approveSource(ctx, projectId);

    const snapshot = await ctx.export.buildSnapshot(projectId);
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toMatch(/storageKey/i);
    expect(serialized).not.toMatch(/AAAAAAAAAAAA/); // no base64-looking blob leaked in
  });

  it('includes readiness, staleness and a traceability summary in every export (Phase H closure)', async () => {
    const workspace = await createWorkspace(ctx.prisma, 'Export Closure Summaries');
    const projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;

    const snapshot = await ctx.export.buildSnapshot(projectId);
    expect(snapshot.readiness).toMatchObject({ projectId, ready: false });
    expect(snapshot.readiness.stages).toHaveLength(13);
    expect(snapshot.stalenessSummary).toMatchObject({ projectId, entries: [] });
    expect(snapshot.traceabilitySummary).toEqual({ nodeCount: 0, edgeCount: 0, truncated: false });
  });

  it('binds the ER diagram to the exact selected authoritative Data Model version, and uses the shared snapshot policy across multiple APPROVED Data Models (Phase H closure)', async () => {
    const workspace = await createWorkspace(ctx.prisma, 'Export Data Model Closure');
    const projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;

    const modelInput = {
      title: 'Modelo A',
      modelKind: 'ER' as const,
      entities: [
        {
          localId: 'e1',
          name: 'Pedido',
          attributes: [
            { name: 'id', type: 'UUID' as const, required: true, primaryKey: true, unique: true },
          ],
        },
      ],
      relationships: [],
    };
    const older = await ctx.dataModels.create(projectId, modelInput);
    await ctx.dataModels.transition(projectId, older.id, older.version.id, 'IN_REVIEW');
    await ctx.dataModels.transition(projectId, older.id, older.version.id, 'APPROVED');

    const newer = await ctx.dataModels.create(projectId, { ...modelInput, title: 'Modelo B' });
    await ctx.dataModels.transition(projectId, newer.id, newer.version.id, 'IN_REVIEW');
    await ctx.dataModels.transition(projectId, newer.id, newer.version.id, 'APPROVED');

    const snapshot = await ctx.export.buildSnapshot(projectId);
    // The most recently approved Data Model wins (shared authoritative
    // selection policy — the same one Readiness uses), never the
    // lexicographically-first one.
    expect(snapshot.dataModel?.code).toBe(newer.code);
    expect(snapshot.erDiagram?.versionId).toBe(newer.version.id);
  });

  it('binds the Mockup to the exact selected authoritative UI Blueprint version (Phase H closure)', async () => {
    const workspace = await createWorkspace(ctx.prisma, 'Export Mockup Closure');
    const projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;

    const blueprint = await ctx.structuredAnalysis.create(projectId, 'UI_BLUEPRINT', 'Blueprint', {
      screens: [
        {
          localId: 's1',
          name: 'Pantalla',
          purpose: 'Crear pedido',
          targetActors: [],
          relatedUseCaseCodes: [],
          sections: [],
          primaryActions: [],
          secondaryActions: [],
          principalData: [],
          forms: [],
          states: [],
        },
      ],
    });
    await ctx.structuredAnalysis.transition(
      projectId,
      'UI_BLUEPRINT',
      blueprint.id,
      blueprint.version.id,
      'IN_REVIEW',
    );
    await ctx.structuredAnalysis.transition(
      projectId,
      'UI_BLUEPRINT',
      blueprint.id,
      blueprint.version.id,
      'APPROVED',
    );

    const mockup = await ctx.mockups.create(projectId, blueprint.version.id);
    await ctx.mockups.transition(projectId, mockup.id, mockup.version.id, 'IN_REVIEW');
    await ctx.mockups.transition(projectId, mockup.id, mockup.version.id, 'APPROVED');

    const snapshot = await ctx.export.buildSnapshot(projectId);
    expect(snapshot.uiBlueprint?.code).toBe(blueprint.code);
    expect(snapshot.mockups).toHaveLength(1);
    expect(snapshot.mockups[0]?.uiBlueprintVersionId).toBe(blueprint.version.id);
  });

  it('binds the Navigation/Software Architecture/System Architecture diagrams to their exact selected authoritative versions (Phase H closure)', async () => {
    const workspace = await createWorkspace(ctx.prisma, 'Export Structured Diagram Closure');
    const projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;

    async function approveStructured(
      kind: 'NAVIGATION_TREE' | 'SOFTWARE_ARCHITECTURE' | 'SYSTEM_ARCHITECTURE',
      title: string,
      content: Record<string, unknown>,
    ) {
      const artifact = await ctx.structuredAnalysis.create(projectId, kind, title, content);
      await ctx.structuredAnalysis.transition(
        projectId,
        kind,
        artifact.id,
        artifact.version.id,
        'IN_REVIEW',
      );
      await ctx.structuredAnalysis.transition(
        projectId,
        kind,
        artifact.id,
        artifact.version.id,
        'APPROVED',
      );
      return artifact;
    }

    const navigation = await approveStructured('NAVIGATION_TREE', 'Navegación', {
      nodes: [{ localId: 'n1', label: 'Inicio', viewName: 'Home', kind: 'HOME' }],
    });
    const software = await approveStructured('SOFTWARE_ARCHITECTURE', 'Arquitectura SW', {
      style: 'Monolito modular',
      components: [{ localId: 'c1', name: 'API', responsibilities: [] }],
      dependencies: [],
      decisions: [],
    });
    const system = await approveStructured('SYSTEM_ARCHITECTURE', 'Arquitectura Sistema', {
      boundary: 'Sistema de pedidos',
      nodes: [{ localId: 'n1', name: 'API Gateway', kind: 'RUNTIME', responsibilities: [] }],
      links: [],
    });

    const snapshot = await ctx.export.buildSnapshot(projectId);
    expect(snapshot.navigation?.code).toBe(navigation.code);
    expect(snapshot.navigationDiagram?.versionId).toBe(navigation.version.id);
    expect(snapshot.softwareArchitecture?.code).toBe(software.code);
    expect(snapshot.softwareArchitectureDiagram?.versionId).toBe(software.version.id);
    expect(snapshot.systemArchitecture?.code).toBe(system.code);
    expect(snapshot.systemArchitectureDiagram?.versionId).toBe(system.version.id);
  });

  it('escapes a malicious project name in the HTML export instead of injecting it raw', async () => {
    const workspace = await createWorkspace(ctx.prisma, 'Export XSS');
    const maliciousName = '<script>alert(1)</script>';
    const projectId = (
      await ctx.projects.create({ workspaceId: workspace.id, name: maliciousName })
    ).id;

    const snapshot = firstDeliverableExportSchema.parse(await ctx.export.buildSnapshot(projectId));
    const html = renderExportHtml(snapshot);
    expect(html).not.toContain(maliciousName);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('responds with the correct Content-Type and a safe deterministic Content-Disposition for JSON (Phase H closure)', async () => {
    const workspace = await createWorkspace(ctx.prisma, 'Export Headers JSON');
    const projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;

    const response = await request(ctx.app.getHttpServer())
      .get(`/projects/${projectId}/export?format=json`)
      .expect(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="proyecto-${projectId}.json"`,
    );
  });

  it('responds with the correct Content-Type and a safe deterministic Content-Disposition for HTML (Phase H closure)', async () => {
    const workspace = await createWorkspace(ctx.prisma, 'Export Headers HTML');
    const maliciousName = '"; attachment; filename=evil.sh #';
    const projectId = (
      await ctx.projects.create({ workspaceId: workspace.id, name: maliciousName })
    ).id;

    const response = await request(ctx.app.getHttpServer())
      .get(`/projects/${projectId}/export?format=html`)
      .expect(200);
    expect(response.headers['content-type']).toMatch(/text\/html/);
    // The filename never derives from the project's own (untrusted) name —
    // only from the projectId — so a malicious project name cannot inject
    // extra Content-Disposition directives or path segments.
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="proyecto-${projectId}.html"`,
    );
  });

  it('composes every section together for a fully populated First Deliverable (composition completeness)', async () => {
    const workspace = await createWorkspace(ctx.prisma, 'Export Fully Populated');
    const projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;

    const source = await approveSource(ctx, projectId, 'Notas iniciales');
    const context = await approveContext(ctx, projectId, [source.id]);

    const requirementsService = new (
      await import('../../src/requirements/requirements.service')
    ).RequirementsService(
      ctx.prisma,
      fakeAi(ctx, 'requirements.generate', 2, {
        candidates: [
          {
            candidateId: 'rc1',
            requirementType: 'FUNCTIONAL' as const,
            name: 'Registrar pedido',
            description: 'El usuario registra pedidos',
            priority: 'HIGH' as const,
            actors: ['Usuario'],
            preconditions: [],
            postconditions: [],
            dependencyCandidateIds: [],
          },
        ],
      }),
    );
    const rfGeneration = await requirementsService.generate(projectId, context.id);
    const rfAccepted = (
      await requirementsService.accept(projectId, rfGeneration.id, [rfGeneration.candidates[0]!.id])
    ).items[0]!;
    await requirementsService.transition(
      projectId,
      rfAccepted.id,
      rfAccepted.version.id,
      'IN_REVIEW',
    );
    await requirementsService.transition(
      projectId,
      rfAccepted.id,
      rfAccepted.version.id,
      'APPROVED',
    );

    const useCasesService = new UseCasesService(
      ctx.prisma,
      fakeAi(ctx, 'use-cases.generate', 1, {
        candidates: [
          {
            candidateId: 'uc1',
            name: 'Registrar pedido',
            objective: 'Registrar',
            primaryActor: 'Usuario',
            secondaryActors: [],
            preconditions: [],
            postconditions: [],
            mainFlow: [{ actor: 'Usuario', action: 'Registra' }],
            alternativeFlows: [],
            relatedRequirementSourceIds: [rfAccepted.version.id],
          },
        ],
      }),
    );
    const ucGeneration = await useCasesService.generate(projectId, [rfAccepted.version.id]);
    const ucAccepted = (
      await useCasesService.accept(projectId, ucGeneration.id, [ucGeneration.candidates[0]!.id])
    ).items[0]!;
    await useCasesService.transition(projectId, ucAccepted.id, ucAccepted.version.id, 'IN_REVIEW');
    await useCasesService.transition(projectId, ucAccepted.id, ucAccepted.version.id, 'APPROVED');

    const dataModelsService = new DataModelsService(
      ctx.prisma,
      fakeAi(ctx, 'data-model.generate', 1, {
        candidates: [
          {
            candidateId: 'dm1',
            title: 'Modelo',
            modelKind: 'ER' as const,
            entities: [
              {
                localId: 'pedido',
                name: 'Pedido',
                attributes: [
                  {
                    name: 'id',
                    type: 'UUID' as const,
                    required: true,
                    primaryKey: true,
                    unique: true,
                  },
                ],
              },
            ],
            relationships: [],
          },
        ],
      }),
      new DiagramEngine(),
      new FakeDiagramProvider({ svg: FAKE_SVG }),
    );
    const dmGeneration = await dataModelsService.generate(
      projectId,
      [rfAccepted.version.id],
      [ucAccepted.version.id],
    );
    const dmAccepted = (
      await dataModelsService.accept(projectId, dmGeneration.id, [dmGeneration.candidates[0]!.id])
    ).items[0]!;
    await dataModelsService.transition(
      projectId,
      dmAccepted.id,
      dmAccepted.version.id,
      'IN_REVIEW',
    );
    await dataModelsService.transition(projectId, dmAccepted.id, dmAccepted.version.id, 'APPROVED');

    await dataModelsService.generateUseCaseDiagram(projectId, [ucAccepted.version.id]);

    const navigationService = new StructuredAnalysisService(
      ctx.prisma,
      fakeAi(ctx, 'navigation.generate', 1, {
        nodes: [{ localId: 'home', label: 'Home', viewName: 'Home', kind: 'HOME' as const }],
      }),
      new DiagramEngine(),
      new FakeDiagramProvider({ svg: FAKE_SVG }),
    );
    const navGeneration = await navigationService.generate(projectId, 'NAVIGATION_TREE', [
      rfAccepted.version.id,
    ]);
    const navAccepted = (
      await navigationService.accept(projectId, 'NAVIGATION_TREE', navGeneration.id, [
        navGeneration.candidates[0]!.id,
      ])
    ).items[0]!;
    await navigationService.transition(
      projectId,
      'NAVIGATION_TREE',
      navAccepted.id,
      navAccepted.version.id,
      'IN_REVIEW',
    );
    await navigationService.transition(
      projectId,
      'NAVIGATION_TREE',
      navAccepted.id,
      navAccepted.version.id,
      'APPROVED',
    );

    const softwareArchitectureService = new StructuredAnalysisService(
      ctx.prisma,
      fakeAi(ctx, 'software-architecture.generate', 1, {
        style: 'Monolito modular',
        components: [{ localId: 'api', name: 'API' }],
        dependencies: [],
      }),
      new DiagramEngine(),
      new FakeDiagramProvider({ svg: FAKE_SVG }),
    );
    const swGeneration = await softwareArchitectureService.generate(
      projectId,
      'SOFTWARE_ARCHITECTURE',
      [navAccepted.version.id],
    );
    const swAccepted = (
      await softwareArchitectureService.accept(
        projectId,
        'SOFTWARE_ARCHITECTURE',
        swGeneration.id,
        [swGeneration.candidates[0]!.id],
      )
    ).items[0]!;
    await softwareArchitectureService.transition(
      projectId,
      'SOFTWARE_ARCHITECTURE',
      swAccepted.id,
      swAccepted.version.id,
      'IN_REVIEW',
    );
    await softwareArchitectureService.transition(
      projectId,
      'SOFTWARE_ARCHITECTURE',
      swAccepted.id,
      swAccepted.version.id,
      'APPROVED',
    );

    const systemArchitectureService = new StructuredAnalysisService(
      ctx.prisma,
      fakeAi(ctx, 'system-architecture.generate', 1, {
        boundary: 'Sistema',
        nodes: [{ localId: 'server', name: 'Servidor', kind: 'RUNTIME' as const }],
        links: [],
      }),
      new DiagramEngine(),
      new FakeDiagramProvider({ svg: FAKE_SVG }),
    );
    const sysGeneration = await systemArchitectureService.generate(
      projectId,
      'SYSTEM_ARCHITECTURE',
      [navAccepted.version.id],
    );
    const sysAccepted = (
      await systemArchitectureService.accept(projectId, 'SYSTEM_ARCHITECTURE', sysGeneration.id, [
        sysGeneration.candidates[0]!.id,
      ])
    ).items[0]!;
    await systemArchitectureService.transition(
      projectId,
      'SYSTEM_ARCHITECTURE',
      sysAccepted.id,
      sysAccepted.version.id,
      'IN_REVIEW',
    );
    await systemArchitectureService.transition(
      projectId,
      'SYSTEM_ARCHITECTURE',
      sysAccepted.id,
      sysAccepted.version.id,
      'APPROVED',
    );

    const uiBlueprintService = new StructuredAnalysisService(
      ctx.prisma,
      fakeAi(ctx, 'ui-blueprint.generate', 1, {
        screens: [{ localId: 'home', name: 'Inicio', purpose: 'Ver panel' }],
      }),
      new DiagramEngine(),
      new FakeDiagramProvider({ svg: FAKE_SVG }),
    );
    const blueprintGeneration = await uiBlueprintService.generate(projectId, 'UI_BLUEPRINT', [
      navAccepted.version.id,
    ]);
    const blueprintAccepted = (
      await uiBlueprintService.accept(projectId, 'UI_BLUEPRINT', blueprintGeneration.id, [
        blueprintGeneration.candidates[0]!.id,
      ])
    ).items[0]!;
    await uiBlueprintService.transition(
      projectId,
      'UI_BLUEPRINT',
      blueprintAccepted.id,
      blueprintAccepted.version.id,
      'IN_REVIEW',
    );
    await uiBlueprintService.transition(
      projectId,
      'UI_BLUEPRINT',
      blueprintAccepted.id,
      blueprintAccepted.version.id,
      'APPROVED',
    );

    const mockup = await ctx.mockups.create(projectId, blueprintAccepted.version.id);
    await ctx.mockups.transition(projectId, mockup.id, mockup.version.id, 'IN_REVIEW');
    await ctx.mockups.transition(projectId, mockup.id, mockup.version.id, 'APPROVED');

    // --- Composition completeness: every section present together ---
    const snapshot = await ctx.export.buildSnapshot(projectId);

    expect(snapshot.sources).toHaveLength(1);
    expect(snapshot.context?.problemStatement).toBe('p');
    expect(snapshot.requirements).toHaveLength(1);
    expect(snapshot.useCases).toHaveLength(1);
    expect(snapshot.useCaseDiagram).not.toBeNull();
    expect(snapshot.dataModel?.code).toBe(dmAccepted.code);
    expect(snapshot.erDiagram).not.toBeNull();
    expect(snapshot.navigation?.code).toBe(navAccepted.code);
    expect(snapshot.navigationDiagram).not.toBeNull();
    expect(snapshot.softwareArchitecture?.code).toBe(swAccepted.code);
    expect(snapshot.softwareArchitectureDiagram).not.toBeNull();
    expect(snapshot.systemArchitecture?.code).toBe(sysAccepted.code);
    expect(snapshot.systemArchitectureDiagram).not.toBeNull();
    expect(snapshot.uiBlueprint?.code).toBe(blueprintAccepted.code);
    expect(snapshot.mockups).toHaveLength(1);

    expect(snapshot.readiness).toBeTruthy();
    expect(snapshot.readiness.stages).toHaveLength(13);
    expect(snapshot.stalenessSummary).toBeTruthy();
    expect(snapshot.traceabilitySummary.nodeCount).toBeGreaterThan(0);

    // The full export also validates against its own published schema.
    expect(() => firstDeliverableExportSchema.parse(snapshot)).not.toThrow();
  });
});
