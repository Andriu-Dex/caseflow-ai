import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  createTestContext,
  createUnauthorizedUser,
  createWorkspaceWithOwner,
  type TestContext,
} from './support/test-app';
import { CONTENT } from './support/construction-fixtures';

// Workflow routes and approval origins (DEC-116, ADR-001).
describe('Workflow routes integration', () => {
  let ctx: TestContext;
  let workspaceId: string;
  const http = () => request(ctx.app.getHttpServer());
  const auth = { Authorization: '' };

  beforeAll(async () => {
    ctx = await createTestContext();
    auth.Authorization = `Bearer ${ctx.token}`;
    workspaceId = (await createWorkspaceWithOwner(ctx, 'Rutas')).id;
  });
  afterAll(async () => ctx.close());

  const createProject = async (workflowRoute?: string) =>
    (
      await http()
        .post('/projects')
        .set(auth)
        .send({ workspaceId, name: `Ruta ${workflowRoute ?? 'por defecto'}`, workflowRoute })
        .expect(201)
    ).body as { id: string; workflowRoute: string };

  const draftNavigation = (projectId: string) =>
    ctx.structuredAnalysis.create(
      projectId,
      'NAVIGATION_TREE',
      'Navegación',
      CONTENT.NAVIGATION_TREE!,
    );

  it('creates FULL projects by default and records the chosen route', async () => {
    expect((await createProject()).workflowRoute).toBe('FULL');
    expect((await createProject('BUILD_ONLY')).workflowRoute).toBe('BUILD_ONLY');
  });

  it('only moves a route up, and audits every change', async () => {
    const project = await createProject('BUILD_ONLY');
    const upgrade = (workflowRoute: string) =>
      http().post(`/projects/${project.id}/workflow-route`).set(auth).send({ workflowRoute });

    const express = await upgrade('EXPRESS').expect(200);
    expect(express.body.workflowRoute).toBe('EXPRESS');
    const down = await upgrade('BUILD_ONLY').expect(422);
    expect(down.body.message).toContain('solo puede subir');
    await upgrade('EXPRESS').expect(422);
    await upgrade('FULL').expect(200);

    const events = await ctx.prisma.auditEvent.findMany({
      where: { projectId: project.id, action: 'PROJECT_WORKFLOW_ROUTE_CHANGED' },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((e) => e.metadata)).toEqual([
      { from: 'BUILD_ONLY', to: 'EXPRESS' },
      { from: 'EXPRESS', to: 'FULL' },
    ]);

    // The database refuses a downgrade even when the service is bypassed.
    await expect(
      ctx.sql.query(`UPDATE projects SET workflow_route = 'EXPRESS' WHERE id = $1`, [project.id]),
    ).rejects.toThrow('can only be upgraded');
  });

  it('records approvals as HUMAN and allows bulk or automatic ones only in their route', async () => {
    const full = await createProject('FULL');
    const human = await draftNavigation(full.id);
    await ctx.structuredAnalysis.transition(
      full.id,
      'NAVIGATION_TREE',
      human.id,
      human.version.id,
      'IN_REVIEW',
    );
    await ctx.structuredAnalysis.transition(
      full.id,
      'NAVIGATION_TREE',
      human.id,
      human.version.id,
      'APPROVED',
    );
    expect(
      (await ctx.prisma.artifactVersion.findUniqueOrThrow({ where: { id: human.version.id } }))
        .approvalOrigin,
    ).toBe('HUMAN');

    const approveAs = (versionId: string, origin: string) =>
      ctx.sql.query(
        `UPDATE artifact_versions SET status = 'APPROVED', approved_at = now(), approval_origin = $2 WHERE id = $1`,
        [versionId, origin],
      );
    await expect(
      approveAs((await draftNavigation(full.id)).version.id, 'AUTOMATIC'),
    ).rejects.toThrow('not allowed in the FULL workflow route');
    await expect(
      approveAs((await draftNavigation(full.id)).version.id, 'HUMAN_BULK'),
    ).rejects.toThrow('not allowed');

    const buildOnly = await createProject('BUILD_ONLY');
    const automatic = await draftNavigation(buildOnly.id);
    await approveAs(automatic.version.id, 'AUTOMATIC');
    // Once approved, the origin is frozen with the rest of the version, and
    // upgrading the route keeps it.
    await expect(
      ctx.sql.query(`UPDATE artifact_versions SET approval_origin = 'HUMAN' WHERE id = $1`, [
        automatic.version.id,
      ]),
    ).rejects.toThrow('immutable');
    await http()
      .post(`/projects/${buildOnly.id}/workflow-route`)
      .set(auth)
      .send({ workflowRoute: 'FULL' })
      .expect(200);
    expect(
      (await ctx.prisma.artifactVersion.findUniqueOrThrow({ where: { id: automatic.version.id } }))
        .approvalOrigin,
    ).toBe('AUTOMATIC');
  });

  it('never lets a non-member change a route', async () => {
    const project = await createProject('EXPRESS');
    const intruder = await createUnauthorizedUser(ctx);
    await http()
      .post(`/projects/${project.id}/workflow-route`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .send({ workflowRoute: 'FULL' })
      .expect(403);
  });
});
