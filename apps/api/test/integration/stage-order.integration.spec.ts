import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, createWorkspaceWithOwner, type TestContext } from './support/test-app';

describe('Stage order integration', () => {
  let ctx: TestContext;
  let projectId: string;

  beforeAll(async () => {
    ctx = await createTestContext({ enforceStageOrder: true });
    const workspace = await createWorkspaceWithOwner(ctx, 'Stage order');
    projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'Orden' })).id;
  });
  afterAll(async () => ctx.close());

  it('refuses approving a step while an earlier one is incomplete and names it', async () => {
    const requirement = await ctx.requirements.create(projectId, {
      requirementType: 'FUNCTIONAL',
      name: 'Registrar venta',
      description: 'La caja registra una venta.',
      priority: 'HIGH',
      actors: ['Cajero'],
      preconditions: [],
      postconditions: [],
      dependencyArtifactIds: [],
      origin: { kind: 'USER_DECISION', justification: 'Decisión del equipo.' },
    });
    await ctx.requirements.transition(
      projectId,
      requirement.id,
      requirement.version.id,
      'IN_REVIEW',
    );
    await expect(
      ctx.requirements.transition(projectId, requirement.id, requirement.version.id, 'APPROVED'),
    ).rejects.toThrow('No se puede aprobar este paso porque falta completar Fuentes del proyecto.');
    const stored = await ctx.prisma.artifactVersion.findUniqueOrThrow({
      where: { id: requirement.version.id },
    });
    expect(stored.status).toBe('IN_REVIEW');
  });
});
