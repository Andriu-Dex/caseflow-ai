import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestContext, createWorkspaceWithOwner, type TestContext } from './support/test-app';

// DEC-138: one action over several use cases, all of them or none.
describe('Use case bulk actions', () => {
  let ctx: TestContext;
  let projectId: string;
  let workspaceId: string;
  let requirementVersionId: string;
  const http = () => request(ctx.app.getHttpServer());
  const auth = { Authorization: '' };
  const bulk = (action: string, useCaseIds: string[], pid = projectId) =>
    http().post(`/projects/${pid}/use-cases/bulk`).set(auth).send({ action, useCaseIds });
  const create = (name: string, relations: { kind: 'INCLUDE'; targetUseCaseId: string }[] = []) =>
    ctx.useCases.create(projectId, {
      name,
      objective: 'Completar el proceso',
      primaryActor: 'Usuario',
      secondaryActors: [],
      preconditions: ['Usuario autenticado'],
      postconditions: ['Operación registrada'],
      mainFlow: [
        { actor: 'Usuario', action: 'Solicita la operación' },
        { actor: 'Sistema', action: 'Registra la operación' },
      ],
      alternativeFlows: [
        {
          name: 'Datos inválidos',
          condition: 'La entrada es inválida',
          steps: [{ actor: 'Sistema', action: 'Informa el error' }],
        },
      ],
      relatedRequirementVersionIds: [requirementVersionId],
      relations,
    });

  beforeAll(async () => {
    ctx = await createTestContext();
    auth.Authorization = `Bearer ${ctx.token}`;
    workspaceId = (await createWorkspaceWithOwner(ctx, 'Casos de uso en bloque')).id;
    projectId = (await ctx.projects.create({ workspaceId, name: 'Casos' })).id;
    const requirement = await ctx.requirements.create(projectId, {
      requirementType: 'FUNCTIONAL',
      name: 'Registrar pedidos',
      description: 'El sistema debe registrar pedidos.',
      priority: 'MEDIUM',
      actors: ['Usuario'],
      preconditions: [],
      postconditions: [],
      dependencyArtifactIds: [],
      origin: { kind: 'USER_DECISION', justification: 'Decisión del equipo.' },
    });
    requirementVersionId = requirement.version.id;
  });
  afterAll(async () => ctx.close());

  it('approves the pending ones and skips those already approved', async () => {
    const a = await create('Registrar pedido');
    const b = await create('Consultar pedido');
    expect((await bulk('APPROVE', [a.id, b.id]).expect(200)).body).toEqual({
      affected: 2,
      skipped: 0,
    });
    const versions = await ctx.prisma.artifactVersion.findMany({
      where: { artifactId: { in: [a.id, b.id] } },
    });
    expect(versions.every((v) => v.status === 'APPROVED' && v.approvedAt)).toBe(true);
    expect((await bulk('APPROVE', [a.id, b.id]).expect(200)).body).toEqual({
      affected: 0,
      skipped: 2,
    });
    expect(
      await ctx.prisma.auditEvent.count({
        where: { projectId, action: 'USE_CASE_APPROVED', entityId: { in: [a.id, b.id] } },
      }),
    ).toBe(2);

    // An approved use case can only be archived, never deleted.
    const refused = await bulk('DELETE', [a.id]).expect(422);
    expect(refused.body.message).toContain('tuvo una versión aprobada');
    expect((await bulk('ARCHIVE', [a.id, b.id]).expect(200)).body).toEqual({
      affected: 2,
      skipped: 0,
    });
    expect(
      await ctx.prisma.artifact.count({ where: { id: { in: [a.id, b.id] }, archivedAt: null } }),
    ).toBe(0);
  });

  it('deletes only what nothing else includes, and all of them or none', async () => {
    const shared = await create('Autenticar usuario');
    const user = await create('Emitir comprobante', [
      { kind: 'INCLUDE', targetUseCaseId: shared.id },
    ]);
    const loose = await create('Exportar catálogo');

    // "shared" is included by a use case outside the batch: nothing is deleted.
    const refused = await bulk('DELETE', [shared.id, loose.id]).expect(422);
    expect(refused.body.message).toContain(`${shared.code} lo usa ${user.code}`);
    expect(await ctx.prisma.artifact.count({ where: { id: loose.id } })).toBe(1);

    // Deleting both ends of the relation together is fine.
    expect((await bulk('DELETE', [shared.id, user.id, loose.id]).expect(200)).body).toEqual({
      affected: 3,
      skipped: 0,
    });
    expect(
      await ctx.prisma.artifact.count({ where: { id: { in: [shared.id, user.id, loose.id] } } }),
    ).toBe(0);
    expect(
      await ctx.prisma.auditEvent.count({ where: { projectId, action: 'USE_CASE_DELETED' } }),
    ).toBe(3);
    // Their codes are never reused.
    const next = await create('Caso nuevo');
    expect(next.code).not.toBe(shared.code);
  });

  it('never touches another project', async () => {
    const other = await ctx.projects.create({ workspaceId, name: 'Otro proyecto' });
    const mine = await create('Caso propio');
    await bulk('ARCHIVE', [mine.id], other.id).expect(404);
    expect(
      (await ctx.prisma.artifact.findUniqueOrThrow({ where: { id: mine.id } })).archivedAt,
    ).toBeNull();
    await bulk('ARCHIVE', [mine.id, mine.id]).expect(400);
  });
});
