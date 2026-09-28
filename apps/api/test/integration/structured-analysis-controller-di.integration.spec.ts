import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestContext, createWorkspace, type TestContext } from './support/test-app';

// Regression test for a real DI bug: subclasses of BaseStructuredAnalysisController
// had no explicit constructor, so tsc never emitted design:paramtypes metadata for
// them and Nest injected `service` as undefined at runtime. Unlike the rest of this
// suite, these requests must go through the real Nest HTTP pipeline (not a directly
// constructed service) to actually exercise controller-level dependency injection.
describe('structured-analysis controllers: real HTTP dependency injection', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('GET /projects/:projectId/ui-blueprint does not crash with undefined service', async () => {
    const workspace = await createWorkspace(ctx.prisma);
    const project = await ctx.projects.create({ workspaceId: workspace.id, name: 'Smoke' });
    const res = await request(ctx.app.getHttpServer()).get(`/projects/${project.id}/ui-blueprint`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });

  it('GET /projects/:projectId/navigation does not crash with undefined service', async () => {
    const workspace = await createWorkspace(ctx.prisma);
    const project = await ctx.projects.create({ workspaceId: workspace.id, name: 'Smoke2' });
    const res = await request(ctx.app.getHttpServer()).get(`/projects/${project.id}/navigation`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });

  it('GET /projects/:projectId/software-architecture does not crash with undefined service', async () => {
    const workspace = await createWorkspace(ctx.prisma);
    const project = await ctx.projects.create({ workspaceId: workspace.id, name: 'Smoke3' });
    const res = await request(ctx.app.getHttpServer()).get(
      `/projects/${project.id}/software-architecture`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });

  it('GET /projects/:projectId/system-architecture does not crash with undefined service', async () => {
    const workspace = await createWorkspace(ctx.prisma);
    const project = await ctx.projects.create({ workspaceId: workspace.id, name: 'Smoke4' });
    const res = await request(ctx.app.getHttpServer()).get(
      `/projects/${project.id}/system-architecture`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });
});
