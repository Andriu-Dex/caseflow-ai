import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { AIError, type AIProviderRequest } from '@caseflow-ai/ai';
import { PrismaAIRunRecorder } from '../../src/ai/ai-run-recorder';
import { createTestContext, createWorkspaceWithOwner, type TestContext } from './support/test-app';

// DEC-142: the class diagram drawn in batches, in the background, resumable.
describe('Batched class diagram generation jobs', () => {
  let ctx: TestContext;
  let projectId: string;
  let workspaceId: string;
  let sourceIds: string[] = [];
  const seenTargets: string[][] = [];
  const seenExisting: number[] = [];
  let failSecondBatch = true;
  const http = () => request(ctx.app.getHttpServer());
  const base = () => `/projects/${projectId}/class-diagram/generation-jobs`;
  const start = (ids = sourceIds) =>
    http().post(base()).set('Authorization', `Bearer ${ctx.token}`).send({ sourceVersionIds: ids });
  const jobStatus = async (id: string) =>
    (await ctx.prisma.structuredGenerationJob.findUniqueOrThrow({ where: { id } })).status;

  beforeAll(async () => {
    ctx = await createTestContext({
      aiProvider: {
        id: 'scripted',
        generateStructured: async (input: AIProviderRequest) => {
          const payload = JSON.parse(input.messages[0]!.content);
          const targets: { name: string }[] = payload.targetEntities;
          seenTargets.push(targets.map((t) => t.name));
          seenExisting.push(payload.existingClasses.length);
          if (seenTargets.length === 2 && failSecondBatch) {
            failSecondBatch = false;
            throw new AIError('AI_PROVIDER_ERROR', 'Proveedor no disponible.');
          }
          const idOf = (entity: string) =>
            targets.some((t) => t.name === entity)
              ? `c-${entity}`
              : payload.existingClasses.find(
                  (c: { entityName?: string }) => c.entityName === entity,
                ).localId;
          return {
            provider: 'scripted',
            model: 'test',
            payload: {
              classes: [
                // Every attribute but the second one: the data model fills it in.
                ...(
                  payload.targetEntities as { name: string; attributes: { name: string }[] }[]
                ).map((entity) => ({
                  localId: `c-${entity.name}`,
                  name: entity.name,
                  stereotype: 'ENTITY',
                  dataModelEntityName: entity.name,
                  attributes: entity.attributes
                    .slice(0, 1)
                    .map((a) => ({ name: a.name, type: 'UUID' })),
                })),
                // The same support class in every batch: drawn once.
                { localId: 'estado', name: 'EstadoComun', stereotype: 'ENUMERATION' },
              ],
              relationships: (
                payload.dataModelRelationships as { from: string; to: string; label?: string }[]
              ).map((r) => ({
                fromLocalId: idOf(r.from),
                toLocalId: idOf(r.to),
                kind: 'ASSOCIATION',
                label: r.label,
              })),
            },
            usage: null,
            latencyMs: 1,
          };
        },
      },
    });
    const workspace = await createWorkspaceWithOwner(ctx, 'Clases por lotes');
    workspaceId = workspace.id;
    projectId = (await ctx.projects.create({ workspaceId, name: 'Registros' })).id;
    const entities = Array.from({ length: 10 }, (_, i) => ({
      localId: `e${i + 1}`,
      name: `Entidad ${i + 1}`,
      attributes: [
        { name: 'id', type: 'UUID' as const, required: true, primaryKey: true, unique: true },
        {
          name: 'nombre',
          type: 'STRING' as const,
          required: true,
          primaryKey: false,
          unique: false,
        },
      ],
    }));
    const model = await ctx.dataModels.create(projectId, {
      title: 'Modelo',
      modelKind: 'ER',
      entities,
      relationships: entities.slice(1).map((entity, i) => ({
        sourceEntityId: entities[i]!.localId,
        targetEntityId: entity.localId,
        name: 'se relaciona con',
        sourceCardinality: 'ONE' as const,
        targetCardinality: 'ZERO_OR_MORE' as const,
      })),
    });
    await ctx.dataModels.transition(projectId, model.id, model.version.id, 'IN_REVIEW');
    await ctx.dataModels.transition(projectId, model.id, model.version.id, 'APPROVED');
    const requirement = await ctx.requirements.create(projectId, {
      requirementType: 'FUNCTIONAL',
      name: 'Registrar',
      description: 'El sistema debe registrar.',
      priority: 'MEDIUM',
      actors: ['Operador'],
      preconditions: [],
      postconditions: [],
      dependencyArtifactIds: [],
      origin: { kind: 'USER_DECISION', justification: 'Decisión del equipo.' },
    });
    await ctx.requirements.transition(
      projectId,
      requirement.id,
      requirement.version.id,
      'IN_REVIEW',
    );
    await ctx.requirements.transition(
      projectId,
      requirement.id,
      requirement.version.id,
      'APPROVED',
    );
    sourceIds = [model.version.id, requirement.version.id];
  });
  afterAll(async () => ctx?.close());

  it('validates the selection up front: one approved data model is needed', async () => {
    expect((await start([sourceIds[1]!])).status).toBe(422);
    expect((await start(['00000000-0000-4000-8000-000000000000'])).status).toBe(422);
    expect(await ctx.prisma.structuredGenerationJob.count({ where: { projectId } })).toBe(0);
  });

  it('keeps validated checkpoints after a failure and publishes nothing partial', async () => {
    const response = await start();
    expect(response.status).toBe(202);
    expect(response.body.kind).toBe('CLASS_DIAGRAM');
    expect(response.body.sourceVersionIds).toEqual(sourceIds);
    await vi.waitFor(async () => expect(await jobStatus(response.body.id)).toBe('FAILED'));
    expect(
      await ctx.prisma.structuredGenerationPart.count({ where: { jobId: response.body.id } }),
    ).toBe(1);
    expect(await ctx.prisma.structuredAnalysisGeneration.count({ where: { projectId } })).toBe(0);
  });

  it('resumes without drawing the first batch again, and completes what the model left out', async () => {
    const calls = seenTargets.length;
    const response = await start();
    expect(response.status).toBe(202);
    await vi.waitFor(async () => expect(await jobStatus(response.body.id)).toBe('COMPLETED'), {
      timeout: 10000,
    });
    // 10 entities, eight per batch: 2 batches; the first was kept.
    expect(seenTargets.slice(calls)).toHaveLength(1);
    expect(seenTargets[calls]).toEqual(['Entidad 9', 'Entidad 10']);
    // The resumed batch sees what the checkpoint kept: eight entities and the enumeration.
    expect(seenExisting[calls]).toBe(9);

    const job = await ctx.prisma.structuredGenerationJob.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    expect(job).toMatchObject({ completedBatches: 2, totalBatches: 2 });
    const generation = await ctx.structuredAnalysis.getGeneration(
      projectId,
      'CLASS_DIAGRAM',
      job.generationId!,
    );
    expect(generation.candidates).toHaveLength(1);
    const content = generation.candidates[0]!.content as {
      classes: { name: string; stereotype: string; attributes: { name: string }[] }[];
      relationships: { fromLocalId: string; toLocalId: string }[];
    };
    // 10 entity classes and the support class once, not once per batch.
    expect(content.classes).toHaveLength(11);
    expect(content.classes.filter((c) => c.name === 'EstadoComun')).toHaveLength(1);
    // The model drew only the first attribute; the data model gave back the rest.
    for (const entity of content.classes.filter((c) => c.stereotype === 'ENTITY'))
      expect(entity.attributes.map((a) => a.name)).toEqual(['id', 'nombre']);
    // One relationship per pair, across the batches too (Entidad 8 — Entidad 9).
    expect(content.relationships).toHaveLength(9);
    // Nothing the model produced is a coverage gap.
    expect(generation.candidates[0]!.qualityFindings.filter((f) => f.severity === 'ERROR')).toEqual(
      [],
    );
  });

  it('keeps jobs of one project away from another', async () => {
    const other = await ctx.projects.create({ workspaceId, name: 'Otro proyecto' });
    const latest = await http()
      .get(`/projects/${other.id}/class-diagram/generation-jobs/latest`)
      .set('Authorization', `Bearer ${ctx.token}`);
    expect(latest.body).toEqual({ job: null });
    const first = await ctx.prisma.structuredGenerationJob.findFirstOrThrow({
      where: { projectId },
    });
    expect(
      (
        await http()
          .get(`/projects/${other.id}/class-diagram/generation-jobs/${first.id}`)
          .set('Authorization', `Bearer ${ctx.token}`)
      ).status,
    ).toBe(404);
    // Sources of another project are not valid.
    const response = await http()
      .post(`/projects/${other.id}/class-diagram/generation-jobs`)
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ sourceVersionIds: sourceIds });
    expect(response.status).toBe(422);
  });

  it('closes an AI run left running by a restart', async () => {
    const run = await ctx.prisma.aIRun.create({
      data: {
        projectId,
        provider: 'scripted',
        capability: 'STRUCTURED_OUTPUT',
        purpose: 'class_diagram_generation',
        promptKey: 'class-diagram.generate',
        promptVersion: 3,
        status: 'RUNNING',
        inputHash: 'a'.repeat(64),
      },
    });
    await new PrismaAIRunRecorder(ctx.prisma).onApplicationBootstrap();
    expect(await ctx.prisma.aIRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({
      status: 'FAILED',
      errorCode: 'AI_PROVIDER_ERROR',
    });
  });
});
