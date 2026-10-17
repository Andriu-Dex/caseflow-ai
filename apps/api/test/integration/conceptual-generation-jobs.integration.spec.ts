import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { AIError, type AIProviderRequest } from '@caseflow-ai/ai';
import { createTestContext, createWorkspaceWithOwner, type TestContext } from './support/test-app';

// DEC-144: the conceptual model drawn in batches, class by class, in the background.
describe('Batched conceptual model generation jobs', () => {
  let ctx: TestContext;
  let projectId: string;
  let diagramVersionId = '';
  const seenTargets: string[][] = [];
  let failSecondCall = true;
  let omittedOnce = false;
  const http = () => request(ctx.app.getHttpServer());
  const start = (ids = [diagramVersionId]) =>
    http()
      .post(`/projects/${projectId}/conceptual-domain-model/generation-jobs`)
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
          const asked: { localId: string; name: string }[] = payload.targetClasses;
          seenTargets.push(asked.map((c) => c.localId));
          if (seenTargets.length === 2 && failSecondCall) {
            failSecondCall = false;
            throw new AIError('AI_PROVIDER_ERROR', 'Proveedor no disponible.');
          }
          // The first time the last batch is asked for, the model answers only
          // for its first class: the other has to be asked for again.
          let answered = asked;
          if (asked.some((c) => c.localId === 'c10') && asked.length > 1 && !omittedOnce) {
            omittedOnce = true;
            answered = asked.slice(0, 1);
          }
          return {
            provider: 'scripted',
            model: 'test',
            payload: {
              // No relationships: the ones of the class diagram are carried over.
              entities: answered.map((cls) => ({
                localId: `e-${cls.localId}`,
                name: cls.name,
                description: `Entidad ${cls.name}.`,
                classLocalId: cls.localId,
                attributes: [{ name: 'Identificador', required: true }],
              })),
              relationships: [],
            },
            usage: null,
            latencyMs: 1,
          };
        },
      },
    });
    const workspace = await createWorkspaceWithOwner(ctx, 'Conceptual por lotes');
    projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Registros' })).id;
    const classes = [
      ...Array.from({ length: 10 }, (_, i) => ({
        localId: `c${i + 1}`,
        name: `Clase ${i + 1}`,
        stereotype: 'ENTITY' as const,
        attributes: [
          { name: 'Identificador', type: 'UUID', required: true, visibility: 'PRIVATE' as const },
        ],
        methods: [],
      })),
      {
        localId: 'estado',
        name: 'Estado',
        stereotype: 'ENUMERATION' as const,
        attributes: [],
        methods: [],
      },
    ];
    const diagram = await ctx.structuredAnalysis.create(projectId, 'CLASS_DIAGRAM', 'Clases', {
      classes,
      relationships: [
        {
          fromLocalId: 'c1',
          toLocalId: 'c2',
          kind: 'ASSOCIATION',
          fromMultiplicity: '1',
          toMultiplicity: '*',
        },
        {
          fromLocalId: 'c10',
          toLocalId: 'c1',
          kind: 'ASSOCIATION',
          fromMultiplicity: '*',
          toMultiplicity: '1',
        },
        { fromLocalId: 'c1', toLocalId: 'estado', kind: 'DEPENDENCY' },
      ],
    });
    for (const status of ['IN_REVIEW', 'APPROVED'] as const)
      await ctx.structuredAnalysis.transition(
        projectId,
        'CLASS_DIAGRAM',
        diagram.id,
        diagram.version.id,
        status,
      );
    diagramVersionId = diagram.version.id;
  });
  afterAll(async () => ctx?.close());

  it('needs exactly one approved class diagram', async () => {
    const stranger = '00000000-0000-4000-8000-000000000000';
    expect((await start([stranger])).status).toBe(422);
    expect(await ctx.prisma.structuredGenerationJob.count({ where: { projectId } })).toBe(0);
  });

  it('keeps checkpoints after a failure, resumes, asks again for a skipped class and carries the relationships over', async () => {
    const failed = await start();
    expect(failed.status).toBe(202);
    expect(failed.body.kind).toBe('CONCEPTUAL_DOMAIN_MODEL');
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
    // Ten entity classes, eight per batch: the first batch was kept; the model
    // answered only for c9 of the second, so c10 was asked for again.
    expect(seenTargets.slice(calls)).toEqual([['c9', 'c10'], ['c10']]);

    const job = await ctx.prisma.structuredGenerationJob.findUniqueOrThrow({
      where: { id: resumed.body.id },
    });
    expect(job).toMatchObject({ completedBatches: 2, totalBatches: 2 });
    const generation = await ctx.structuredAnalysis.getGeneration(
      projectId,
      'CONCEPTUAL_DOMAIN_MODEL',
      job.generationId!,
    );
    const content = generation.candidates[0]!.content as {
      entities: { localId: string; classLocalId: string }[];
      relationships: { fromLocalId: string; toLocalId: string; cardinality: string }[];
    };
    expect(content.entities.map((e) => e.classLocalId)).toEqual(
      Array.from({ length: 10 }, (_, i) => `c${i + 1}`),
    );
    // The two class relationships between entities came over; the one to the
    // enumeration did not.
    expect(content.relationships).toEqual([
      expect.objectContaining({
        fromLocalId: 'e-c1',
        toLocalId: 'e-c2',
        cardinality: 'ONE_TO_MANY',
      }),
      expect.objectContaining({
        fromLocalId: 'e-c1',
        toLocalId: 'e-c10',
        cardinality: 'ONE_TO_MANY',
      }),
    ]);
    expect(generation.candidates[0]!.qualityFindings.filter((f) => f.severity === 'ERROR')).toEqual(
      [],
    );
  });
});
