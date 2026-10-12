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

  it('finds the most relevant fragments of current approved sources, within a budget', async () => {
    const w = await createWorkspace(ctx.prisma, 'KB3');
    const projectId = (await ctx.projects.create({ workspaceId: w.id, name: 'Tienda' })).id;
    const other = (await ctx.projects.create({ workspaceId: w.id, name: 'Otra' })).id;
    await approvedSource(
      projectId,
      '# Pedidos\n\nEl cliente registra pedidos con su dirección de entrega.\n\n# Inventario\n\nEl stock se descuenta al confirmar.\n\n# Horarios\n\nLa tienda abre de lunes a sábado.',
    );
    // Another project's source with the same words is never read.
    await approvedSource(other, '# Pedidos\n\nEl cliente registra pedidos urgentes.');

    const hits = await kb.searchSources(projectId, 'registrar un pedido y descontar stock', 1_000);
    expect(hits.map((h) => h.section)).toEqual(['Pedidos', 'Inventario']);
    expect(hits.every((h) => h.sourceCode.startsWith('SRC-'))).toBe(true);
    expect(hits.some((h) => h.content.includes('urgentes'))).toBe(false);

    // A tight budget keeps only what fits, best first.
    expect((await kb.searchSources(projectId, 'registrar pedido stock', 30)).length).toBe(1);
  });

  it('ignores archived sources and versions replaced by a newer approved one', async () => {
    const w = await createWorkspace(ctx.prisma, 'KB4');
    const projectId = (await ctx.projects.create({ workspaceId: w.id, name: 'Versiones' })).id;
    const first = await approvedSource(projectId, '# Pagos\n\nSe paga en efectivo.');
    const firstSource = await ctx.prisma.artifactVersion.findUniqueOrThrow({
      where: { id: first },
    });
    const corrected = await ctx.sources.submitManualTranscript(
      projectId,
      firstSource.artifactId,
      '# Pagos\n\nSe paga con tarjeta.',
    );
    await ctx.sources.transition(projectId, corrected.id, corrected.version.id, 'IN_REVIEW');
    await ctx.sources.transition(projectId, corrected.id, corrected.version.id, 'APPROVED');
    await kb.indexSource(projectId, corrected.version.id);
    const archived = await approvedSource(projectId, '# Pagos\n\nSe paga con cheque.');
    const archivedSource = await ctx.prisma.artifactVersion.findUniqueOrThrow({
      where: { id: archived },
    });
    await ctx.sources.archive(projectId, archivedSource.artifactId);

    const hits = await kb.searchSources(projectId, 'pagos efectivo tarjeta cheque', 1_000);
    expect(hits.map((h) => h.content)).toEqual(['Se paga con tarjeta.']);
  });
});
