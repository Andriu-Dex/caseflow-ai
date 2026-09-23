import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AIOrchestrator, FakeAIProvider, PromptRegistry } from '@caseflow-ai/ai';
import { FakeDiagramProvider } from '@caseflow-ai/integrations';
import { PrismaAIRunRecorder } from '../../src/ai/ai-run-recorder';
import { DiagramEngine } from '../../src/data-models/diagram-engine';
import { StructuredAnalysisService } from '../../src/structured-analysis/structured-analysis.service';
import { createTestContext, createWorkspace, type TestContext } from './support/test-app';

const FAKE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><g></g></svg>';

const navigation = {
  nodes: [
    { localId: 'home', label: 'Inicio', viewName: 'Home', kind: 'HOME' as const },
    {
      localId: 'orders',
      label: 'Pedidos',
      viewName: 'Orders',
      kind: 'LIST' as const,
      parentLocalId: 'home',
    },
  ],
};
const softwareArchitecture = {
  style: 'Modular monolith',
  components: [
    { localId: 'api', name: 'API' },
    { localId: 'web', name: 'Web' },
  ],
  dependencies: [{ fromLocalId: 'web', toLocalId: 'api' }],
};
const systemArchitecture = {
  boundary: 'Sistema CASEFlow',
  nodes: [
    { localId: 'server', name: 'Servidor', kind: 'RUNTIME' as const },
    { localId: 'db', name: 'Base de datos', kind: 'DATABASE' as const },
  ],
  links: [{ fromLocalId: 'server', toLocalId: 'db' }],
};
const uiBlueprint = {
  screens: [{ localId: 'home', name: 'Inicio', purpose: 'Ver el panel principal' }],
};
const requirement = {
  requirementType: 'FUNCTIONAL' as const,
  name: 'Registrar pedido',
  description: 'El usuario registra pedidos',
  priority: 'HIGH' as const,
  actors: ['Usuario'],
  preconditions: [],
  postconditions: [],
  dependencyArtifactIds: [],
};

function fakeAIOrchestrator(ctx: TestContext, promptKey: string, payload: unknown) {
  const provider = new FakeAIProvider({
    provider: 'fake',
    model: 'fake-v1',
    payload,
    usage: null,
    latencyMs: 1,
  });
  const ai = new AIOrchestrator(
    provider,
    new PromptRegistry([
      {
        key: promptKey,
        version: 1,
        capability: 'STRUCTURED_OUTPUT',
        purpose: promptKey,
        systemInstructions: 'policy',
      },
    ]),
    new PrismaAIRunRecorder(ctx.prisma),
  );
  return { provider, ai };
}

describe('Structured Analysis (Navigation/Architecture/UI Blueprint) integration', () => {
  let ctx: TestContext;
  let projectId: string;
  let approvedRequirementId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    const workspace = await createWorkspace(ctx.prisma, 'Structured Analysis');
    projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;
    const req = await ctx.requirements.create(projectId, requirement);
    await ctx.requirements.transition(projectId, req.id, req.version.id, 'IN_REVIEW');
    await ctx.requirements.transition(projectId, req.id, req.version.id, 'APPROVED');
    approvedRequirementId = req.version.id;
  });
  afterAll(async () => ctx.close());

  it('creates a manual Navigation Tree as DRAFT with a deterministic flowchart diagram', async () => {
    const created = await ctx.structuredAnalysis.create(
      projectId,
      'NAVIGATION_TREE',
      'Navegación',
      navigation,
    );
    expect(created).toMatchObject({
      code: 'NAV-001',
      kind: 'NAVIGATION_TREE',
      version: { origin: 'MANUAL', status: 'DRAFT' },
    });
    const diagram = await ctx.structuredAnalysis.getDiagram(
      projectId,
      'NAVIGATION_TREE',
      created.id,
    );
    expect(diagram).toMatchObject({ kind: 'NAVIGATION_TREE', sourceFormat: 'MERMAID_FLOWCHART' });
    expect(diagram.svg).toMatch(/^<svg/);

    const versioned = await ctx.structuredAnalysis.version(
      projectId,
      'NAVIGATION_TREE',
      created.id,
      'Navegación v2',
      navigation,
    );
    expect(versioned.version.versionNumber).toBe(2);
  });

  it('creates Software Architecture and System Architecture with their own diagrams', async () => {
    const architecture = await ctx.structuredAnalysis.create(
      projectId,
      'SOFTWARE_ARCHITECTURE',
      'Arquitectura de software',
      softwareArchitecture,
    );
    expect(architecture.code).toBe('ARQ-001');
    const softwareDiagram = await ctx.structuredAnalysis.getDiagram(
      projectId,
      'SOFTWARE_ARCHITECTURE',
      architecture.id,
    );
    expect(softwareDiagram.sourceFormat).toBe('PLANTUML_COMPONENT');

    const system = await ctx.structuredAnalysis.create(
      projectId,
      'SYSTEM_ARCHITECTURE',
      'Arquitectura de sistema',
      systemArchitecture,
    );
    // SOFTWARE_ARCHITECTURE (ARQ) and SYSTEM_ARCHITECTURE (SARQ) must not
    // share a code-prefix counter, or their codes would collide (fixed by the
    // additive 20260924000000_structured_analysis migration).
    expect(system.code).toBe('SARQ-001');
    const systemDiagram = await ctx.structuredAnalysis.getDiagram(
      projectId,
      'SYSTEM_ARCHITECTURE',
      system.id,
    );
    expect(systemDiagram.sourceFormat).toBe('PLANTUML_DEPLOYMENT');
  });

  it('creates a UI Blueprint with no diagram (no diagram config for that kind)', async () => {
    const blueprint = await ctx.structuredAnalysis.create(
      projectId,
      'UI_BLUEPRINT',
      'Pantallas',
      uiBlueprint,
    );
    expect(blueprint.code).toMatch(/^UI-/);
    await expect(
      ctx.structuredAnalysis.getDiagram(projectId, 'UI_BLUEPRINT', blueprint.id),
    ).rejects.toThrow('no tiene diagrama');
  });

  it('generates a candidate from exact APPROVED sources and accepts it with full provenance', async () => {
    const { provider, ai } = fakeAIOrchestrator(ctx, 'navigation.generate', navigation);
    const service = new StructuredAnalysisService(
      ctx.prisma,
      ai,
      new DiagramEngine(),
      new FakeDiagramProvider({ svg: FAKE_SVG }),
    );
    const generation = await service.generate(projectId, 'NAVIGATION_TREE', [
      approvedRequirementId,
    ]);
    expect(provider.lastRequest?.maxOutputTokens).toBe(4096);
    expect(generation.candidates).toHaveLength(1);
    expect(generation.candidates[0]?.content).toMatchObject(navigation);

    const accepted = await service.accept(projectId, 'NAVIGATION_TREE', generation.id, [
      generation.candidates[0]!.id,
    ]);
    expect(accepted.items[0]).toMatchObject({
      version: { origin: 'AI_GENERATED', status: 'GENERATED' },
      generationId: generation.id,
      aiRunId: generation.aiRunId,
    });
    // Never auto-approved: an accepted AI candidate still starts at GENERATED,
    // requiring an explicit human transition to APPROVED (spec §4.5/AGENTS.md §4.5).
    expect(accepted.items[0]!.version.status).not.toBe('APPROVED');
  });

  it('rejects draft and cross-project generation sources', async () => {
    const draft = await ctx.requirements.create(projectId, { ...requirement, name: 'Borrador' });
    const { ai } = fakeAIOrchestrator(ctx, 'navigation.generate', navigation);
    const service = new StructuredAnalysisService(
      ctx.prisma,
      ai,
      new DiagramEngine(),
      new FakeDiagramProvider({ svg: FAKE_SVG }),
    );
    await expect(
      service.generate(projectId, 'NAVIGATION_TREE', [draft.version.id]),
    ).rejects.toThrow('APPROVED');

    const workspace = await createWorkspace(ctx.prisma, 'Other Structured Analysis');
    const other = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Other' })).id;
    await expect(
      service.generate(other, 'NAVIGATION_TREE', [approvedRequirementId]),
    ).rejects.toThrow('APPROVED');
  });

  it('enforces stage-gated review before approval: DRAFT -> IN_REVIEW -> APPROVED', async () => {
    const created = await ctx.structuredAnalysis.create(
      projectId,
      'NAVIGATION_TREE',
      'Revisión',
      navigation,
    );
    await expect(
      ctx.structuredAnalysis.transition(
        projectId,
        'NAVIGATION_TREE',
        created.id,
        created.version.id,
        'APPROVED',
      ),
    ).rejects.toThrow('no permitida');

    const inReview = await ctx.structuredAnalysis.transition(
      projectId,
      'NAVIGATION_TREE',
      created.id,
      created.version.id,
      'IN_REVIEW',
    );
    expect(inReview.status).toBe('IN_REVIEW');
    const approved = await ctx.structuredAnalysis.transition(
      projectId,
      'NAVIGATION_TREE',
      created.id,
      created.version.id,
      'APPROVED',
    );
    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedAt).not.toBeNull();
  });

  it('never resolves an artifact of one kind through another kind endpoint, and enforces project isolation', async () => {
    const navigationArtifact = await ctx.structuredAnalysis.create(
      projectId,
      'NAVIGATION_TREE',
      'Aislada',
      navigation,
    );
    await expect(
      ctx.structuredAnalysis.get(projectId, 'SOFTWARE_ARCHITECTURE', navigationArtifact.id),
    ).rejects.toThrow('no encontrado');

    const workspace = await createWorkspace(ctx.prisma, 'Isolation');
    const otherProjectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Other' }))
      .id;
    await expect(
      ctx.structuredAnalysis.get(otherProjectId, 'NAVIGATION_TREE', navigationArtifact.id),
    ).rejects.toThrow('no encontrado');
  });
});
