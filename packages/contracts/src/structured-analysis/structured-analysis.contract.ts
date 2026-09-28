import { z } from 'zod';

// Shared "structured content + candidate-first AI generation + optional
// deterministic diagram" family (spec §13/§14/§15/§17). Each kind has its
// own content schema below; the generic envelope (version/provenance) is
// identical across all four, mirroring the existing Data Model contract.

export const STRUCTURED_ANALYSIS_KINDS = [
  'NAVIGATION_TREE',
  'SOFTWARE_ARCHITECTURE',
  'SYSTEM_ARCHITECTURE',
  'UI_BLUEPRINT',
] as const;
export type StructuredAnalysisKind = (typeof STRUCTURED_ANALYSIS_KINDS)[number];

const text = (max: number) => z.string().trim().min(1, 'El valor es obligatorio.').max(max);
const localId = () => text(80);

function uniqueBy<T>(items: T[], key: (item: T) => string): boolean {
  const seen = new Set(items.map(key));
  return seen.size === items.length;
}

// ---- NAVIGATION_TREE ----------------------------------------------------
export const NAVIGATION_NODE_KINDS = [
  'HOME',
  'SECTION',
  'VIEW',
  'FORM',
  'DETAIL',
  'LIST',
  'AUTH',
  'OTHER',
] as const;
const navigationNodeSchema = z
  .object({
    localId: localId(),
    label: text(200),
    viewName: text(200),
    route: text(300).optional(),
    description: text(2000).optional(),
    kind: z.enum(NAVIGATION_NODE_KINDS),
    parentLocalId: localId().optional(),
    relatedUseCaseCodes: z.array(text(40)).max(20).default([]),
  })
  .strict();
export const navigationTreeContentSchema = z
  .object({ nodes: z.array(navigationNodeSchema).min(1).max(150) })
  .strict()
  .superRefine((value, ctx) => {
    const ids = value.nodes.map((node) => node.localId);
    if (!uniqueBy(value.nodes, (node) => node.localId))
      ctx.addIssue({ code: 'custom', message: 'localId debe ser único.', path: ['nodes'] });
    const known = new Set(ids);
    value.nodes.forEach((node, index) => {
      if (node.parentLocalId && !known.has(node.parentLocalId))
        ctx.addIssue({
          code: 'custom',
          message: 'El nodo padre no existe.',
          path: ['nodes', index, 'parentLocalId'],
        });
      if (node.parentLocalId === node.localId)
        ctx.addIssue({
          code: 'custom',
          message: 'Un nodo no puede ser su propio padre.',
          path: ['nodes', index, 'parentLocalId'],
        });
    });
    // Deterministic cycle detection (parent chain must terminate).
    for (const node of value.nodes) {
      const visited = new Set<string>();
      let current: string | undefined = node.localId;
      while (current) {
        if (visited.has(current)) {
          ctx.addIssue({ code: 'custom', message: 'Los nodos forman un ciclo.', path: ['nodes'] });
          break;
        }
        visited.add(current);
        current = value.nodes.find((item) => item.localId === current)?.parentLocalId;
      }
    }
  });
export type NavigationTreeContent = z.output<typeof navigationTreeContentSchema>;

// ---- SOFTWARE_ARCHITECTURE ------------------------------------------------
const softwareComponentSchema = z
  .object({
    localId: localId(),
    name: text(200),
    layerLocalId: localId().optional(),
    responsibilities: z.array(text(500)).max(20).default([]),
  })
  .strict();
const componentDependencySchema = z
  .object({ fromLocalId: localId(), toLocalId: localId(), description: text(500).optional() })
  .strict();
export const softwareArchitectureContentSchema = z
  .object({
    style: text(200),
    components: z.array(softwareComponentSchema).min(1).max(100),
    dependencies: z.array(componentDependencySchema).max(300).default([]),
    decisions: z.array(text(1000)).max(50).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!uniqueBy(value.components, (component) => component.localId))
      ctx.addIssue({ code: 'custom', message: 'localId debe ser único.', path: ['components'] });
    const known = new Set(value.components.map((component) => component.localId));
    value.dependencies.forEach((dependency, index) => {
      if (!known.has(dependency.fromLocalId) || !known.has(dependency.toLocalId))
        ctx.addIssue({
          code: 'custom',
          message: 'La dependencia referencia un componente inexistente.',
          path: ['dependencies', index],
        });
    });
  });
export type SoftwareArchitectureContent = z.output<typeof softwareArchitectureContentSchema>;

// ---- SYSTEM_ARCHITECTURE --------------------------------------------------
export const SYSTEM_NODE_KINDS = [
  'RUNTIME',
  'DATABASE',
  'STORAGE',
  'EXTERNAL_SERVICE',
  'CLIENT',
  'OTHER',
] as const;
const systemNodeSchema = z
  .object({
    localId: localId(),
    name: text(200),
    kind: z.enum(SYSTEM_NODE_KINDS),
    responsibilities: z.array(text(500)).max(20).default([]),
  })
  .strict();
const systemLinkSchema = z
  .object({
    fromLocalId: localId(),
    toLocalId: localId(),
    protocol: text(100).optional(),
    description: text(500).optional(),
  })
  .strict();
export const systemArchitectureContentSchema = z
  .object({
    boundary: text(1000),
    nodes: z.array(systemNodeSchema).min(1).max(100),
    links: z.array(systemLinkSchema).max(300).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!uniqueBy(value.nodes, (node) => node.localId))
      ctx.addIssue({ code: 'custom', message: 'localId debe ser único.', path: ['nodes'] });
    const known = new Set(value.nodes.map((node) => node.localId));
    value.links.forEach((link, index) => {
      if (!known.has(link.fromLocalId) || !known.has(link.toLocalId))
        ctx.addIssue({
          code: 'custom',
          message: 'El enlace referencia un nodo inexistente.',
          path: ['links', index],
        });
    });
  });
export type SystemArchitectureContent = z.output<typeof systemArchitectureContentSchema>;

// ---- UI_BLUEPRINT ----------------------------------------------------------
const screenSchema = z
  .object({
    localId: localId(),
    name: text(200),
    purpose: text(1000),
    targetActors: z.array(text(200)).max(20).default([]),
    relatedUseCaseCodes: z.array(text(40)).max(20).default([]),
    navigationNodeLocalId: localId().optional(),
    sections: z.array(text(300)).max(30).default([]),
    primaryActions: z.array(text(200)).max(20).default([]),
    secondaryActions: z.array(text(200)).max(20).default([]),
    principalData: z.array(text(300)).max(30).default([]),
    forms: z.array(text(300)).max(20).default([]),
    states: z.array(text(200)).max(10).default([]),
  })
  .strict();
export const uiBlueprintContentSchema = z
  .object({ screens: z.array(screenSchema).min(1).max(100) })
  .strict()
  .superRefine((value, ctx) => {
    if (!uniqueBy(value.screens, (screen) => screen.localId))
      ctx.addIssue({ code: 'custom', message: 'localId debe ser único.', path: ['screens'] });
  });
export type UiBlueprintContent = z.output<typeof uiBlueprintContentSchema>;

// ---- Shared envelope -------------------------------------------------------
export const STRUCTURED_ANALYSIS_CONTENT_SCHEMAS = {
  NAVIGATION_TREE: navigationTreeContentSchema,
  SOFTWARE_ARCHITECTURE: softwareArchitectureContentSchema,
  SYSTEM_ARCHITECTURE: systemArchitectureContentSchema,
  UI_BLUEPRINT: uiBlueprintContentSchema,
} as const;

const structuredAnalysisContentSchema = z.union([
  navigationTreeContentSchema,
  softwareArchitectureContentSchema,
  systemArchitectureContentSchema,
  uiBlueprintContentSchema,
]);

export const structuredAnalysisInputSchema = z
  .object({ title: text(200), content: structuredAnalysisContentSchema })
  .strict();
export type StructuredAnalysisInput = z.output<typeof structuredAnalysisInputSchema>;

const versionSchema = z.object({
  id: z.uuid(),
  versionNumber: z.number().int(),
  status: z.enum(['DRAFT', 'GENERATED', 'IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED']),
  origin: z.enum(['MANUAL', 'AI_GENERATED', 'AI_ASSISTED', 'SYSTEM_GENERATED', 'IMPORTED']),
  createdAt: z.iso.datetime(),
});
export const structuredAnalysisResponseSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  code: z.string(),
  kind: z.enum(STRUCTURED_ANALYSIS_KINDS),
  createdAt: z.iso.datetime(),
  version: versionSchema,
  title: z.string(),
  content: structuredAnalysisContentSchema,
  generationId: z.uuid().nullable(),
  candidateId: z.uuid().nullable(),
  aiRunId: z.uuid().nullable(),
});
export type StructuredAnalysisResponse = z.infer<typeof structuredAnalysisResponseSchema>;
export const structuredAnalysisListResponseSchema = z.object({
  items: z.array(structuredAnalysisResponseSchema),
});

export const generateStructuredAnalysisRequestSchema = z
  .object({ sourceVersionIds: z.array(z.uuid()).min(1).max(100) })
  .strict();
export const acceptStructuredAnalysisCandidatesRequestSchema = z
  .object({ candidateIds: z.array(z.uuid()).min(1).max(5) })
  .strict();
export const structuredAnalysisGenerationCandidateResponseSchema = z.object({
  id: z.uuid(),
  candidateId: z.string(),
  title: z.string(),
  content: structuredAnalysisContentSchema,
  createdAt: z.iso.datetime(),
});
export const structuredAnalysisGenerationResponseSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  kind: z.enum(STRUCTURED_ANALYSIS_KINDS),
  aiRunId: z.uuid(),
  createdAt: z.iso.datetime(),
  sources: z.array(
    z.object({ generationId: z.uuid(), artifactVersionId: z.uuid(), sourceId: z.uuid() }),
  ),
  candidates: z.array(structuredAnalysisGenerationCandidateResponseSchema),
});
