import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AIError, AIOrchestrator, FakeAIProvider } from '@caseflow-ai/ai';
import request from 'supertest';
import { GenerationRunsService } from '../../src/construction/generation-runs.service';
import {
  createTestContext,
  createUnauthorizedUser,
  createWorkspaceWithOwner,
  type TestContext,
} from './support/test-app';
import { approvedDesignBaseline } from './support/construction-fixtures';

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

describe('Construction generation runs integration', () => {
  let ctx: TestContext;
  let runs: GenerationRunsService;
  let projectId: string;
  let otherProjectId: string;
  let uiVersionId: string;
  let planVersionId: string;
  let draftPlanVersionId: string;
  let approvedContent: ReturnType<typeof planBody>;
  const http = () => request(ctx.app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${ctx.token}` });

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
    runs = ctx.app.get(GenerationRunsService);
    const workspace = await createWorkspaceWithOwner(ctx, 'Generation Runs');
    projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Tienda' })).id;
    otherProjectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Otra' })).id;
    const { baseline, versions } = await approvedDesignBaseline(ctx, projectId);
    uiVersionId = versions.UI_BLUEPRINT;
    const ui = await ctx.prisma.artifactVersion.findUniqueOrThrow({
      where: { id: uiVersionId },
      select: { artifact: { select: { code: true } } },
    });
    const content = planBody(baseline.id, ui.artifact.code);
    approvedContent = content;
    const plan = await ctx.structuredAnalysis.create(
      projectId,
      'IMPLEMENTATION_PLAN',
      'Plan',
      content,
    );
    await ctx.structuredAnalysis.transition(
      projectId,
      'IMPLEMENTATION_PLAN',
      plan.id,
      plan.version.id,
      'IN_REVIEW',
    );
    await ctx.structuredAnalysis.transition(
      projectId,
      'IMPLEMENTATION_PLAN',
      plan.id,
      plan.version.id,
      'APPROVED',
    );
    planVersionId = plan.version.id;
    const draft = await ctx.structuredAnalysis.create(
      projectId,
      'IMPLEMENTATION_PLAN',
      'Borrador',
      content,
    );
    draftPlanVersionId = draft.version.id;
  });
  afterAll(async () => ctx.close());

  it('generates the project from an approved plan with files, trace links and audit', async () => {
    const started = await http()
      .post(`/projects/${projectId}/generation-runs`)
      .set(auth())
      .send({ implementationPlanVersionId: planVersionId })
      .expect(202);
    expect(started.body).toMatchObject({
      status: 'QUEUED',
      targetTemplateIdentifier: 'CASEFLOW_WEB_TS_V1',
      targetTemplateVersion: 2,
      fileCount: 0,
    });
    const runId = started.body.id as string;

    await runs.runJob(projectId, runId);
    await runs.runJob(projectId, runId); // A retried job must not duplicate output.

    const run = await http()
      .get(`/projects/${projectId}/generation-runs/${runId}`)
      .set(auth())
      .expect(200);
    expect(run.body.status).toBe('GENERATED');
    expect(run.body.fileCount).toBeGreaterThan(10);
    expect(run.body.warnings).toEqual([expect.stringContaining('fidelidad visual')]);

    const files = await http()
      .get(`/projects/${projectId}/generation-runs/${runId}/files`)
      .set(auth())
      .expect(200);
    expect(files.body.items).toHaveLength(run.body.fileCount);
    const service = files.body.items.find((f: { path: string }) =>
      f.path.endsWith('/order.service.ts'),
    );
    expect(service).toBeDefined();
    const detail = await http()
      .get(`/projects/${projectId}/generation-runs/${runId}/files/${service.id}`)
      .set(auth())
      .expect(200);
    expect(detail.body.content).toContain('class OrderService');
    expect(
      detail.body.traceLinks.map(
        (l: { sourceArtifactVersionId: string }) => l.sourceArtifactVersionId,
      ),
    ).toEqual(expect.arrayContaining([planVersionId, uiVersionId]));

    const audit = await ctx.prisma.auditEvent.findMany({
      where: { projectId, entityId: runId },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((e) => e.action)).toEqual([
      'GENERATION_RUN_STARTED',
      'GENERATION_RUN_FINISHED',
    ]);

    // Generated output is history: the database refuses to rewrite it.
    await expect(
      ctx.prisma.generatedFile.update({ where: { id: service.id }, data: { content: 'x' } }),
    ).rejects.toThrow();
    await expect(
      ctx.prisma.generationRun.update({ where: { id: runId }, data: { status: 'QUEUED' } }),
    ).rejects.toThrow();
  });

  it('fails the new template explicitly when business logic is unavailable instead of delivering 501 actions', async () => {
    const unavailable = vi
      .spyOn(ctx.app.get(AIOrchestrator), 'generateStructured')
      .mockRejectedValue(new AIError('AI_PROVIDER_UNAVAILABLE', 'unavailable'));
    try {
      const reused = await runs.start(projectId, ctx.userId, planVersionId);
      await runs.runJob(projectId, reused.id);
      expect(await runs.get(projectId, reused.id)).toMatchObject({ status: 'GENERATED' });
      expect(unavailable).not.toHaveBeenCalled();
      const changed = structuredClone(approvedContent);
      changed.customEndpoints[0]!.summary =
        'Confirmar pedido con una regla nueva sin implementación disponible';
      const newPlan = await ctx.structuredAnalysis.create(
        projectId,
        'IMPLEMENTATION_PLAN',
        'Plan con cambio de regla',
        changed,
      );
      for (const status of ['IN_REVIEW', 'APPROVED'] as const)
        await ctx.structuredAnalysis.transition(
          projectId,
          'IMPLEMENTATION_PLAN',
          newPlan.id,
          newPlan.version.id,
          status,
        );
      const run = await runs.start(projectId, ctx.userId, newPlan.version.id);
      await runs.runJob(projectId, run.id);
      expect(await runs.get(projectId, run.id)).toMatchObject({
        status: 'FAILED',
        fileCount: 0,
        errorMessage: expect.stringContaining('1 acción de negocio sin implementar'),
        warnings: [expect.stringContaining('Confirmar pedido')],
      });
      expect(
        await ctx.prisma.generatedProjectSnapshot.count({ where: { generationRunId: run.id } }),
      ).toBe(0);
    } finally {
      unavailable.mockRestore();
    }
  });

  it('refuses plans that are not approved or belong to another project', async () => {
    for (const implementationPlanVersionId of [
      draftPlanVersionId,
      '11111111-1111-4111-8111-111111111111',
    ])
      await http()
        .post(`/projects/${projectId}/generation-runs`)
        .set(auth())
        .send({ implementationPlanVersionId })
        .expect(422);
    await http()
      .post(`/projects/${otherProjectId}/generation-runs`)
      .set(auth())
      .send({ implementationPlanVersionId: planVersionId })
      .expect(422);
  });

  it('isolates runs by project and membership', async () => {
    const { items } = await runs.list(projectId);
    const runId = items[0]!.id;
    await http()
      .get(`/projects/${otherProjectId}/generation-runs/${runId}`)
      .set(auth())
      .expect(404);
    await http()
      .get(`/projects/${otherProjectId}/generation-runs/${runId}/files`)
      .set(auth())
      .expect(404);
    expect((await runs.list(otherProjectId)).items).toEqual([]);
    const intruder = await createUnauthorizedUser(ctx);
    await http()
      .get(`/projects/${projectId}/generation-runs`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .expect(403);
  });

  it('runs construction jobs only with the internal secret', async () => {
    const { items } = await runs.list(projectId);
    await http()
      .post(`/projects/${projectId}/construction-jobs/generation-run/${items[0]!.id}/run`)
      .expect(401);
    await http()
      .post(`/projects/${projectId}/construction-jobs/generation-run/${items[0]!.id}/run`)
      .set('x-internal-jobs-secret', 'wrong')
      .expect(401);
  });
});
