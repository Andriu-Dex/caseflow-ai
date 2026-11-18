import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, createWorkspaceWithOwner, type TestContext } from './support/test-app';

const BUILT_IN = 'builtin-acceso-usuarios-roles';

describe('Starting points (DEC-176)', () => {
  let ctx: TestContext;
  let workspaceId: string;
  let projectA: string;
  let projectB: string;
  let foreign: string;
  const http = () => request(ctx.app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${ctx.token}` });
  const base = (project: string) => `/projects/${project}/starting-points`;

  beforeAll(async () => {
    ctx = await createTestContext();
    workspaceId = (await createWorkspaceWithOwner(ctx, 'Puntos de partida')).id;
    projectA = (await ctx.projects.create({ workspaceId, name: 'Origen' })).id;
    projectB = (await ctx.projects.create({ workspaceId, name: 'Destino' })).id;
    const other = await createWorkspaceWithOwner(ctx, 'Otro espacio');
    foreign = (await ctx.projects.create({ workspaceId: other.id, name: 'Ajeno' })).id;
  });
  afterAll(async () => ctx.close());

  // Copying a starting point writes about fifteen artifacts.
  it(
    'offers the built-in starting point and copies it as linked drafts',
    { timeout: 30_000 },
    async () => {
      const list = await http().get(base(projectA)).set(auth()).expect(200);
      expect(list.body.items).toContainEqual(
        expect.objectContaining({
          id: BUILT_IN,
          builtIn: true,
          counts: { requirements: 7, useCases: 6, entities: 3 },
        }),
      );
      const applied = await http()
        .post(`${base(projectA)}/${BUILT_IN}/apply`)
        .set(auth())
        .expect(201);
      expect(applied.body).toEqual({ requirements: 7, useCases: 6, entities: 3 });

      const requirements = (await ctx.requirements.list(projectA)).items;
      expect(requirements).toHaveLength(7);
      expect(requirements.every((r) => r.version.status === 'DRAFT')).toBe(true);
      const signIn = requirements.find(
        (r) => r.requirement.name === 'Iniciar sesión con una cuenta individual',
      )!;
      const signOut = requirements.find((r) => r.requirement.name === 'Cerrar la sesión')!;
      expect(signOut.requirement.dependencyArtifactIds).toEqual([signIn.id]);
      expect(signIn.requirement.origin?.justification).toContain(
        'Tomado del punto de partida «Acceso, usuarios, roles y auditoría».',
      );
      const useCases = (await ctx.useCases.list(projectA)).items;
      expect(useCases).toHaveLength(6);
      expect(
        useCases.find((u) => u.useCase.name === 'Iniciar sesión')!.useCase
          .relatedRequirementVersionIds,
      ).toContain(signIn.version.id);
      expect((await ctx.dataModels.list(projectA)).items).toHaveLength(1);
    },
  );

  // Copying a starting point writes about fifteen artifacts.
  it(
    'saves the approved work of a project and copies it into another of the workspace',
    { timeout: 30_000 },
    async () => {
      const empty = await http().post(base(projectB)).set(auth()).send({ name: 'Vacío' });
      expect(empty.status).toBe(422);
      const requirements = (await ctx.requirements.list(projectA)).items;
      for (const r of requirements)
        for (const status of ['IN_REVIEW', 'APPROVED'] as const)
          await ctx.requirements.transition(projectA, r.id, r.version.id, status);
      const useCase = (await ctx.useCases.list(projectA)).items.find(
        (u) => u.useCase.name === 'Iniciar sesión',
      )!;
      for (const status of ['IN_REVIEW', 'APPROVED'] as const)
        await ctx.useCases.transition(projectA, useCase.id, useCase.version.id, status);

      const saved = await http()
        .post(base(projectA))
        .set(auth())
        .send({ name: 'Acceso de Origen', description: 'Lo aprobado en Origen.' })
        .expect(201);
      expect(saved.body).toMatchObject({
        builtIn: false,
        // Only what was approved: seven requirements and one use case.
        counts: { requirements: 7, useCases: 1, entities: 0 },
      });

      const applied = await http()
        .post(`${base(projectB)}/${saved.body.id}/apply`)
        .set(auth())
        .expect(201);
      expect(applied.body).toEqual({ requirements: 7, useCases: 1, entities: 0 });
      expect((await ctx.requirements.list(projectB)).items).toHaveLength(7);

      // Another workspace neither sees nor uses it.
      const foreignList = await http().get(base(foreign)).set(auth()).expect(200);
      expect(foreignList.body.items.map((i: { id: string }) => i.id)).not.toContain(saved.body.id);
      await http()
        .post(`${base(foreign)}/${saved.body.id}/apply`)
        .set(auth())
        .expect(404);

      await http()
        .delete(`${base(projectB)}/${BUILT_IN}`)
        .set(auth())
        .expect(403);
      await http()
        .delete(`${base(projectB)}/${saved.body.id}`)
        .set(auth())
        .expect(204);
      await http()
        .post(`${base(projectB)}/${saved.body.id}/apply`)
        .set(auth())
        .expect(404);
    },
  );

  it('lets only the roles that edit copy or save starting points', async () => {
    const viewer = await ctx.prisma.user.create({
      data: {
        email: `viewer-${Date.now()}@example.com`,
        passwordHash: 'x',
        displayName: 'Lectura',
      },
    });
    await ctx.prisma.projectMembership.create({
      data: { projectId: projectB, userId: viewer.id, role: 'VIEWER' },
    });
    const { StartingPointsService } =
      await import('../../src/starting-points/starting-points.service');
    const service = ctx.app.get(StartingPointsService);
    await expect(service.apply(projectB, viewer.id, BUILT_IN)).rejects.toThrow('No tiene permisos');
    await expect(service.save(projectB, viewer.id, { name: 'x', description: '' })).rejects.toThrow(
      'No tiene permisos',
    );
  });
});
