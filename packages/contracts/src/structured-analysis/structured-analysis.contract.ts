import { z } from 'zod';
import { designThemeContentSchema } from './design-theme.contract';
import { classDiagramContentSchema } from './class-diagram.contract';

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
  'IMPLEMENTATION_PLAN',
  'DESIGN_THEME',
  'CLASS_DIAGRAM',
] as const;
export type StructuredAnalysisKind = (typeof STRUCTURED_ANALYSIS_KINDS)[number];

// DEC-142: the kinds generated in batches in the background.
export const BATCHED_STRUCTURED_KINDS = [
  'CLASS_DIAGRAM',
  'UI_BLUEPRINT',
  'CONCEPTUAL_DOMAIN_MODEL',
  'GENERATION_PLAN',
  'IMPLEMENTATION_PLAN',
] as const;
export const startStructuredGenerationRequestSchema = z
  .object({
    sourceVersionIds: z
      .array(z.uuid())
      .min(1)
      .max(500)
      .refine((ids) => new Set(ids).size === ids.length, 'Las fuentes no pueden repetirse.'),
  })
  .strict();
// An implementation plan is not drawn from a free selection but from a baseline.
export const startImplementationPlanGenerationRequestSchema = z
  .object({ designBaselineId: z.uuid() })
  .strict();
export const structuredGenerationJobSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  kind: z.enum(STRUCTURED_ANALYSIS_KINDS),
  status: z.enum(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']),
  completedBatches: z.number().int().nonnegative(),
  totalBatches: z.number().int().nonnegative(),
  outputChars: z.number().int().nonnegative(),
  generationId: z.uuid().nullable(),
  errorMessage: z.string().nullable(),
  designBaselineId: z.uuid().nullable().default(null),
  sourceVersionIds: z.array(z.uuid()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type StructuredGenerationJob = z.infer<typeof structuredGenerationJobSchema>;

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
// DEC-143: a batch draws the screens of a few navigation views.
export const uiBlueprintBatchOutputSchema = z
  .object({ screens: z.array(screenSchema).min(1).max(20) })
  .strict();
export const uiBlueprintContentSchema = z
  .object({ screens: z.array(screenSchema).min(1).max(200) })
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
    workflows: z.array(planWorkflowSchema).max(100).default([]),
    screens: z.array(planScreenSchema).max(200).default([]),
    integrations: z.array(planIntegrationSchema).max(20).default([]),
    authentication: z
      .object({
        required: z.boolean(),
        strategy: text(1000).optional(),
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
// DEC-144: the plan is drawn in two stages. The outline gives everything but
// the workflows and screens; each batch of modules then gives theirs.
export const planOutlineSchema = z
  .object({
    summary: text(2000),
    modules: z.array(planModuleSchema).min(1).max(50),
    actors: z.array(planActorSchema).max(30).default([]),
    integrations: z.array(planIntegrationSchema).max(20).default([]),
    authentication: z
      .object({
        required: z.boolean(),
        strategy: text(1000).optional(),
        roles: z.array(text(100)).max(20).default([]),
      })
      .strict(),
    technicalConstraints: z.array(text(500)).max(50).default([]),
    risks: z.array(planRiskSchema).max(50).default([]),
  })
  .strict();
export type PlanOutline = z.output<typeof planOutlineSchema>;
export const planDetailBatchOutputSchema = z
  .object({
    workflows: z.array(planWorkflowSchema).max(40).default([]),
    screens: z.array(planScreenSchema).min(1).max(80),
  })
  .strict();

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
    // DEC-121: the domain class (class diagram localId) this entity refines.
    classLocalId: localId().optional(),
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
// DEC-144: a batch gives the entities of a few classes of the class diagram.
export const conceptualBatchOutputSchema = z
  .object({
    entities: z.array(conceptualEntitySchema).min(1).max(20),
    relationships: z.array(conceptualRelationshipSchema).max(60).default([]),
  })
  .strict();

// ---- IMPLEMENTATION_PLAN (spec §161) ----------------------------------------
// "How exactly will the approved system be built?" Produced after the Design
// Gate from an approved Design Baseline (DEC-095). It is also the logical and
// physical data model and the API contract: the Prisma schema and OpenAPI
// document of the generated project are derived from it deterministically.
// Names follow the generated code's conventions so no translation step (and
// no guessing) happens between review and generation.
export const IMPLEMENTATION_FIELD_TYPES = [
  'STRING',
  'TEXT',
  'INT',
  'DECIMAL',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'ENUM',
] as const;
export const IMPLEMENTATION_RELATION_KINDS = ['MANY_TO_ONE', 'ONE_TO_ONE', 'MANY_TO_MANY'] as const;
export const IMPLEMENTATION_CRUD_OPERATIONS = [
  'LIST',
  'GET',
  'CREATE',
  'UPDATE',
  'DELETE',
] as const;
export const IMPLEMENTATION_HTTP_METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const;
export const IMPLEMENTATION_ROUTE_KINDS = [
  'LIST',
  'DETAIL',
  'FORM',
  'DASHBOARD',
  'CUSTOM',
] as const;
export const IMPLEMENTATION_TEST_KINDS = ['UNIT', 'INTEGRATION', 'E2E'] as const;
// Added to every entity by the generator; the plan must not redeclare them.
export const IMPLEMENTATION_RESERVED_FIELDS = ['id', 'createdAt', 'updatedAt'] as const;

const pascalName = () =>
  text(60).regex(/^[A-Z][A-Za-z0-9]*$/, 'Use PascalCase sin espacios (p. ej. OrderItem).');
const camelName = () =>
  text(60).regex(/^[a-z][A-Za-z0-9]*$/, 'Use camelCase sin espacios (p. ej. unitPrice).');
const enumValue = () =>
  text(60).regex(/^[A-Z][A-Z0-9_]*$/, 'Use MAYÚSCULAS_CON_GUIONES (p. ej. IN_PROGRESS).');

const implementationFieldSchema = z
  .object({
    name: camelName(),
    type: z.enum(IMPLEMENTATION_FIELD_TYPES),
    required: z.boolean().default(true),
    unique: z.boolean().default(false),
    enumValues: z.array(enumValue()).max(30).default([]),
    description: text(300).optional(),
  })
  .strict();
const implementationRelationSchema = z
  .object({
    name: camelName(),
    kind: z.enum(IMPLEMENTATION_RELATION_KINDS),
    targetEntityLocalId: localId(),
    required: z.boolean().default(false),
  })
  .strict();
const implementationEntitySchema = z
  .object({
    localId: localId(),
    name: pascalName(),
    moduleLocalId: localId(),
    // DEC-121: the domain class (class diagram localId) this entity persists.
    classLocalId: localId().optional(),
    description: text(500).optional(),
    fields: z.array(implementationFieldSchema).min(1).max(60),
    relations: z.array(implementationRelationSchema).max(30).default([]),
    operations: z.array(z.enum(IMPLEMENTATION_CRUD_OPERATIONS)).max(5).default([]),
    // Empty = any authenticated user (when authentication is required).
    readRoles: z.array(text(60)).max(20).default([]),
    writeRoles: z.array(text(60)).max(20).default([]),
    relatedSourceCodes: z.array(text(40)).max(100).optional(),
  })
  .strict();
const implementationModuleSchema = z
  .object({
    localId: localId(),
    name: pascalName(),
    description: text(500),
    relatedSourceCodes: z.array(text(40)).max(100).optional(),
  })
  .strict();
const implementationEndpointSchema = z
  .object({
    moduleLocalId: localId(),
    method: z.enum(IMPLEMENTATION_HTTP_METHODS),
    path: text(200).regex(
      /^\/[a-z0-9-]+(?:\/(?:[a-z0-9-]+|:[a-z][A-Za-z0-9]*))*$/,
      'Use una ruta en minúsculas, p. ej. /orders/:orderId/confirm.',
    ),
    summary: text(300),
    entityLocalId: localId().optional(),
    roles: z.array(text(60)).max(20).default([]),
    relatedSourceCodes: z.array(text(40)).max(100).optional(),
  })
  .strict();
// A screen action (as the UI blueprint names it) and what serves it: one of
// the route entity's CRUD operations or a custom endpoint ("POST /orders/:id/x").
const implementationRouteActionSchema = z
  .object({
    label: text(200),
    operation: z.enum(IMPLEMENTATION_CRUD_OPERATIONS).optional(),
    endpoint: text(220).optional(),
  })
  .strict()
  .refine((action) => Boolean(action.operation) !== Boolean(action.endpoint), {
    message: 'Cada acción la atiende una operación CRUD o un endpoint, exactamente uno.',
  });
const implementationRouteSchema = z
  .object({
    path: text(200).regex(
      /^\/(?:[a-z0-9-]+(?:\/(?:[a-z0-9-]+|\[[a-z][A-Za-z0-9]*\]))*)?$/,
      'Use una ruta Next.js en minúsculas, p. ej. /orders/[orderId].',
    ),
    screenName: text(200),
    // DEC-121: the UI blueprint screen (localId) this route renders.
    screenLocalId: localId().optional(),
    moduleLocalId: localId(),
    kind: z.enum(IMPLEMENTATION_ROUTE_KINDS),
    entityLocalId: localId().optional(),
    actions: z.array(implementationRouteActionSchema).max(20).default([]),
    relatedSourceCodes: z.array(text(40)).max(100).optional(),
  })
  .strict();
const implementationEnvVarSchema = z
  .object({
    name: text(80).regex(/^[A-Z][A-Z0-9_]*$/, 'Use MAYÚSCULAS_CON_GUIONES.'),
    description: text(300),
    required: z.boolean().default(true),
  })
  .strict();
const implementationTestSchema = z
  .object({
    moduleLocalId: localId(),
    kind: z.enum(IMPLEMENTATION_TEST_KINDS),
    description: text(500),
  })
  .strict();

// The part an AI proposes; the Design Baseline id is set by the system.
export const implementationPlanBodySchema = z
  .object({
    authentication: z
      .object({ required: z.boolean(), roles: z.array(text(60)).max(20).default([]) })
      .strict(),
    modules: z.array(implementationModuleSchema).min(1).max(40),
    entities: z.array(implementationEntitySchema).min(1).max(100),
    customEndpoints: z.array(implementationEndpointSchema).max(100).default([]),
    routes: z.array(implementationRouteSchema).max(100).default([]),
    envVars: z.array(implementationEnvVarSchema).max(40).default([]),
    tests: z.array(implementationTestSchema).max(200).default([]),
  })
  .strict();

export type ImplementationPlanBody = z.output<typeof implementationPlanBodySchema>;

// DEC-144: the plan is drawn in stages. The skeleton gives the roles, modules
// and environment variables; each batch of entity classes then gives their
// entities (relations come from the class diagram); each batch of screens
// gives their routes and the custom endpoints those need. Tests are derived.
export const implementationSkeletonSchema = z
  .object({
    authentication: implementationPlanBodySchema.shape.authentication,
    modules: implementationPlanBodySchema.shape.modules,
    envVars: implementationPlanBodySchema.shape.envVars,
  })
  .strict();
export type ImplementationSkeleton = z.output<typeof implementationSkeletonSchema>;
export const implementationEntityBatchOutputSchema = z
  .object({
    entities: z
      .array(implementationEntitySchema.omit({ relations: true }))
      .min(1)
      .max(20),
  })
  .strict();
// The model sometimes names both an operation and an endpoint for an action, or
// neither: that is settled when the batch is merged (the plan itself stays
// strict), instead of failing the whole batch.
const looseRouteActionSchema = z
  .object({
    label: text(200),
    operation: z.enum(IMPLEMENTATION_CRUD_OPERATIONS).optional(),
    endpoint: text(220).optional(),
  })
  .strict();
const looseRouteSchema = implementationRouteSchema.extend({
  actions: z.array(looseRouteActionSchema).max(20).default([]),
});
export type LooseImplementationRoute = z.output<typeof looseRouteSchema>;
export const implementationRoutesBatchOutputSchema = z
  .object({
    routes: z.array(looseRouteSchema).min(1).max(40),
    customEndpoints: z.array(implementationEndpointSchema).max(40).default([]),
  })
  .strict();

export const implementationPlanContentSchema = implementationPlanBodySchema
  .extend({ designBaselineId: z.uuid() })
  .strict()
  .superRefine((value, ctx) => {
    const issue = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: 'custom', message, path });
    if (!uniqueBy(value.modules, (m) => m.localId)) issue('localId debe ser único.', ['modules']);
    if (!uniqueBy(value.modules, (m) => m.name))
      issue('Los módulos deben tener nombres distintos.', ['modules']);
    if (!uniqueBy(value.entities, (e) => e.localId)) issue('localId debe ser único.', ['entities']);
    if (!uniqueBy(value.entities, (e) => e.name))
      issue('Las entidades deben tener nombres distintos.', ['entities']);
    const modules = new Set(value.modules.map((m) => m.localId));
    const entities = new Set(value.entities.map((e) => e.localId));
    const roles = new Set(value.authentication.roles);
    const endpoints = new Set(value.customEndpoints.map((e) => `${e.method} ${e.path}`));
    const checkRoles = (list: string[], path: (string | number)[]) => {
      for (const role of list)
        if (!roles.has(role)) issue(`El rol «${role}» no está declarado en autenticación.`, path);
    };
    value.entities.forEach((entity, i) => {
      if (!modules.has(entity.moduleLocalId))
        issue('La entidad referencia un módulo inexistente.', ['entities', i, 'moduleLocalId']);
      const names = [...entity.fields.map((f) => f.name), ...entity.relations.map((r) => r.name)];
      if (new Set(names).size !== names.length)
        issue('Los campos y relaciones de una entidad deben tener nombres distintos.', [
          'entities',
          i,
        ]);
      entity.fields.forEach((field, j) => {
        if ((IMPLEMENTATION_RESERVED_FIELDS as readonly string[]).includes(field.name))
          issue(`«${field.name}» lo agrega el generador; no lo declare.`, [
            'entities',
            i,
            'fields',
            j,
          ]);
        if ((field.type === 'ENUM') !== field.enumValues.length > 0)
          issue('Solo los campos ENUM llevan valores, y todo ENUM necesita al menos uno.', [
            'entities',
            i,
            'fields',
            j,
          ]);
      });
      entity.relations.forEach((relation, j) => {
        if (!entities.has(relation.targetEntityLocalId))
          issue('La relación apunta a una entidad inexistente.', ['entities', i, 'relations', j]);
      });
      if (new Set(entity.operations).size !== entity.operations.length)
        issue('Las operaciones no deben repetirse.', ['entities', i, 'operations']);
      checkRoles([...entity.readRoles, ...entity.writeRoles], ['entities', i]);
    });
    value.customEndpoints.forEach((endpoint, i) => {
      if (!modules.has(endpoint.moduleLocalId))
        issue('El endpoint referencia un módulo inexistente.', ['customEndpoints', i]);
      if (endpoint.entityLocalId && !entities.has(endpoint.entityLocalId))
        issue('El endpoint referencia una entidad inexistente.', ['customEndpoints', i]);
      checkRoles(endpoint.roles, ['customEndpoints', i, 'roles']);
    });
    if (!uniqueBy(value.customEndpoints, (e) => `${e.method} ${e.path}`))
      issue('Cada endpoint (método y ruta) debe ser único.', ['customEndpoints']);
    value.routes.forEach((route, i) => {
      if (!modules.has(route.moduleLocalId))
        issue('La ruta referencia un módulo inexistente.', ['routes', i]);
      if (route.entityLocalId && !entities.has(route.entityLocalId))
        issue('La ruta referencia una entidad inexistente.', ['routes', i]);
      const entity = value.entities.find((e) => e.localId === route.entityLocalId);
      route.actions.forEach((action, j) => {
        if (action.operation && !entity?.operations.includes(action.operation))
          issue(
            `La acción «${action.label}» usa la operación ${action.operation}, que la entidad de la ruta no ofrece.`,
            ['routes', i, 'actions', j],
          );
        if (action.endpoint && !endpoints.has(action.endpoint))
          issue(`La acción «${action.label}» usa el endpoint ${action.endpoint}, que no existe.`, [
            'routes',
            i,
            'actions',
            j,
          ]);
      });
    });
    if (!uniqueBy(value.routes, (r) => r.path))
      issue('Cada ruta del frontend debe ser única.', ['routes']);
    if (!uniqueBy(value.envVars, (v) => v.name))
      issue('Las variables de entorno deben ser únicas.', ['envVars']);
    value.tests.forEach((test, i) => {
      if (!modules.has(test.moduleLocalId))
        issue('La prueba referencia un módulo inexistente.', ['tests', i]);
    });
  });
export type ImplementationPlanContent = z.output<typeof implementationPlanContentSchema>;

// ---- Shared envelope -------------------------------------------------------
export const STRUCTURED_ANALYSIS_CONTENT_SCHEMAS = {
  NAVIGATION_TREE: navigationTreeContentSchema,
  SOFTWARE_ARCHITECTURE: softwareArchitectureContentSchema,
  SYSTEM_ARCHITECTURE: systemArchitectureContentSchema,
  UI_BLUEPRINT: uiBlueprintContentSchema,
  GENERATION_PLAN: generationPlanContentSchema,
  CONCEPTUAL_DOMAIN_MODEL: conceptualDomainModelContentSchema,
  IMPLEMENTATION_PLAN: implementationPlanContentSchema,
  DESIGN_THEME: designThemeContentSchema,
  CLASS_DIAGRAM: classDiagramContentSchema,
} as const;

const structuredAnalysisContentSchema = z.union([
  navigationTreeContentSchema,
  softwareArchitectureContentSchema,
  systemArchitectureContentSchema,
  uiBlueprintContentSchema,
  generationPlanContentSchema,
  conceptualDomainModelContentSchema,
  implementationPlanContentSchema,
  designThemeContentSchema,
  classDiagramContentSchema,
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
  .object({
    sourceVersionIds: z.array(z.uuid()).min(1).max(500),
    // Optional user adjustment (e.g. "más cálida"); treated as data, never as
    // system instructions.
    instruction: z.string().trim().min(1).max(500).optional(),
  })
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
