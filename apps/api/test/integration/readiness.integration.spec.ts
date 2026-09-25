import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AIOrchestrator, FakeAIProvider, PromptRegistry } from '@caseflow-ai/ai';
import { FakeDiagramProvider } from '@caseflow-ai/integrations';
import { PrismaAIRunRecorder } from '../../src/ai/ai-run-recorder';
import { DataModelsService } from '../../src/data-models/data-models.service';
import { DiagramEngine } from '../../src/data-models/diagram-engine';
import { RequirementsService } from '../../src/requirements/requirements.service';
import { StructuredAnalysisService } from '../../src/structured-analysis/structured-analysis.service';
import { UseCasesService } from '../../src/use-cases/use-cases.service';
import { createTestContext, createWorkspace, type TestContext } from './support/test-app';

const FAKE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><g></g></svg>';

function fakeAi(ctx: TestContext, promptKey: string, promptVersion: number, payload: unknown) {
  return new AIOrchestrator(
    new FakeAIProvider({ provider: 'fake', model: 'fake-v1', payload, usage: null, latencyMs: 1 }),
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

async function approveRequirement(
  ctx: TestContext,
  projectId: string,
  contextVersionId: string,
  name: string,
) {
  const service = new RequirementsService(
    ctx.prisma,
    fakeAi(ctx, 'requirements.generate', 2, {
      candidates: [
        {
          candidateId: `rc-${name}`,
          requirementType: 'FUNCTIONAL' as const,
          name,
          description: `Descripción ${name}`,
          priority: 'HIGH' as const,
          actors: ['Usuario'],
          preconditions: [],
          postconditions: [],
          dependencyCandidateIds: [],
        },
      ],
    }),
  );
  const generation = await service.generate(projectId, contextVersionId);
  const accepted = (await service.accept(projectId, generation.id, [generation.candidates[0]!.id]))
    .items[0]!;
  await service.transition(projectId, accepted.id, accepted.version.id, 'IN_REVIEW');
  return service.transition(projectId, accepted.id, accepted.version.id, 'APPROVED');
}

async function approveUseCase(
  ctx: TestContext,
  projectId: string,
  requirementVersionId: string,
  name: string,
) {
  const service = new UseCasesService(
    ctx.prisma,
    fakeAi(ctx, 'use-cases.generate', 1, {
      candidates: [
        {
          candidateId: `uc-${name}`,
          name,
          objective: 'Objetivo',
          primaryActor: 'Usuario',
          secondaryActors: [],
          preconditions: [],
          postconditions: [],
          mainFlow: [{ actor: 'Usuario', action: 'Actua' }],
          alternativeFlows: [],
          relatedRequirementSourceIds: [requirementVersionId],
        },
      ],
    }),
  );
  const generation = await service.generate(projectId, [requirementVersionId]);
  const accepted = (await service.accept(projectId, generation.id, [generation.candidates[0]!.id]))
    .items[0]!;
  await service.transition(projectId, accepted.id, accepted.version.id, 'IN_REVIEW');
  return service.transition(projectId, accepted.id, accepted.version.id, 'APPROVED');
}

describe('Readiness integration', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => ctx.close());

  async function project(name: string) {
    const workspace = await createWorkspace(ctx.prisma, name);
    return (await ctx.projects.create({ workspaceId: workspace.id, name })).id;
  }

  it('reports not ready for an empty project', async () => {
    const projectId = await project('Empty');
    const result = await ctx.readiness.evaluate(projectId);
    expect(result.ready).toBe(false);
    expect(result.stages.find((s) => s.key === 'SOURCES')?.satisfied).toBe(false);
  });

  it('blocks on an uploaded but unapproved source', async () => {
    const projectId = await project('Unapproved Source');
    await ctx.sources.create(
      projectId,
      { title: 'x', sourceKind: 'NOTES', purpose: 'p', description: 'Contenido de prueba.' },
      { originalname: 'n.txt', mimetype: 'text/plain', size: 4, buffer: Buffer.from('abcd') },
    );
    const result = await ctx.readiness.evaluate(projectId);
    expect(result.stages.find((s) => s.key === 'SOURCES')?.satisfied).toBe(false);
  });

  it('blocks on approved source but no Context', async () => {
    const projectId = await project('No Context');
    await approveSource(ctx, projectId);
    const result = await ctx.readiness.evaluate(projectId);
    const sourcesStage = result.stages.find((s) => s.key === 'SOURCES')!;
    expect(sourcesStage.satisfied).toBe(true);
    expect(result.stages.find((s) => s.key === 'CONTEXT')?.satisfied).toBe(false);
    expect(result.ready).toBe(false);
  });

  it('blocks on a source-less approved Context', async () => {
    const projectId = await project('Source-less Context');
    const context = await ctx.projectContext.create(projectId, {
      problemStatement: 'p',
      objective: 'o',
      scopeItems: [],
      actors: [{ name: 'Usuario' }],
      needs: [],
      constraints: [],
      businessRules: [],
    });
    await ctx.projectContext.transition(projectId, context.version.id, 'IN_REVIEW');
    await ctx.projectContext.transition(projectId, context.version.id, 'APPROVED');
    const result = await ctx.readiness.evaluate(projectId);
    const contextStage = result.stages.find((s) => s.key === 'CONTEXT')!;
    expect(contextStage.satisfied).toBe(false);
    expect(contextStage.blockers[0]).toMatch(/respaldado/);
  });

  it('progresses through the complete authoritative chain to fully ready, then a new approved Source reintroduces a blocker', async () => {
    const projectId = await project('Full Chain');
    const source = await approveSource(ctx, projectId, 'Fuente inicial');
    const context = await approveContext(ctx, projectId, [source.id]);

    let result = await ctx.readiness.evaluate(projectId);
    expect(result.stages.find((s) => s.key === 'REQUIREMENTS')?.satisfied).toBe(false);
    expect(result.ready).toBe(false);

    const requirement = await approveRequirement(ctx, projectId, context.id, 'Registrar pedido');
    result = await ctx.readiness.evaluate(projectId);
    expect(result.stages.find((s) => s.key === 'REQUIREMENTS')?.satisfied).toBe(true);
    expect(result.stages.find((s) => s.key === 'USE_CASES')?.satisfied).toBe(false);

    for (let i = 0; i < 3; i++) {
      await approveUseCase(ctx, projectId, requirement.id, `Caso ${i}`);
      result = await ctx.readiness.evaluate(projectId);
      expect(result.stages.find((s) => s.key === 'USE_CASES')?.satisfied).toBe(false);
    }
    const lastUseCase = await approveUseCase(ctx, projectId, requirement.id, 'Caso 4');
    result = await ctx.readiness.evaluate(projectId);
    const useCasesStage = result.stages.find((s) => s.key === 'USE_CASES')!;
    expect(useCasesStage.satisfied).toBe(true);
    expect(useCasesStage.counts).toMatchObject({ approved: 4, minimumRequired: 4 });
    expect(result.stages.find((s) => s.key === 'USE_CASE_DIAGRAM')?.satisfied).toBe(false);

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
    await dataModelsService.generateUseCaseDiagram(projectId, [lastUseCase.id]);
    result = await ctx.readiness.evaluate(projectId);
    expect(result.stages.find((s) => s.key === 'USE_CASE_DIAGRAM')?.satisfied).toBe(true);
    expect(result.stages.find((s) => s.key === 'DATA_MODEL')?.satisfied).toBe(false);

    const dmGeneration = await dataModelsService.generate(
      projectId,
      [requirement.id],
      [lastUseCase.id],
    );
    const dmAccepted = (
      await dataModelsService.accept(projectId, dmGeneration.id, [dmGeneration.candidates[0]!.id])
    ).items[0]!;
    result = await ctx.readiness.evaluate(projectId);
    // Accepted (GENERATED) Data Model is not yet APPROVED.
    expect(result.stages.find((s) => s.key === 'DATA_MODEL')?.satisfied).toBe(false);
    await dataModelsService.transition(
      projectId,
      dmAccepted.id,
      dmAccepted.version.id,
      'IN_REVIEW',
    );
    await dataModelsService.transition(projectId, dmAccepted.id, dmAccepted.version.id, 'APPROVED');
    result = await ctx.readiness.evaluate(projectId);
    expect(result.stages.find((s) => s.key === 'DATA_MODEL')?.satisfied).toBe(true);
    expect(result.stages.find((s) => s.key === 'ER_DIAGRAM')?.satisfied).toBe(true);
    expect(result.stages.find((s) => s.key === 'NAVIGATION')?.satisfied).toBe(false);

    const structuredAnalysisService = new StructuredAnalysisService(
      ctx.prisma,
      fakeAi(ctx, 'navigation.generate', 1, {
        nodes: [{ localId: 'home', label: 'Home', viewName: 'Home', kind: 'HOME' as const }],
      }),
      new DiagramEngine(),
      new FakeDiagramProvider({ svg: FAKE_SVG }),
    );
    const navGeneration = await structuredAnalysisService.generate(projectId, 'NAVIGATION_TREE', [
      requirement.id,
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
    result = await ctx.readiness.evaluate(projectId);
    expect(result.stages.find((s) => s.key === 'NAVIGATION')?.satisfied).toBe(true);
    expect(result.stages.find((s) => s.key === 'SOFTWARE_ARCHITECTURE')?.satisfied).toBe(false);

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
    result = await ctx.readiness.evaluate(projectId);
    expect(result.stages.find((s) => s.key === 'SOFTWARE_ARCHITECTURE')?.satisfied).toBe(true);
    expect(result.stages.find((s) => s.key === 'SYSTEM_ARCHITECTURE')?.satisfied).toBe(false);

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
    result = await ctx.readiness.evaluate(projectId);
    expect(result.stages.find((s) => s.key === 'SYSTEM_ARCHITECTURE')?.satisfied).toBe(true);
    expect(result.stages.find((s) => s.key === 'UI_BLUEPRINT')?.satisfied).toBe(false);

    const uiService = new StructuredAnalysisService(
      ctx.prisma,
      fakeAi(ctx, 'ui-blueprint.generate', 1, {
        screens: [{ localId: 'home', name: 'Inicio', purpose: 'Ver panel' }],
      }),
      new DiagramEngine(),
      new FakeDiagramProvider({ svg: FAKE_SVG }),
    );
    const blueprintGeneration = await uiService.generate(projectId, 'UI_BLUEPRINT', [
      navAccepted.version.id,
    ]);
    const blueprintAccepted = (
      await uiService.accept(projectId, 'UI_BLUEPRINT', blueprintGeneration.id, [
        blueprintGeneration.candidates[0]!.id,
      ])
    ).items[0]!;
    await uiService.transition(
      projectId,
      'UI_BLUEPRINT',
      blueprintAccepted.id,
      blueprintAccepted.version.id,
      'IN_REVIEW',
    );
    await uiService.transition(
      projectId,
      'UI_BLUEPRINT',
      blueprintAccepted.id,
      blueprintAccepted.version.id,
      'APPROVED',
    );
    result = await ctx.readiness.evaluate(projectId);
    expect(result.stages.find((s) => s.key === 'UI_BLUEPRINT')?.satisfied).toBe(true);
    expect(result.stages.find((s) => s.key === 'MOCKUPS')?.satisfied).toBe(false);

    const mockup = await ctx.mockups.create(projectId, blueprintAccepted.version.id);
    await ctx.mockups.transition(projectId, mockup.id, mockup.version.id, 'IN_REVIEW');
    await ctx.mockups.transition(projectId, mockup.id, mockup.version.id, 'APPROVED');

    result = await ctx.readiness.evaluate(projectId);
    expect(result.stages.find((s) => s.key === 'MOCKUPS')?.satisfied).toBe(true);
    expect(result.stages.find((s) => s.key === 'IMPACT')?.satisfied).toBe(true);
    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);

    // A brand-new approved Source reintroduces a staleness blocker.
    await approveSource(ctx, projectId, 'Fuente nueva posterior');
    const after = await ctx.readiness.evaluate(projectId);
    expect(after.stages.find((s) => s.key === 'IMPACT')?.satisfied).toBe(false);
    expect(after.ready).toBe(false);
  });

  it('keeps a historical APPROVED v1 authoritative over a newer DRAFT v2', async () => {
    const projectId = await project('Historical Version');
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
    await ctx.structuredAnalysis.version(projectId, 'NAVIGATION_TREE', created.id, 'Nav v2', {
      nodes: [
        { localId: 'home', label: 'Home', viewName: 'Home', kind: 'HOME' as const },
        { localId: 'other', label: 'Other', viewName: 'Other', kind: 'VIEW' as const },
      ],
    });
    const result = await ctx.readiness.evaluate(projectId);
    const navStage = result.stages.find((s) => s.key === 'NAVIGATION')!;
    expect(navStage.satisfied).toBe(true);
    expect(navStage.evidence?.artifactVersionId).toBe(created.version.id);
  });

  it('never leaks another project into readiness', async () => {
    const projectA = await project('Isolation A');
    const projectB = await project('Isolation B');
    await approveSource(ctx, projectA);
    const resultB = await ctx.readiness.evaluate(projectB);
    expect(resultB.stages.find((s) => s.key === 'SOURCES')?.satisfied).toBe(false);
  });
});
