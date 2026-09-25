import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, createWorkspace, type TestContext } from './support/test-app';

describe('Sources: edit (new version) and delete', () => {
  let ctx: TestContext;
  let projectId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    const workspace = await createWorkspace(ctx.prisma, 'SourcesEditDelete');
    projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;
  });
  afterAll(async () => ctx.close());

  it('creates a source from typed content alone, with no file', async () => {
    const source = await ctx.sources.create(
      projectId,
      {
        title: 'Notas sin archivo',
        sourceKind: 'NOTES',
        purpose: 'Prueba de contenido sin archivo',
        description: 'Este es el contenido completo de la fuente.',
      },
      undefined,
    );
    expect(source).toMatchObject({
      version: { status: 'DRAFT' },
      source: {
        extractionState: 'MANUAL',
        hasExtractedText: true,
        originalFilename: null,
      },
    });
  });

  it('editing never mutates the current row — it creates the next version', async () => {
    const created = await ctx.sources.create(
      projectId,
      {
        title: 'v1',
        sourceKind: 'NOTES',
        purpose: 'Original',
        description: 'Contenido v1',
      },
      undefined,
    );
    expect(created.version.versionNumber).toBe(1);

    const edited = await ctx.sources.editMetadata(projectId, created.id, {
      title: 'v2',
      sourceKind: 'NOTES',
      purpose: 'Corregido',
      description: 'Contenido v2',
    });

    expect(edited.version.versionNumber).toBe(2);
    expect(edited.source.purpose).toBe('Corregido');

    const current = await ctx.sources.get(projectId, created.id);
    expect(current.version.versionNumber).toBe(2);
  });

  it('deletes a source that was never approved', async () => {
    const created = await ctx.sources.create(
      projectId,
      {
        title: 'Descartable',
        sourceKind: 'NOTES',
        purpose: 'Se va a borrar',
        description: 'Contenido.',
      },
      undefined,
    );

    await ctx.sources.delete(projectId, created.id);

    await expect(ctx.sources.get(projectId, created.id)).rejects.toThrow();
    const artifact = await ctx.prisma.artifact.findUnique({ where: { id: created.id } });
    expect(artifact).toBeNull();
  });

  it('refuses to delete a source that has an approved version', async () => {
    const created = await ctx.sources.create(
      projectId,
      {
        title: 'Aprobada',
        sourceKind: 'NOTES',
        purpose: 'No se puede borrar',
        description: 'Contenido.',
      },
      undefined,
    );
    await ctx.sources.transition(projectId, created.id, created.version.id, 'IN_REVIEW');
    await ctx.sources.transition(projectId, created.id, created.version.id, 'APPROVED');

    await expect(ctx.sources.delete(projectId, created.id)).rejects.toThrow('versiones aprobadas');
    await expect(ctx.sources.get(projectId, created.id)).resolves.toBeDefined();
  });

  it('rejects deleting a source that does not exist', async () => {
    await expect(
      ctx.sources.delete(projectId, '00000000-0000-4000-8000-000000000000'),
    ).rejects.toThrow('Fuente no encontrada.');
  });
});
