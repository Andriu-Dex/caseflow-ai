import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AIOrchestrator, FakeAIProvider, PromptRegistry } from '@caseflow-ai/ai';
import { FakeDiagramProvider } from '@caseflow-ai/integrations';
import { PrismaAIRunRecorder } from '../../src/ai/ai-run-recorder';
import { DiagramEngine } from '../../src/data-models/diagram-engine';
import { StructuredAnalysisService } from '../../src/structured-analysis/structured-analysis.service';
import {
  createTestContext,
  createUnauthorizedUser,
  createWorkspaceWithOwner,
  type TestContext,
} from './support/test-app';
import { approved, approvedDesignBaseline } from './support/construction-fixtures';

const planBody = {
  authentication: { required: true, roles: ['SELLER'] },
  modules: [{ localId: 'sales', name: 'Sales', description: 'Pedidos' }],
  entities: [
    {
      localId: 'order',
      name: 'Order',
      moduleLocalId: 'sales',
      fields: [
        { name: 'total', type: 'DECIMAL' },
        { name: 'status', type: 'ENUM', enumValues: ['DRAFT', 'CONFIRMED'] },
      ],
      operations: ['LIST', 'GET', 'CREATE'],
      writeRoles: ['SELLER'],
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
  routes: [{ path: '/orders', screenName: 'Pedidos', moduleLocalId: 'sales', kind: 'LIST' }],
};

describe('Construction Implementation Plan integration', () => {
  let ctx: TestContext;
  let projectId: string;
  let otherProjectId: string;
  let baselineId: string;
  let frozen: Record<string, string>;
  const http = () => request(ctx.app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${ctx.token}` });

  beforeAll(async () => {
    ctx = await createTestContext();
    const workspace = await createWorkspaceWithOwner(ctx, 'Implementation Plan');
    projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;
    otherProjectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Q' })).id;
    const { baseline, versions } = await approvedDesignBaseline(ctx, projectId);
    baselineId = baseline.id;
    frozen = versions;
  });
  afterAll(async () => ctx.close());

  it('creates a plan tied to an approved design and previews its Prisma schema and OpenAPI contract', async () => {
    const created = await http()
      .post(`/projects/${projectId}/implementation-plan`)
      .set(auth())
      .send({ title: 'Plan v1', content: { ...planBody, designBaselineId: baselineId } })
      .expect(201);
    expect(created.body).toMatchObject({ code: 'PI-001', kind: 'IMPLEMENTATION_PLAN' });

    const artifacts = await http()
      .get(`/projects/${projectId}/implementation-plan/${created.body.id}/artifacts`)
      .set(auth())
      .expect(200);
    expect(artifacts.body.databaseSchema).toContain('model Order {');
    expect(artifacts.body.databaseSchema).toContain('enum OrderStatus {');
    expect(Object.keys(artifacts.body.openApi.paths)).toEqual(
      expect.arrayContaining(['/orders', '/orders/{id}', '/orders/{orderId}/confirm']),
    );
  });

  it('refuses a plan that points at no approved design of this project', async () => {
    const other = await approvedDesignBaseline(ctx, otherProjectId);
    for (const designBaselineId of [other.baseline.id, '11111111-1111-4111-8111-111111111111'])
      await http()
        .post(`/projects/${projectId}/implementation-plan`)
        .set(auth())
        .send({ title: 'Plan', content: { ...planBody, designBaselineId } })
        .expect(422);
    // Contract-level rules: roles must be declared, reserved fields are added by the generator.
    await http()
      .post(`/projects/${projectId}/implementation-plan`)
      .set(auth())
      .send({
        title: 'Plan',
        content: {
          ...planBody,
          designBaselineId: baselineId,
          entities: [
            {
              ...planBody.entities[0],
              fields: [{ name: 'id', type: 'STRING' }],
              writeRoles: ['UNDECLARED'],
            },
          ],
        },
      })
      .expect(400);
  });

  it('generates a candidate only from the versions the design baseline froze', async () => {
    const provider = new FakeAIProvider({
      provider: 'fake',
      model: 'fake-v1',
      payload: planBody,
      usage: null,
      latencyMs: 1,
    });
    const service = new StructuredAnalysisService(
      ctx.prisma,
      new AIOrchestrator(
        provider,
        new PromptRegistry([
          {
            key: 'implementation-plan.generate',
            version: 1,
            capability: 'STRUCTURED_OUTPUT',
            purpose: 'implementation_plan_generation',
            systemInstructions: 'policy',
          },
        ]),
        new PrismaAIRunRecorder(ctx.prisma),
      ),
      new DiagramEngine(),
      new FakeDiagramProvider({ svg: '<svg/>' }),
    );

    const generation = await service.generateFromDesignBaseline(
      projectId,
      'IMPLEMENTATION_PLAN',
      baselineId,
    );
    expect(generation.candidates[0]!.content).toMatchObject({ designBaselineId: baselineId });
    // The mockup has no structured content and the theme only paints the
    // frontend (read from the baseline); every other frozen version is a source.
    expect(generation.sources.map((s) => s.artifactVersionId).sort()).toEqual(
      Object.entries(frozen)
        .filter(([role]) => role !== 'MOCKUP' && role !== 'DESIGN_THEME')
        .map(([, id]) => id)
        .sort(),
    );

    await expect(
      service.generate(projectId, 'IMPLEMENTATION_PLAN', [frozen.GENERATION_PLAN!]),
    ).rejects.toThrow('línea base de diseño');
    const outsider = await approved(ctx, projectId, 'GENERATION_PLAN');
    await expect(
      service.generate(projectId, 'IMPLEMENTATION_PLAN', [outsider.version.id], {
        designBaselineId: baselineId,
      }),
    ).rejects.toThrow('congeladas');
  });

  it('keeps implementation plans invisible to non-members', async () => {
    const intruder = await createUnauthorizedUser(ctx);
    await http()
      .get(`/projects/${projectId}/implementation-plan`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .expect(403);
  });
});
