import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AIProvider, AIProviderResponse } from '@caseflow-ai/ai';
import { createTestContext, createWorkspaceWithOwner, type TestContext } from './support/test-app';
import { CONTENT } from './support/construction-fixtures';

const themeAnswer: AIProvider = {
  id: 'scripted',
  async generateStructured(): Promise<AIProviderResponse> {
    return {
      provider: 'scripted',
      model: 'v1',
      payload: { palettes: [CONTENT.DESIGN_THEME] },
      usage: null,
      latencyMs: 1,
    };
  },
};

// Provisional sources in the EXPRESS route (DEC-119, ADR-004).
describe('Provisional sources integration', () => {
  let ctx: TestContext;
  let workspaceId: string;

  beforeAll(async () => {
    ctx = await createTestContext({ aiProvider: themeAnswer });
    workspaceId = (await createWorkspaceWithOwner(ctx, 'Borradores')).id;
  });
  afterAll(async () => ctx.close());

  const project = async (workflowRoute: 'FULL' | 'EXPRESS') =>
    (await ctx.projects.create({ workspaceId, name: `Proyecto ${workflowRoute}`, workflowRoute }))
      .id;
  const draftBlueprint = (projectId: string) =>
    ctx.structuredAnalysis.create(projectId, 'UI_BLUEPRINT', 'Plano', CONTENT.UI_BLUEPRINT!);

  it('generates from drafts only in EXPRESS', async () => {
    const full = await project('FULL');
    const fullDraft = await draftBlueprint(full);
    await expect(
      ctx.structuredAnalysis.generate(full, 'DESIGN_THEME', [fullDraft.version.id]),
    ).rejects.toThrow('APPROVED');

    const express = await project('EXPRESS');
    const draft = await draftBlueprint(express);
    const generation = await ctx.structuredAnalysis.generate(express, 'DESIGN_THEME', [
      draft.version.id,
    ]);
    expect(generation.sources.map((s) => s.artifactVersionId)).toEqual([draft.version.id]);
  });

  it('never approves anything ahead of the versions it was generated from', async () => {
    const projectId = await project('EXPRESS');
    const blueprint = await draftBlueprint(projectId);
    const generation = await ctx.structuredAnalysis.generate(projectId, 'DESIGN_THEME', [
      blueprint.version.id,
    ]);
    const [theme] = (
      await ctx.structuredAnalysis.accept(projectId, 'DESIGN_THEME', generation.id, [
        generation.candidates[0]!.id,
      ])
    ).items;
    const approve = (kind: 'UI_BLUEPRINT' | 'DESIGN_THEME', item: typeof blueprint) =>
      ctx.structuredAnalysis
        .transition(projectId, kind, item.id, item.version.id, 'IN_REVIEW')
        .then(() =>
          ctx.structuredAnalysis.transition(
            projectId,
            kind,
            item.id,
            item.version.id,
            'APPROVED',
            null,
            'HUMAN_BULK',
          ),
        );

    await expect(approve('DESIGN_THEME', theme!)).rejects.toThrow(
      'Apruebe primero los elementos a partir de los cuales se generó este.',
    );

    // A provisional mockup is painted with the draft theme and blueprint.
    const job = await ctx.mockups.generateNow(projectId, blueprint.version.id);
    const mockup = await ctx.mockups.get(projectId, job.resultArtifactId!);
    expect(mockup.designThemeVersionId).toBe(theme!.version.id);

    // In dependency order, the bulk approval goes through and is recorded as such.
    await approve('UI_BLUEPRINT', blueprint);
    await ctx.structuredAnalysis.transition(
      projectId,
      'DESIGN_THEME',
      theme!.id,
      theme!.version.id,
      'APPROVED',
      null,
      'HUMAN_BULK',
    );
    await ctx.mockups.transition(projectId, mockup.id, mockup.version.id, 'IN_REVIEW');
    await ctx.mockups.transition(projectId, mockup.id, mockup.version.id, 'APPROVED', 'HUMAN_BULK');
    const origins = await ctx.prisma.artifactVersion.findMany({
      where: { projectId, status: 'APPROVED' },
      select: { approvalOrigin: true },
    });
    expect(origins.map((o) => o.approvalOrigin)).toEqual([
      'HUMAN_BULK',
      'HUMAN_BULK',
      'HUMAN_BULK',
    ]);
  });
});
