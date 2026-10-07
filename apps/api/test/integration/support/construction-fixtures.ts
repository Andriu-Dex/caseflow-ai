import type { StructuredAnalysisKind } from '@caseflow-ai/contracts';
import { DesignBaselinesService } from '../../../src/construction/design-baselines.service';
import type { TestContext } from './test-app';

// Minimal valid content per construction-design kind, shared by the
// construction integration tests.
export const CONTENT: Partial<Record<StructuredAnalysisKind, Record<string, unknown>>> = {
  GENERATION_PLAN: {
    summary: 'Sistema de gestión de pedidos.',
    modules: [{ localId: 'orders', name: 'Pedidos', purpose: 'Registrar y seguir pedidos.' }],
    authentication: { required: true, strategy: 'Correo y contraseña', roles: ['Vendedor'] },
  },
  CONCEPTUAL_DOMAIN_MODEL: {
    entities: [
      {
        localId: 'order',
        name: 'Pedido',
        classLocalId: 'order',
        description: 'Solicitud de compra de un cliente.',
        attributes: [{ name: 'fecha' }, { name: 'total' }],
      },
    ],
  },
  CLASS_DIAGRAM: {
    classes: [
      {
        localId: 'order',
        name: 'Pedido',
        attributes: [
          { name: 'fecha', type: 'Date' },
          { name: 'total', type: 'number' },
        ],
        methods: [],
      },
    ],
    relationships: [],
  },
  NAVIGATION_TREE: {
    nodes: [{ localId: 'home', label: 'Inicio', viewName: 'Inicio', kind: 'HOME' }],
  },
  UI_BLUEPRINT: {
    screens: [
      {
        localId: 'home',
        name: 'Inicio',
        purpose: 'Ver el panel principal',
        navigationNodeLocalId: 'home',
        primaryActions: ['Confirmar pedido'],
      },
    ],
  },
  SOFTWARE_ARCHITECTURE: {
    style: 'Monolito modular',
    dependencies: [],
    decisions: [],
    components: [{ localId: 'api', name: 'API' }],
  },
  DESIGN_THEME: {
    name: 'Índigo',
    mode: 'BOTH',
    light: {
      background: '#ffffff',
      foreground: '#0f172a',
      primary: '#4338ca',
      primaryForeground: '#ffffff',
      secondary: '#e2e8f0',
      secondaryForeground: '#1e293b',
      accent: '#ccfbf1',
      accentForeground: '#134e4a',
      muted: '#f1f5f9',
      mutedForeground: '#475569',
      destructive: '#b91c1c',
      destructiveForeground: '#ffffff',
      border: '#cbd5e1',
    },
    dark: {
      background: '#0f172a',
      foreground: '#f8fafc',
      primary: '#818cf8',
      primaryForeground: '#0f172a',
      secondary: '#1e293b',
      secondaryForeground: '#f1f5f9',
      accent: '#134e4a',
      accentForeground: '#ccfbf1',
      muted: '#1e293b',
      mutedForeground: '#94a3b8',
      destructive: '#f87171',
      destructiveForeground: '#0f172a',
      border: '#334155',
    },
  },
  SYSTEM_ARCHITECTURE: {
    boundary: 'Tienda',
    links: [],
    nodes: [{ localId: 'api', name: 'API', kind: 'RUNTIME' }],
  },
};

export async function approved(ctx: TestContext, pid: string, kind: StructuredAnalysisKind) {
  const created = await ctx.structuredAnalysis.create(pid, kind, `${kind} demo`, CONTENT[kind]!);
  await ctx.structuredAnalysis.transition(pid, kind, created.id, created.version.id, 'IN_REVIEW');
  await ctx.structuredAnalysis.transition(pid, kind, created.id, created.version.id, 'APPROVED');
  return created;
}

export async function approvedMockup(ctx: TestContext, pid: string, uiBlueprintVersionId: string) {
  const job = await ctx.mockups.create(pid, uiBlueprintVersionId);
  await ctx.mockups.runJob(job.id);
  const mockup = await ctx.mockups.get(
    pid,
    (await ctx.mockups.getJob(pid, job.id)).resultArtifactId!,
  );
  await ctx.mockups.transition(pid, mockup.id, mockup.version.id, 'IN_REVIEW');
  await ctx.mockups.transition(pid, mockup.id, mockup.version.id, 'APPROVED');
  return mockup;
}

// Approved versions for every required Design Baseline role.
export async function freezableDesign(ctx: TestContext, pid: string) {
  const ui = await approved(ctx, pid, 'UI_BLUEPRINT');
  // New projects freeze their theme, and mockups are painted with it (DEC-118).
  const theme = await approved(ctx, pid, 'DESIGN_THEME');
  return {
    GENERATION_PLAN: (await approved(ctx, pid, 'GENERATION_PLAN')).version.id,
    CONCEPTUAL_DOMAIN_MODEL: (await approved(ctx, pid, 'CONCEPTUAL_DOMAIN_MODEL')).version.id,
    // New projects freeze their class diagram too (DEC-121).
    CLASS_DIAGRAM: (await approved(ctx, pid, 'CLASS_DIAGRAM')).version.id,
    NAVIGATION_TREE: (await approved(ctx, pid, 'NAVIGATION_TREE')).version.id,
    UI_BLUEPRINT: ui.version.id,
    DESIGN_THEME: theme.version.id,
    MOCKUP: (await approvedMockup(ctx, pid, ui.version.id)).version.id,
  };
}

export async function approvedDesignBaseline(ctx: TestContext, pid: string) {
  const versions = await freezableDesign(ctx, pid);
  const baseline = await ctx.app
    .get(DesignBaselinesService)
    .create(pid, ctx.userId, { label: 'Diseño aprobado', versions });
  return { baseline, versions };
}
