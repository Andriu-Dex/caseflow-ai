import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeAIProvider } from '@caseflow-ai/ai';
import { E2E_TEST_PROVIDER, type E2ETestProvider } from '@caseflow-ai/integrations';
import { DesignBaselinesService } from '../../src/construction/design-baselines.service';
import { GenerationRunsService } from '../../src/construction/generation-runs.service';
import { SandboxRunsService } from '../../src/construction/sandbox-runs.service';
import { createTestContext, createWorkspaceWithOwner, type TestContext } from './support/test-app';
import { CONTENT, approved, approvedMockup } from './support/construction-fixtures';

const planBody = (designBaselineId: string, uiCode: string) => ({
  designBaselineId,
  authentication: { required: false, roles: [] },
  modules: [{ localId: 'sales', name: 'Sales', description: 'Pedidos' }],
  entities: [
    {
      localId: 'order',
      name: 'Order',
      moduleLocalId: 'sales',
      classLocalId: 'order',
      fields: [{ name: 'total', type: 'DECIMAL' }],
      operations: ['LIST', 'GET', 'CREATE'],
      relatedSourceCodes: [uiCode],
    },
  ],
  customEndpoints: [
    {
      moduleLocalId: 'sales',
      method: 'POST',
      path: '/orders/:orderId/confirm',
      summary: 'Confirmar pedido',
      entityLocalId: 'order',
    },
  ],
  routes: [
    {
      path: '/orders',
      screenName: 'Inicio',
      screenLocalId: 'home',
      moduleLocalId: 'sales',
      kind: 'LIST',
      entityLocalId: 'order',
      actions: [{ label: 'Confirmar pedido', endpoint: 'POST /orders/:orderId/confirm' }],
    },
  ],
});

describe('Acceptance tests per use case (ADR-025)', () => {
  let ctx: TestContext;
  let projectId: string;
  let runId: string;
  let planVersionId: string;
  let useCaseCode: string;
  let requirementCode: string;
  const http = () => request(ctx.app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${ctx.token}` });
  const validate = async () => {
    await http()
      .post(`/projects/${projectId}/generation-runs/${runId}/sandbox-runs`)
      .set(auth())
      .expect(202);
    for (;;) {
      const next = await ctx.prisma.sandboxRun.findFirst({
        where: { generationRunId: runId, status: 'QUEUED' },
      });
      if (!next) break;
      await ctx.app.get(SandboxRunsService).runJob(projectId, next.id);
    }
  };
  const report = async () =>
    (
      await http()
        .get(`/projects/${projectId}/generation-runs/${runId}/acceptance`)
        .set(auth())
        .expect(200)
    ).body;

  beforeAll(async () => {
    ctx = await createTestContext({
      aiProvider: new FakeAIProvider({
        provider: 'fake',
        model: 'fixture',
        payload: { body: 'return { confirmed: true };' },
        latencyMs: 1,
        usage: null,
      }),
    });
    const workspace = await createWorkspaceWithOwner(ctx, 'Acceptance');
    projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Tienda' })).id;
    const requirement = await ctx.requirements.create(projectId, {
      requirementType: 'FUNCTIONAL',
      name: 'Confirmar pedidos',
      description: 'El usuario confirma sus pedidos.',
      priority: 'HIGH',
      actors: ['Usuario'],
      preconditions: [],
      postconditions: [],
      dependencyArtifactIds: [],
      origin: { kind: 'USER_DECISION', justification: 'Decisión del equipo.' },
    });
    for (const status of ['IN_REVIEW', 'APPROVED'] as const)
      await ctx.requirements.transition(projectId, requirement.id, requirement.version.id, status);
    requirementCode = requirement.code;
    const useCase = await ctx.useCases.create(projectId, {
      name: 'Confirmar pedido',
      objective: 'Confirmar',
      primaryActor: 'Usuario',
      secondaryActors: [],
      preconditions: ['Hay un pedido pendiente.'],
      postconditions: ['El pedido queda confirmado.'],
      mainFlow: [{ actor: 'Usuario', action: 'confirma el pedido' }],
      alternativeFlows: [],
      relatedRequirementVersionIds: [requirement.version.id],
      relations: [],
    });
    for (const status of ['IN_REVIEW', 'APPROVED'] as const)
      await ctx.useCases.transition(projectId, useCase.id, useCase.version.id, status);
    useCaseCode = useCase.code;

    // In pipeline order: an earlier stage approved later would leave the next ones to redo.
    const classes = await approved(ctx, projectId, 'CLASS_DIAGRAM');
    const navigation = await approved(ctx, projectId, 'NAVIGATION_TREE');
    // The interface blueprint's «Inicio» screen realizes the use case.
    const blueprint = CONTENT.UI_BLUEPRINT as { screens: Record<string, unknown>[] };
    const ui = await ctx.structuredAnalysis.create(projectId, 'UI_BLUEPRINT', 'Plano', {
      ...blueprint,
      screens: blueprint.screens.map((screen) => ({
        ...screen,
        relatedUseCaseCodes: [useCaseCode],
      })),
    });
    for (const status of ['IN_REVIEW', 'APPROVED'] as const)
      await ctx.structuredAnalysis.transition(
        projectId,
        'UI_BLUEPRINT',
        ui.id,
        ui.version.id,
        status,
      );
    const theme = await approved(ctx, projectId, 'DESIGN_THEME');
    const mockup = await approvedMockup(ctx, projectId, ui.version.id);
    const baseline = await ctx.app.get(DesignBaselinesService).create(projectId, ctx.userId, {
      label: 'Diseño con casos de uso',
      versions: {
        GENERATION_PLAN: (await approved(ctx, projectId, 'GENERATION_PLAN')).version.id,
        CONCEPTUAL_DOMAIN_MODEL: (await approved(ctx, projectId, 'CONCEPTUAL_DOMAIN_MODEL')).version
          .id,
        CLASS_DIAGRAM: classes.version.id,
        NAVIGATION_TREE: navigation.version.id,
        UI_BLUEPRINT: ui.version.id,
        DESIGN_THEME: theme.version.id,
        MOCKUP: mockup.version.id,
      },
    });
    const plan = await ctx.structuredAnalysis.create(
      projectId,
      'IMPLEMENTATION_PLAN',
      'Plan',
      planBody(baseline.id, ui.code),
    );
    for (const status of ['IN_REVIEW', 'APPROVED'] as const)
      await ctx.structuredAnalysis.transition(
        projectId,
        'IMPLEMENTATION_PLAN',
        plan.id,
        plan.version.id,
        status,
      );
    planVersionId = plan.version.id;
    const runs = ctx.app.get(GenerationRunsService);
    runId = (await runs.start(projectId, ctx.userId, plan.version.id)).id;
    await runs.runJob(projectId, runId);
    expect((await runs.get(projectId, runId)).status).toBe('GENERATED');
  });
  afterAll(async () => ctx.close());

  it('lists the criteria before validating, without results', async () => {
    const body = await report();
    expect(body.sandboxRunId).toBeNull();
    expect(body.criteria).toEqual([
      expect.objectContaining({
        key: `CA-${useCaseCode}`,
        // The plan needs no session, so nobody signs in.
        given: 'Hay un pedido pendiente',
        when: 'Usuario confirma el pedido',
        then: 'El pedido queda confirmado',
        requirementCodes: [requirementCode],
        screens: [{ path: '/orders', screenName: 'Inicio' }],
        result: null,
      }),
    ]);
    expect(body.requirements).toEqual([
      { code: requirementCode, title: expect.any(String), status: 'NOT_RUN' },
    ]);
  });

  it('runs the acceptance test in the validation and reports the result per requirement', async () => {
    const e2e = ctx.app.get<E2ETestProvider>(E2E_TEST_PROVIDER);
    const spy = vi.spyOn(e2e, 'runE2E');
    try {
      await validate();
      const files = spy.mock.calls[0]![0].files;
      const spec = files.find((file) => file.path === 'apps/web/e2e/acceptance.spec.ts');
      expect(spec?.content).toContain(`[CA-${useCaseCode}] Confirmar pedido`);
    } finally {
      spy.mockRestore();
    }
    const passed = await report();
    expect(passed.criteria[0].result).toEqual({ passed: true, message: null });
    expect(passed.requirements[0].status).toBe('PASSED');

    // A READY run is not validated again: the failure is checked on a new run.
    const runs = ctx.app.get(GenerationRunsService);
    runId = (await runs.start(projectId, ctx.userId, planVersionId)).id;
    await runs.runJob(projectId, runId);
    const failing = vi.spyOn(e2e, 'runE2E').mockResolvedValue({
      passed: false,
      output: `  ✘  1 [chromium] › acceptance.spec.ts:20:3 › [CA-${useCaseCode}] Confirmar pedido`,
      durationMs: 1,
    });
    try {
      await validate();
    } finally {
      failing.mockRestore();
    }
    const failed = await report();
    expect(failed.criteria[0].result).toEqual({
      passed: false,
      message: 'La prueba de aceptación falló.',
    });
    expect(failed.requirements[0].status).toBe('FAILED');
    // A failed acceptance test keeps the run from READY.
    const latest = await ctx.prisma.sandboxRun.findFirstOrThrow({
      where: { generationRunId: runId },
      orderBy: { createdAt: 'desc' },
    });
    expect(latest.status).not.toBe('READY');
  });

  it('traces a requirement and its use case to screens, actions, files and results (DEC-172)', async () => {
    const trace = async (code: string) =>
      (
        await http()
          .get(`/projects/${projectId}/implementation-trace/${code}`)
          .set(auth())
          .expect(200)
      ).body;
    const requirement = await trace(requirementCode);
    expect(requirement).toMatchObject({
      code: requirementCode,
      type: 'REQUIREMENT',
      useCases: [{ code: useCaseCode, name: 'Confirmar pedido' }],
      run: { id: runId },
      screens: [{ path: '/orders', screenName: 'Inicio' }],
      actions: [{ key: 'POST /orders/:orderId/confirm', summary: 'Confirmar pedido' }],
      acceptance: [{ key: `CA-${useCaseCode}`, result: { passed: false } }],
    });
    expect(requirement.files.map((file: { path: string }) => file.path)).toContain(
      'apps/web/app/orders/page.tsx',
    );
    const useCase = await trace(useCaseCode);
    expect(useCase).toMatchObject({ type: 'USE_CASE', screens: requirement.screens });
    await http().get(`/projects/${projectId}/implementation-trace/RF-999`).set(auth()).expect(404);
    await http().get(`/projects/${projectId}/implementation-trace/x`).set(auth()).expect(400);
  });
});
