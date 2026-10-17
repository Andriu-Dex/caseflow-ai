import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { AIError, type AIProviderRequest } from '@caseflow-ai/ai';
import { createTestContext, createWorkspaceWithOwner, type TestContext } from './support/test-app';
import { approvedDesignBaseline } from './support/construction-fixtures';

// DEC-144: the implementation plan drawn in stages from a design baseline.
describe('Batched implementation plan jobs', () => {
  let ctx: TestContext;
  let projectId: string;
  let baselineId = '';
  const asked: string[] = [];
  let failEntities = true;
  const http = () => request(ctx.app.getHttpServer());
  const start = (designBaselineId = baselineId) =>
    http()
      .post(`/projects/${projectId}/implementation-plan/generation-jobs`)
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ designBaselineId });
  const jobStatus = async (id: string) =>
    (await ctx.prisma.structuredGenerationJob.findUniqueOrThrow({ where: { id } })).status;

  beforeAll(async () => {
    ctx = await createTestContext({
      aiProvider: {
        id: 'scripted',
        generateStructured: async (input: AIProviderRequest) => {
          const payload = JSON.parse(input.messages[0]!.content);
          const answer = (data: unknown) => ({
            provider: 'scripted',
            model: 'test',
            payload: data,
            usage: null,
            latencyMs: 1,
          });
          if (payload.planModules) {
            asked.push('skeleton');
            return answer({
              authentication: { required: true, roles: ['Vendedor'] },
              modules: [
                {
                  localId: 'orders',
                  name: 'Orders',
                  description: 'Pedidos.',
                  // A source that does not exist: it must not fail the run.
                  relatedSourceCodes: ['XX-9'],
                },
              ],
            });
          }
          if (payload.targetClasses) {
            asked.push('entities');
            if (failEntities) {
              failEntities = false;
              throw new AIError('AI_PROVIDER_ERROR', 'Proveedor no disponible.');
            }
            return answer({
              entities: [
                {
                  localId: 'ent-order',
                  name: 'Order',
                  // A module that does not exist: it falls back to the first one.
                  moduleLocalId: 'nope',
                  classLocalId: 'order',
                  fields: [
                    // The generator adds "id": declaring it is dropped.
                    { name: 'id', type: 'STRING' },
                    { name: 'date', type: 'DATE' },
                    { name: 'total', type: 'DECIMAL' },
                  ],
                  operations: ['LIST', 'GET', 'CREATE'],
                  readRoles: ['Vendedor', 'Fantasma'],
                },
              ],
            });
          }
          asked.push('routes');
          return answer({
            routes: [
              {
                path: '/orders',
                screenName: 'Inicio',
                screenLocalId: 'home',
                moduleLocalId: 'orders',
                kind: 'LIST',
                entityLocalId: 'ent-order',
                actions: [
                  { label: 'Confirmar pedido', endpoint: 'POST /orders/:orderId/confirm' },
                  // The screen has no such action: it is dropped.
                  { label: 'Inexistente', operation: 'LIST' },
                ],
              },
            ],
            customEndpoints: [
              {
                moduleLocalId: 'orders',
                method: 'POST',
                path: '/orders/:orderId/confirm',
                summary: 'Confirma un pedido.',
                entityLocalId: 'ent-order',
                roles: ['Vendedor'],
              },
            ],
          });
        },
      },
    });
    const workspace = await createWorkspaceWithOwner(ctx, 'Implementación por lotes');
    projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Pedidos' })).id;
    baselineId = (await approvedDesignBaseline(ctx, projectId)).baseline.id;
  });
  afterAll(async () => ctx?.close());

  it('needs a design baseline of the project', async () => {
    expect((await start('00000000-0000-4000-8000-000000000000')).status).toBe(422);
    expect(await ctx.prisma.structuredGenerationJob.count({ where: { projectId } })).toBe(0);
  });

  it('keeps the skeleton after a failure, resumes and corrects what the plan cross-checks', async () => {
    const failed = await start();
    expect(failed.status).toBe(202);
    expect(failed.body).toMatchObject({
      kind: 'IMPLEMENTATION_PLAN',
      designBaselineId: baselineId,
    });
    await vi.waitFor(async () => expect(await jobStatus(failed.body.id)).toBe('FAILED'));
    expect(
      await ctx.prisma.structuredGenerationPart.count({ where: { jobId: failed.body.id } }),
    ).toBe(1);

    asked.length = 0;
    const resumed = await start();
    await vi.waitFor(async () => expect(await jobStatus(resumed.body.id)).toBe('COMPLETED'), {
      timeout: 10000,
    });
    // The skeleton was kept (not asked for again).
    expect(asked).toEqual(['entities', 'routes']);

    const job = await ctx.prisma.structuredGenerationJob.findUniqueOrThrow({
      where: { id: resumed.body.id },
    });
    expect(job).toMatchObject({ completedBatches: 3, totalBatches: 3 });
    const generation = await ctx.structuredAnalysis.getGeneration(
      projectId,
      'IMPLEMENTATION_PLAN',
      job.generationId!,
    );
    const content = generation.candidates[0]!.content as {
      designBaselineId: string;
      entities: {
        moduleLocalId: string;
        fields: { name: string }[];
        readRoles: string[];
      }[];
      routes: { actions: { label: string }[] }[];
      customEndpoints: unknown[];
      tests: { kind: string }[];
    };
    expect(content.designBaselineId).toBe(baselineId);
    expect(content.entities[0]).toMatchObject({
      moduleLocalId: 'orders',
      readRoles: ['Vendedor'],
    });
    expect(content.entities[0]!.fields.map((f) => f.name)).toEqual(['date', 'total']);
    expect(content.routes[0]!.actions.map((a) => a.label)).toEqual(['Confirmar pedido']);
    expect(content.customEndpoints).toHaveLength(1);
    expect(content.tests.map((t) => t.kind)).toEqual(['UNIT', 'INTEGRATION', 'E2E']);
    expect(generation.candidates[0]!.qualityFindings.filter((f) => f.severity === 'ERROR')).toEqual(
      [],
    );
  });
});
