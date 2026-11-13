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

  it('rejects contradictory retention while preserving approved history and project scope', async () => {
    const projectId = await newProject('Retención verificable');
    const requirement = await ctx.requirements.create(projectId, {
      requirementType: 'NON_FUNCTIONAL',
      name: 'Conservación de eventos',
      description: 'Conservar los eventos durante 365 días.',
      priority: 'HIGH',
      actors: [],
      preconditions: [],
      postconditions: [],
      dependencyArtifactIds: [],
      origin: { kind: 'USER_DECISION', justification: 'Política revisada del proyecto de prueba.' },
    });
    await ctx.requirements.transition(
      projectId,
      requirement.id,
      requirement.version.id,
      'IN_REVIEW',
    );
    await ctx.requirements.transition(
      projectId,
      requirement.id,
      requirement.version.id,
      'APPROVED',
    );
    const create = (days: number) => ({
      title: 'Arquitectura',
      content: {
        style: 'Modular monolith',
        components: [
          {
            localId: 'audit',
            name: 'Auditoría',
            responsibilities: [`Conservar los eventos durante ${days} días.`],
            relatedSourceCodes: [requirement.code],
          },
        ],
        dependencies: [],
        decisions: [],
      },
    });
    const original = await http()
      .post(`/projects/${projectId}/software-architecture`)
      .set(auth)
      .send(create(365))
      .expect(201);
    const transition = (versionId: string, status: string) =>
      http()
        .post(
          `/projects/${projectId}/software-architecture/${original.body.id}/versions/${versionId}/transition`,
        )
        .set(auth)
        .send({ status });
    await transition(original.body.version.id, 'IN_REVIEW').expect(201);
    await transition(original.body.version.id, 'APPROVED').expect(201);
    const changed = await http()
      .post(`/projects/${projectId}/software-architecture/${original.body.id}/versions`)
      .set(auth)
      .send(create(1))
      .expect(201);
    await transition(changed.body.version.id, 'IN_REVIEW').expect(201);
    const refused = await transition(changed.body.version.id, 'APPROVED').expect(422);
    expect(refused.body.message).toContain('inferior');
    expect(
      (
        await ctx.prisma.artifactVersion.findUniqueOrThrow({
          where: { id: original.body.version.id },
        })
      ).status,
    ).toBe('APPROVED');
    expect(
      (
        await ctx.prisma.artifactVersion.findUniqueOrThrow({
          where: { id: changed.body.version.id },
        })
      ).status,
    ).toBe('IN_REVIEW');
    const otherProject = await newProject('Política independiente');
    const otherRequirement = await ctx.requirements.create(otherProject, {
      requirementType: 'NON_FUNCTIONAL',
      name: 'Política propia',
      description: 'Conservar los eventos durante 1 día.',
      priority: 'HIGH',
      actors: [],
      preconditions: [],
      postconditions: [],
      dependencyArtifactIds: [],
      origin: {
        kind: 'USER_DECISION',
        justification: 'Política independiente de otro proyecto de prueba.',
      },
    });
    expect(otherRequirement.code).toBe(requirement.code);
    await ctx.requirements.transition(
      otherProject,
      otherRequirement.id,
      otherRequirement.version.id,
      'IN_REVIEW',
    );
    await ctx.requirements.transition(
      otherProject,
      otherRequirement.id,
      otherRequirement.version.id,
      'APPROVED',
    );
    const other = await http()
      .post(`/projects/${otherProject}/software-architecture`)
      .set(auth)
      .send(create(1))
      .expect(201);
    await http()
      .post(
        `/projects/${otherProject}/software-architecture/${other.body.id}/versions/${other.body.version.id}/transition`,
      )
      .set(auth)
      .send({ status: 'IN_REVIEW' })
      .expect(201);
    // Equal project-scoped codes never import another project's policy.
    await http()
      .post(
        `/projects/${otherProject}/software-architecture/${other.body.id}/versions/${other.body.version.id}/transition`,
      )
      .set(auth)
      .send({ status: 'APPROVED' })
      .expect(201);
  });

  it('counts the exact internal blueprint only after mockup approval and stops counting it after archival', async () => {
    const projectId = await newProject('Cobertura del boceto interno');
    await approved(ctx, projectId, 'NAVIGATION_TREE');
    const ui = await approved(ctx, projectId, 'UI_BLUEPRINT');
    await approved(ctx, projectId, 'DESIGN_THEME');
    const job = await ctx.mockups.create(projectId, ui.version.id);
    await ctx.mockups.runJob(job.id);
    const mockup = await ctx.mockups.get(
      projectId,
      (await ctx.mockups.getJob(projectId, job.id)).resultArtifactId!,
    );
    const report = async () =>
      (await http().get(`/projects/${projectId}/consistency`).set(auth).expect(200)).body
        .issues as { rule: string }[];
    expect((await report()).some((issue) => issue.rule === 'Mockup Association')).toBe(true);
    await ctx.mockups.transition(projectId, mockup.id, mockup.version.id, 'IN_REVIEW');
    await ctx.mockups.transition(projectId, mockup.id, mockup.version.id, 'APPROVED');
    expect((await report()).some((issue) => issue.rule === 'Mockup Association')).toBe(false);
    expect(
      (await ctx.readiness.evaluate(projectId)).stages.find((stage) => stage.key === 'MOCKUPS')
        ?.satisfied,
    ).toBe(true);
    await ctx.artifacts.archive(projectId, mockup.id, ctx.userId);
    expect((await report()).some((issue) => issue.rule === 'Mockup Association')).toBe(true);
    expect(
      (await ctx.readiness.evaluate(projectId)).stages.find((stage) => stage.key === 'MOCKUPS')
        ?.satisfied,
    ).toBe(false);
  });
});
