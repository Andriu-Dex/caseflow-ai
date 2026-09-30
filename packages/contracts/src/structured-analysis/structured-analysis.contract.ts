import { z } from 'zod';

// Shared "structured content + candidate-first AI generation + optional
// deterministic diagram" family (spec §13/§14/§15/§17). Each kind has its
// own content schema below; the generic envelope (version/provenance) is
// identical across all kinds, mirroring the existing Data Model contract.

export const STRUCTURED_ANALYSIS_KINDS = [
  'NAVIGATION_TREE',
  'SOFTWARE_ARCHITECTURE',
  'SYSTEM_ARCHITECTURE',
  'UI_BLUEPRINT',
  'GENERATION_PLAN',
  'CONCEPTUAL_DOMAIN_MODEL',
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
    relatedSourceCodes: z.array(text(40)).max(100).optional(),
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
    relatedSourceCodes: z.array(text(40)).max(100).optional(),
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
    relatedSourceCodes: z.array(text(40)).max(100).optional(),
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
    relatedSourceCodes: z.array(text(40)).max(100).optional(),
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

// ---- GENERATION_PLAN (spec §156) -------------------------------------------
// "What system are we going to build?" — reviewed and approved before any
// official code generation (DEC-090). Conceptual only: no physical types.
const planModuleSchema = z
  .object({
    localId: localId(),
    name: text(200),
    purpose: text(1000),
    entityNames: z.array(text(200)).max(50).default([]),
    relatedRequirementCodes: z.array(text(40)).max(100).default([]),
    relatedUseCaseCodes: z.array(text(40)).max(100).default([]),
    relatedSourceCodes: z.array(text(40)).max(100).optional(),
  })
  .strict();
const planActorSchema = z
  .object({
    name: text(200),
    description: text(1000).optional(),
    permissions: z.array(text(300)).max(30).default([]),
  })
  .strict();
const planWorkflowSchema = z
  .object({
    localId: localId(),
    name: text(200),
    steps: z.array(text(500)).min(1).max(30),
    relatedUseCaseCodes: z.array(text(40)).max(50).default([]),
    relatedSourceCodes: z.array(text(40)).max(100).optional(),
  })
  .strict();
const planScreenSchema = z
  .object({
    name: text(200),
    moduleLocalId: localId().optional(),
    purpose: text(1000),
    relatedSourceCodes: z.array(text(40)).max(100).optional(),
  })
  .strict();
const planIntegrationSchema = z.object({ name: text(200), purpose: text(1000) }).strict();
const planRiskSchema = z
  .object({ description: text(1000), mitigation: text(1000).optional() })
  .strict();
export const generationPlanContentSchema = z
  .object({
    summary: text(2000),
    modules: z.array(planModuleSchema).min(1).max(50),
    actors: z.array(planActorSchema).max(30).default([]),
    workflows: z.array(planWorkflowSchema).max(50).default([]),
    screens: z.array(planScreenSchema).max(100).default([]),
    integrations: z.array(planIntegrationSchema).max(20).default([]),
    authentication: z
      .object({
        required: z.boolean(),
        strategy: text(300).optional(),
        roles: z.array(text(100)).max(20).default([]),
      })
      .strict(),
    technicalConstraints: z.array(text(500)).max(50).default([]),
    risks: z.array(planRiskSchema).max(50).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!uniqueBy(value.modules, (module) => module.localId))
      ctx.addIssue({ code: 'custom', message: 'localId debe ser único.', path: ['modules'] });
    if (!uniqueBy(value.workflows, (workflow) => workflow.localId))
      ctx.addIssue({ code: 'custom', message: 'localId debe ser único.', path: ['workflows'] });
    const modules = new Set(value.modules.map((module) => module.localId));
    value.screens.forEach((screen, index) => {
      if (screen.moduleLocalId && !modules.has(screen.moduleLocalId))
        ctx.addIssue({
          code: 'custom',
          message: 'La pantalla referencia un módulo inexistente.',
          path: ['screens', index, 'moduleLocalId'],
        });
    });
  });
export type GenerationPlanContent = z.output<typeof generationPlanContentSchema>;

// ---- CONCEPTUAL_DOMAIN_MODEL (spec §157) ------------------------------------
// Entities and relationships only. Deliberately not the physical model: no
// column types or keys, which are decided after the Design Gate (DEC-096).
export const CONCEPTUAL_CARDINALITIES = ['ONE_TO_ONE', 'ONE_TO_MANY', 'MANY_TO_MANY'] as const;
const conceptualAttributeSchema = z
  .object({
    name: text(200),
    description: text(500).optional(),
    required: z.boolean().default(true),
  })
  .strict();
const conceptualEntitySchema = z
  .object({
    localId: localId(),
    name: text(200),
    description: text(1000),
    moduleName: text(200).optional(),
    attributes: z.array(conceptualAttributeSchema).min(1).max(60),
    relatedSourceCodes: z.array(text(40)).max(100).optional(),
  })
  .strict();
const conceptualRelationshipSchema = z
  .object({
    fromLocalId: localId(),
    toLocalId: localId(),
    name: text(200),
    cardinality: z.enum(CONCEPTUAL_CARDINALITIES),
    description: text(500).optional(),
  })
  .strict();
export const conceptualDomainModelContentSchema = z
  .object({
    entities: z.array(conceptualEntitySchema).min(1).max(100),
    relationships: z.array(conceptualRelationshipSchema).max(300).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!uniqueBy(value.entities, (entity) => entity.localId))
      ctx.addIssue({ code: 'custom', message: 'localId debe ser único.', path: ['entities'] });
    value.entities.forEach((entity, index) => {
      if (!uniqueBy(entity.attributes, (attribute) => attribute.name.toLowerCase()))
        ctx.addIssue({
          code: 'custom',
          message: 'Los atributos de una entidad deben tener nombres distintos.',
          path: ['entities', index, 'attributes'],
        });
    });
    const known = new Set(value.entities.map((entity) => entity.localId));
    value.relationships.forEach((relationship, index) => {
      if (!known.has(relationship.fromLocalId) || !known.has(relationship.toLocalId))
        ctx.addIssue({
          code: 'custom',
          message: 'La relación referencia una entidad inexistente.',
          path: ['relationships', index],
        });
    });
  });
export type ConceptualDomainModelContent = z.output<typeof conceptualDomainModelContentSchema>;

// ---- Shared envelope -------------------------------------------------------
export const STRUCTURED_ANALYSIS_CONTENT_SCHEMAS = {
  NAVIGATION_TREE: navigationTreeContentSchema,
  SOFTWARE_ARCHITECTURE: softwareArchitectureContentSchema,
  SYSTEM_ARCHITECTURE: systemArchitectureContentSchema,
  UI_BLUEPRINT: uiBlueprintContentSchema,
  GENERATION_PLAN: generationPlanContentSchema,
  CONCEPTUAL_DOMAIN_MODEL: conceptualDomainModelContentSchema,
} as const;

const structuredAnalysisContentSchema = z.union([
  navigationTreeContentSchema,
  softwareArchitectureContentSchema,
  systemArchitectureContentSchema,
  uiBlueprintContentSchema,
  generationPlanContentSchema,
  conceptualDomainModelContentSchema,
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
  qualityFindings: z
    .array(
      z.object({
        severity: z.enum(['ERROR', 'WARNING']),
        code: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
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
