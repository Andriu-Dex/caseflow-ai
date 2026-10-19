import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { AIError, type AIProviderRequest } from '@caseflow-ai/ai';
import { createTestContext, createWorkspaceWithOwner, type TestContext } from './support/test-app';

// DEC-144: the generation plan drawn in stages: outline, then modules in batches.
describe('Batched generation plan jobs', () => {
  let ctx: TestContext;
  let projectId: string;
  let requirementVersionId = '';
  let calls = 0;
  const detailTargets: string[][] = [];
  let failFirstDetail = true;
  let omittedOnce = false;
  const http = () => request(ctx.app.getHttpServer());
  const start = (ids = [requirementVersionId]) =>
    http()
      .post(`/projects/${projectId}/generation-plan/generation-jobs`)
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ sourceVersionIds: ids });
  const jobStatus = async (id: string) =>
    (await ctx.prisma.structuredGenerationJob.findUniqueOrThrow({ where: { id } })).status;

  beforeAll(async () => {
    ctx = await createTestContext({
      aiProvider: {
        id: 'scripted',
        generateStructured: async (input: AIProviderRequest) => {
          calls += 1;
          const payload = JSON.parse(input.messages[0]!.content);
          if (!payload.targetModules)
            return {
              provider: 'scripted',
              model: 'test',
              payload: {
                summary: 'Un sistema de registros.',
                modules: Array.from({ length: 7 }, (_, i) => ({
                  localId: `m${i + 1}`,
                  name: `Módulo ${i + 1}`,
                  purpose: 'Gestiona registros.',
                  // A requirement that does not exist: it must not fail the run.
                  relatedRequirementCodes: ['RF-001', 'RF-999'],
                  relatedSourceCodes: ['RF-001'],
                })),
                authentication: { required: true, roles: ['ADMIN'] },
              },
              usage: null,
              latencyMs: 1,
            };
          const asked: { localId: string; name: string }[] = payload.targetModules;
          detailTargets.push(asked.map((m) => m.localId));
          if (failFirstDetail) {
            failFirstDetail = false;
            throw new AIError('AI_PROVIDER_ERROR', 'Proveedor no disponible.');
          }
          // The first time the first batch is asked for, the model forgets m6.
          let answered = asked;
          if (asked.length > 1 && !omittedOnce) {
            omittedOnce = true;
            answered = asked.filter((m) => m.localId !== 'm6');
          }
          return {
            provider: 'scripted',
            model: 'test',
            payload: {
              workflows: answered.map((m) => ({
                localId: `f-${m.localId}`,
                name: `Flujo de ${m.name}`,
                steps: ['Abrir', 'Guardar'],
              })),
              screens: answered.map((m) => ({
                name: `Pantalla de ${m.name}`,
                moduleLocalId: m.localId,
                purpose: 'Trabaja con registros.',
                relatedSourceCodes: ['RF-001'],
              })),
            },
            usage: null,
            latencyMs: 1,
          };
        },
      },
    });
    const workspace = await createWorkspaceWithOwner(ctx, 'Plan por lotes');
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

  it('needs approved sources', async () => {
    const stranger = '00000000-0000-4000-8000-000000000000';
    expect((await start([stranger])).status).toBe(422);
    expect(await ctx.prisma.structuredGenerationJob.count({ where: { projectId } })).toBe(0);
  });

  it('keeps the outline after a failure, resumes and asks again for a module left without a screen', async () => {
    const failed = await start();
    expect(failed.status).toBe(202);
    expect(failed.body.kind).toBe('GENERATION_PLAN');
    await vi.waitFor(async () => expect(await jobStatus(failed.body.id)).toBe('FAILED'));
    expect(
      await ctx.prisma.structuredGenerationPart.count({ where: { jobId: failed.body.id } }),
    ).toBe(1);
    expect(await ctx.prisma.structuredAnalysisGeneration.count({ where: { projectId } })).toBe(0);

    const before = calls;
    const resumed = await start();
    await vi.waitFor(async () => expect(await jobStatus(resumed.body.id)).toBe('COMPLETED'), {
      timeout: 10000,
    });
    // The outline was kept (not asked for again). Seven modules, six per
    // batch; m6 was forgotten in the first answer and asked for again.
    expect(calls - before).toBe(3);
    expect(detailTargets.slice(1)).toEqual([['m1', 'm2', 'm3', 'm4', 'm5', 'm6'], ['m6'], ['m7']]);

    const job = await ctx.prisma.structuredGenerationJob.findUniqueOrThrow({
      where: { id: resumed.body.id },
    });
    expect(job).toMatchObject({ completedBatches: 3, totalBatches: 3 });
    const generation = await ctx.structuredAnalysis.getGeneration(
      projectId,
      'GENERATION_PLAN',
      job.generationId!,
    );
    const content = generation.candidates[0]!.content as {
      modules: { localId: string; relatedRequirementCodes: string[] }[];
      screens: { moduleLocalId: string }[];
      workflows: unknown[];
    };
    expect(content.modules).toHaveLength(7);
    expect(content.modules.every((m) => m.relatedRequirementCodes.join() === 'RF-001')).toBe(true);
    expect(content.screens.map((s) => s.moduleLocalId)).toEqual([
      'm1',
      'm2',
      'm3',
      'm4',
      'm5',
      'm6',
      'm7',
    ]);
    expect(content.workflows).toHaveLength(7);
    expect(generation.candidates[0]!.qualityFindings.filter((f) => f.severity === 'ERROR')).toEqual(
      [],
    );
  });
});
