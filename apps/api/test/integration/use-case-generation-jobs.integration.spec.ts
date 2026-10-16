import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { AIError, type AIProviderRequest } from '@caseflow-ai/ai';
import { createTestContext, createWorkspaceWithOwner, type TestContext } from './support/test-app';

// DEC-139: use cases generated in batches, in the background, resumable.
describe('Batched use case generation jobs', () => {
  let ctx: TestContext;
  let projectId: string;
  const versionIds: string[] = [];
  const seenTargets: string[][] = [];
  const seenExisting: number[] = [];
  let failSecondBatch = true;
  const http = () => request(ctx.app.getHttpServer());
  const start = (ids = versionIds) =>
    http()
      .post(`/projects/${projectId}/use-cases/generation-jobs`)
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ requirementVersionIds: ids });
  const jobStatus = async (id: string) =>
    (await ctx.prisma.useCaseGenerationJob.findUniqueOrThrow({ where: { id } })).status;

  beforeAll(async () => {
    ctx = await createTestContext({
      aiProvider: {
        id: 'scripted',
        generateStructured: async (input: AIProviderRequest) => {
          const payload = JSON.parse(input.messages[0]!.content);
          const targets: string[] = payload.targetRequirementSources.map(
            (source: { sourceId: string }) => source.sourceId,
          );
          seenTargets.push(targets);
          seenExisting.push(payload.existingUseCases.length);
          if (seenTargets.length === 2 && failSecondBatch) {
            failSecondBatch = false;
            throw new AIError('AI_PROVIDER_ERROR', 'Proveedor no disponible.');
          }
          const earlier: { candidateId: string }[] = payload.existingUseCases;
          // The model cites the shared non-functional context too; it must not stick.
          const context: string[] = payload.contextRequirementSources.map(
            (source: { sourceId: string }) => source.sourceId,
          );
          return {
            provider: 'scripted',
            model: 'test',
            payload: {
              candidates: targets.map((code, index) => ({
                candidateId: `local-${index}`,
                name: `Procesar ${code}`,
                objective: `Completar ${code}`,
                primaryActor: 'Operador',
                mainFlow: [{ actor: 'Operador', action: `Solicita ${code}` }],
                relatedRequirementSourceIds: [code, ...context],
                // Every batch after the first relates its first proposal to the
                // very first one proposed.
                relations:
                  index === 0 && earlier.length
                    ? [{ kind: 'INCLUDE', targetCandidateId: earlier[0]!.candidateId }]
                    : [],
              })),
            },
            usage: null,
            latencyMs: 1,
          };
        },
      },
    });
    const workspace = await createWorkspaceWithOwner(ctx, 'Casos por lotes');
    projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Registros' })).id;
    for (let i = 1; i <= 14; i++) {
      const requirement = await ctx.requirements.create(projectId, {
        requirementType: 'FUNCTIONAL',
        name: `Capacidad ${i}`,
        description: `El sistema debe ofrecer la capacidad ${i}.`,
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
      versionIds.push(requirement.version.id);
    }
    // A non-functional requirement is shared context, never a target.
    const quality = await ctx.requirements.create(projectId, {
      requirementType: 'NON_FUNCTIONAL',
      name: 'Respuesta rápida',
      description: 'Las consultas responden en menos de dos segundos.',
      priority: 'MEDIUM',
      actors: [],
      preconditions: [],
      postconditions: [],
      dependencyArtifactIds: [],
      origin: { kind: 'USER_DECISION', justification: 'Decisión del equipo.' },
    });
    await ctx.requirements.transition(projectId, quality.id, quality.version.id, 'IN_REVIEW');
    await ctx.requirements.transition(projectId, quality.id, quality.version.id, 'APPROVED');
    versionIds.push(quality.version.id);
  });
  afterAll(async () => ctx?.close());

  it('accepts more than fifty requirements and validates the selection up front', async () => {
    const stranger = '00000000-0000-4000-8000-000000000000';
    expect((await start([stranger])).status).toBe(422);
    expect((await start([versionIds[0]!, versionIds[0]!])).status).toBe(400);
    expect(await ctx.prisma.useCaseGenerationJob.count({ where: { projectId } })).toBe(0);
  });

  it('keeps validated checkpoints after a failure and publishes nothing partial', async () => {
    const response = await start();
    expect(response.status).toBe(202);
    expect(response.body.requirementVersionIds).toEqual(versionIds);
    await vi.waitFor(async () => expect(await jobStatus(response.body.id)).toBe('FAILED'));
    expect(
      await ctx.prisma.useCaseGenerationPart.count({ where: { jobId: response.body.id } }),
    ).toBe(1);
    expect(await ctx.prisma.useCaseGeneration.count({ where: { projectId } })).toBe(0);
    expect(
      await ctx.prisma.artifact.count({ where: { projectId, artifactTypeCode: 'USE_CASE' } }),
    ).toBe(0);
  });

  it('resumes without repeating the finished batch and hands over every proposal', async () => {
    const calls = seenTargets.length;
    const response = await start();
    expect(response.status).toBe(202);
    await vi.waitFor(async () => expect(await jobStatus(response.body.id)).toBe('COMPLETED'), {
      timeout: 10000,
    });
    // 14 functional requirements, six per batch: 3 batches; the first was kept.
    const after = seenTargets.slice(calls);
    expect(after).toHaveLength(2);
    expect(after.flat()).not.toContain('RNF-001');
    expect(after[0]).toHaveLength(6);
    // The resumed batch sees the six proposals the checkpoint kept.
    expect(seenExisting[calls]).toBe(6);

    const job = await ctx.prisma.useCaseGenerationJob.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    expect(job).toMatchObject({ completedBatches: 3, totalBatches: 3 });
    const generation = await ctx.useCases.getGeneration(projectId, job.generationId!);
    expect(generation.candidates).toHaveLength(14);
    expect(generation.sources).toHaveLength(15);
    // Every proposal cites exactly the requirement it was made for.
    expect(generation.candidates.every((c) => c.sources.length === 1)).toBe(true);
    // A relation to a proposal of an earlier batch survives under its final id.
    const related = generation.candidates.filter((c) => (c.relations as unknown[]).length);
    expect(related.map((c) => c.candidateId)).toEqual(['B2-C1', 'B3-C1']);
    expect(related[0]!.relations).toEqual([{ kind: 'INCLUDE', targetCandidateId: 'B1-C1' }]);

    // More than twenty proposals can be accepted at once; relations come along.
    const accepted = await ctx.useCases.accept(
      projectId,
      generation.id,
      generation.candidates.map((c) => c.id),
    );
    expect(accepted.items).toHaveLength(14);
    expect(
      await ctx.prisma.useCaseRelation.count({
        where: { useCase: { artifactVersion: { projectId } } },
      }),
    ).toBe(2);
  });

  it('keeps jobs of one project away from another', async () => {
    const other = await ctx.projects.create({
      workspaceId: (await ctx.prisma.project.findUniqueOrThrow({ where: { id: projectId } }))
        .workspaceId,
      name: 'Otro proyecto',
    });
    const latest = await http()
      .get(`/projects/${other.id}/use-cases/generation-jobs/latest`)
      .set('Authorization', `Bearer ${ctx.token}`);
    expect(latest.body).toEqual({ job: null });
    const first = await ctx.prisma.useCaseGenerationJob.findFirstOrThrow({ where: { projectId } });
    expect(
      (
        await http()
          .get(`/projects/${other.id}/use-cases/generation-jobs/${first.id}`)
          .set('Authorization', `Bearer ${ctx.token}`)
      ).status,
    ).toBe(404);
    // Requirements of another project are not valid sources.
    const response = await http()
      .post(`/projects/${other.id}/use-cases/generation-jobs`)
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ requirementVersionIds: [versionIds[0]] });
    expect(response.status).toBe(422);
  });
});
