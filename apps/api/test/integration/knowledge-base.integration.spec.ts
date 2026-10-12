import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KnowledgeBaseService } from '../../src/knowledge-base/knowledge-base.service';
import { createTestContext, createWorkspace, type TestContext } from './support/test-app';

// DEC-127: approved sources are indexed by sections with a full-text search
// vector in the project's language, never mixing projects.
describe('Knowledge base indexing', () => {
  let ctx: TestContext;
  let kb: KnowledgeBaseService;

  beforeAll(async () => {
    ctx = await createTestContext();
    kb = ctx.app.get(KnowledgeBaseService);
  });
  afterAll(async () => ctx.close());

  async function approvedSource(projectId: string, text: string) {
    const source = await ctx.sources.create(
      projectId,
      { title: 'Especificación', sourceKind: 'TEXT', purpose: 'Requisitos', description: '' },
      {
        originalname: 'especificacion.md',
        mimetype: 'text/markdown',
        size: Buffer.byteLength(text),
        buffer: Buffer.from(text),
      },
    );
    await ctx.sources.transition(projectId, source.id, source.version.id, 'IN_REVIEW');
    await ctx.sources.transition(projectId, source.id, source.version.id, 'APPROVED');
    // Indexing on approval runs in the background; run it here to wait for it.
    await kb.indexSource(projectId, source.version.id);
    return source.version.id;
  }

  const fragments = (versionId: string) =>
    ctx.sql
      .query<{ section: string | null; content: string; search_vector: string }>(
        `SELECT section, content, search_vector::text FROM source_fragments
         WHERE source_version_id = $1 ORDER BY sequence`,
        [versionId],
      )
      .then((result) => result.rows);

  it('indexes an approved source by sections, findable in its language', async () => {
    const w = await createWorkspace(ctx.prisma, 'KB');
    const projectId = (await ctx.projects.create({ workspaceId: w.id, name: 'Pedidos' })).id;
    const versionId = await approvedSource(
      projectId,
      '# Pedidos\n\nEl cliente registra sus pedidos desde el teléfono.\n\n# Pagos\n\nSe paga al recibir.',
    );
    const rows = await fragments(versionId);
    expect(rows.map((r) => [r.section, r.content])).toEqual([
      ['Pedidos', 'El cliente registra sus pedidos desde el teléfono.'],
      ['Pagos', 'Se paga al recibir.'],
    ]);
    // Spanish stemming: "registrar pedido" finds "registra sus pedidos".
    const hits = await ctx.sql.query(
      `SELECT section FROM source_fragments
       WHERE source_version_id = $1 AND search_vector @@ websearch_to_tsquery('spanish', 'registrar pedido')`,
      [versionId],
    );
    expect(hits.rows).toEqual([{ section: 'Pedidos' }]);

    // Indexing again rebuilds the same fragments, never duplicates them.
    await kb.indexSource(projectId, versionId);
    expect(await fragments(versionId)).toHaveLength(2);
  });

  it("never indexes another project's source", async () => {
    const w = await createWorkspace(ctx.prisma, 'KB2');
    const projectId = (await ctx.projects.create({ workspaceId: w.id, name: 'A' })).id;
    const other = (await ctx.projects.create({ workspaceId: w.id, name: 'B' })).id;
    const versionId = await approvedSource(projectId, 'Texto del proyecto A.');
    await kb.indexSource(other, versionId);
    const owners = await ctx.sql.query(
      'SELECT DISTINCT project_id FROM source_fragments WHERE source_version_id = $1',
      [versionId],
    );
    expect(owners.rows).toEqual([{ project_id: projectId }]);
  });
});
