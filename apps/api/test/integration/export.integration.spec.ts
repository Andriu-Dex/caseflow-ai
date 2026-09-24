import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { firstDeliverableExportSchema } from '@caseflow-ai/contracts';
import { renderExportHtml } from '../../src/export/export-html';
import { createTestContext, createWorkspace, type TestContext } from './support/test-app';

async function approveSource(ctx: TestContext, projectId: string, title = 'Notas') {
  const source = await ctx.sources.create(
    projectId,
    { title, sourceKind: 'NOTES', purpose: 'Conocimiento del proyecto' },
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
      `attachment; filename="first-deliverable-${projectId}.json"`,
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
      `attachment; filename="first-deliverable-${projectId}.html"`,
    );
  });
});
