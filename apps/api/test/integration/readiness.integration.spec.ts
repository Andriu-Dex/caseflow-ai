import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AIOrchestrator, FakeAIProvider, PromptRegistry } from '@caseflow-ai/ai';
import { FakeDiagramProvider } from '@caseflow-ai/integrations';
import { PrismaAIRunRecorder } from '../../src/ai/ai-run-recorder';
import { DataModelsService } from '../../src/data-models/data-models.service';
import { DiagramEngine } from '../../src/data-models/diagram-engine';
import type { KnowledgeBaseService } from '../../src/knowledge-base/knowledge-base.service';
import { RequirementsService } from '../../src/requirements/requirements.service';
import { StructuredAnalysisService } from '../../src/structured-analysis/structured-analysis.service';
import { UseCasesService } from '../../src/use-cases/use-cases.service';
import { approved, freezableDesign } from './support/construction-fixtures';
import { createTestContext, createWorkspace, type TestContext } from './support/test-app';
import { DesignBaselinesService } from '../../src/construction/design-baselines.service';

const disabledKb: Pick<KnowledgeBaseService, 'searchSources'> = { searchSources: async () => [] };

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
      sourceKind: 'TEXT',
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
    needs: [{ description: 'Registrar datos' }],
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
    fakeAi(ctx, 'requirements.generate', 3, {
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
          contextItemCodes: ['N-1'],
          dependencyCandidateIds: [],
        },
      ],
    }),
    disabledKb as KnowledgeBaseService,
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
    fakeAi(ctx, 'use-cases.generate', 2, {
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

  it('counts identities once and diagrams only the latest approved use-case versions', async () => {
    const projectId = await project('Versioned use cases');
    const source = await approveSource(ctx, projectId);
    const context = await approveContext(ctx, projectId, [source.id]);
    const requirement = await approveRequirement(ctx, projectId, context.id, 'Registrar datos');
    const first = await approveUseCase(ctx, projectId, requirement.id, 'Registrar datos');
    const identity = await ctx.prisma.artifactVersion.findUniqueOrThrow({
      where: { id: first.id },
    });
    const edited = await ctx.useCases.version(projectId, identity.artifactId, {
      name: 'Registrar datos revisado',
      objective: 'Registrar datos',
      primaryActor: 'Usuario',
      secondaryActors: [],
      preconditions: [],
      postconditions: [],
      mainFlow: [{ actor: 'Usuario', action: 'Registra los datos' }],
      alternativeFlows: [],
      relatedRequirementVersionIds: [requirement.id],
      relations: [],
    });
    await ctx.useCases.transition(projectId, edited.id, edited.version.id, 'IN_REVIEW');
    await ctx.useCases.transition(projectId, edited.id, edited.version.id, 'APPROVED');
    await ctx.dataModels.generateUseCaseDiagram(projectId, [edited.version.id]);
    const result = await ctx.readiness.evaluate(projectId);
    expect(result.stages.find((stage) => stage.key === 'USE_CASES')?.counts?.approved).toBe(1);
    expect(result.stages.find((stage) => stage.key === 'USE_CASE_DIAGRAM')?.satisfied).toBe(true);
  });

  it('reviews changes in order, audits confirmations and blocks construction', async () => {
    const projectId = await project('Ordered review');
    const source = await approveSource(ctx, projectId);
    const context = await approveContext(ctx, projectId, [source.id]);
    const requirement = await approveRequirement(ctx, projectId, context.id, 'Registrar datos');
    await approveUseCase(ctx, projectId, requirement.id, 'Registrar datos');
    const original = await ctx.readiness.evaluate(projectId);
    expect(original.stages.every((stage) => stage.currency === 'CURRENT')).toBe(true);
    await approveSource(ctx, projectId, 'Nueva fuente');
    const changed = await ctx.readiness.evaluate(projectId);
    expect(changed.stages.find((s) => s.key === 'CONTEXT')?.currency).toBe('OUTDATED');
    expect(changed.stages.find((s) => s.key === 'REQUIREMENTS')?.currency).toBe('BLOCKED');
    await expect(
      ctx.readiness.confirmCurrent(projectId, 'REQUIREMENTS', ctx.userId),
    ).rejects.toThrow('Primero revise');
    const designProject = await project('Stale design gate');
    const designVersions = await freezableDesign(ctx, designProject);
    await approveSource(ctx, designProject, 'Cambio aprobado posterior al diseño');
    await expect(
      ctx.app
        .get(DesignBaselinesService)
        .create(designProject, ctx.userId, { label: 'Obsoleto', versions: designVersions }),
    ).rejects.toThrow('pasos por rehacer');
    await expect(
      ctx.readiness.confirmCurrent(projectId, 'CONTEXT', '00000000-0000-4000-8000-000000000001'),
    ).rejects.toThrow('permiso');
    await ctx.readiness.confirmCurrent(projectId, 'CONTEXT', ctx.userId, 'Fuentes revisadas');
    const next = await ctx.readiness.evaluate(projectId);
    expect(next.stages.find((s) => s.key === 'CONTEXT')?.currency).toBe('CURRENT');
    expect(next.stages.find((s) => s.key === 'IMPACT')?.satisfied).toBe(true);
    expect(next.stages.find((s) => s.key === 'REQUIREMENTS')?.currency).toBe('OUTDATED');
    await ctx.readiness.confirmCurrent(projectId, 'REQUIREMENTS', ctx.userId);
    const following = await ctx.readiness.evaluate(projectId);
    expect(following.stages.find((s) => s.key === 'USE_CASES')?.currency).toBe('OUTDATED');
    const event = await ctx.prisma.auditEvent.findFirst({
      where: { projectId, action: 'STAGE_CONFIRMED_CURRENT' },
    });
    expect(event?.metadata).toMatchObject({
      stage: 'CONTEXT',
      upstreamStage: 'SOURCES',
      note: 'Fuentes revisadas',
    });
    const confirmation = await ctx.prisma.stageConfirmation.findFirstOrThrow({
      where: { projectId },
    });
    await expect(
      ctx.sql.query('UPDATE stage_confirmations SET note = $1 WHERE id = $2', [
        'changed',
        confirmation.id,
      ]),
    ).rejects.toMatchObject({ code: '23001' });
  });

  // DEC-137: archiving or restoring an approved source changes the Sources stage.
  it('asks to review the context when an approved source is archived or restored', async () => {
    const projectId = await project('Archived source');
    const source = await approveSource(ctx, projectId);
    await approveContext(ctx, projectId, [source.id]);
    const sourceId = source.artifactId;
    const currency = async (key: string) =>
      (await ctx.readiness.evaluate(projectId)).stages.find((s) => s.key === key)?.currency;
    expect(await currency('CONTEXT')).toBe('CURRENT');

    // A draft source that was never approved changes nothing.
    const draft = await ctx.sources.create(
      projectId,
      { title: 'Borrador', sourceKind: 'TEXT', purpose: 'p', description: 'Contenido.' },
      undefined,
    );
    await ctx.sources.archive(projectId, draft.id, ctx.userId);
    expect(await currency('CONTEXT')).toBe('CURRENT');

    await ctx.sources.archive(projectId, sourceId, ctx.userId);
    expect(await currency('CONTEXT')).toBe('OUTDATED');
    await ctx.readiness.confirmCurrent(projectId, 'CONTEXT', ctx.userId);
    expect(await currency('CONTEXT')).toBe('CURRENT');

    await expect(ctx.sources.restore(projectId, draft.id, ctx.userId)).resolves.toMatchObject({
      archivedAt: null,
    });
    await ctx.sources.restore(projectId, sourceId, ctx.userId);
    expect(await currency('CONTEXT')).toBe('OUTDATED');
    await expect(ctx.sources.restore(projectId, sourceId, ctx.userId)).rejects.toThrow(
      'no está archivada',
    );
    expect(
      await ctx.prisma.auditEvent.findMany({
        where: { projectId, entityId: sourceId },
        select: { action: true, actorUserId: true },
        orderBy: { createdAt: 'asc' },
      }),
    ).toEqual([
      { action: 'SOURCE_ARCHIVED', actorUserId: ctx.userId },
      { action: 'SOURCE_RESTORED', actorUserId: ctx.userId },
    ]);
  });

  it('blocks on an uploaded but unapproved source', async () => {
    const projectId = await project('Unapproved Source');
    await ctx.sources.create(
      projectId,
      { title: 'x', sourceKind: 'TEXT', purpose: 'p', description: 'Contenido de prueba.' },
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
      needs: [{ description: 'Registrar datos' }],
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

    // Every approved use case must reach a screen of the UI blueprint (DEC-121).
    const useCaseIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      useCaseIds.push((await approveUseCase(ctx, projectId, requirement.id, `Caso ${i}`)).id);
      result = await ctx.readiness.evaluate(projectId);
      expect(result.stages.find((s) => s.key === 'USE_CASES')?.satisfied).toBe(false);
    }
    const lastUseCase = await approveUseCase(ctx, projectId, requirement.id, 'Caso 4');
    useCaseIds.push(lastUseCase.id);
    result = await ctx.readiness.evaluate(projectId);
    const useCasesStage = result.stages.find((s) => s.key === 'USE_CASES')!;
    expect(useCasesStage.satisfied).toBe(true);
    expect(useCasesStage.counts).toMatchObject({ approved: 4, minimumRequired: 4 });
    expect(result.stages.find((s) => s.key === 'USE_CASE_DIAGRAM')?.satisfied).toBe(false);

    const dataModelsService = new DataModelsService(
      ctx.prisma,
      fakeAi(ctx, 'data-model.generate', 2, {
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
    expect(result.stages.find((s) => s.key === 'USE_CASE_DIAGRAM')?.satisfied).toBe(false);
    await dataModelsService.generateUseCaseDiagram(projectId, useCaseIds);
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

    // Follow the canonical pipeline: classes precede navigation and design.
    expect(result.stages.find((s) => s.key === 'CLASS_DIAGRAM')?.satisfied).toBe(false);
    const classDiagram = await ctx.structuredAnalysis.create(projectId, 'CLASS_DIAGRAM', 'Clases', {
      classes: [
        {
          localId: 'order',
          name: 'Pedido',
          stereotype: 'ENTITY',
          dataModelEntityName: 'Pedido',
          attributes: [{ name: 'id', type: 'UUID', visibility: 'PRIVATE', required: true }],
          methods: [],
        },
      ],
      relationships: [],
    });
    for (const status of ['IN_REVIEW', 'APPROVED'] as const)
      await ctx.structuredAnalysis.transition(
        projectId,
        'CLASS_DIAGRAM',
        classDiagram.id,
        classDiagram.version.id,
        status,
      );

    const structuredAnalysisService = new StructuredAnalysisService(
      ctx.prisma,
      fakeAi(ctx, 'navigation.generate', 4, {
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
      fakeAi(ctx, 'software-architecture.generate', 3, {
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
      fakeAi(ctx, 'system-architecture.generate', 2, {
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
      fakeAi(ctx, 'ui-blueprint.generate', 2, {
        screens: [
          {
            localId: 'home',
            name: 'Inicio',
            purpose: 'Ver panel',
            navigationNodeLocalId: 'home',
            relatedUseCaseCodes: ['CU-001', 'CU-002', 'CU-003', 'CU-004'],
            relatedSourceCodes: ['CU-001', 'CU-002', 'CU-003', 'CU-004'],
          },
        ],
      }),
      new DiagramEngine(),
      new FakeDiagramProvider({ svg: FAKE_SVG }),
    );
    const blueprintGeneration = await uiService.generate(projectId, 'UI_BLUEPRINT', [
      navAccepted.version.id,
      ...useCaseIds,
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
    expect(result.stages.find((s) => s.key === 'DESIGN_THEME')?.satisfied).toBe(false);
    expect(result.stages.find((s) => s.key === 'MOCKUPS')?.satisfied).toBe(false);

    // New projects paint their mockups with an approved theme (DEC-118).
    await approved(ctx, projectId, 'DESIGN_THEME');
    result = await ctx.readiness.evaluate(projectId);
    expect(result.stages.find((s) => s.key === 'DESIGN_THEME')?.satisfied).toBe(true);

    const mockupJob = await ctx.mockups.create(projectId, blueprintAccepted.version.id);
    await ctx.mockups.runJob(mockupJob.id);
    const finishedMockupJob = await ctx.mockups.getJob(projectId, mockupJob.id);
    const mockup = await ctx.mockups.get(projectId, finishedMockupJob.resultArtifactId!);
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
