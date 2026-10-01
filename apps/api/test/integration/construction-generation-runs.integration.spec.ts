import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
});

describe('Construction generation runs integration', () => {
  let ctx: TestContext;
  let runs: GenerationRunsService;
  let projectId: string;
  let otherProjectId: string;
  let uiVersionId: string;
  let planVersionId: string;
  let draftPlanVersionId: string;
  const http = () => request(ctx.app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${ctx.token}` });

  beforeAll(async () => {
    ctx = await createTestContext();
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
    // No AI configured in tests: the custom action keeps its honest 501 stub.
    expect(run.body.warnings).toEqual([expect.stringContaining('Confirmar pedido')]);

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
