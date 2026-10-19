import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { AIError, type AIProviderRequest } from '@caseflow-ai/ai';
import { createTestContext, createWorkspaceWithOwner, type TestContext } from './support/test-app';

// DEC-143: the UI blueprint drawn in batches, view by view, in the background.
describe('Batched UI blueprint generation jobs', () => {
  let ctx: TestContext;
  let projectId: string;
  let treeVersionId = '';
  const seenTargets: string[][] = [];
  let failSecondCall = true;
  let omittedOnce = false;
  const http = () => request(ctx.app.getHttpServer());
  const start = (ids = [treeVersionId]) =>
    http()
      .post(`/projects/${projectId}/ui-blueprint/generation-jobs`)
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ sourceVersionIds: ids });
  const jobStatus = async (id: string) =>
    (await ctx.prisma.structuredGenerationJob.findUniqueOrThrow({ where: { id } })).status;

  beforeAll(async () => {
    ctx = await createTestContext({
      aiProvider: {
        id: 'scripted',
        generateStructured: async (input: AIProviderRequest) => {
          const payload = JSON.parse(input.messages[0]!.content);
          const asked: { localId: string; viewName: string }[] = payload.targetNodes;
          seenTargets.push(asked.map((n) => n.localId));
          if (seenTargets.length === 2 && failSecondCall) {
            failSecondCall = false;
            throw new AIError('AI_PROVIDER_ERROR', 'Proveedor no disponible.');
          }
          // The first time the last batch is asked for, the model answers only
          // for its first view: the other has to be asked for again.
          let answered = asked;
          if (asked.some((n) => n.localId === 'v8') && asked.length > 1 && !omittedOnce) {
            omittedOnce = true;
            answered = asked.slice(0, 1);
          }
          return {
            provider: 'scripted',
            model: 'test',
            payload: {
              screens: answered.map((node) => ({
                localId: `screen-${node.localId}`,
                name: `Pantalla de ${node.viewName}`,
                purpose: `Trabaja con ${node.viewName}.`,
                navigationNodeLocalId: node.localId,
                // One use case that does not exist: it must not fail the run.
                relatedUseCaseCodes: ['CU-999'],
                primaryActions: ['Guardar'],
              })),
            },
            usage: null,
            latencyMs: 1,
          };
        },
      },
    });
    const workspace = await createWorkspaceWithOwner(ctx, 'Plano por lotes');
    projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Registros' })).id;
    const views = Array.from({ length: 8 }, (_, i) => ({
      localId: `v${i + 1}`,
      label: `Vista ${i + 1}`,
      viewName: `Vista ${i + 1}`,
      kind: 'LIST' as const,
      parentLocalId: 'root',
    }));
    const tree = await ctx.structuredAnalysis.create(projectId, 'NAVIGATION_TREE', 'Navegación', {
      nodes: [
        { localId: 'root', label: 'Inicio', viewName: 'Inicio', kind: 'SECTION' as const },
        ...views,
      ],
    });
    await ctx.structuredAnalysis.transition(
      projectId,
      'NAVIGATION_TREE',
      tree.id,
      tree.version.id,
      'IN_REVIEW',
    );
    await ctx.structuredAnalysis.transition(
      projectId,
      'NAVIGATION_TREE',
      tree.id,
      tree.version.id,
      'APPROVED',
    );
    treeVersionId = tree.version.id;
  });
  afterAll(async () => ctx?.close());

  it('needs one approved navigation tree', async () => {
    const stranger = '00000000-0000-4000-8000-000000000000';
    expect((await start([stranger])).status).toBe(422);
    expect(await ctx.prisma.structuredGenerationJob.count({ where: { projectId } })).toBe(0);
  });

  it('keeps validated checkpoints after a failure, then resumes and asks again for a view the model skipped', async () => {
    const failed = await start();
    expect(failed.status).toBe(202);
    expect(failed.body.kind).toBe('UI_BLUEPRINT');
    await vi.waitFor(async () => expect(await jobStatus(failed.body.id)).toBe('FAILED'));
    expect(
      await ctx.prisma.structuredGenerationPart.count({ where: { jobId: failed.body.id } }),
    ).toBe(1);
    expect(await ctx.prisma.structuredAnalysisGeneration.count({ where: { projectId } })).toBe(0);

    const calls = seenTargets.length;
    const resumed = await start();
    await vi.waitFor(async () => expect(await jobStatus(resumed.body.id)).toBe('COMPLETED'), {
      timeout: 10000,
    });
    // Eight views, six per batch: the first batch was kept; the model answered
    // only for v7 of the second, so v8 was asked for again.
    expect(seenTargets.slice(calls)).toEqual([['v7', 'v8'], ['v8']]);

    const job = await ctx.prisma.structuredGenerationJob.findUniqueOrThrow({
      where: { id: resumed.body.id },
    });
    expect(job).toMatchObject({ completedBatches: 2, totalBatches: 2 });
    const generation = await ctx.structuredAnalysis.getGeneration(
      projectId,
      'UI_BLUEPRINT',
      job.generationId!,
    );
    const content = generation.candidates[0]!.content as {
      screens: { navigationNodeLocalId: string; relatedUseCaseCodes: string[] }[];
    };
    expect(content.screens.map((s) => s.navigationNodeLocalId)).toEqual(
      Array.from({ length: 8 }, (_, i) => `v${i + 1}`),
    );
    // The use case that does not exist was dropped from every screen.
    expect(content.screens.every((s) => s.relatedUseCaseCodes.length === 0)).toBe(true);
    // Every view has a screen: no coverage gap.
    expect(generation.candidates[0]!.qualityFindings.filter((f) => f.severity === 'ERROR')).toEqual(
      [],
    );
  });
});
