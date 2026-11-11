import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AIError } from '@caseflow-ai/ai';
import { CASEFLOW_WEB_TS_V2 } from '@caseflow-ai/domain';
import { implementationPlanContentSchema } from '@caseflow-ai/contracts';
import { FakeStorageProvider } from '@caseflow-ai/integrations';
import {
  FrontendDesignService,
  screenEvaluator,
  serverMethods,
  sharedComponentImports,
} from './frontend-design.service';
import { generateProject } from '../code-generation/engine/project-generator';
import { structuralProblems } from './project-validation';
import { planTraceLinks } from '../code-generation/engine/trace-links';
import { file } from '../code-generation/engine/types';

const id = '11111111-1111-4111-8111-111111111111';
const mockupId = '22222222-2222-4222-8222-222222222222';
const plan = implementationPlanContentSchema.parse({
  designBaselineId: id,
  authentication: { required: false, roles: [] },
  modules: [{ localId: 'catalog', name: 'Catalog', description: 'Catálogo' }],
  entities: [
    {
      localId: 'item',
      name: 'Item',
      moduleLocalId: 'catalog',
      fields: [{ name: 'name', type: 'STRING' }],
      operations: ['LIST'],
    },
  ],
  routes: [
    {
      path: '/items',
      screenName: 'Artículos',
      screenLocalId: 'items',
      moduleLocalId: 'catalog',
      kind: 'LIST',
      entityLocalId: 'item',
    },
  ],
});
const files = () =>
  generateProject({ plan, template: CASEFLOW_WEB_TS_V2, projectName: 'Catálogo', slug: 'catalog' });

async function setup() {
  const mockup = {
    generatorKind: 'STITCH',
    uiBlueprintVersionId: id,
    screens: [{ screenLocalId: 'items', htmlStorageKey: `mockups/${id}/screen.html` }],
  };
  const baseline = {
    entries: [
      {
        role: 'MOCKUP',
        artifactVersionId: mockupId,
        artifactVersion: { projectId: id, mockupDetail: mockup },
      },
      {
        role: 'UI_BLUEPRINT',
        artifactVersionId: id,
        artifactVersion: {
          projectId: id,
          structuredAnalysisDetail: {
            content: {
              screens: [{ localId: 'items', name: 'Artículos', purpose: 'Consultar el catálogo' }],
            },
          },
        },
      },
    ],
  };
  const prisma = {
    generationRun: { findFirst: vi.fn().mockResolvedValue({ id }) },
    designBaseline: { findFirst: vi.fn().mockResolvedValue(baseline) },
    project: { findUnique: vi.fn().mockResolvedValue({ language: 'ES' }) },
    screenDesignException: { findMany: vi.fn().mockResolvedValue([]) },
    generatedFile: {
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(async (args) => {
        prisma.generatedFile.findFirst.mockResolvedValue({ content: args.create.content });
        return args.create;
      }),
    },
  };
  const ai = {
    generateStructured: vi.fn(async ({ messages }) => {
      const { sources } = JSON.parse(messages[0].content);
      return {
        data: {
          navigation: 'TOP',
          limitations: [],
          nodes: [
            {
              id: 'root',
              parentId: null,
              kind: 'CONTAINER',
              tag: 'section',
              sourceId: null,
              className: 'mx-auto max-w-6xl space-y-6',
            },
            ...sources.map((source: { id: string; frames: string[]; kind: string }) => ({
              id: source.id,
              parentId: source.frames.at(-1) ?? 'root',
              kind: source.kind,
              sourceId: source.id,
              tag: null,
              className: '',
            })),
          ],
        },
      };
    }),
  };
  const storage = new FakeStorageProvider();
  await storage.putObject({
    key: mockup.screens[0]!.htmlStorageKey,
    body: Buffer.from('<main class="mx-auto max-w-6xl"><h1>Artículos</h1><table></table></main>'),
    contentType: 'text/html',
  });
  const service = new FrontendDesignService(prisma as never, ai as never, storage);
  return { service, prisma, ai, storage, mockup, baseline };
}

describe('frozen design adaptation', () => {
  it('omits unused action components and retains compatible presentation checkpoints when they change', async () => {
    const { service, ai } = await setup();
    await service.adapt(
      id,
      id,
      plan,
      [...files(), file('apps/web/components/action-form.tsx', 'unused version one')],
      'Catálogo',
      false,
      id,
    );
    const sent = JSON.parse(ai.generateStructured.mock.calls[0]![0].messages[0].content);
    expect(
      sent.bindings.functionalComponents.some((item: { path: string }) =>
        item.path.endsWith('/action-form.tsx'),
      ),
    ).toBe(false);
    await service.adapt(
      id,
      id,
      plan,
      [...files(), file('apps/web/components/action-form.tsx', 'unused version two')],
      'Catálogo',
      false,
      id,
    );
    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
  });
  it('uses the exact frozen HTML, keeps bindings, caches only validated layouts and traces the real sources', async () => {
    const { service, ai, prisma } = await setup();
    const result = await service.adapt(id, id, plan, files(), 'Catálogo', false, id);
    expect(prisma.designBaseline.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id, projectId: id } }),
    );
    expect(ai.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: id,
        sourceArtifactVersionId: mockupId,
        promptKey: 'frontend-design.generate',
        promptVersion: 37,
      }),
    );
    const sent = JSON.parse(ai.generateStructured.mock.calls[0]![0].messages[0].content);
    expect(sent.bindings.functionalPageSource).toBe(
      files().find((file) => file.path === 'apps/web/app/items/page.tsx')!.content,
    );
    const page = result.files.find((item) => item.path === 'apps/web/app/items/page.tsx')!;
    expect(page.content).toContain('mx-auto max-w-6xl');
    expect(page.content).toContain('api.listItems({ page, limit })');
    expect(result.files.find((item) => item.path === 'apps/web/app/layout.tsx')!.content).toContain(
      'PresentationShell',
    );
    const cached = await service.adapt(id, id, plan, files(), 'Catálogo', false, id);
    expect(cached.files).toEqual(result.files);
    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
    expect(
      structuralProblems(result.files, CASEFLOW_WEB_TS_V2, CASEFLOW_WEB_TS_V2.dependencies),
    ).toEqual([]);
    const links = planTraceLinks(
      result.files,
      plan,
      id,
      new Map([
        ['UI-001', id],
        ['MCK-001', mockupId],
      ]),
    );
    expect(links).toContainEqual(
      expect.objectContaining({ path: page.path, sourceArtifactVersionId: mockupId }),
    );
    const modified = result.files.map((item) =>
      item === page ? { ...item, content: item.content + '\n// changed' } : item,
    );
    expect(
      structuralProblems(modified, CASEFLOW_WEB_TS_V2, CASEFLOW_WEB_TS_V2.dependencies),
    ).toContainEqual(expect.stringContaining('no coincide'));
  });
  it('does not silently fall back to generic templates when approved HTML is unavailable, cross-project or not mapped', async () => {
    const { service, mockup, storage, ai, baseline } = await setup();
    await storage.deleteObject(mockup.screens[0]!.htmlStorageKey);
    await expect(service.adapt(id, id, plan, files(), 'Catálogo', false, id)).rejects.toThrow();
    expect(ai.generateStructured).not.toHaveBeenCalled();
    mockup.screens[0]!.htmlStorageKey = 'mockups/other-project/screen.html';
    await expect(service.adapt(id, id, plan, files(), 'Catálogo', false, id)).rejects.toThrow(
      'Falta el HTML',
    );
    baseline.entries[0]!.artifactVersion.projectId = 'other-project';
    await expect(service.adapt(id, id, plan, files(), 'Catálogo', false, id)).rejects.toThrow(
      'proyecto',
    );
  });
  it('rejects layout output that drops original behavior instead of persisting it', async () => {
    const { service, ai, prisma } = await setup();
    ai.generateStructured.mockResolvedValue({
      data: {
        navigation: 'SIDE',
        limitations: [],
        nodes: [
          {
            id: 'root',
            parentId: null,
            kind: 'CONTAINER',
            tag: 'div',
            className: '',
            sourceId: null,
          },
        ],
      },
    } as never);
    const put = vi.spyOn(prisma.generatedFile, 'upsert');
    await expect(service.adapt(id, id, plan, files(), 'Catálogo', false, id)).rejects.toThrow(
      'todos los controles',
    );
    expect(put).not.toHaveBeenCalled();
  });
  it('keeps the deterministic internal-wireframe route usable without an external provider', async () => {
    const { service, ai, mockup } = await setup();
    mockup.generatorKind = 'INTERNAL_WIREFRAME';
    const result = await service.adapt(id, id, plan, files(), 'Catálogo', false, id);
    expect(ai.generateStructured).not.toHaveBeenCalled();
    expect(result.records[0]!.mockupSha256).toBeNull();
  });
  it('reports the exact screen and missing binding without storing an accepted presentation', async () => {
    const { service, ai, prisma } = await setup();
    const original = ai.generateStructured.getMockImplementation()!;
    ai.generateStructured.mockImplementation(async (input) => {
      const result = await original(input);
      return {
        data: {
          ...result.data,
          limitations: [
            { code: 'MISSING_DATA_BINDING', description: 'Falta el enlace de existencias.' },
          ],
        },
      } as never;
    });
    const stored = new Map<string, string>();
    prisma.generatedFile.findFirst.mockImplementation(async ({ where }) =>
      stored.has(where.path) ? { content: stored.get(where.path) } : null,
    );
    prisma.generatedFile.upsert.mockImplementation(async (args) => {
      stored.set(args.create.path, args.create.content);
      return args.create;
    });
    await expect(service.adapt(id, id, plan, files(), 'Catálogo', false, id)).rejects.toThrow(
      'Artículos',
    );
    // The findings are kept, never an accepted presentation, and a second run
    // reports them again without another evaluation.
    expect([...stored.keys()]).toEqual([expect.stringMatching(/^docs\/presentation-findings\//)]);
    await expect(service.adapt(id, id, plan, files(), 'Catálogo', false, id)).rejects.toThrow(
      'Falta el enlace de existencias',
    );
    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
  });
  it('lets findings through only with a justified exception for those exact findings', async () => {
    const { service, ai, prisma } = await setup();
    const original = ai.generateStructured.getMockImplementation()!;
    ai.generateStructured.mockImplementation(async (input) => {
      const result = await original(input);
      return {
        data: {
          ...result.data,
          limitations: [{ code: 'MISSING_DATA_BINDING', description: 'Falta el resumen.' }],
        },
      } as never;
    });
    const stored = new Map<string, string>();
    prisma.generatedFile.findFirst.mockImplementation(async ({ where }) =>
      stored.has(where.path) ? { content: stored.get(where.path) } : null,
    );
    prisma.generatedFile.upsert.mockImplementation(async (args) => {
      stored.set(args.create.path, args.create.content);
      return args.create;
    });
    await expect(service.adapt(id, id, plan, files(), 'Catálogo', false, id)).rejects.toThrow(
      'Falta el resumen',
    );
    const findings = JSON.parse([...stored.values()][0]!).findings as string;
    prisma.screenDesignException.findMany.mockResolvedValue([
      {
        id: 'exception',
        routePath: '/items',
        findingsSha256: createHash('sha256').update(findings).digest('hex'),
        justification: 'Demostración: el resumen no es necesario.',
      },
    ]);
    const adapted = await service.adapt(id, id, plan, files(), 'Catálogo', false, id);
    expect(adapted.records[0]).toMatchObject({
      routePath: '/items',
      acceptedException: { id: 'exception' },
    });
    // The second run reused the recorded findings instead of asking again.
    expect(ai.generateStructured).toHaveBeenCalledTimes(1);
    // An exception for different findings does not apply.
    prisma.screenDesignException.findMany.mockResolvedValue([
      {
        id: 'other',
        routePath: '/items',
        findingsSha256: 'f'.repeat(64),
        justification: 'x'.repeat(12),
      },
    ]);
    await expect(service.adapt(id, id, plan, files(), 'Catálogo', false, id)).rejects.toThrow(
      'Falta el resumen',
    );
  });

  it('keeps the functional page of an excepted screen whose proposed layout is invalid', async () => {
    const { service, ai, prisma } = await setup();
    ai.generateStructured.mockResolvedValue({
      data: {
        navigation: 'SIDE',
        limitations: [{ code: 'UNSUPPORTED_LAYOUT', description: 'No encaja.' }],
        nodes: [
          {
            id: 'root',
            parentId: null,
            kind: 'CONTAINER',
            tag: 'div',
            className: '',
            sourceId: null,
          },
        ],
      },
    } as never);
    const findings = 'UNSUPPORTED_LAYOUT: No encaja.';
    prisma.screenDesignException.findMany.mockResolvedValue([
      {
        id: 'exception',
        routePath: '/items',
        findingsSha256: createHash('sha256').update(findings).digest('hex'),
        justification: 'Demostración: se conserva la página funcional.',
      },
    ]);
    const original = files().find((file) => file.path === 'apps/web/app/items/page.tsx')!.content;
    const adapted = await service.adapt(id, id, plan, files(), 'Catálogo', false, id);
    expect(adapted.records[0]).toMatchObject({ acceptedException: { id: 'exception' } });
    expect(adapted.records[0]).not.toHaveProperty('presentation');
    expect(adapted.files.find((file) => file.path === 'apps/web/app/items/page.tsx')!.content).toBe(
      original,
    );
  });

  it('leaves a screen unevaluated when the provider fails and asks again next run', async () => {
    const { service, ai, prisma } = await setup();
    const original = ai.generateStructured.getMockImplementation()!;
    ai.generateStructured.mockRejectedValueOnce(
      new AIError('AI_PROVIDER_UNAVAILABLE', 'El proveedor de IA no está disponible.'),
    );
    await expect(service.adapt(id, id, plan, files(), 'Catálogo', false, id)).rejects.toThrow(
      'NOT_EVALUATED',
    );
    // Recorded so a person can accept it; never reused while unaccepted.
    expect(prisma.generatedFile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          path: expect.stringMatching(/^docs\/presentation-findings\//),
          content: expect.stringContaining('NOT_EVALUATED: El proveedor de IA no está disponible.'),
        }),
      }),
    );
    const recorded = prisma.generatedFile.upsert.mock.calls[0]![0].create.content as string;
    prisma.generatedFile.findFirst.mockImplementation(async ({ where }) =>
      where.path.startsWith('docs/presentation-findings/') ? { content: recorded } : null,
    );
    ai.generateStructured.mockImplementation(original);
    await service.adapt(id, id, plan, files(), 'Catálogo', false, id);
    expect(ai.generateStructured).toHaveBeenCalledTimes(2);
  });

  it('does not fall back to presentation evaluations from older prompt versions', async () => {
    const { service, prisma } = await setup();
    prisma.generatedFile.findFirst.mockResolvedValue(null);
    await service.adapt(id, id, plan, files(), 'Catálogo', false, id);
    // One lookup for an accepted presentation and one for recorded findings,
    // both under the current version's inputs hash.
    const paths = prisma.generatedFile.findFirst.mock.calls.map(([args]) => args.where.path);
    expect(paths).toHaveLength(2);
    expect(new Set(paths.map((path: string) => path.split('/').at(-1))).size).toBe(1);
  });
});

describe('evaluation evidence', () => {
  it('collects the shared components a page imports, without UI primitives', () => {
    const imports = sharedComponentImports(
      'apps/web/app/items/[itemId]/page.tsx',
      "import { PageState } from '../../../components/page-state';\nimport { Button } from '../../../components/ui/button';\nimport { api } from '../../../lib/api';",
    );
    expect([...imports]).toEqual(['apps/web/components/page-state.tsx']);
  });

  it('extracts only the named server methods from generated API sources', () => {
    const methods = serverMethods(
      [
        {
          path: 'apps/api/src/sales/sales.service.ts',
          content:
            'export class SalesService {\n  async confirmSale(id: string) { return { id }; }\n  other() { return 1; }\n}',
        },
        { path: 'apps/api/src/sales/sales.service.spec.ts', content: 'confirmSale' },
        { path: 'apps/web/app/page.tsx', content: 'confirmSale' },
      ],
      'confirmSale',
    );
    expect(methods).toEqual([
      {
        path: 'apps/api/src/sales/sales.service.ts',
        source: 'async confirmSale(id: string) { return { id }; }',
      },
    ]);
  });
});

describe('screen evaluator identity', () => {
  it('keys checkpoints by the routed development model or the default model', () => {
    const slot = {
      AI_PROVIDER_2_ID: 'gemini',
      AI_PROVIDER_2_BASE_URL: 'https://gemini.example/v1',
      AI_PROVIDER_2_API_KEY: 'k',
      AI_PROVIDER_2_MODEL: 'flash',
    };
    expect(screenEvaluator({ AI_PROVIDER: 'chatgpt', AI_MODEL: 'gpt-x', ...slot })).toBe(
      'chatgpt:gpt-x',
    );
    expect(
      screenEvaluator({
        AI_PROVIDER: 'chatgpt',
        AI_MODEL: 'gpt-x',
        ...slot,
        AI_ROUTE_FRONTEND_PRESENTATION: 'gemini:flash-lite',
      }),
    ).toBe('gemini:flash-lite');
  });
});
