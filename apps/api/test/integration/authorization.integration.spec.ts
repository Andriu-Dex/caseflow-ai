import { afterAll, beforeAll, describe, it } from 'vitest';
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
    // Auto-grant owner so regular tests pass
    await ctx.prisma.projectMembership.create({
      data: { projectId, userId: ctx.userId, role: 'OWNER' },
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('rejects an unauthorized user trying to access Knowledge Base', async () => {
    const intruder = await createUnauthorizedUser(ctx);
    await request(ctx.app.getHttpServer())
      .get(`/projects/${projectId}/knowledge-base?q=test`)
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
});
