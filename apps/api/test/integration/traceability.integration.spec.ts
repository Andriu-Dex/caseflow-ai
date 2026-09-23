import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AIOrchestrator, FakeAIProvider, PromptRegistry } from '@caseflow-ai/ai';
import { FakeDiagramProvider } from '@caseflow-ai/integrations';
import { PrismaAIRunRecorder } from '../../src/ai/ai-run-recorder';
import { DataModelsService } from '../../src/data-models/data-models.service';
import { DiagramEngine } from '../../src/data-models/diagram-engine';
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

async function approveSource(ctx: TestContext, projectId: string, title: string) {
  const source = await ctx.sources.create(
    projectId,
    { title, sourceKind: 'NOTES', purpose: 'Conocimiento del proyecto' },
    { originalname: 'n.txt', mimetype: 'text/plain', size: 4, buffer: Buffer.from('abcd') },
  );
  await ctx.sources.transition(projectId, source.id, source.version.id, 'IN_REVIEW');
  return {
    artifactId: source.id,
    version: await ctx.sources.transition(projectId, source.id, source.version.id, 'APPROVED'),
  };
}

describe('Traceability graph integration', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => ctx.close());

  it('builds a full graph across the entire chain, edges matching only real persisted provenance', async () => {
    const workspace = await createWorkspace(ctx.prisma, 'Traceability Full Chain');
    const projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;

    const source = await approveSource(ctx, projectId, 'Notas iniciales');
    const context = await ctx.projectContext.create(projectId, {
      problemStatement: 'p',
      objective: 'o',
      scopeItems: [],
      actors: [{ name: 'Usuario' }],
      needs: [],
      constraints: [],
      businessRules: [],
      sourceVersionIds: [source.version.id],
    });
    await ctx.projectContext.transition(projectId, context.version.id, 'IN_REVIEW');
    await ctx.projectContext.transition(projectId, context.version.id, 'APPROVED');

    const requirementsAi = fakeAi(ctx, 'requirements.generate', 2, {
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
    });
    const { RequirementsService } = await import('../../src/requirements/requirements.service');
    const requirementsService = new RequirementsService(ctx.prisma, requirementsAi);
    const rfGeneration = await requirementsService.generate(projectId, context.version.id);
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

    const useCasesAi = fakeAi(ctx, 'use-cases.generate', 1, {
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
    });
    const useCasesService = new UseCasesService(ctx.prisma, useCasesAi);
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

    const useCaseDiagram = await dataModelsService.generateUseCaseDiagram(projectId, [
      ucAccepted.version.id,
    ]);

    const structuredAnalysisService = new StructuredAnalysisService(
      ctx.prisma,
      fakeAi(ctx, 'navigation.generate', 1, {
        nodes: [{ localId: 'home', label: 'Home', viewName: 'Home', kind: 'HOME' as const }],
      }),
      new DiagramEngine(),
      new FakeDiagramProvider({ svg: FAKE_SVG }),
    );
    const navGeneration = await structuredAnalysisService.generate(projectId, 'NAVIGATION_TREE', [
      rfAccepted.version.id,
    ]);
    const navAccepted = (
      await structuredAnalysisService.accept(projectId, 'NAVIGATION_TREE', navGeneration.id, [
        navGeneration.candidates[0]!.id,
      ])
    ).items[0]!;
    await structuredAnalysisService.transition(
      projectId,
      'NAVIGATION_TREE',
      navAccepted.id,
      navAccepted.version.id,
      'IN_REVIEW',
    );
    await structuredAnalysisService.transition(
      projectId,
      'NAVIGATION_TREE',
      navAccepted.id,
      navAccepted.version.id,
      'APPROVED',
    );

    // Closure item B/C: explicit SOFTWARE_ARCHITECTURE and SYSTEM_ARCHITECTURE
    // SOURCE_FOR_STRUCTURED_ANALYSIS edges, backed by a real persisted
    // StructuredAnalysisGenerationSource — never inferred from adjacency.
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

    const { nodes, edges } = await ctx.traceability.buildGraph(projectId);

    const sourceNode = nodes.find((n) => n.artifactType === 'PROJECT_SOURCE')!;
    const contextNode = nodes.find((n) => n.artifactType === 'PROJECT_CONTEXT')!;
    const requirementNode = nodes.find((n) => n.artifactType === 'REQUIREMENT')!;
    const useCaseNode = nodes.find((n) => n.artifactType === 'USE_CASE')!;
    const dataModelNode = nodes.find((n) => n.artifactType === 'DATA_MODEL')!;
    const useCaseDiagramNode = nodes.find((n) => n.artifactType === 'USE_CASE_DIAGRAM')!;
    const navNode = nodes.find((n) => n.artifactType === 'NAVIGATION_TREE')!;
    const softwareArchitectureNode = nodes.find((n) => n.artifactType === 'SOFTWARE_ARCHITECTURE')!;
    const systemArchitectureNode = nodes.find((n) => n.artifactType === 'SYSTEM_ARCHITECTURE')!;
    const blueprintNode = nodes.find((n) => n.artifactType === 'UI_BLUEPRINT')!;
    const mockupNode = nodes.find((n) => n.artifactType === 'MOCKUP')!;

    expect(sourceNode.id).toBe(source.version.id);
    expect(contextNode.id).toBe(context.version.id);
    expect(requirementNode.id).toBe(rfAccepted.version.id);
    expect(useCaseNode.id).toBe(ucAccepted.version.id);
    expect(dataModelNode.id).toBe(dmAccepted.version.id);
    expect(useCaseDiagramNode.id).toBe(useCaseDiagram.versionId);
    expect(navNode.id).toBe(navAccepted.version.id);
    expect(softwareArchitectureNode.id).toBe(swAccepted.version.id);
    expect(systemArchitectureNode.id).toBe(sysAccepted.version.id);
    expect(blueprintNode.id).toBe(blueprintAccepted.version.id);
    expect(mockupNode.id).toBe(mockup.version.id);

    expect(edges).toContainEqual({
      type: 'SOURCE_FOR_STRUCTURED_ANALYSIS',
      fromId: navNode.id,
      toId: softwareArchitectureNode.id,
    });
    expect(edges).toContainEqual({
      type: 'SOURCE_FOR_STRUCTURED_ANALYSIS',
      fromId: navNode.id,
      toId: systemArchitectureNode.id,
    });

    expect(edges).toContainEqual({
      type: 'SOURCE_SUPPORTS_CONTEXT',
      fromId: sourceNode.id,
      toId: contextNode.id,
    });
    expect(edges).toContainEqual({
      type: 'CONTEXT_SOURCE_FOR_REQUIREMENT',
      fromId: contextNode.id,
      toId: requirementNode.id,
    });
    expect(edges).toContainEqual({
      type: 'REQUIREMENT_SOURCE_FOR_USE_CASE',
      fromId: requirementNode.id,
      toId: useCaseNode.id,
    });
    expect(edges).toContainEqual({
      type: 'SOURCE_FOR_DATA_MODEL',
      fromId: requirementNode.id,
      toId: dataModelNode.id,
    });
    expect(edges).toContainEqual({
      type: 'SOURCE_FOR_DATA_MODEL',
      fromId: useCaseNode.id,
      toId: dataModelNode.id,
    });
    expect(edges).toContainEqual({
      type: 'SOURCE_FOR_DIAGRAM',
      fromId: useCaseNode.id,
      toId: useCaseDiagramNode.id,
    });
    expect(edges).toContainEqual({
      type: 'SOURCE_FOR_STRUCTURED_ANALYSIS',
      fromId: requirementNode.id,
      toId: navNode.id,
    });
    expect(edges).toContainEqual({
      type: 'SOURCE_FOR_STRUCTURED_ANALYSIS',
      fromId: navNode.id,
      toId: blueprintNode.id,
    });
    expect(edges).toContainEqual({
      type: 'UI_BLUEPRINT_SOURCE_FOR_MOCKUP',
      fromId: blueprintNode.id,
      toId: mockupNode.id,
    });

    // No self-loop edges from the ER/Navigation/etc self-referencing diagram
    // bookkeeping rows.
    expect(edges.every((e) => e.fromId !== e.toId)).toBe(true);

    // Requirement node carries real generation provenance.
    expect(requirementNode.generation).toMatchObject({
      promptKey: 'requirements.generate',
      promptVersion: 2,
      provider: 'fake',
    });
    // Deterministic diagram node carries generator provenance, not AI.
    expect(useCaseDiagramNode.generator).toMatchObject({ sourceFormat: 'PLANTUML' });
    expect(useCaseDiagramNode.generation).toBeNull();
  });

  it('never leaks another project into the graph', async () => {
    const workspace = await createWorkspace(ctx.prisma, 'Traceability Isolation');
    const projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;
    const { nodes, edges } = await ctx.traceability.buildGraph(projectId);
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });

  it('reports truncated=false for a normal-size project graph', async () => {
    const workspace = await createWorkspace(ctx.prisma, 'Traceability Untruncated');
    const projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;
    await approveSource(ctx, projectId, 'Notas');
    const { truncated } = await ctx.traceability.buildGraph(projectId);
    expect(truncated).toBe(false);
  });

  it('keeps a historical APPROVED version visible and distinct from a newer DRAFT edit', async () => {
    const workspace = await createWorkspace(ctx.prisma, 'Traceability History');
    const projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;
    const created = await ctx.structuredAnalysis.create(projectId, 'NAVIGATION_TREE', 'Nav', {
      nodes: [{ localId: 'home', label: 'Home', viewName: 'Home', kind: 'HOME' as const }],
    });
    await ctx.structuredAnalysis.transition(
      projectId,
      'NAVIGATION_TREE',
      created.id,
      created.version.id,
      'IN_REVIEW',
    );
    await ctx.structuredAnalysis.transition(
      projectId,
      'NAVIGATION_TREE',
      created.id,
      created.version.id,
      'APPROVED',
    );
    const v2 = await ctx.structuredAnalysis.version(
      projectId,
      'NAVIGATION_TREE',
      created.id,
      'Nav v2',
      {
        nodes: [
          { localId: 'home', label: 'Home', viewName: 'Home', kind: 'HOME' as const },
          { localId: 'other', label: 'Other', viewName: 'Other', kind: 'VIEW' as const },
        ],
      },
    );

    const { nodes } = await ctx.traceability.buildGraph(projectId);
    const navNodes = nodes.filter((n) => n.artifactType === 'NAVIGATION_TREE');
    expect(navNodes).toHaveLength(2);
    const v1Node = navNodes.find((n) => n.versionNumber === 1)!;
    const v2Node = navNodes.find((n) => n.versionNumber === 2)!;
    expect(v1Node.status).toBe('APPROVED');
    expect(v1Node.isCurrent).toBe(false);
    expect(v2Node.status).toBe('DRAFT');
    expect(v2Node.isCurrent).toBe(true);
    expect(v2Node.id).toBe(v2.version.id);
  });
});
