import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, createWorkspace, type TestContext } from './support/test-app';

describe('Project persistence', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('persists a project with generated id and timestamps, owned by its workspace', async () => {
    const workspace = await createWorkspace(ctx.prisma);

    const project = await ctx.projects.create({
      workspaceId: workspace.id,
      name: 'Sistema de prueba',
      description: 'Contexto inicial',
    });

    expect(project.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(project.workspaceId).toBe(workspace.id);
    expect(project.name).toBe('Sistema de prueba');
    expect(project.description).toBe('Contexto inicial');
    expect(Date.parse(project.createdAt)).not.toBeNaN();
    expect(Date.parse(project.updatedAt)).not.toBeNaN();

    await expect(ctx.projects.get(project.id)).resolves.toEqual(project);
  });

  it('requires an existing workspace', async () => {
    await expect(
      ctx.projects.create({
        workspaceId: '00000000-0000-4000-8000-000000000000',
        name: 'Huérfano',
      }),
    ).rejects.toThrow('Workspace no encontrado.');
  });

  it('rejects a project without workspace at the database level', async () => {
    await expect(
      ctx.sql.query("INSERT INTO projects (workspace_id, name) VALUES (NULL, 'Sin workspace')"),
    ).rejects.toMatchObject({ code: '23502' });

    await expect(
      ctx.sql.query(
        "INSERT INTO projects (workspace_id, name) VALUES ('00000000-0000-4000-8000-000000000000', 'FK')",
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('rejects blank project names at the database level', async () => {
    const workspace = await createWorkspace(ctx.prisma);

    await expect(
      ctx.sql.query("INSERT INTO projects (workspace_id, name) VALUES ($1, '   ')", [workspace.id]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('does not delete a workspace that still owns projects', async () => {
    const workspace = await createWorkspace(ctx.prisma);
    await ctx.projects.create({ workspaceId: workspace.id, name: 'Protegido' });

    await expect(
      ctx.sql.query('DELETE FROM workspaces WHERE id = $1', [workspace.id]),
    ).rejects.toMatchObject({ code: '23001' });
  });

  it('lists only the projects of the requested workspace, deterministically', async () => {
    const workspaceA = await createWorkspace(ctx.prisma, 'A');
    const workspaceB = await createWorkspace(ctx.prisma, 'B');
    const first = await ctx.projects.create({ workspaceId: workspaceA.id, name: 'A-1' });
    const second = await ctx.projects.create({ workspaceId: workspaceA.id, name: 'A-2' });
    await ctx.projects.create({ workspaceId: workspaceB.id, name: 'B-1' });

    const listed = await ctx.projects.list(workspaceA.id, 50, 0);

    expect(listed.items.map((item) => item.id)).toEqual([first.id, second.id]);

    const page = await ctx.projects.list(workspaceA.id, 1, 1);
    expect(page.items.map((item) => item.id)).toEqual([second.id]);
  });

  describe('deletion', () => {
    it('permanently deletes a project that has nothing approved, cascading its artifacts', async () => {
      const workspace = await createWorkspace(ctx.prisma);
      const project = await ctx.projects.create({ workspaceId: workspace.id, name: 'Descartable' });
      const context = await ctx.projectContext.create(project.id, {
        problemStatement: 'p',
        objective: 'o',
        scopeItems: [],
        actors: [{ name: 'a' }],
        needs: [],
        constraints: [],
        businessRules: [],
      });
      await ctx.projectContext.transition(project.id, context.version.id, 'IN_REVIEW');
      // Never approved — stays IN_REVIEW.

      await ctx.projects.delete(project.id);

      await expect(ctx.projects.get(project.id)).rejects.toThrow('Proyecto no encontrado.');
      const remainingArtifacts = await ctx.prisma.artifact.count({
        where: { projectId: project.id },
      });
      expect(remainingArtifacts).toBe(0);
    });

    it('refuses to delete a project that has any approved artifact', async () => {
      const workspace = await createWorkspace(ctx.prisma);
      const project = await ctx.projects.create({
        workspaceId: workspace.id,
        name: 'Con historial',
      });
      const context = await ctx.projectContext.create(project.id, {
        problemStatement: 'p',
        objective: 'o',
        scopeItems: [],
        actors: [{ name: 'a' }],
        needs: [],
        constraints: [],
        businessRules: [],
      });
      await ctx.projectContext.transition(project.id, context.version.id, 'IN_REVIEW');
      await ctx.projectContext.transition(project.id, context.version.id, 'APPROVED');

      await expect(ctx.projects.delete(project.id)).rejects.toThrow('artefactos aprobados');
      await expect(ctx.projects.get(project.id)).resolves.toBeDefined();
    });

    it('rejects deleting a project that does not exist', async () => {
      await expect(ctx.projects.delete('00000000-0000-4000-8000-000000000000')).rejects.toThrow(
        'Proyecto no encontrado.',
      );
    });
  });
});
