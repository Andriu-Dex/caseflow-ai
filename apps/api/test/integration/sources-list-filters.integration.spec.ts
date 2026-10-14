import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestContext, createWorkspaceWithOwner, type TestContext } from './support/test-app';

// DEC-137: the Sources page filters and pages its list; without parameters
// the list stays complete for the other screens that rely on it.
describe('Sources list filters and paging', () => {
  let ctx: TestContext;
  let projectId: string;
  const http = () => request(ctx.app.getHttpServer());
  const auth = { Authorization: '' };
  const list = (query = '') =>
    http().get(`/projects/${projectId}/sources${query}`).set(auth).expect(200);
  const create = (pid: string, title: string, sourceKind = 'NOTES') =>
    ctx.sources.create(
      pid,
      { title, sourceKind: sourceKind as 'NOTES', purpose: 'p', description: 'Contenido.' },
      undefined,
    );

  beforeAll(async () => {
    ctx = await createTestContext();
    auth.Authorization = `Bearer ${ctx.token}`;
    const workspace = await createWorkspaceWithOwner(ctx, 'Filtros de fuentes');
    projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Fuentes' })).id;
    const interview = await create(projectId, 'Entrevista con la dueña');
    await ctx.sources.transition(projectId, interview.id, interview.version.id, 'IN_REVIEW');
    await ctx.sources.transition(projectId, interview.id, interview.version.id, 'APPROVED');
    await create(projectId, 'Menú del día');
    const old = await create(projectId, 'Notas antiguas');
    await ctx.sources.archive(projectId, old.id, ctx.userId);
    // Another project's sources never appear.
    const other = await ctx.projects.create({ workspaceId: workspace.id, name: 'Otro' });
    await create(other.id, 'Entrevista ajena');
  });
  afterAll(async () => ctx.close());

  it('returns every source of the project without parameters', async () => {
    const { body } = await list();
    expect(body.items.map((s: { code: string }) => s.code)).toEqual([
      'SRC-001',
      'SRC-002',
      'SRC-003',
    ]);
    expect(body).toMatchObject({ total: 3, counts: { ACTIVE: 2, ARCHIVED: 1, ALL: 3 } });
  });

  it('filters by archive status, version status and text, ignoring accents', async () => {
    const titles = async (query: string) =>
      (await list(query)).body.items.map((s: { source: { title: string } }) => s.source.title);
    expect(await titles('?status=ACTIVE')).toEqual(['Entrevista con la dueña', 'Menú del día']);
    expect(await titles('?status=ARCHIVED')).toEqual(['Notas antiguas']);
    expect(await titles('?versionStatus=APPROVED')).toEqual(['Entrevista con la dueña']);
    expect(await titles('?search=menu')).toEqual(['Menú del día']);
    expect(await titles('?search=src-003')).toEqual(['Notas antiguas']);
    expect(await titles('?status=ACTIVE&sort=TITLE')).toEqual([
      'Entrevista con la dueña',
      'Menú del día',
    ]);
  });

  it('pages the matching sources and reports their total', async () => {
    const first = await list('?limit=2&offset=0');
    expect(first.body.items).toHaveLength(2);
    expect(first.body.total).toBe(3);
    const second = await list('?limit=2&offset=2');
    expect(second.body.items.map((s: { code: string }) => s.code)).toEqual(['SRC-003']);
  });

  it('replaces the file in a new version of the same source, keeping the old one', async () => {
    const text = (content: string) => ({
      originalname: 'acta.txt',
      mimetype: 'text/plain',
      size: Buffer.byteLength(content),
      buffer: Buffer.from(content),
    });
    const created = await ctx.sources.create(
      projectId,
      { title: 'Acta de reunión', sourceKind: 'TEXT', purpose: 'p', description: 'Acta.' },
      text('Primera versión del acta.'),
    );
    await ctx.sources.transition(projectId, created.id, created.version.id, 'IN_REVIEW');
    await ctx.sources.transition(projectId, created.id, created.version.id, 'APPROVED');

    const replaced = await http()
      .post(`/projects/${projectId}/sources/${created.id}/file`)
      .set(auth)
      .attach('file', Buffer.from('Acta corregida con los acuerdos finales.'), {
        filename: 'acta-corregida.txt',
        contentType: 'text/plain',
      })
      .expect(201);
    expect(replaced.body).toMatchObject({
      code: created.code,
      version: { versionNumber: 2, status: 'DRAFT' },
      source: { originalFilename: 'acta-corregida.txt', hasExtractedText: true },
    });
    const [v1, v2] = await ctx.prisma.sourceDetail.findMany({
      where: { artifactVersion: { artifactId: created.id } },
      orderBy: { artifactVersion: { versionNumber: 'asc' } },
    });
    expect(v1!.extractedText).toBe('Primera versión del acta.');
    expect(v2!.extractedText).toBe('Acta corregida con los acuerdos finales.');
    expect(v2!.storageKey).not.toBe(v1!.storageKey);
    expect(
      await ctx.prisma.auditEvent.count({
        where: { projectId, entityId: created.id, action: 'SOURCE_FILE_REPLACED' },
      }),
    ).toBe(1);

    // A file of another kind, or an archived source, is refused.
    await expect(
      ctx.sources.replaceFile(projectId, created.id, {
        originalname: 'x.pdf',
        mimetype: 'application/pdf',
        size: 8,
        buffer: Buffer.from('%PDF-1.4'),
      }),
    ).rejects.toThrow();
    await ctx.sources.archive(projectId, created.id, ctx.userId);
    await expect(ctx.sources.replaceFile(projectId, created.id, text('Otra.'))).rejects.toThrow(
      'Restaure la fuente',
    );
  });

  it('rejects unknown filters', async () => {
    await http().get(`/projects/${projectId}/sources?status=GONE`).set(auth).expect(400);
    await http().get(`/projects/${projectId}/sources?limit=500`).set(auth).expect(400);
  });
});
