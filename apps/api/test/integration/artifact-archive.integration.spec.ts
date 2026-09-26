import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, createWorkspace, type TestContext } from './support/test-app';

const requirement = (name: string) => ({
  requirementType: 'FUNCTIONAL' as const,
  name,
  description: `Descripción ${name}`,
  priority: 'HIGH' as const,
  actors: ['Usuario'],
  preconditions: [],
  postconditions: [],
  dependencyArtifactIds: [],
});

describe('Artifact archive integration', () => {
  let ctx: TestContext;
  let projectId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    const w = await createWorkspace(ctx.prisma, 'Archive');
    projectId = (await ctx.projects.create({ workspaceId: w.id, name: 'Archive' })).id;
  });
  afterAll(async () => ctx.close());

  it('retires an approved requirement from lists and readiness without deleting history', async () => {
    const r = await ctx.requirements.create(projectId, requirement('Archivable'));
    await ctx.requirements.transition(projectId, r.id, r.version.id, 'IN_REVIEW');
    await ctx.requirements.transition(projectId, r.id, r.version.id, 'APPROVED');
    const before = await ctx.readiness.evaluate(projectId);
    expect(before.stages.find((s) => s.key === 'REQUIREMENTS')?.satisfied).toBe(true);

    const res = await request(ctx.app.getHttpServer()).post(
      `/projects/${projectId}/artifacts/${r.id}/archive`,
    );
    expect(res.status).toBe(201);

    expect((await ctx.requirements.list(projectId)).items.map((i) => i.id)).not.toContain(r.id);
    const after = await ctx.readiness.evaluate(projectId);
    expect(after.stages.find((s) => s.key === 'REQUIREMENTS')?.satisfied).toBe(false);
    expect(
      (await ctx.prisma.artifactVersion.findUniqueOrThrow({ where: { id: r.version.id } })).status,
    ).toBe('APPROVED');

    const again = await request(ctx.app.getHttpServer()).post(
      `/projects/${projectId}/artifacts/${r.id}/archive`,
    );
    expect(again.status).toBe(422);
  });

  it('refuses to archive the canonical Project Context and cross-project artifacts', async () => {
    const context = await ctx.projectContext.create(projectId, {
      problemStatement: 'Problema',
      objective: 'Objetivo',
      scopeItems: [],
      actors: [],
      needs: [],
      constraints: [],
      businessRules: [],
    });
    const res = await request(ctx.app.getHttpServer()).post(
      `/projects/${projectId}/artifacts/${context.artifactId}/archive`,
    );
    expect(res.status).toBe(422);

    const w = await createWorkspace(ctx.prisma, 'Archive other');
    const other = (await ctx.projects.create({ workspaceId: w.id, name: 'Other' })).id;
    const r = await ctx.requirements.create(projectId, requirement('Ajeno'));
    const cross = await request(ctx.app.getHttpServer()).post(
      `/projects/${other}/artifacts/${r.id}/archive`,
    );
    expect(cross.status).toBe(404);
  });
});
