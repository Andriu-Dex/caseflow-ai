import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  createTestContext,
  createUnauthorizedUser,
  createWorkspaceWithOwner,
  type TestContext,
} from './support/test-app';
import { approved } from './support/construction-fixtures';

// Mandatory coherence between stages (DEC-121, ADR-006): approval gate and
// coherence matrix.
describe('Coherence integration', () => {
  let ctx: TestContext;
  let workspaceId: string;
  const http = () => request(ctx.app.getHttpServer());
  const auth = { Authorization: '' };
  const newProject = async (name: string) => (await ctx.projects.create({ workspaceId, name })).id;

  beforeAll(async () => {
    ctx = await createTestContext();
    auth.Authorization = `Bearer ${ctx.token}`;
    workspaceId = (await createWorkspaceWithOwner(ctx, 'Coherencia')).id;
  });
  afterAll(async () => ctx.close());

  // A blueprint whose only screen forgets the approved navigation node.
  async function uncoveredBlueprint(projectId: string) {
    await approved(ctx, projectId, 'NAVIGATION_TREE');
    const created = await http()
      .post(`/projects/${projectId}/ui-blueprint`)
      .set(auth)
      .send({
        title: 'Plano',
        content: { screens: [{ localId: 'other', name: 'Otra', purpose: 'Ver' }] },
      })
      .expect(201);
    const transition = (status: string) =>
      http()
        .post(
          `/projects/${projectId}/ui-blueprint/${created.body.id}/versions/${created.body.version.id}/transition`,
        )
        .set(auth)
        .send({ status });
    await transition('IN_REVIEW').expect(201);
    return transition('APPROVED');
  }

  it('refuses to approve an artifact with coverage gaps in new projects', async () => {
    const projectId = await newProject('Nuevo');
    const refused = await uncoveredBlueprint(projectId);
    expect(refused.status).toBe(422);
    expect(refused.body.message).toContain(
      'El nodo de navegación «Inicio» no tiene una pantalla en el plano de interfaz.',
    );
    expect(refused.body.message).toContain('Revise la matriz de coherencia.');
  });

  it('lets older projects approve and lists the gaps as warnings in the matrix', async () => {
    const projectId = await newProject('Anterior');
    await ctx.prisma.project.update({
      where: { id: projectId },
      data: { coherenceRequired: false },
    });
    expect((await uncoveredBlueprint(projectId)).status).toBe(201);

    const report = await http().get(`/projects/${projectId}/consistency`).set(auth).expect(200);
    expect(report.body.coherenceRequired).toBe(false);
    expect(report.body.issues).toContainEqual(
      expect.objectContaining({
        severity: 'WARNING',
        chain: 'NAVIGATION_SCREEN_ROUTE',
        artifactType: 'UI_BLUEPRINT',
        message: 'El nodo de navegación «Inicio» no tiene una pantalla en el plano de interfaz.',
      }),
    );
  });

  it('keeps the matrix invisible to non-members', async () => {
    const projectId = await newProject('Privado');
    const intruder = await createUnauthorizedUser(ctx);
    await http()
      .get(`/projects/${projectId}/consistency`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .expect(403);
  });
});
