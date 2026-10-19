import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, createWorkspaceWithOwner, type TestContext } from './support/test-app';

const requirement = (name: string) => ({
  requirementType: 'FUNCTIONAL' as const,
  name,
  description: `Descripción ${name}`,
  priority: 'HIGH' as const,
  actors: ['Usuario'],
  preconditions: [],
  postconditions: [],
  dependencyArtifactIds: [],
  origin: { kind: 'USER_DECISION' as const, justification: 'Decisión del equipo.' },
});

describe('Artifact archive integration', () => {
  let ctx: TestContext;
  let projectId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    const w = await createWorkspaceWithOwner(ctx, 'Archive');
    projectId = (await ctx.projects.create({ workspaceId: w.id, name: 'Archive' })).id;
  });
  afterAll(async () => ctx.close());

  it('retires an approved requirement from lists and readiness without deleting history', async () => {
    const r = await ctx.requirements.create(projectId, requirement('Archivable'));
    await ctx.requirements.transition(projectId, r.id, r.version.id, 'IN_REVIEW');
    await ctx.requirements.transition(projectId, r.id, r.version.id, 'APPROVED');
    const before = await ctx.readiness.evaluate(projectId);
    expect(before.stages.find((s) => s.key === 'REQUIREMENTS')?.satisfied).toBe(true);

    const res = await request(ctx.app.getHttpServer())
      .post(`/projects/${projectId}/artifacts/${r.id}/archive`)
      .set('Authorization', `Bearer ${ctx.token}`);
    expect(res.status).toBe(201);

    expect((await ctx.requirements.list(projectId)).items.map((i) => i.id)).not.toContain(r.id);
    const after = await ctx.readiness.evaluate(projectId);
    expect(after.stages.find((s) => s.key === 'REQUIREMENTS')?.satisfied).toBe(false);
    expect(
      (await ctx.prisma.artifactVersion.findUniqueOrThrow({ where: { id: r.version.id } })).status,
    ).toBe('APPROVED');

    const again = await request(ctx.app.getHttpServer())
      .post(`/projects/${projectId}/artifacts/${r.id}/archive`)
      .set('Authorization', `Bearer ${ctx.token}`);
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
    const res = await request(ctx.app.getHttpServer())
      .post(`/projects/${projectId}/artifacts/${context.artifactId}/archive`)
      .set('Authorization', `Bearer ${ctx.token}`);
    expect(res.status).toBe(422);

    const w = await createWorkspaceWithOwner(ctx, 'Archive other');
    const other = (await ctx.projects.create({ workspaceId: w.id, name: 'Other' })).id;
    const r = await ctx.requirements.create(projectId, requirement('Ajeno'));
    const cross = await request(ctx.app.getHttpServer())
      .post(`/projects/${other}/artifacts/${r.id}/archive`)
      .set('Authorization', `Bearer ${ctx.token}`);
    expect(cross.status).toBe(404);
  });

  describe('restoring', () => {
    const http = () => request(ctx.app.getHttpServer());
    const auth = () => ({ Authorization: `Bearer ${ctx.token}` });
    const post = (path: string) =>
      http().post(`/projects/${projectId}/artifacts/${path}`).set(auth());
    const nav = async () => {
      const content = {
        nodes: [{ localId: 'home', label: 'Inicio', viewName: 'Inicio', kind: 'HOME' as const }],
      };
      const tree = await ctx.structuredAnalysis.create(
        projectId,
        'NAVIGATION_TREE',
        'Nav',
        content,
      );
      for (const status of ['IN_REVIEW', 'APPROVED'] as const)
        await ctx.structuredAnalysis.transition(
          projectId,
          'NAVIGATION_TREE',
          tree.id,
          tree.version.id,
          status,
        );
      return tree;
    };

    it('lists what was archived, restores it, audits both and counts as a change of its stage', async () => {
      const r = await ctx.requirements.create(projectId, requirement('Restaurable'));
      await ctx.requirements.transition(projectId, r.id, r.version.id, 'IN_REVIEW');
      await ctx.requirements.transition(projectId, r.id, r.version.id, 'APPROVED');
      expect((await post(`${r.id}/archive`)).status).toBe(201);

      const archived = await http()
        .get(`/projects/${projectId}/artifacts/archived?types=REQUIREMENT`)
        .set(auth());
      expect(archived.status).toBe(200);
      expect(archived.body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: r.id, type: 'REQUIREMENT', status: 'APPROVED' }),
        ]),
      );
      expect(
        (await http().get(`/projects/${projectId}/artifacts/archived?types=DATA_MODEL`).set(auth()))
          .body.items,
      ).toEqual([]);

      const restored = await post(`${r.id}/restore`);
      expect(restored.status).toBe(201);
      expect(restored.body).toEqual({ restored: true, warning: null });
      expect((await requirementsList()).includes(r.id)).toBe(true);
      const actions = (await ctx.prisma.auditEvent.findMany({ where: { entityId: r.id } })).map(
        (e) => e.action,
      );
      expect(actions).toEqual(expect.arrayContaining(['ARTIFACT_ARCHIVED', 'ARTIFACT_RESTORED']));
      const row = await ctx.prisma.artifact.findUniqueOrThrow({ where: { id: r.id } });
      expect(row).toMatchObject({ archivedAt: null });
      expect(row.archiveChangedAt).not.toBeNull();
    });

    const requirementsList = async () =>
      (await ctx.requirements.list(projectId)).items.map((i) => i.id);

    it('allows restoring next to another approved one of a type used once, with a warning', async () => {
      const first = await nav();
      expect((await post(`${first.id}/archive`)).status).toBe(201);
      const second = await nav();
      const restored = await post(`${first.id}/restore`);
      expect(restored.status).toBe(201);
      expect(restored.body.warning).toContain(second.code);
      expect((await ctx.structuredAnalysis.list(projectId, 'NAVIGATION_TREE')).items).toHaveLength(
        2,
      );
    });

    it('refuses to restore what is not archived and stays inside its project', async () => {
      const tree = await nav();
      expect((await post(`${tree.id}/restore`)).status).toBe(422);
      const w = await createWorkspaceWithOwner(ctx, 'Restore other');
      const other = (await ctx.projects.create({ workspaceId: w.id, name: 'Other' })).id;
      expect(
        (await http().post(`/projects/${other}/artifacts/${tree.id}/restore`).set(auth())).status,
      ).toBe(404);
      expect(
        (await http().get(`/projects/${other}/artifacts/archived`).set(auth())).body.items,
      ).toEqual([]);
    });
  });
});
