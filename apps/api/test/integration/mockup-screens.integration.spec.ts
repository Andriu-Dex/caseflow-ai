import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FakeStorageProvider,
  MockupProviderError,
  type BlueprintScreen,
  type MockupProvider,
} from '@caseflow-ai/integrations';
import { MockupsService } from '../../src/mockups/mockups.service';
import { approved } from './support/construction-fixtures';
import { createTestContext, createWorkspace, type TestContext } from './support/test-app';

const screen = (localId: string): BlueprintScreen => ({
  localId,
  name: `Pantalla ${localId}`,
  purpose: 'Trabajar con registros.',
  targetActors: [],
  relatedUseCaseCodes: [],
  sections: ['Resumen'],
  primaryActions: ['Guardar'],
  secondaryActions: [],
  principalData: [],
  forms: [],
  states: [],
});

// DEC-146: Stitch screens drawn one by one, kept as they arrive, resumed.
describe('Mockups drawn screen by screen', () => {
  let ctx: TestContext;
  let projectId: string;
  let blueprintVersionId: string;
  const queued: string[] = [];
  const asked: string[] = [];
  let projects = 0;
  let failing = new Set<string>();
  let unavailable = false;

  const provider: MockupProvider = {
    id: 'scripted',
    screens: {
      createProject: async () => {
        if (unavailable)
          throw new MockupProviderError('MOCKUP_PROVIDER_UNAVAILABLE', 'Stitch no responde.');
        projects += 1;
        return `stitch-${projects}`;
      },
      generateScreen: async (stitchProjectId, target) => {
        asked.push(target.localId);
        if (failing.has(target.localId))
          throw new MockupProviderError('MOCKUP_PROVIDER_TIMEOUT', 'La pantalla tardó demasiado.');
        return {
          screenLocalId: target.localId,
          screenName: target.name,
          image: { body: Buffer.from('png'), contentType: 'image/png' },
          html: '<html></html>',
          providerRef: { projectId: stitchProjectId, screenId: `s-${target.localId}` },
        };
      },
    },
    generate: async () => ({ kind: 'INTERNAL_WIREFRAME', svg: '<svg>esquema</svg>' }),
    generateFallback: async () => ({ kind: 'INTERNAL_WIREFRAME', svg: '<svg>esquema</svg>' }),
  };
  let service: MockupsService;

  beforeAll(async () => {
    ctx = await createTestContext();
    service = new MockupsService(ctx.prisma, provider, new FakeStorageProvider(), {
      add: async (_name: string, payload: { jobId: string }) => {
        queued.push(payload.jobId);
      },
    } as never);
    const workspace = await createWorkspace(ctx.prisma, 'Bocetos por pantalla');
    projectId = (await ctx.projects.create({ workspaceId: workspace.id, name: 'P' })).id;
    const blueprint = await ctx.structuredAnalysis.create(projectId, 'UI_BLUEPRINT', 'Plano', {
      screens: ['a', 'b', 'c', 'd', 'e'].map(screen),
    });
    for (const status of ['IN_REVIEW', 'APPROVED'] as const)
      await ctx.structuredAnalysis.transition(
        projectId,
        'UI_BLUEPRINT',
        blueprint.id,
        blueprint.version.id,
        status,
      );
    blueprintVersionId = blueprint.version.id;
    await approved(ctx, projectId, 'DESIGN_THEME');
  });
  afterAll(async () => ctx?.close());

  it('keeps the screens that arrived when one fails, then resumes asking only for the missing one', async () => {
    failing = new Set(['c']);
    const first = await service.create(projectId, blueprintVersionId);
    await service.runJob(first.id);
    const failed = await service.getJob(projectId, first.id);
    expect(failed).toMatchObject({ status: 'FAILED', completedScreens: 4, totalScreens: 5 });
    expect(failed.errorMessage).toContain('Faltan 1 de 5 pantallas');
    expect(failed.errorMessage).toContain('«Pantalla c»');
    // Each failing screen was asked for three times.
    expect(asked.filter((id) => id === 'c')).toHaveLength(3);
    expect(await ctx.prisma.mockupGenerationPart.count({ where: { jobId: first.id } })).toBe(4);

    failing = new Set();
    asked.length = 0;
    const again = await service.create(projectId, blueprintVersionId);
    // The same job continues: no new job, no new Stitch project.
    expect(again).toMatchObject({ id: first.id, status: 'QUEUED' });
    expect(queued.at(-1)).toBe(first.id);
    await service.runJob(first.id);
    expect(asked).toEqual(['c']);
    expect(projects).toBe(1);

    const done = await service.getJob(projectId, first.id);
    expect(done).toMatchObject({ status: 'COMPLETED', completedScreens: 5, totalScreens: 5 });
    expect(done.errorMessage).toBeNull();
    const mockup = await service.getPreview(projectId, done.resultArtifactId!);
    expect(mockup.screens!.map((s) => s.screenLocalId)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(mockup.screens!.every((s) => s.editable)).toBe(true);
  });

  it('falls back to the internal wireframe when no screen could be drawn, and says why', async () => {
    unavailable = true;
    const job = await service.create(projectId, blueprintVersionId);
    await service.runJob(job.id);
    const done = await service.getJob(projectId, job.id);
    expect(done.status).toBe('COMPLETED');
    expect(done.errorMessage).toContain('Stitch no generó ninguna pantalla');
    expect(done.errorMessage).toContain('Stitch no responde.');
    const preview = await service.getPreview(projectId, done.resultArtifactId!);
    expect(preview.svg).toContain('esquema');
  });
});
