import { z } from 'zod';
import { implementationActionContractSchema } from './action-contract';
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
    label: text(200).optional(),
    internal: z.boolean().optional(),
    readOnly: z.boolean().optional(),
    serverDefault: z
      .union([z.string().max(1000), z.number().int().min(-2147483648).max(2147483647), z.boolean()])
      .optional(),
    type: z.enum(IMPLEMENTATION_FIELD_TYPES),
    required: z.boolean().default(true),
    unique: z.boolean().default(false),
    enumValues: z.array(enumValue()).max(30).default([]),
    description: text(300).optional(),
  })
  .strict()
  .superRefine((field, ctx) => {
    if (field.serverDefault === undefined) return;
    const valid =
      field.readOnly &&
      !field.internal &&
      ((['STRING', 'TEXT'].includes(field.type) &&
        typeof field.serverDefault === 'string' &&
        field.serverDefault.length > 0) ||
        (field.type === 'ENUM' &&
          typeof field.serverDefault === 'string' &&
          field.enumValues.includes(field.serverDefault)) ||
        (field.type === 'INT' && typeof field.serverDefault === 'number') ||
        (field.type === 'BOOLEAN' && typeof field.serverDefault === 'boolean'));
    if (!valid)
      ctx.addIssue({
        code: 'custom',
        message: 'El valor del servidor requiere un campo de solo lectura y un tipo compatible.',
        path: ['serverDefault'],
      });
  });
const implementationRelationSchema = z
  .object({
    name: camelName(),
    label: text(200).optional(),
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
    lifecycle: z
      .object({
        stateField: camelName(),
        initialState: text(100),
        immutableStates: z.array(text(100)).min(1).max(30),
        managedFields: z.array(camelName()).max(20).default([]),
      })
      .strict()
      .optional(),
    compositionOwnerRelation: camelName().optional(),
    description: text(500).optional(),
    operationScope: z
      .object({
        paths: z.array(z.array(camelName()).max(8)).min(1).max(16),
        includeUnscoped: z.boolean().default(false),
        ownerRelation: camelName().optional(),
        actorRelation: camelName().optional(),
      })
      .strict()
      .optional(),
    fields: z.array(implementationFieldSchema).min(1).max(60),
    uniqueConstraints: z.array(z.array(camelName()).min(2).max(8)).max(20).optional(),
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
    contract: implementationActionContractSchema.optional(),
    disabledReason: text(500).optional(),
    rules: z
      .array(
        z
          .object({
            localId: localId(),
            description: text(2000),
            relatedSourceCodes: z.array(text(40)).max(30),
          })
          .strict(),
      )
      .max(30)
      .optional(),
    moduleLocalId: localId(),
    method: z.enum(IMPLEMENTATION_HTTP_METHODS),
    path: text(200).regex(
      /^\/[a-z0-9-]+(?:\/(?:[a-z0-9-]+|:[a-z][A-Za-z0-9]*))*$/,
      'Use una ruta en minúsculas, p. ej. /orders/:orderId/confirm.',
    ),
    summary: text(300),
    builtin: z
      .enum([
        'LOGIN',
        'LOGOUT',
        'AUTHORIZED_OPTIONS',
        'ACCOUNT_DEACTIVATE',
        'AUTH_CONTEXT',
        'SELECT_SCOPE',
      ])
      .optional(),
    scopeAccess: z.enum(['SELECTED', 'ASSIGNED_SET']).optional(),
    dataAccess: z
      .array(
        z
          .object({
            entityLocalId: localId(),
            operations: z
              .array(z.enum(['READ', 'CREATE', 'UPDATE', 'DELETE']))
              .min(1)
              .max(4),
          })
          .strict(),
      )
      .max(100)
      .optional(),
    entityLocalId: localId().optional(),
    roles: z.array(text(60)).max(20).default([]),
    relatedSourceCodes: z.array(text(40)).max(100).optional(),
  })
  .strict();
export const IMPLEMENTATION_ROUTE_ACTION_INTERACTIONS = [
  'QUERY',
  'REFETCH',
  'PAGINATE_PREVIOUS',
  'PAGINATE_NEXT',
] as const;
export type ImplementationRouteActionInteraction =
  (typeof IMPLEMENTATION_ROUTE_ACTION_INTERACTIONS)[number];

// A screen action (as the UI blueprint names it) and what serves it: one of
// the route entity's CRUD operations or a custom endpoint ("POST /orders/:id/x").
const routeNavigationSchema = z
  .object({
    routePath: text(200),
    sourceEndpoint: text(220).optional(),
    collectionField: camelName().optional(),
    idField: camelName().optional(),
  })
  .strict()
  .refine(
    (value) =>
      Boolean(value.sourceEndpoint) === Boolean(value.idField) &&
      (!value.collectionField || Boolean(value.sourceEndpoint)),
    {
      message: 'La navegación de resultados requiere consulta y campo identificador explícitos.',
    },
  );
const implementationRouteActionSchema = z
  .object({
    label: text(200),
    operation: z.enum(IMPLEMENTATION_CRUD_OPERATIONS).optional(),
    endpoint: text(220).optional(),
    navigation: routeNavigationSchema.optional(),
    interaction: z.enum(IMPLEMENTATION_ROUTE_ACTION_INTERACTIONS).optional(),
  })
  .strict()
  .refine(
    (action) => [action.operation, action.endpoint, action.navigation].filter(Boolean).length === 1,
    {
      message: 'Cada acción la atiende una operación CRUD o un endpoint, exactamente uno.',
    },
  )
  .refine(
    (action) => {
      if (!action.interaction) return true;
      if (action.interaction === 'PAGINATE_NEXT' || action.interaction === 'PAGINATE_PREVIOUS') {
        return (
          action.operation === 'LIST' ||
          (action.endpoint ? action.endpoint.startsWith('GET ') : false)
        );
      }
      if (action.interaction === 'QUERY' || action.interaction === 'REFETCH') {
        return (
          action.operation === 'LIST' ||
          action.operation === 'GET' ||
          (action.endpoint ? action.endpoint.startsWith('GET ') : false)
        );
      }
      return true;
    },
    {
      message:
        'Las interacciones de paginación solo aplican a operaciones LIST o endpoints GET; las de consulta y recarga solo a operaciones de lectura.',
    },
  );
const implementationRouteSchema = z
  .object({
    path: text(200).regex(
      /^\/(?:[a-z0-9-]+(?:\/(?:[a-z0-9-]+|\[[a-z][A-Za-z0-9]*\]))*)?$/,
      'Use una ruta Next.js en minúsculas, p. ej. /orders/[orderId].',
    ),
    screenName: text(200),
    roles: z.array(text(60)).max(20).optional(),
    // DEC-121: the UI blueprint screen (localId) this route renders.
    screenLocalId: localId().optional(),
    moduleLocalId: localId(),
    kind: z.enum(IMPLEMENTATION_ROUTE_KINDS),
    builtinView: z.enum(['ACCOUNT_ACCESS']).optional(),
    entityLocalId: localId().optional(),
    actions: z.array(implementationRouteActionSchema).max(20).default([]),
    contextQueries: z.array(text(220)).max(10).optional(),
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
      .object({
        required: z.boolean(),
        roles: z.array(text(60)).max(20).default([]),
        local: z
          .object({
            scope: z
              .object({
                entityLocalId: localId(),
                accountRelation: camelName(),
                labelField: camelName(),
                statusField: camelName(),
                activeStatus: text(60),
                displayNameField: camelName(),
                displayFields: z
                  .array(z.object({ field: camelName(), label: text(100) }).strict())
                  .max(10)
                  .default([]),
                unrestrictedRoles: z.array(text(60)).min(1).max(20),
                label: text(100).default('Ámbito de operación'),
                pluralLabel: text(100).default('Ámbitos de operación'),
                permissionRelation: camelName(),
                permissionOperationField: camelName(),
              })
              .strict()
              .optional(),
            audit: z
              .object({
                entityLocalId: localId(),
                userRelation: camelName(),
                occurredAtField: camelName(),
                resultField: camelName(),
                correlationField: camelName(),
              })
              .strict()
              .optional(),
            userEntityLocalId: localId(),
            loginField: camelName(),
            passwordHashField: camelName(),
            statusField: camelName(),
            activeStatus: text(60),
            inactiveStatus: text(60).optional(),
            roleRelation: camelName(),
            roleNameField: camelName(),
            sessionEntityLocalId: localId(),
            sessionUserRelation: camelName(),
            startedAtField: camelName(),
            lastActivityAtField: camelName(),
            invalidatedAtField: camelName(),
            sessionStatusField: camelName(),
            activeSessionStatus: text(60),
            closedSessionStatus: text(60),
          })
          .strict()
          .optional(),
      })
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
export const implementationPlanAIOutputSchema = implementationPlanBodySchema.extend({
  customEndpoints: z
    .array(implementationEndpointSchema.omit({ disabledReason: true }))
    .max(100)
    .default([]),
});

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
    navigation: routeNavigationSchema.optional(),
    interaction: z.enum(IMPLEMENTATION_ROUTE_ACTION_INTERACTIONS).optional(),
  })
  .strict();
const looseRouteSchema = implementationRouteSchema.extend({
  actions: z.array(looseRouteActionSchema).max(20).default([]),
});
export type LooseImplementationRoute = z.output<typeof looseRouteSchema>;
// The actions of existing routes that nothing served yet, and the endpoints
// that serve them (a short follow-up to a routes batch).
export const implementationActionsOutputSchema = z
  .object({
    routes: z
      .array(
        z
          .object({
            screenLocalId: localId(),
            actions: z.array(looseRouteActionSchema).max(20).default([]),
          })
          .strict(),
      )
      .min(1)
      .max(40),
    customEndpoints: z
      .array(implementationEndpointSchema.omit({ disabledReason: true }))
      .max(40)
      .default([]),
  })
  .strict();
export const implementationRoutesBatchOutputSchema = z
  .object({
    routes: z.array(looseRouteSchema).min(1).max(40),
    customEndpoints: z
      .array(implementationEndpointSchema.omit({ disabledReason: true }))
      .max(40)
      .default([]),
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
      if (entity.lifecycle) {
        const policy = entity.lifecycle;
        const state = entity.fields.find((field) => field.name === policy.stateField);
        if (
          !state ||
          state.type !== 'ENUM' ||
          state.readOnly ||
          state.internal ||
          (state.serverDefault !== undefined && state.serverDefault !== policy.initialState) ||
          !state.enumValues.includes(policy.initialState) ||
          policy.immutableStates.some((value) => !state.enumValues.includes(value)) ||
          policy.immutableStates.includes(policy.initialState) ||
          new Set(policy.immutableStates).size !== policy.immutableStates.length ||
          policy.managedFields.includes(policy.stateField) ||
          policy.managedFields.some(
            (name) =>
              !entity.fields.some(
                (field) =>
                  field.name === name &&
                  field.readOnly &&
                  (!field.required || field.serverDefault !== undefined),
              ),
          )
        ) {
          issue(
            'El ciclo de vida requiere estados y campos existentes; el estado inicial debe ser editable.',
            ['entities', i, 'lifecycle'],
          );
        }
      }
      if (entity.compositionOwnerRelation) {
        const relation = entity.relations.find(
          (item) => item.name === entity.compositionOwnerRelation,
        );
        const owner = value.entities.find((item) => item.localId === relation?.targetEntityLocalId);
        if (
          !relation ||
          relation.kind !== 'MANY_TO_ONE' ||
          !relation.required ||
          !owner?.lifecycle ||
          owner === entity ||
          owner.compositionOwnerRelation
        ) {
          issue(
            'La composición requiere una relación MANY_TO_ONE a un propietario con ciclo de vida explícito.',
            ['entities', i, 'compositionOwnerRelation'],
          );
        }
      }
      const constraintFields = new Set([
        ...entity.fields.map((field) => field.name),
        ...entity.relations
          .filter((relation) => relation.kind !== 'MANY_TO_MANY')
          .map((relation) => relation.name + 'Id'),
      ]);
      if (
        new Set(entity.uniqueConstraints?.map((fields) => [...fields].sort().join(','))).size !==
        (entity.uniqueConstraints?.length ?? 0)
      )
        issue('Las claves únicas no pueden repetirse.', ['entities', i, 'uniqueConstraints']);
      for (const fields of entity.uniqueConstraints ?? [])
        if (
          new Set(fields).size !== fields.length ||
          fields.some((field) => !constraintFields.has(field))
        )
          issue('La clave única requiere campos escalares existentes y distintos.', [
            'entities',
            i,
            'uniqueConstraints',
          ]);
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
    const local = value.authentication.local;
    const scope = local?.scope;
    if (value.entities.some((entity) => entity.operationScope) && !scope)
      issue('El alcance de las entidades requiere un perfil de contexto de operación.', [
        'authentication',
        'local',
      ]);
    if (local) {
      const account = value.entities.find((e) => e.localId === local.userEntityLocalId);
      const session = value.entities.find((e) => e.localId === local.sessionEntityLocalId);
      const roleLink = account?.relations.find((r) => r.name === local.roleRelation);
      const roleEntity = value.entities.find((e) => e.localId === roleLink?.targetEntityLocalId);
      if (scope) {
        const scopeEntity = value.entities.find((entity) => entity.localId === scope.entityLocalId);
        const assigned = account?.relations.find(
          (relation) => relation.name === scope.accountRelation,
        );
        const permissionLink = roleEntity?.relations.find(
          (relation) => relation.name === scope.permissionRelation,
        );
        const permissionEntity = value.entities.find(
          (entity) => entity.localId === permissionLink?.targetEntityLocalId,
        );
        if (
          !scopeEntity ||
          assigned?.kind !== 'MANY_TO_MANY' ||
          assigned.targetEntityLocalId !== scope.entityLocalId ||
          !scopeEntity.fields.some(
            (field) =>
              field.name === scope.labelField && field.type === 'STRING' && !field.internal,
          ) ||
          !scopeEntity.fields.some(
            (field) => field.name === scope.statusField && ['STRING', 'ENUM'].includes(field.type),
          ) ||
          !account?.fields.some(
            (field) =>
              field.name === scope.displayNameField && field.type === 'STRING' && !field.internal,
          ) ||
          permissionLink?.kind !== 'MANY_TO_MANY' ||
          !permissionEntity?.fields.some(
            (field) =>
              field.name === scope.permissionOperationField &&
              field.type === 'STRING' &&
              field.unique,
          )
        )
          issue(
            'El contexto requiere alcance, asignaciones, identificación y permisos por operación válidos.',
            ['authentication', 'local', 'scope'],
          );
        if (
          scope.displayFields.some(
            (binding) =>
              !scopeEntity?.fields.some(
                (field) =>
                  field.name === binding.field &&
                  !field.internal &&
                  ['STRING', 'TEXT', 'ENUM'].includes(field.type),
              ),
          )
        )
          issue(
            'Los datos visibles del contexto deben enlazar campos públicos de texto del ámbito.',
            ['authentication', 'local', 'scope', 'displayFields'],
          );
        checkRoles(scope.unrestrictedRoles, [
          'authentication',
          'local',
          'scope',
          'unrestrictedRoles',
        ]);
        if (
          !value.authentication.roles.length ||
          account?.writeRoles.some((role) => !scope.unrestrictedRoles.includes(role))
        )
          issue('La administración de cuentas requiere roles globales del perfil.', [
            'authentication',
            'local',
            'scope',
          ]);
        for (const entity of [roleEntity, permissionEntity])
          if (
            entity?.operations.some((operation) =>
              ['CREATE', 'UPDATE', 'DELETE'].includes(operation),
            ) &&
            (!entity.writeRoles.length ||
              entity.writeRoles.some((role) => !scope.unrestrictedRoles.includes(role)))
          )
            issue('La administración de autorizaciones requiere roles globales explícitos.', [
              'authentication',
              'local',
              'scope',
            ]);
        for (const [entity, name] of [
          [roleEntity, local.roleNameField],
          [permissionEntity, scope.permissionOperationField],
        ] as const)
          if (
            entity?.fields.some((field) => field.name !== name && field.required) ||
            entity?.relations.some(
              (relation) => relation.kind !== 'MANY_TO_MANY' && relation.required,
            )
          )
            issue(
              'Los catálogos de autorización no pueden requerir datos de negocio adicionales.',
              ['authentication', 'local', 'scope'],
            );
        const pathsToScope = (entityId: string, visited = new Set<string>()): string[][] => {
          if (entityId === scope.entityLocalId) return [[]];
          if (visited.has(entityId) || visited.size >= 8) return [];
          const next = new Set(visited).add(entityId);
          return value.entities
            .find((entity) => entity.localId === entityId)!
            .relations.filter((relation) => relation.kind !== 'MANY_TO_MANY')
            .flatMap((relation) =>
              pathsToScope(relation.targetEntityLocalId, next).map((path) => [
                relation.name,
                ...path,
              ]),
            );
        };
        for (const [index, entity] of value.entities.entries()) {
          const requiredPaths = pathsToScope(entity.localId);
          if (
            requiredPaths.some(
              (path) =>
                !entity.operationScope?.paths.some(
                  (declared) => JSON.stringify(path) === JSON.stringify(declared),
                ),
            )
          )
            issue('Debe declarar todas las rutas de propiedad hacia el contexto de operación.', [
              'entities',
              index,
              'operationScope',
            ]);
          for (const path of entity.operationScope?.paths ?? []) {
            let target = entity;
            for (const part of path) {
              const link = target.relations.find(
                (relation) => relation.name === part && relation.kind !== 'MANY_TO_MANY',
              );
              const next = value.entities.find(
                (candidate) => candidate.localId === link?.targetEntityLocalId,
              );
              if (!next) {
                issue('La ruta de alcance debe recorrer relaciones singulares existentes.', [
                  'entities',
                  index,
                  'operationScope',
                ]);
                break;
              }
              target = next;
            }
            if (target.localId !== scope.entityLocalId)
              issue('La ruta de alcance debe terminar en la entidad del contexto.', [
                'entities',
                index,
                'operationScope',
              ]);
          }
          if (
            entity.operationScope?.ownerRelation &&
            !entity.relations.some(
              (relation) =>
                relation.name === entity.operationScope!.ownerRelation &&
                relation.kind !== 'MANY_TO_MANY' &&
                relation.targetEntityLocalId === local.userEntityLocalId,
            )
          )
            issue('El propietario del registro debe referenciar la cuenta autenticada.', [
              'entities',
              index,
              'operationScope',
              'ownerRelation',
            ]);
          if (
            entity.operationScope?.actorRelation &&
            !entity.relations.some(
              (relation) =>
                relation.name === entity.operationScope!.actorRelation &&
                relation.kind !== 'MANY_TO_MANY' &&
                relation.targetEntityLocalId === local.userEntityLocalId,
            )
          )
            issue('El autor del registro debe referenciar la cuenta autenticada.', [
              'entities',
              index,
              'operationScope',
              'actorRelation',
            ]);
        }
      }
      const login = account?.fields.find((f) => f.name === local.loginField);
      const hash = account?.fields.find((f) => f.name === local.passwordHashField);
      if (
        !value.authentication.required ||
        !account ||
        !session ||
        !login?.unique ||
        !login.required ||
        login.type !== 'STRING' ||
        !hash?.internal ||
        !hash.required ||
        hash.type !== 'STRING'
      )
        issue(
          'La autenticación local requiere cuenta, sesión, identificador único y hash interno de contraseña.',
          ['authentication', 'local'],
        );
      if (
        !account?.fields.some(
          (f) => f.name === local.statusField && ['STRING', 'ENUM'].includes(f.type),
        ) ||
        roleLink?.kind !== 'MANY_TO_MANY' ||
        !roleEntity?.fields.some(
          (f) => f.name === local.roleNameField && f.unique && f.required && f.type === 'STRING',
        )
      )
        issue('La autenticación local requiere estado y relación de roles con nombre único.', [
          'authentication',
          'local',
        ]);
      for (const name of [
        local.startedAtField,
        local.lastActivityAtField,
        local.invalidatedAtField,
      ])
        if (!session?.fields.some((f) => f.name === name && f.type === 'DATETIME'))
          issue('El modelo de sesión no contiene sus fechas de vigencia.', [
            'authentication',
            'local',
          ]);
      if (
        !session?.fields.some(
          (f) => f.name === local.sessionStatusField && ['STRING', 'ENUM'].includes(f.type),
        ) ||
        !session?.relations.some(
          (r) =>
            r.name === local.sessionUserRelation &&
            r.kind === 'MANY_TO_ONE' &&
            r.targetEntityLocalId === account?.localId,
        )
      )
        issue('La sesión debe pertenecer a una cuenta y tener estado.', [
          'authentication',
          'local',
        ]);
      if (session?.operations.length)
        issue('La sesión se administra por autenticación, sin CRUD público.', [
          'authentication',
          'local',
        ]);
      if (
        new Set([local.loginField, local.passwordHashField, local.statusField]).size !== 3 ||
        new Set([
          local.startedAtField,
          local.lastActivityAtField,
          local.invalidatedAtField,
          local.sessionStatusField,
        ]).size !== 4
      )
        issue('Los campos de identidad y vigencia deben tener funciones distintas.', [
          'authentication',
          'local',
        ]);
      if (session?.fields.find((field) => field.name === local.invalidatedAtField)?.required)
        issue('La fecha de invalidación debe permitir una sesión todavía activa.', [
          'authentication',
          'local',
        ]);
      if (local.audit) {
        const audit = local.audit;
        const events = value.entities.find((entity) => entity.localId === audit.entityLocalId);
        if (
          !events ||
          !events.fields.some(
            (field) => field.name === audit.occurredAtField && field.type === 'DATETIME',
          ) ||
          !events.fields.some(
            (field) => field.name === audit.resultField && field.type === 'STRING',
          ) ||
          !events.fields.some(
            (field) => field.name === audit.correlationField && field.type === 'STRING',
          ) ||
          !events.relations.some(
            (relation) =>
              relation.name === audit.userRelation &&
              relation.kind === 'MANY_TO_ONE' &&
              relation.targetEntityLocalId === account?.localId &&
              !relation.required,
          ) ||
          events.operations.some((operation) => !['LIST', 'GET'].includes(operation))
        )
          issue(
            'La auditoría de acceso requiere fechas, resultado, correlación y cuenta opcional, sin escritura CRUD pública.',
            ['authentication', 'local', 'audit'],
          );
      }
    }
    value.customEndpoints.forEach((endpoint, i) => {
      if (endpoint.disabledReason && (endpoint.builtin || endpoint.contract))
        issue(
          'Una acción desactivada no reemplaza autenticación ni declara un contrato ejecutable.',
          ['customEndpoints', i, 'disabledReason'],
        );
      if (endpoint.contract) {
        for (const binding of endpoint.contract.bindings ?? [])
          if (binding.kind === 'ACTION' || binding.kind === 'PREFILL') {
            const source = value.customEndpoints.find(
              (source) =>
                `${source.method} ${source.path}` === binding.sourceEndpoint &&
                (source.method === 'GET' ||
                  (source.method === 'POST' &&
                    Boolean(local?.scope) &&
                    Boolean(source.dataAccess?.length) &&
                    source.dataAccess!.every((access) =>
                      access.operations.every((operation) => operation === 'READ'),
                    ))),
            );
            const output = source?.contract?.response.properties?.find(
              (field) => field.name === binding.sourceField,
            );
            const input = endpoint.contract.body?.properties?.find(
              (field) => field.name === binding.field,
            );
            if (
              binding.requireTrue &&
              !source?.contract?.response.properties?.some(
                (field) =>
                  field.name === binding.requireTrue &&
                  field.value.type === 'BOOLEAN' &&
                  field.required !== false &&
                  !field.value.nullable,
              )
            )
              issue('La condición requiere un resultado booleano obligatorio de la consulta.', [
                'customEndpoints',
                i,
                'contract',
                'bindings',
              ]);
            if (
              !output ||
              output.required === false ||
              output.value.nullable ||
              output.value.type !== input?.value.type
            )
              issue(
                'El enlace requiere una salida obligatoria y compatible de una consulta declarada.',
                ['customEndpoints', i, 'contract', 'bindings'],
              );
          }
        if (endpoint.contract.successNavigation) {
          const next = endpoint.contract.successNavigation;
          const field = endpoint.contract.response.properties?.find(
            (field) => field.name === next.idField,
          );
          if (
            !value.routes.some(
              (route) =>
                route.path === next.routePath && (route.path.match(/\[/g)?.length ?? 0) === 1,
            ) ||
            !field ||
            field.required === false ||
            field.value.nullable ||
            !['STRING', 'UUID'].includes(field.value.type)
          )
            issue('La navegación requiere una ruta existente y un identificador en la respuesta.', [
              'customEndpoints',
              i,
              'contract',
              'successNavigation',
            ]);
        }
        if (
          endpoint.builtin ||
          ['POST', 'PATCH', 'PUT'].includes(endpoint.method) !== Boolean(endpoint.contract.body)
        )
          issue(
            'El contrato de una acción requiere entrada para escrituras y no reemplaza operaciones integradas.',
            ['customEndpoints', i, 'contract'],
          );
        const internal = new Set(
          value.entities.flatMap((entity) =>
            entity.fields.filter((field) => field.internal).map((field) => field.name),
          ),
        );
        const inspect = (node: import('./action-contract').ActionValueDefinition) => {
          if (
            node.referenceEntityLocalId &&
            !value.entities.some(
              (entity) =>
                entity.localId === node.referenceEntityLocalId &&
                entity.operations.includes('LIST'),
            )
          )
            issue('La referencia de entrada requiere una entidad con consulta de opciones.', [
              'customEndpoints',
              i,
              'contract',
            ]);
          for (const field of node.properties ?? []) {
            if (internal.has(field.name))
              issue('Los campos internos no pueden exponerse en contratos de acciones.', [
                'customEndpoints',
                i,
                'contract',
              ]);
            inspect(field.value);
          }
          if (node.items) inspect(node.items);
        };
        for (const part of [
          endpoint.contract.body,
          endpoint.contract.query,
          endpoint.contract.response,
        ])
          if (part) inspect(part);
      }
      if (endpoint.builtin) {
        const expected = {
          LOGIN: 'POST /auth/login',
          LOGOUT: 'POST /auth/logout',
          AUTHORIZED_OPTIONS: 'GET /auth/options',
          ACCOUNT_DEACTIVATE: 'POST /auth/accounts/:userId/deactivate',
          AUTH_CONTEXT: 'GET /auth/context',
          SELECT_SCOPE: 'POST /auth/context',
        }[endpoint.builtin];
        if (endpoint.builtin === 'ACCOUNT_DEACTIVATE' && !local?.inactiveStatus)
          issue('Indique el estado de cuenta desactivada.', [
            'authentication',
            'local',
            'inactiveStatus',
          ]);
        if (
          endpoint.builtin === 'ACCOUNT_DEACTIVATE' &&
          (!endpoint.roles.length ||
            endpoint.roles.some(
              (role) =>
                !value.entities
                  .find((entity) => entity.localId === local?.userEntityLocalId)
                  ?.writeRoles.includes(role),
            ))
        )
          issue('Desactivar cuentas exige los roles administrativos de la cuenta.', [
            'customEndpoints',
            i,
            'roles',
          ]);
        if (!local || expected !== endpoint.method + ' ' + endpoint.path)
          issue('La operación integrada requiere autenticación local y su ruta contractual.', [
            'customEndpoints',
            i,
          ]);
        if (['AUTH_CONTEXT', 'SELECT_SCOPE'].includes(endpoint.builtin) && !scope)
          issue('Esta operación requiere contexto de operación.', [
            'customEndpoints',
            i,
            'builtin',
          ]);
      }
      if (
        endpoint.scopeAccess === 'ASSIGNED_SET' &&
        (!scope ||
          endpoint.method !== 'GET' ||
          !endpoint.roles.length ||
          endpoint.roles.some((role) => !scope.unrestrictedRoles.includes(role)))
      )
        issue('La consulta entre alcances requiere GET y roles globales explícitos.', [
          'customEndpoints',
          i,
          'scopeAccess',
        ]);
      if (scope && !endpoint.builtin && !endpoint.dataAccess)
        issue('La acción de negocio requiere capacidades de datos explícitas.', [
          'customEndpoints',
          i,
          'dataAccess',
        ]);
      if (!modules.has(endpoint.moduleLocalId))
        issue('El endpoint referencia un módulo inexistente.', ['customEndpoints', i]);
      if (endpoint.entityLocalId && !entities.has(endpoint.entityLocalId))
        issue('El endpoint referencia una entidad inexistente.', ['customEndpoints', i]);
      checkRoles(endpoint.roles, ['customEndpoints', i, 'roles']);
      for (const access of endpoint.dataAccess ?? []) {
        if (
          !entities.has(access.entityLocalId) ||
          access.entityLocalId === local?.sessionEntityLocalId
        )
          issue('La capacidad de datos debe referenciar una entidad de negocio, no sesiones.', [
            'customEndpoints',
            i,
            'dataAccess',
          ]);
      }
    });
    if (!uniqueBy(value.customEndpoints, (e) => `${e.method} ${e.path}`))
      issue('Cada endpoint (método y ruta) debe ser único.', ['customEndpoints']);
    value.routes.forEach((route, i) => {
      if (
        route.builtinView === 'ACCOUNT_ACCESS' &&
        (!scope ||
          route.entityLocalId !== local?.userEntityLocalId ||
          !route.roles?.length ||
          route.roles.some((role) => !scope.unrestrictedRoles.includes(role)))
      )
        issue(
          'La edición de acceso requiere la cuenta del perfil y roles administrativos explícitos.',
          ['routes', i, 'builtinView'],
        );
      checkRoles(route.roles ?? [], ['routes', i, 'roles']);
      if (!modules.has(route.moduleLocalId))
        issue('La ruta referencia un módulo inexistente.', ['routes', i]);
      if (route.entityLocalId && !entities.has(route.entityLocalId))
        issue('La ruta referencia una entidad inexistente.', ['routes', i]);
      const entity = value.entities.find((e) => e.localId === route.entityLocalId);
      for (const query of route.contextQueries ?? []) {
        if (
          !value.customEndpoints.some(
            (endpoint) =>
              endpoint.method === 'GET' &&
              `${endpoint.method} ${endpoint.path}` === query &&
              endpoint.contract,
          )
        )
          issue('El contexto requiere una consulta GET declarada con contrato.', [
            'routes',
            i,
            'contextQueries',
          ]);
      }
      route.actions.forEach((action, j) => {
        if (action.navigation) {
          const navigation = action.navigation;
          const target = value.routes.find((item) => item.path === navigation.routePath);
          if (!target)
            issue('La navegación requiere una ruta declarada.', ['routes', i, 'actions', j]);
          if (navigation.sourceEndpoint) {
            const source = value.customEndpoints.find(
              (endpoint) =>
                endpoint.method === 'GET' &&
                `${endpoint.method} ${endpoint.path}` === navigation.sourceEndpoint,
            );
            const shape = navigation.collectionField
              ? source?.contract?.response.properties?.find(
                  (field) => field.name === navigation.collectionField,
                )?.value.items
              : source?.contract?.response;
            const identifier = shape?.properties?.find(
              (field) => field.name === navigation.idField,
            );
            if (
              !identifier ||
              identifier.value.type !== 'UUID' ||
              identifier.required === false ||
              identifier.value.nullable ||
              (target?.path.match(/\[/g)?.length ?? 0) !== 1 ||
              !(
                route.contextQueries?.includes(navigation.sourceEndpoint) ||
                route.actions.some((item) => item.endpoint === navigation.sourceEndpoint)
              )
            )
              issue(
                'La navegación requiere un identificador UUID obligatorio de una consulta de la pantalla y una ruta con un parámetro.',
                ['routes', i, 'actions', j],
              );
          }
        }
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
        const endpoint = value.customEndpoints.find(
          (endpoint) => `${endpoint.method} ${endpoint.path}` === action.endpoint,
        );
        for (const binding of endpoint?.contract?.bindings ?? [])
          if (
            (binding.kind === 'ACTION' || binding.kind === 'PREFILL') &&
            !route.actions.some((source) => source.endpoint === binding.sourceEndpoint) &&
            !route.contextQueries?.includes(binding.sourceEndpoint)
          )
            issue('La pantalla debe ofrecer la consulta que alimenta la acción.', [
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
