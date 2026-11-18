import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AIOrchestrator, FakeAIProvider } from '@caseflow-ai/ai';
import { GenerationRunsService } from '../../src/construction/generation-runs.service';
import { createTestContext, createWorkspaceWithOwner, type TestContext } from './support/test-app';
import { approvedDesignBaseline } from './support/construction-fixtures';

// Three modules on the shared design fixtures: the «Inicio» screen (sales)
// uses an action of the catalog module; reports needs nothing.
const planBody = (designBaselineId: string, uiCode: string) => ({
  designBaselineId,
  authentication: { required: false, roles: [] },
  modules: [
    { localId: 'reports', name: 'Reports', description: 'Reportes' },
    { localId: 'sales', name: 'Sales', description: 'Ventas' },
    { localId: 'catalog', name: 'Catalog', description: 'Catálogo' },
  ],
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
      moduleLocalId: 'catalog',
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

describe('Construction by deliveries (ADR-024)', () => {
  let ctx: TestContext;
  let projectId: string;
  let otherProjectId: string;
  let baselineId: string;
  let planVersionId: string;
  let draftPlanVersionId: string;
  const http = () => request(ctx.app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${ctx.token}` });
  const path = (project: string, version: string) =>
    `/projects/${project}/implementation-plans/${version}/delivery-plan`;
  const modulesOf = (body: { deliveries: { modules: { localId: string }[] }[] }) =>
    body.deliveries.map((delivery) => delivery.modules.map((module) => module.localId));

  let workspaceId: string;
  const approvedPlanFor = async (project: string) => {
    const { baseline, versions } = await approvedDesignBaseline(ctx, project);
    const ui = await ctx.prisma.artifactVersion.findUniqueOrThrow({
      where: { id: versions.UI_BLUEPRINT },
      select: { artifact: { select: { code: true } } },
    });
    const content = planBody(baseline.id, ui.artifact.code);
    const plan = await ctx.structuredAnalysis.create(
      project,
      'IMPLEMENTATION_PLAN',
      'Plan',
      content,
    );
    for (const status of ['IN_REVIEW', 'APPROVED'] as const)
      await ctx.structuredAnalysis.transition(
        project,
        'IMPLEMENTATION_PLAN',
        plan.id,
        plan.version.id,
        status,
      );
    return { baselineId: baseline.id, planVersionId: plan.version.id, content };
  };

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
    const workspace = await createWorkspaceWithOwner(ctx, 'Deliveries');
    workspaceId = workspace.id;
    projectId = (await ctx.projects.create({ workspaceId, name: 'Tienda' })).id;
    otherProjectId = (await ctx.projects.create({ workspaceId, name: 'Otra' })).id;
    const approvedPlan = await approvedPlanFor(projectId);
    baselineId = approvedPlan.baselineId;
    planVersionId = approvedPlan.planVersionId;
    draftPlanVersionId = (
      await ctx.structuredAnalysis.create(
        projectId,
        'IMPLEMENTATION_PLAN',
        'Borrador',
        approvedPlan.content,
      )
    ).version.id;
  });
  afterAll(async () => ctx.close());

  it('proposes the deliveries in dependency order and explains each dependency', async () => {
    expect((await http().get(path(projectId, planVersionId)).set(auth())).status).toBe(404);
    const created = await http().post(path(projectId, planVersionId)).set(auth()).send({});
    expect(created.status).toBe(201);
    expect(modulesOf(created.body)).toEqual([['reports'], ['catalog'], ['sales']]);
    expect(created.body.deliveries.map((d: { name: string }) => d.name)).toEqual([
      'Reports',
      'Catalog',
      'Sales',
    ]);
    expect(created.body.deliveries.every((d: { status: string }) => d.status === 'PENDING')).toBe(
      true,
    );
    expect(created.body.dependencies).toEqual([
      {
        module: 'sales',
        needs: 'catalog',
        reason: 'la pantalla «Inicio» usa la acción POST /orders/:orderId/confirm',
      },
    ]);
    expect((await http().post(path(projectId, planVersionId)).set(auth()).send({})).status).toBe(
      409,
    );
    const audit = await ctx.prisma.auditEvent.findFirst({
      where: { projectId, action: 'DELIVERY_PLAN_CREATED' },
    });
    expect(audit?.entityId).toBe(created.body.id);
  });

  it('regroups the deliveries, and refuses an order that cannot be built', async () => {
    const refused = await http()
      .put(path(projectId, planVersionId))
      .set(auth())
      .send({
        deliveries: [{ modules: ['sales'] }, { modules: ['catalog'] }, { modules: ['reports'] }],
      });
    expect(refused.status).toBe(422);
    expect(refused.body.message).toContain('«Sales» necesita «Catalog»');
    const saved = await http()
      .put(path(projectId, planVersionId))
      .set(auth())
      .send({ deliveries: [{ modules: ['catalog', 'sales'] }, { modules: ['reports'] }] });
    expect(saved.status).toBe(200);
    expect(modulesOf(saved.body)).toEqual([['catalog', 'sales'], ['reports']]);
  });

  it('keeps a generated delivery in its place with its modules', async () => {
    const plan = (await http().get(path(projectId, planVersionId)).set(auth())).body;
    const first = plan.deliveries[0];
    await ctx.prisma.generationRun.create({
      data: {
        projectId,
        implementationPlanVersionId: planVersionId,
        designBaselineId: baselineId,
        targetTemplateIdentifier: 'CASEFLOW_WEB_TS_V1',
        targetTemplateVersion: 2,
        createdByUserId: ctx.userId,
        status: 'FAILED',
        deliveryId: first.id,
      },
    });
    const changed = await http()
      .put(path(projectId, planVersionId))
      .set(auth())
      .send({ deliveries: [{ modules: ['catalog'] }, { modules: ['sales', 'reports'] }] });
    expect(changed.status).toBe(422);
    expect(changed.body.message).toBe(
      'La entrega 0 ya se generó y no puede cambiar de módulos ni de lugar.',
    );
    const kept = await http()
      .put(path(projectId, planVersionId))
      .set(auth())
      .send({ deliveries: [{ modules: ['catalog', 'sales'] }, { modules: ['reports'] }] });
    expect(kept.status).toBe(200);
    expect(kept.body.deliveries[0]).toMatchObject({
      id: first.id,
      status: 'GENERATED',
      locked: true,
    });
    expect(kept.body.deliveries[1].locked).toBe(false);
  });

  it('requires an approved plan of the project', async () => {
    expect(
      (await http().post(path(projectId, draftPlanVersionId)).set(auth()).send({})).status,
    ).toBe(422);
    expect((await http().get(path(otherProjectId, planVersionId)).set(auth())).status).toBe(404);
    expect(
      (await http().post(path(otherProjectId, planVersionId)).set(auth()).send({})).status,
    ).toBe(422);
  });

  it('keeps approvals as history that cannot be changed', async () => {
    const plan = (await http().get(path(projectId, planVersionId)).set(auth())).body;
    const run = await ctx.prisma.generationRun.findFirstOrThrow({
      where: { deliveryId: plan.deliveries[0].id },
    });
    const approval = await ctx.prisma.deliveryApproval.create({
      data: {
        deliveryId: plan.deliveries[0].id,
        generationRunId: run.id,
        approvedByUserId: ctx.userId,
      },
    });
    await expect(
      ctx.prisma.deliveryApproval.update({ where: { id: approval.id }, data: { note: 'x' } }),
    ).rejects.toThrow();
    await expect(
      ctx.prisma.deliveryApproval.delete({ where: { id: approval.id } }),
    ).rejects.toThrow();
    expect(
      (await http().get(path(projectId, planVersionId)).set(auth())).body.deliveries[0].status,
    ).toBe('APPROVED');
  });

  describe('building by deliveries', () => {
    const DEMO_DATA_PROMPT = 'demo-data.generate';
    const actionCalls = (spy: { mock: { calls: unknown[][] } }) =>
      spy.mock.calls.filter(
        ([call]) => (call as { promptKey?: string }).promptKey !== DEMO_DATA_PROMPT,
      ).length;
    let shop: string;
    let version: string;
    let deliveries: { id: string; modules: { localId: string }[] }[];
    const runs = () => ctx.app.get(GenerationRunsService);
    const approve = (deliveryId: string, generationRunId: string) =>
      ctx.prisma.deliveryApproval.create({
        data: { deliveryId, generationRunId, approvedByUserId: ctx.userId },
      });
    const build = async (deliveryId?: string) => {
      const run = await runs().start(shop, ctx.userId, version, deliveryId);
      await runs().runJob(shop, run.id);
      const done = await runs().get(shop, run.id);
      expect(done.status).toBe('GENERATED');
      return done;
    };
    const fileOf = (runId: string, path: string) =>
      ctx.prisma.generatedFile.findFirst({ where: { generationRunId: runId, path } });

    beforeAll(async () => {
      shop = (await ctx.projects.create({ workspaceId, name: 'Tienda por entregas' })).id;
      version = (await approvedPlanFor(shop)).planVersionId;
      deliveries = (await http().post(path(shop, version)).set(auth()).send({}).expect(201)).body
        .deliveries;
    });

    it('builds one delivery at a time, in order, each on the approved ones', async () => {
      const [reports, catalog, sales] = deliveries;
      await expect(runs().start(shop, ctx.userId, version, catalog!.id)).rejects.toThrow(
        'Apruebe primero las entregas anteriores',
      );
      const first = await build(reports!.id);
      expect(first.deliveryId).toBe(reports!.id);
      // Screens of later deliveries open a notice instead of an error.
      expect((await fileOf(first.id, 'apps/web/app/orders/page.tsx'))?.content).toContain(
        'Esta sección llegará en una próxima entrega.',
      );
      await approve(reports!.id, first.id);
      await expect(runs().start(shop, ctx.userId, version, reports!.id)).rejects.toThrow(
        'Esta entrega ya está aprobada.',
      );

      const ai = vi.spyOn(ctx.app.get(AIOrchestrator), 'generateStructured');
      try {
        const second = await build(catalog!.id);
        expect(actionCalls(ai)).toBe(1);
        await approve(catalog!.id, second.id);

        const estimate = await runs().estimate(shop, version, sales!.id);
        expect(estimate.businessActions).toEqual({ total: 1, reused: 1 });
        ai.mockClear();
        const third = await build(sales!.id);
        // The catalog's action was implemented in the previous delivery.
        expect(actionCalls(ai)).toBe(0);
        expect((await fileOf(third.id, 'apps/web/app/orders/page.tsx'))?.content).not.toContain(
          'Esta sección llegará',
        );
        await approve(sales!.id, third.id);

        ai.mockClear();
        // Building everything at once reuses what the deliveries built.
        const whole = await build();
        expect(whole.deliveryId).toBeNull();
        expect(actionCalls(ai)).toBe(0);
      } finally {
        ai.mockRestore();
      }
    });

    it('checks the delivery belongs to the plan', async () => {
      const other = await approvedPlanFor(shop);
      await expect(
        runs().start(shop, ctx.userId, other.planVersionId, deliveries[0]!.id),
      ).rejects.toThrow('La entrega pertenece a otro plan de implementación.');
      await expect(runs().estimate(otherProjectId, version, deliveries[0]!.id)).rejects.toThrow();
    });
  });
});
