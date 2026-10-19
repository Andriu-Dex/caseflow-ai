import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { AIError, type AIProviderRequest } from '@caseflow-ai/ai';
import { createTestContext, createWorkspaceWithOwner, type TestContext } from './support/test-app';

// DEC-144: the data model drawn in the background: discovery, then entities in batches.
describe('Batched data model generation jobs', () => {
  let ctx: TestContext;
  let projectId: string;
  let requirementVersionId = '';
  const detailTargets: string[][] = [];
  let calls = 0;
  let failFirstDetail = true;
  let omittedOnce = false;
  const http = () => request(ctx.app.getHttpServer());
  const start = (ids = [requirementVersionId]) =>
    http()
      .post(`/projects/${projectId}/data-models/generation-jobs`)
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ requirementVersionIds: ids, useCaseVersionIds: [] });
  const jobStatus = async (id: string) =>
    (await ctx.prisma.dataModelGenerationJob.findUniqueOrThrow({ where: { id } })).status;

  beforeAll(async () => {
    ctx = await createTestContext({
      aiProvider: {
        id: 'scripted',
        generateStructured: async (input: AIProviderRequest) => {
          calls += 1;
          const payload = JSON.parse(input.messages[0]!.content);
          const answer = (data: unknown) => ({
            provider: 'scripted',
            model: 'test',
            payload: data,
            usage: null,
            latencyMs: 1,
          });
          if (!payload.targetEntities)
            return answer({
              title: 'Registros',
              entities: Array.from({ length: 10 }, (_, i) => ({
                localId: `e${i + 1}`,
                name: `Entidad ${i + 1}`,
                relatedSourceCodes: ['RF-001'],
              })),
            });
          const asked: { localId: string; name: string }[] = payload.targetEntities;
          detailTargets.push(asked.map((e) => e.localId));
          if (failFirstDetail) {
            failFirstDetail = false;
            throw new AIError('AI_PROVIDER_ERROR', 'Proveedor no disponible.');
          }
          // The first time the first batch is asked for, the model forgets e8.
          let answered = asked;
          if (asked.length > 1 && asked.some((e) => e.localId === 'e8') && !omittedOnce) {
            omittedOnce = true;
            answered = asked.filter((e) => e.localId !== 'e8');
          }
          return answer({
            entities: answered.map((e) => ({
              localId: e.localId,
              name: e.name,
              attributes: [
                { name: 'Código', type: 'STRING', required: true, primaryKey: true, unique: true },
              ],
            })),
            // The second entity points at the first one and at one that does not exist.
            relationships: answered.some((e) => e.localId === 'e2')
              ? [
                  {
                    sourceEntityId: 'e1',
                    targetEntityId: 'e2',
                    name: 'tiene',
                    sourceCardinality: 'ONE',
                    targetCardinality: 'ZERO_OR_MORE',
                  },
                  {
                    sourceEntityId: 'e1',
                    targetEntityId: 'nope',
                    sourceCardinality: 'ONE',
                    targetCardinality: 'ONE',
                  },
                ]
              : [],
          });
        },
      },
    });
    const workspace = await createWorkspaceWithOwner(ctx, 'Datos por lotes');
    projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Registros' })).id;
    const requirement = await ctx.requirements.create(projectId, {
      requirementType: 'FUNCTIONAL',
      name: 'Registrar',
      description: 'El sistema permite registrar.',
      priority: 'HIGH',
      actors: ['Usuario'],
      preconditions: [],
      postconditions: [],
      dependencyArtifactIds: [],
      origin: { kind: 'USER_DECISION', justification: 'Decisión del equipo.' },
    });
    for (const status of ['IN_REVIEW', 'APPROVED'] as const)
      await ctx.requirements.transition(projectId, requirement.id, requirement.version.id, status);
    requirementVersionId = requirement.version.id;
  });
  afterAll(async () => ctx?.close());

  it('needs approved sources of the project', async () => {
    const stranger = '00000000-0000-4000-8000-000000000000';
    expect((await start([stranger])).status).toBe(422);
    expect(await ctx.prisma.dataModelGenerationJob.count({ where: { projectId } })).toBe(0);
  });

  it('keeps the discovery after a failure, resumes and asks again for an entity the model skipped', async () => {
    const failed = await start();
    expect(failed.status).toBe(202);
    await vi.waitFor(async () => expect(await jobStatus(failed.body.id)).toBe('FAILED'));
    expect(
      await ctx.prisma.dataModelGenerationPart.count({ where: { jobId: failed.body.id } }),
    ).toBe(1);
    expect(await ctx.prisma.dataModelGeneration.count({ where: { projectId } })).toBe(0);

    const before = calls;
    detailTargets.length = 0;
    const resumed = await start();
    await vi.waitFor(async () => expect(await jobStatus(resumed.body.id)).toBe('COMPLETED'), {
      timeout: 10000,
    });
    // The discovery was kept. Ten entities, eight per batch: e8 was forgotten
    // in the first answer and asked for again.
    expect(calls - before).toBe(3);
    expect(detailTargets).toEqual([
      ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'],
      ['e8'],
      ['e9', 'e10'],
    ]);

    const job = await ctx.prisma.dataModelGenerationJob.findUniqueOrThrow({
      where: { id: resumed.body.id },
    });
    expect(job).toMatchObject({ completedBatches: 3, totalBatches: 3 });
    const generation = await ctx.dataModels.getGeneration(projectId, job.generationId!);
    expect(generation.candidates).toHaveLength(1);
    const candidate = generation.candidates[0]!;
    expect(candidate).toMatchObject({ title: 'Registros', modelKind: 'ER' });
    const entities = candidate.entities as { localId: string }[];
    expect(entities.map((e) => e.localId)).toEqual(
      Array.from({ length: 10 }, (_, i) => `e${i + 1}`),
    );
    // Only the relationship between two entities of the model is kept.
    expect(candidate.relationships).toEqual([
      expect.objectContaining({ sourceEntityId: 'e1', targetEntityId: 'e2' }),
    ]);
    // It can be accepted like any other candidate.
    const accepted = await ctx.dataModels.accept(projectId, generation.id, [candidate.id]);
    expect(accepted.items).toHaveLength(1);
  });
});
