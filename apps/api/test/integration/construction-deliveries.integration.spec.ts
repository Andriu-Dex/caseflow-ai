import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AIOrchestrator, FakeAIProvider } from '@caseflow-ai/ai';
import { GenerationRunsService } from '../../src/construction/generation-runs.service';
import { SandboxRunsService } from '../../src/construction/sandbox-runs.service';
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
    // Named in Spanish from each module's description, not its internal name.
    expect(created.body.deliveries.map((d: { name: string }) => d.name)).toEqual([
      'Reportes',
      'Catálogo',
      'Ventas',
    ]);
    expect(created.body.deliveries[0].modules[0].name).toBe('Reportes');
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
    const validate = async (runId: string) => {
      await http()
        .post(`/projects/${shop}/generation-runs/${runId}/sandbox-runs`)
        .set(auth())
        .expect(202);
      // The queue is a no-op in tests: drain every attempt the service enqueues.
      for (;;) {
        const next = await ctx.prisma.sandboxRun.findFirst({
          where: { generationRunId: runId, status: 'QUEUED' },
        });
        if (!next) break;
        await ctx.app.get(SandboxRunsService).runJob(shop, next.id);
      }
      const last = await ctx.prisma.sandboxRun.findFirstOrThrow({
        where: { generationRunId: runId },
        orderBy: { createdAt: 'desc' },
      });
      expect(last.status).toBe('READY');
    };
    const approval = (deliveryId: string, generationRunId: string) =>
      http()
        .post(`${path(shop, version)}/deliveries/${deliveryId}/approval`)
        .set(auth())
        .send({ generationRunId });
    const approve = async (deliveryId: string, generationRunId: string) => {
      await validate(generationRunId);
      const approved = await approval(deliveryId, generationRunId).expect(201);
      return approved.body.deliveries.find((d: { id: string }) => d.id === deliveryId);
    };
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
      // Only a validated run is approved.
      expect((await approval(reports!.id, first.id)).status).toBe(422);
      expect(await approve(reports!.id, first.id)).toMatchObject({
        status: 'APPROVED',
        approval: { generationRunId: first.id, approvedByUserId: ctx.userId },
      });
      expect((await approval(reports!.id, first.id)).status).toBe(409);
      await expect(runs().start(shop, ctx.userId, version, reports!.id)).rejects.toThrow(
        'Esta entrega ya está aprobada.',
      );
      expect(
        await ctx.prisma.auditEvent.count({
          where: { projectId: shop, action: 'DELIVERY_APPROVED', entityId: reports!.id },
        }),
      ).toBe(1);

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

    it('marks an approved delivery affected when a later run changes its files', async () => {
      const [, catalog, sales] = deliveries;
      const approvedRun = (
        await ctx.prisma.deliveryApproval.findFirstOrThrow({ where: { deliveryId: catalog!.id } })
      ).generationRunId;
      // A file of the catalog's action and of nothing else.
      const files = await ctx.prisma.generatedFile.findMany({
        where: { generationRunId: approvedRun },
        include: { traceLinks: true },
      });
      const own = files.find((file) => {
        const elements = file.traceLinks.map((link) => link.planElement);
        return (
          elements.includes('endpoint:POST /orders/:orderId/confirm') &&
          !elements.some((element) => element.startsWith('route:'))
        );
      })!;
      expect(own).toBeDefined();
      // A later run of the sales delivery whose copy of that file changed.
      const approvedRow = await ctx.prisma.generationRun.findUniqueOrThrow({
        where: { id: approvedRun },
      });
      const later = await ctx.prisma.generationRun.create({
        data: {
          projectId: shop,
          implementationPlanVersionId: version,
          designBaselineId: approvedRow.designBaselineId,
          targetTemplateIdentifier: approvedRow.targetTemplateIdentifier,
          targetTemplateVersion: approvedRow.targetTemplateVersion,
          createdByUserId: ctx.userId,
          status: 'GENERATING',
          deliveryId: sales!.id,
        },
      });
      const changed = await ctx.prisma.generatedFile.create({
        data: {
          generationRunId: later.id,
          path: own.path,
          content: `${own.content}\n// changed`,
          sha256: 'f'.repeat(64),
          origin: own.origin,
          kind: own.kind,
        },
      });
      await ctx.prisma.codeTraceLink.createMany({
        data: own.traceLinks.map((link) => ({
          generatedFileId: changed.id,
          sourceArtifactVersionId: link.sourceArtifactVersionId,
          planElement: link.planElement,
          linkType: link.linkType,
        })),
      });
      await ctx.prisma.generationRun.update({
        where: { id: later.id },
        data: { status: 'GENERATED', finishedAt: new Date() },
      });
      const plan = (await http().get(path(shop, version)).set(auth()).expect(200)).body;
      expect(plan.deliveries.map((d: { status: string }) => d.status)).toEqual([
        'APPROVED',
        'AFFECTED',
        'APPROVED',
      ]);
      // It is approved again only with a validated run that includes it.
      expect((await approval(catalog!.id, later.id)).status).toBe(422);
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
