import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  createTestContext,
  createUnauthorizedUser,
  createWorkspaceWithOwner,
  type TestContext,
} from './support/test-app';
import { CONTENT, approved, freezableDesign } from './support/construction-fixtures';

describe('Construction Design Gate integration', () => {
  let ctx: TestContext;
  let projectId: string;
  let otherProjectId: string;
  const http = () => request(ctx.app.getHttpServer());
  const auth = { Authorization: '' };

  beforeAll(async () => {
    ctx = await createTestContext();
    auth.Authorization = `Bearer ${ctx.token}`;
    const workspace = await createWorkspaceWithOwner(ctx, 'Design Gate');
    projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;
    otherProjectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Q' })).id;
  });
  afterAll(async () => ctx.close());

  it('creates generation plans and conceptual models with their own codes and audits approvals', async () => {
    const plan = await http()
      .post(`/projects/${projectId}/generation-plan`)
      .set(auth)
      .send({ title: 'Plan', content: CONTENT.GENERATION_PLAN })
      .expect(201);
    expect(plan.body).toMatchObject({ code: 'PG-001', kind: 'GENERATION_PLAN' });
    const model = await http()
      .post(`/projects/${projectId}/conceptual-domain-model`)
      .set(auth)
      .send({ title: 'Modelo', content: CONTENT.CONCEPTUAL_DOMAIN_MODEL })
      .expect(201);
    expect(model.body.code).toBe('MC-001');

    const transition = (status: string) =>
      http()
        .post(
          `/projects/${projectId}/generation-plan/${plan.body.id}/versions/${plan.body.version.id}/transition`,
        )
        .set(auth)
        .send({ status });
    await transition('IN_REVIEW').expect(201);
    await transition('APPROVED').expect(201);
    const events = await ctx.prisma.auditEvent.findMany({
      where: { entityId: plan.body.version.id },
    });
    expect(events).toEqual([
      expect.objectContaining({ action: 'GENERATION_PLAN_APPROVED', actorUserId: ctx.userId }),
    ]);

    // Structured construction artifacts are never created through the generic endpoint.
    await http()
      .post(`/projects/${projectId}/artifacts`)
      .set(auth)
      .send({ type: 'GENERATION_PLAN', title: 'Atajo' })
      .expect(422);
  });

  it('rejects a generation plan whose screens reference an unknown module', async () => {
    await http()
      .post(`/projects/${projectId}/generation-plan`)
      .set(auth)
      .send({
        title: 'Plan roto',
        content: {
          ...CONTENT.GENERATION_PLAN,
          screens: [{ name: 'X', purpose: 'Y', moduleLocalId: 'missing' }],
        },
      })
      .expect(400);
  });

  it('freezes exactly the approved design and audits the Design Gate approval', async () => {
    const versions = await freezableDesign(ctx, projectId);
    const res = await http()
      .post(`/projects/${projectId}/design-baselines`)
      .set(auth)
      .send({ label: 'Diseño v1', versions })
      .expect(201);
    expect(res.body).toMatchObject({ label: 'Diseño v1', approvedByUserId: ctx.userId });
    expect(res.body.entries.map((e: { role: string }) => e.role)).toEqual([
      'GENERATION_PLAN',
      'CONCEPTUAL_DOMAIN_MODEL',
      'NAVIGATION_TREE',
      'UI_BLUEPRINT',
      'DESIGN_THEME',
      'MOCKUP',
    ]);
    for (const entry of res.body.entries)
      expect(entry.artifactVersionId).toBe(versions[entry.role as keyof typeof versions]);
    expect(
      await ctx.prisma.auditEvent.count({
        where: { entityId: res.body.id, action: 'DESIGN_BASELINE_APPROVED' },
      }),
    ).toBe(1);

    const list = await http().get(`/projects/${projectId}/design-baselines`).set(auth).expect(200);
    expect(list.body.items.map((b: { id: string }) => b.id)).toContain(res.body.id);
  });

  it('refuses unapproved versions, a mockup from another blueprint and another project', async () => {
    const versions = await freezableDesign(ctx, projectId);
    const post = (overrides: Record<string, string>) =>
      http()
        .post(`/projects/${projectId}/design-baselines`)
        .set(auth)
        .send({ label: 'Intento', versions: { ...versions, ...overrides } });

    const draft = await ctx.structuredAnalysis.create(
      projectId,
      'GENERATION_PLAN',
      'Borrador',
      CONTENT.GENERATION_PLAN!,
    );
    const unapproved = await post({ GENERATION_PLAN: draft.version.id }).expect(422);
    expect(unapproved.body.message).toContain('Apruebe el plan de generación');

    const otherUi = await approved(ctx, projectId, 'UI_BLUEPRINT');
    const mismatch = await post({ UI_BLUEPRINT: otherUi.version.id }).expect(422);
    expect(mismatch.body.message).toContain('boceto');

    // Knowing the id of another project's approved plan is not enough.
    const foreignPlan = await approved(ctx, otherProjectId, 'GENERATION_PLAN');
    await post({ GENERATION_PLAN: foreignPlan.version.id }).expect(422);

    // A role must point at a version of its own type.
    await post({ CONCEPTUAL_DOMAIN_MODEL: versions.GENERATION_PLAN }).expect(422);
  });

  it('enforces baseline integrity and immutability in the database', async () => {
    const versions = await freezableDesign(ctx, projectId);
    const created = await http()
      .post(`/projects/${projectId}/design-baselines`)
      .set(auth)
      .send({ label: 'Congelado', versions })
      .expect(201);
    await expect(
      ctx.sql.query(`UPDATE design_baselines SET label = 'X' WHERE id = $1`, [created.body.id]),
    ).rejects.toThrow('immutable');
    await expect(
      ctx.sql.query(`DELETE FROM design_baseline_entries WHERE baseline_id = $1`, [
        created.body.id,
      ]),
    ).rejects.toThrow('immutable');

    const draft = await ctx.structuredAnalysis.create(
      projectId,
      'SOFTWARE_ARCHITECTURE',
      'Borrador',
      CONTENT.SOFTWARE_ARCHITECTURE!,
    );
    await expect(
      ctx.sql.query(
        `INSERT INTO design_baseline_entries (baseline_id, role, artifact_version_id)
         VALUES ($1, 'SOFTWARE_ARCHITECTURE', $2)`,
        [created.body.id, draft.version.id],
      ),
    ).rejects.toThrow('approved versions of the same project');
  });

  it('keeps plans and design baselines invisible to non-members', async () => {
    const intruder = await createUnauthorizedUser(ctx);
    for (const path of ['generation-plan', 'conceptual-domain-model', 'design-baselines'])
      await http()
        .get(`/projects/${projectId}/${path}`)
        .set('Authorization', `Bearer ${intruder.token}`)
        .expect(403);
  });
});
