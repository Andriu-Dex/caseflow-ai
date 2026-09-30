import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  createTestContext,
  createWorkspaceWithOwner,
  createUnauthorizedUser,
  type TestContext,
} from './support/test-app';

describe('Cross-Project Authorization (Isolation)', () => {
  let ctx: TestContext;
  let projectId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    const workspace = await createWorkspaceWithOwner(ctx, 'Auth Workspace');
    const project = await ctx.projects.create({ workspaceId: workspace.id, name: 'Auth Project' });
    projectId = project.id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('rejects an unauthorized user trying to access project traceability', async () => {
    const intruder = await createUnauthorizedUser(ctx);
    await request(ctx.app.getHttpServer())
      .get(`/projects/${projectId}/traceability`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .expect(403);
  });

  it('rejects an unauthorized user trying to access Impact Analysis', async () => {
    const intruder = await createUnauthorizedUser(ctx);
    await request(ctx.app.getHttpServer())
      .get(`/projects/${projectId}/impact-analysis/dummy`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .expect(403);
  });

  it('rejects an unauthorized user trying to access Consistency Engine', async () => {
    const intruder = await createUnauthorizedUser(ctx);
    await request(ctx.app.getHttpServer())
      .get(`/projects/${projectId}/consistency`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .expect(403);
  });

  it('rejects an unauthorized user trying to access Baselines', async () => {
    const intruder = await createUnauthorizedUser(ctx);
    await request(ctx.app.getHttpServer())
      .get(`/projects/${projectId}/baselines`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .expect(403);
  });

  it('does not list workspaces or projects without the corresponding memberships', async () => {
    const intruder = await createUnauthorizedUser(ctx);
    const workspaceId = (await ctx.prisma.project.findUniqueOrThrow({ where: { id: projectId } }))
      .workspaceId;
    await ctx.prisma.workspaceMembership.create({
      data: { workspaceId, userId: intruder.id, role: 'MEMBER' },
    });

    const workspaces = await request(ctx.app.getHttpServer())
      .get('/workspaces')
      .set('Authorization', `Bearer ${intruder.token}`)
      .expect(200);
    const projects = await request(ctx.app.getHttpServer())
      .get('/projects')
      .query({ workspaceId })
      .set('Authorization', `Bearer ${intruder.token}`)
      .expect(200);

    expect(workspaces.body.items.map((item: { id: string }) => item.id)).toContain(workspaceId);
    expect(projects.body.items).toEqual([]);
  });
});
