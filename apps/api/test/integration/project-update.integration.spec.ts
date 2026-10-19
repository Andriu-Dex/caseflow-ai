import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  createTestContext,
  createUnauthorizedUser,
  createWorkspaceWithOwner,
  type TestContext,
} from './support/test-app';

describe('Project rename integration', () => {
  let ctx: TestContext;
  let workspaceId: string;
  const http = () => request(ctx.app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${ctx.token}` });

  beforeAll(async () => {
    ctx = await createTestContext();
    workspaceId = (await createWorkspaceWithOwner(ctx, 'Renombrar')).id;
  });
  afterAll(async () => ctx.close());

  it('renames a project, clears its description and audits the change', async () => {
    const project = await ctx.projects.create({
      workspaceId,
      name: 'Tienda',
      description: 'Ventas',
    });
    const updated = await http()
      .patch(`/projects/${project.id}`)
      .set(auth())
      .send({ name: '  Tienda Norte  ', description: '' })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'Tienda Norte', description: null });

    const events = await ctx.prisma.auditEvent.findMany({ where: { entityId: project.id } });
    expect(events).toContainEqual(
      expect.objectContaining({
        action: 'PROJECT_DETAILS_UPDATED',
        actorUserId: ctx.userId,
        metadata: {
          from: { name: 'Tienda', description: 'Ventas' },
          to: { name: 'Tienda Norte', description: null },
        },
      }),
    );
  });

  it('rejects an empty name and keeps other members out', async () => {
    const project = await ctx.projects.create({ workspaceId, name: 'Privado' });
    await http().patch(`/projects/${project.id}`).set(auth()).send({ name: '   ' }).expect(400);
    const intruder = await createUnauthorizedUser(ctx);
    await http()
      .patch(`/projects/${project.id}`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .send({ name: 'Ajeno' })
      .expect(403);
    expect((await ctx.projects.get(project.id)).name).toBe('Privado');
  });
});
