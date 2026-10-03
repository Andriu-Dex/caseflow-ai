import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  createTestContext,
  createUnauthorizedUser,
  createWorkspaceWithOwner,
  type TestContext,
} from './support/test-app';
import { CONTENT, approved, approvedMockup } from './support/construction-fixtures';

// Project theme and palette (DEC-118, ADR-003).
describe('Design theme integration', () => {
  let ctx: TestContext;
  let workspaceId: string;
  const http = () => request(ctx.app.getHttpServer());
  const auth = { Authorization: '' };
  const newProject = async (name: string) => (await ctx.projects.create({ workspaceId, name })).id;

  beforeAll(async () => {
    ctx = await createTestContext();
    auth.Authorization = `Bearer ${ctx.token}`;
    workspaceId = (await createWorkspaceWithOwner(ctx, 'Temas')).id;
  });
  afterAll(async () => ctx.close());

  it('creates themes with their own code, blocks inaccessible palettes and audits approval', async () => {
    const projectId = await newProject('Temas HTTP');
    const lowContrast = {
      ...CONTENT.DESIGN_THEME,
      mode: 'LIGHT',
      light: {
        ...(CONTENT.DESIGN_THEME!.light as Record<string, string>),
        foreground: '#eeeeee',
      },
      dark: undefined,
    };
    const theme = await http()
      .post(`/projects/${projectId}/design-theme`)
      .set(auth)
      .send({ title: 'Tema', content: lowContrast })
      .expect(201);
    expect(theme.body).toMatchObject({ code: 'TEM-001', kind: 'DESIGN_THEME' });

    const transition = (body: { id: string; version: { id: string } }, status: string) =>
      http()
        .post(
          `/projects/${projectId}/design-theme/${body.id}/versions/${body.version.id}/transition`,
        )
        .set(auth)
        .send({ status });
    await transition(theme.body, 'IN_REVIEW').expect(201);
    const refused = await transition(theme.body, 'APPROVED').expect(422);
    expect(refused.body.message).toContain('WCAG AA');

    // Correcting the palette is a new version, which can then be approved.
    const fixed = await http()
      .post(`/projects/${projectId}/design-theme/${theme.body.id}/versions`)
      .set(auth)
      .send({ title: 'Tema', content: CONTENT.DESIGN_THEME })
      .expect(201);
    expect(fixed.body.version.versionNumber).toBe(2);
    await transition(fixed.body, 'IN_REVIEW').expect(201);
    await transition(fixed.body, 'APPROVED').expect(201);
    const events = await ctx.prisma.auditEvent.findMany({
      where: { entityId: fixed.body.version.id },
    });
    expect(events).toEqual([
      expect.objectContaining({ action: 'DESIGN_THEME_APPROVED', actorUserId: ctx.userId }),
    ]);

    // Rejected by the schema: BOTH needs both palettes.
    await http()
      .post(`/projects/${projectId}/design-theme`)
      .set(auth)
      .send({ title: 'Incompleto', content: { ...CONTENT.DESIGN_THEME, dark: undefined } })
      .expect(400);
  });

  it('requires an approved theme before mockups and freezes it with the design', async () => {
    const projectId = await newProject('Proyecto nuevo');
    const ui = await approved(ctx, projectId, 'UI_BLUEPRINT');
    await expect(ctx.mockups.create(projectId, ui.version.id)).rejects.toThrow(
      'Apruebe el tema y los colores',
    );

    const theme = await approved(ctx, projectId, 'DESIGN_THEME');
    const mockup = await approvedMockup(ctx, projectId, ui.version.id);
    expect(mockup.designThemeVersionId).toBe(theme.version.id);

    const versions = {
      GENERATION_PLAN: (await approved(ctx, projectId, 'GENERATION_PLAN')).version.id,
      CONCEPTUAL_DOMAIN_MODEL: (await approved(ctx, projectId, 'CONCEPTUAL_DOMAIN_MODEL')).version
        .id,
      NAVIGATION_TREE: (await approved(ctx, projectId, 'NAVIGATION_TREE')).version.id,
      UI_BLUEPRINT: ui.version.id,
      MOCKUP: mockup.version.id,
    };
    const post = (extra: Record<string, string>) =>
      http()
        .post(`/projects/${projectId}/design-baselines`)
        .set(auth)
        .send({ label: 'Diseño', versions: { ...versions, ...extra } });

    const missing = await post({}).expect(422);
    expect(missing.body.message).toBe('Seleccione el tema aprobado del proyecto.');

    // The frozen mockup must have been painted with the frozen theme.
    const otherTheme = await approved(ctx, projectId, 'DESIGN_THEME');
    const mismatch = await post({ DESIGN_THEME: otherTheme.version.id }).expect(422);
    expect(mismatch.body.message).toContain('tema');

    // Knowing another project's approved theme id is not enough.
    const foreignTheme = await approved(ctx, await newProject('Ajeno'), 'DESIGN_THEME');
    await post({ DESIGN_THEME: foreignTheme.version.id }).expect(422);

    const frozen = await post({ DESIGN_THEME: theme.version.id }).expect(201);
    expect(frozen.body.entries.map((e: { role: string }) => e.role)).toContain('DESIGN_THEME');

    const graph = await ctx.traceability.buildGraph(projectId);
    expect(graph.edges).toContainEqual({
      type: 'DESIGN_THEME_SOURCE_FOR_MOCKUP',
      fromId: theme.version.id,
      toId: mockup.version.id,
    });
  });

  it('keeps the standard design for projects created before the theme step', async () => {
    const projectId = await newProject('Proyecto anterior');
    // What the migration does to every existing row.
    await ctx.prisma.project.update({
      where: { id: projectId },
      data: { designThemeRequired: false },
    });
    const ui = await approved(ctx, projectId, 'UI_BLUEPRINT');
    const mockup = await approvedMockup(ctx, projectId, ui.version.id);
    expect(mockup.designThemeVersionId).toBeNull();

    const readiness = await ctx.readiness.evaluate(projectId);
    expect(readiness.stages.find((s) => s.key === 'DESIGN_THEME')).toMatchObject({
      satisfied: true,
      summary: 'Este proyecto usa el diseño estándar de CASEFlow.',
    });
    expect(readiness.stages.find((s) => s.key === 'MOCKUPS')?.satisfied).toBe(true);

    await http()
      .post(`/projects/${projectId}/design-baselines`)
      .set(auth)
      .send({
        label: 'Diseño estándar',
        versions: {
          GENERATION_PLAN: (await approved(ctx, projectId, 'GENERATION_PLAN')).version.id,
          CONCEPTUAL_DOMAIN_MODEL: (await approved(ctx, projectId, 'CONCEPTUAL_DOMAIN_MODEL'))
            .version.id,
          NAVIGATION_TREE: (await approved(ctx, projectId, 'NAVIGATION_TREE')).version.id,
          UI_BLUEPRINT: ui.version.id,
          MOCKUP: mockup.version.id,
        },
      })
      .expect(201);
  });

  it('marks new projects as requiring a theme', async () => {
    const projectId = await newProject('Nuevo');
    const row = await ctx.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(row.designThemeRequired).toBe(true);
  });

  it('keeps themes invisible to non-members', async () => {
    const projectId = await newProject('Privado');
    const intruder = await createUnauthorizedUser(ctx);
    await http()
      .get(`/projects/${projectId}/design-theme`)
      .set('Authorization', `Bearer ${intruder.token}`)
      .expect(403);
  });
});
