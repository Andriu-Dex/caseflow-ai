import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestContext, createWorkspaceWithOwner, type TestContext } from './support/test-app';

// DEC-138: one action over several requirements, all of them or none.
describe('Requirement bulk actions', () => {
  let ctx: TestContext;
  let projectId: string;
  let workspaceId: string;
  const http = () => request(ctx.app.getHttpServer());
  const auth = { Authorization: '' };
  const bulk = (action: string, requirementIds: string[], pid = projectId) =>
    http().post(`/projects/${pid}/requirements/bulk`).set(auth).send({ action, requirementIds });
  const create = (name: string, dependencyArtifactIds: string[] = []) =>
    ctx.requirements.create(projectId, {
      requirementType: 'FUNCTIONAL',
      name,
      description: `El sistema debe ${name.toLowerCase()}.`,
      priority: 'MEDIUM',
      actors: ['Usuario'],
      preconditions: [],
      postconditions: [],
      dependencyArtifactIds,
      origin: { kind: 'USER_DECISION', justification: 'Decisión del equipo.' },
    });

  beforeAll(async () => {
    ctx = await createTestContext();
    auth.Authorization = `Bearer ${ctx.token}`;
    workspaceId = (await createWorkspaceWithOwner(ctx, 'Acciones en bloque')).id;
    projectId = (await ctx.projects.create({ workspaceId, name: 'Requisitos' })).id;
  });
  afterAll(async () => ctx.close());

  it('approves the pending ones and skips those already approved', async () => {
    const a = await create('Registrar pedidos');
    const b = await create('Consultar pedidos');
    const first = await bulk('APPROVE', [a.id, b.id]).expect(200);
    expect(first.body).toEqual({ affected: 2, skipped: 0 });
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
        where: { projectId, action: 'REQUIREMENT_APPROVED', entityId: { in: [a.id, b.id] } },
      }),
    ).toBe(2);

    // An approved requirement can only be archived, never deleted.
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

  it('deletes only what nothing else uses, and all of them or none', async () => {
    const base = await create('Gestionar catálogo');
    const dependent = await create('Publicar catálogo', [base.id]);
    const loose = await create('Exportar catálogo');

    // "base" is needed by a requirement outside the batch: nothing is deleted.
    const refused = await bulk('DELETE', [base.id, loose.id]).expect(422);
    expect(refused.body.message).toContain(`${base.code} es dependencia de ${dependent.code}`);
    expect(await ctx.prisma.artifact.count({ where: { id: loose.id } })).toBe(1);

    // Deleting both ends of the dependency together is fine.
    expect((await bulk('DELETE', [base.id, dependent.id, loose.id]).expect(200)).body).toEqual({
      affected: 3,
      skipped: 0,
    });
    expect(
      await ctx.prisma.artifact.count({ where: { id: { in: [base.id, dependent.id, loose.id] } } }),
    ).toBe(0);
    expect(
      await ctx.prisma.auditEvent.count({ where: { projectId, action: 'REQUIREMENT_DELETED' } }),
    ).toBe(3);
    // Their codes are never reused.
    const next = await create('Requisito nuevo');
    expect(next.code).not.toBe(base.code);
  });

  it('never touches another project', async () => {
    const other = await ctx.projects.create({ workspaceId, name: 'Otro proyecto' });
    const mine = await create('Requisito propio');
    await bulk('ARCHIVE', [mine.id], other.id).expect(404);
    expect(
      (await ctx.prisma.artifact.findUniqueOrThrow({ where: { id: mine.id } })).archivedAt,
    ).toBeNull();
    await bulk('ARCHIVE', [mine.id, mine.id]).expect(400);
  });
});
