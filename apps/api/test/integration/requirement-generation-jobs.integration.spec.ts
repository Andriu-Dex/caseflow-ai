import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { AIError, type AIProviderRequest } from '@caseflow-ai/ai';
import { createTestContext, createWorkspaceWithOwner, type TestContext } from './support/test-app';

describe('Batched requirement generation jobs', () => {
  let ctx: TestContext;
  let projectId: string;
  let contextId: string;
  const seenTargets: string[][] = [];
  let failSecondBatch = true;
  beforeAll(async () => {
    ctx = await createTestContext({
      aiProvider: {
        id: 'scripted',
        generateStructured: async (input: AIProviderRequest) => {
          const payload = JSON.parse(
            input.messages[0]!.content.split('\n\nFragmentos relevantes')[0]!,
          );
          let output: unknown;
          if (input.schemaName === 'requirements_dependencies') {
            const candidates = payload.candidates;
            output = {
              dependencies: [
                {
                  candidateId: candidates.at(-1).candidateId,
                  dependsOnCandidateId: candidates[0].candidateId,
                },
              ],
            };
          } else {
            expect(payload.context.needs).toHaveLength(25);
            expect(payload.context.businessRules).toHaveLength(1);
            expect(payload.context.constraints).toHaveLength(1);
            const target: string[] = payload.targetContextItemCodes;
            seenTargets.push(target);
            if (target.includes('N-9') && failSecondBatch) {
              failSecondBatch = false;
              throw new AIError('AI_RATE_LIMITED', 'Temporary quota limit');
            }
            const previous = payload.existingCandidates[0]?.candidateId;
            output = {
              candidates: target
                .filter((code) => !code.startsWith('RN-'))
                .map((code) => ({
                  candidateId: code,
                  requirementType: code.startsWith('RES-') ? 'NON_FUNCTIONAL' : 'FUNCTIONAL',
                  name: `Support ${code}`,
                  description: `The system must support capability ${code}.`,
                  priority: 'HIGH',
                  actors: ['Operator'],
                  preconditions: [],
                  postconditions: ['Operation recorded'],
                  contextItemCodes: [code],
                  dependencyCandidateIds: previous ? [previous] : [],
                })),
              suggestions: [],
              coverageUpdates: target
                .filter((code) => code.startsWith('RN-'))
                .map((code) => ({
                  candidateId: previous,
                  contextItemCodes: [code],
                  description:
                    'The system records capability N-1 and preserves its original history.',
                })),
            };
          }
          return {
            provider: 'scripted',
            model: 'test',
            payload: output,
            usage: null,
            latencyMs: 1,
          };
        },
      },
    });
    const workspace = await createWorkspaceWithOwner(ctx, 'Batch isolation');
    projectId = (
      await ctx.projects.create({ workspaceId: workspace.id, name: 'Record management' })
    ).id;
    const source = await ctx.sources.create(
      projectId,
      {
        title: 'Workflow notes',
        sourceKind: 'TEXT',
        purpose: 'Business capabilities',
        description: 'Operators record data and preserve history.',
      },
      undefined,
    );
    await ctx.sources.transition(projectId, source.id, source.version.id, 'IN_REVIEW');
    await ctx.sources.transition(projectId, source.id, source.version.id, 'APPROVED');
    const context = await ctx.projectContext.create(projectId, {
      problemStatement: 'Manual records',
      objective: 'Centralize records',
      actors: [{ name: 'Operator' }],
      scopeItems: [],
      needs: Array.from({ length: 25 }, (_, i) => ({ description: `Capability ${i + 1}` })),
      businessRules: [{ description: 'Keep the original history' }],
      constraints: [{ description: 'Accessible interface' }],
      sourceVersionIds: [source.version.id],
    });
    await ctx.projectContext.transition(projectId, context.version.id, 'IN_REVIEW');
    await ctx.projectContext.transition(projectId, context.version.id, 'APPROVED');
    contextId = context.version.id;
  });
  afterAll(async () => ctx?.close());
  const start = () =>
    request(ctx.app.getHttpServer())
      .post(`/projects/${projectId}/requirements/generation-jobs`)
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ sourceContextVersionId: contextId });
  it('keeps validated checkpoints after a failure and publishes no partial artifacts', async () => {
    const response = await start();
    expect(response.status).toBe(202);
    await vi.waitFor(async () =>
      expect(
        (
          await ctx.prisma.requirementGenerationJob.findUniqueOrThrow({
            where: { id: response.body.id },
          })
        ).status,
      ).toBe('FAILED'),
    );
    expect(
      await ctx.prisma.requirementGenerationPart.count({ where: { jobId: response.body.id } }),
    ).toBe(1);
    expect(await ctx.prisma.requirementGeneration.count({ where: { projectId } })).toBe(0);
    expect(seenTargets.filter((codes) => codes.includes('N-9'))).toHaveLength(1);
    expect(
      await ctx.prisma.artifact.count({ where: { projectId, artifactTypeCode: 'REQUIREMENT' } }),
    ).toBe(0);
  });
  it('resumes without regenerating the first batch, covers the context and accepts more than twenty', async () => {
    const response = await start();
    expect(response.status).toBe(202);
    await vi.waitFor(
      async () =>
        expect(
          (
            await ctx.prisma.requirementGenerationJob.findUniqueOrThrow({
              where: { id: response.body.id },
            })
          ).status,
        ).toBe('COMPLETED'),
      { timeout: 10000 },
    );
    expect(seenTargets.filter((codes) => codes.includes('N-1'))).toHaveLength(1);
    const job = await ctx.prisma.requirementGenerationJob.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    expect(job.completedBatches).toBe(job.totalBatches);
    const generation = await ctx.requirements.getGeneration(projectId, job.generationId!);
    expect(generation.candidates).toHaveLength(26);
    expect(
      generation.coverage.filter((item) => item.mandatory && item.coveredBy.length === 0),
    ).toEqual([]);
    expect(generation.candidates.at(-1)!.outgoingDependencies).not.toHaveLength(0);
    const ids = generation.candidates.map((candidate) => candidate.id);
    const accepted = await request(ctx.app.getHttpServer())
      .post(`/projects/${projectId}/requirements/generations/${generation.id}/accept`)
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ candidateIds: ids });
    expect(accepted.status).toBe(201);
    expect(accepted.body.items).toHaveLength(26);
    expect(
      accepted.body.items.every(
        (item: { version: { status: string } }) => item.version.status === 'GENERATED',
      ),
    ).toBe(true);
    expect(
      await ctx.prisma.auditEvent.count({
        where: { projectId, action: 'REQUIREMENT_GENERATION_FINISHED' },
      }),
    ).toBe(2);
    const original = await ctx.prisma.artifactVersion.findUniqueOrThrow({
      where: { id: contextId },
    });
    expect(original.status).toBe('APPROVED');
  });
  it('isolates jobs, rejects foreign context and prevents viewer generation', async () => {
    const workspace = await createWorkspaceWithOwner(ctx, 'Other batch project');
    const other = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Other records' }))
      .id;
    const job = await ctx.prisma.requirementGenerationJob.findFirstOrThrow({
      where: { projectId },
    });
    const read = await request(ctx.app.getHttpServer())
      .get(`/projects/${other}/requirements/generation-jobs/${job.id}`)
      .set('Authorization', `Bearer ${ctx.token}`);
    expect(read.status).toBe(404);
    const foreign = await request(ctx.app.getHttpServer())
      .post(`/projects/${other}/requirements/generation-jobs`)
      .set('Authorization', `Bearer ${ctx.token}`)
      .send({ sourceContextVersionId: contextId });
    expect(foreign.status).toBe(422);
    await ctx.prisma.projectMembership.updateMany({
      where: { projectId, userId: ctx.userId },
      data: { role: 'VIEWER' },
    });
    expect((await start()).status).toBe(403);
    await ctx.prisma.projectMembership.updateMany({
      where: { projectId, userId: ctx.userId },
      data: { role: 'OWNER' },
    });
  });
});
