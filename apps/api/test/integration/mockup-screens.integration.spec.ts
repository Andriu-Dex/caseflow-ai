import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FakeHtmlScreenRenderer,
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
  const contexts = new Map<string, unknown>();
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
      generateScreen: async (stitchProjectId, target, _device, _refinement, _theme, context) => {
        contexts.set(target.localId, context);
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

  it('enqueues again, on startup, a job left queued because its start never reached the API', async () => {
    unavailable = false;
    const job = await service.create(projectId, blueprintVersionId);
    queued.length = 0;
    expect(await service.requeuePending()).toBeGreaterThanOrEqual(1);
    expect(queued).toContain(job.id);
    // Running it twice is harmless: only a QUEUED job is picked up.
    await service.runJob(job.id);
    await service.runJob(job.id);
    expect((await service.getJob(projectId, job.id)).status).toBe('COMPLETED');
  });

  it('gives every screen the application name and the menu of the approved navigation (DEC-147)', async () => {
    const workspace = await createWorkspace(ctx.prisma, 'Una sola aplicación');
    const pid = (
      await ctx.projects.create({ workspaceId: workspace.id, name: 'Restaurante Mateos' })
    ).id;
    const tree = await ctx.structuredAnalysis.create(pid, 'NAVIGATION_TREE', 'Navegación', {
      nodes: [
        { localId: 'login', label: 'Iniciar sesión', viewName: 'Acceso', kind: 'AUTH' },
        { localId: 'home', label: 'Inicio', viewName: 'Inicio', kind: 'HOME' },
        {
          localId: 'sales',
          label: 'Ventas',
          viewName: 'Ventas',
          kind: 'SECTION',
          parentLocalId: 'home',
        },
        {
          localId: 'sale-form',
          label: 'Registrar venta',
          viewName: 'Venta',
          kind: 'FORM',
          parentLocalId: 'sales',
        },
        {
          localId: 'stock',
          label: 'Inventario',
          viewName: 'Inventario',
          kind: 'LIST',
          parentLocalId: 'home',
        },
      ],
    });
    for (const status of ['IN_REVIEW', 'APPROVED'] as const)
      await ctx.structuredAnalysis.transition(
        pid,
        'NAVIGATION_TREE',
        tree.id,
        tree.version.id,
        status,
      );
    const onNode = (localId: string, node: string) => ({
      ...screen(localId),
      navigationNodeLocalId: node,
    });
    const blueprint = await ctx.structuredAnalysis.create(pid, 'UI_BLUEPRINT', 'Plano', {
      screens: [
        onNode('acceso', 'login'),
        onNode('inicio', 'home'),
        onNode('venta', 'sale-form'),
        onNode('existencias', 'stock'),
      ],
    });
    for (const status of ['IN_REVIEW', 'APPROVED'] as const)
      await ctx.structuredAnalysis.transition(
        pid,
        'UI_BLUEPRINT',
        blueprint.id,
        blueprint.version.id,
        status,
      );
    await approved(ctx, pid, 'DESIGN_THEME');
    const job = await service.create(pid, blueprint.version.id);
    await service.runJob(job.id);
    expect((await service.getJob(pid, job.id)).status).toBe('COMPLETED');
    const menu = ['Ventas', 'Inventario'];
    expect(contexts.get('venta')).toEqual(
      expect.objectContaining({ appName: 'Restaurante Mateos', menu }),
    );
    // A screen belongs to the menu entry that is its node or an ancestor of it; the sign-in has none.
    const active = (id: string) =>
      (contexts.get(id) as { activeMenuByScreen: Record<string, string | null> })
        .activeMenuByScreen[id];
    expect(active('venta')).toBe('Ventas');
    expect(active('existencias')).toBe('Inventario');
    expect(active('acceso')).toBeNull();
  });

  it('draws an HTML and CSS mockup screen by screen with the AI and edits one screen from its previous body (DEC-167)', async () => {
    const requests: {
      screen: { localId: string; name: string };
      refinement?: string;
      previousBody?: string;
    }[] = [];
    const ai = {
      generateStructured: async ({ messages }: { messages: { content: string }[] }) => {
        const request = JSON.parse(messages[0]!.content);
        requests.push(request);
        return {
          data: {
            body: `<div class="page-header"><h1>${request.screen.name}</h1></div><p>${request.refinement ?? 'Contenido de la pantalla'}</p>`,
          },
        };
      },
    };
    const renderer = new FakeHtmlScreenRenderer();
    const htmlCss = new MockupsService(
      ctx.prisma,
      provider,
      new FakeStorageProvider(),
      { add: async () => undefined } as never,
      undefined,
      ai as never,
      renderer,
    );
    const asking = asked.length;
    const job = await htmlCss.create(projectId, blueprintVersionId, 'DESKTOP', 'HTML_CSS');
    expect(
      (await ctx.prisma.mockupGenerationJob.findUniqueOrThrow({ where: { id: job.id } }))
        .generatorKind,
    ).toBe('HTML_CSS');
    await htmlCss.runJob(job.id);
    const done = await htmlCss.getJob(projectId, job.id);
    expect(done.status).toBe('COMPLETED');
    const mockupId = done.resultArtifactId!;
    const preview = await htmlCss.getPreview(projectId, mockupId);
    expect(preview.generatorKind).toBe('HTML_CSS');
    expect(preview.screens).toHaveLength(5);
    expect(preview.screens!.every((screen) => screen.editable)).toBe(true);
    expect(renderer.rendered).toHaveLength(5);
    // Stitch was never asked.
    expect(asked.length).toBe(asking);

    const target = preview.screens!.find((screen) => screen.screenLocalId === 'b')!;
    const edit = await htmlCss.refineScreen(
      projectId,
      mockupId,
      target.id,
      'Agrega un filtro por fecha',
    );
    await htmlCss.runJob(edit.id);
    expect((await htmlCss.getJob(projectId, edit.id)).status).toBe('COMPLETED');
    expect(requests.at(-1)).toMatchObject({
      screen: { localId: 'b' },
      refinement: 'Agrega un filtro por fecha',
      previousBody: expect.stringContaining('Pantalla b'),
    });
    const next = await htmlCss.getPreview(projectId, mockupId);
    expect(next.screens!.find((screen) => screen.screenLocalId === 'b')!.refinementPrompt).toBe(
      'Agrega un filtro por fecha',
    );
    // The new version can be compared with the one it came from.
    expect(next.previousVersion).toMatchObject({ versionNumber: 1, generatorKind: 'HTML_CSS' });
    expect(next.previousVersion!.screens).toHaveLength(5);
    expect(renderer.rendered).toHaveLength(6);
  });

  it('imports a hand-written HTML and CSS mockup and its next version, without the provider (DEC-166)', async () => {
    const zip = new JSZip();
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      zip.file(`${id}.html`, `<html><head></head><body><h1>Pantalla ${id}</h1></body></html>`);
      zip.file(`${id}.png`, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]));
    }
    zip.file('styles.css', 'h1 { font-size: 1.5rem; }');
    const archive = await zip.generateAsync({ type: 'nodebuffer' });
    const asking = asked.length;
    const mockup = await service.importManual(
      projectId,
      blueprintVersionId,
      'DESKTOP',
      undefined,
      archive,
    );
    expect(mockup.version).toMatchObject({ versionNumber: 1, status: 'DRAFT', origin: 'MANUAL' });
    const preview = await service.getPreview(projectId, mockup.id);
    expect(preview.generatorKind).toBe('MANUAL');
    expect(preview.screens?.map((screen) => screen.screenName)).toHaveLength(5);
    expect(preview.screens?.every((screen) => !screen.editable)).toBe(true);
    const next = await service.importManual(
      projectId,
      blueprintVersionId,
      'DESKTOP',
      mockup.id,
      archive,
    );
    expect(next.id).toBe(mockup.id);
    expect(next.version.versionNumber).toBe(2);
    expect(asked.length).toBe(asking);
  });
});
