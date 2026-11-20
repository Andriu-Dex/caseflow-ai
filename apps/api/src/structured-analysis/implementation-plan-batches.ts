import { AIError } from '@caseflow-ai/ai';
import {
  IMPLEMENTATION_RESERVED_FIELDS,
  implementationPlanContentSchema,
  type ClassDiagramContent,
  type ImplementationPlanBody,
  type ImplementationSkeleton,
  type LooseImplementationRoute,
  type UiBlueprintContent,
} from '@caseflow-ai/contracts';
import { conceptualCardinality, entityClasses } from './conceptual-model-batches';
import { bindAuthenticationActions } from './implementation-plan-authentication';
import { collectionPath } from '../code-generation/naming';

// DEC-144: entity classes and screens per batch; an entity or a route carries
// its fields or actions, so a batch of this size fits one response.
export const IP_BATCH_SIZE = 8;
// Times a batch is asked for: once, and twice more for what it left out.
export const IP_BATCH_ATTEMPTS = 3;
// Times the actions a routes batch left unserved are asked for.
export const IP_ACTION_ATTEMPTS = 2;

export type IpModule = ImplementationPlanBody['modules'][number];
export type IpEntity = ImplementationPlanBody['entities'][number];
export type IpEndpoint = ImplementationPlanBody['customEndpoints'][number];
export type IpRoute = ImplementationPlanBody['routes'][number];
export type DomainClass = ClassDiagramContent['classes'][number];
export type ClassRelationship = ClassDiagramContent['relationships'][number];
export type BlueprintScreen = UiBlueprintContent['screens'][number];
export type EntityDraft = Omit<IpEntity, 'relations'>;

export interface PlanContext {
  moduleIds: Set<string>;
  roles: Set<string>;
  sourceCodes: Set<string>;
}

const invalid = (message: string): never => {
  throw new AIError('AI_INVALID_OUTPUT', message);
};
const key = (value: string) => value.trim().toLocaleLowerCase('es');
const ascii = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '');
const words = (value: string) =>
  ascii(value)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
const pascal = (value: string) => {
  const name = words(value)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join('');
  return /^[A-Z]/.test(name) ? name : `E${name}`;
};
const camel = (value: string) => {
  const name = pascal(value);
  return name[0]!.toLowerCase() + name.slice(1);
};
const slug = (value: string) => words(value).join('-').toLowerCase() || 'pantalla';
const unique = (base: string, taken: Set<string>, join = '') => {
  let value = base;
  for (let n = 2; taken.has(value); n += 1) value = `${base}${join}${n}`;
  taken.add(value);
  return value;
};
const roleList = (list: string[], context: PlanContext) =>
  [...new Set(list)].filter((role) => context.roles.has(role));
const cited = (codes: string[] | undefined, context: PlanContext) =>
  [...new Set(codes ?? [])].filter((code) => context.sourceCodes.has(code));

export function planEntityBatches(classes: DomainClass[]): DomainClass[][] {
  const entities = entityClasses(classes);
  return Array.from({ length: Math.ceil(entities.length / IP_BATCH_SIZE) }, (_, index) =>
    entities.slice(index * IP_BATCH_SIZE, (index + 1) * IP_BATCH_SIZE),
  );
}
export function planRouteBatches(screens: BlueprintScreen[]): BlueprintScreen[][] {
  return Array.from({ length: Math.ceil(screens.length / IP_BATCH_SIZE) }, (_, index) =>
    screens.slice(index * IP_BATCH_SIZE, (index + 1) * IP_BATCH_SIZE),
  );
}

export function cleanSkeleton(
  skeleton: ImplementationSkeleton,
  sourceCodes: Set<string>,
): ImplementationSkeleton {
  const ids = new Set(skeleton.modules.map((module) => module.localId));
  const names = new Set(skeleton.modules.map((module) => module.name));
  if (ids.size !== skeleton.modules.length || names.size !== skeleton.modules.length)
    invalid('El esqueleto repite el identificador o el nombre de un módulo.');
  return {
    ...skeleton,
    authentication: {
      ...skeleton.authentication,
      roles: [...new Set(skeleton.authentication.roles)],
    },
    modules: skeleton.modules.map((module) => ({
      ...module,
      relatedSourceCodes: [...new Set(module.relatedSourceCodes ?? [])].filter((code) =>
        sourceCodes.has(code),
      ),
    })),
    envVars: skeleton.envVars.filter(
      (value, index, all) => all.findIndex((other) => other.name === value.name) === index,
    ),
  };
}

// Adds one batch's entities to those already drawn. Each belongs to one of the
// batch's classes (an entity of a class already done is dropped, one of a class
// that does not exist refuses the batch). Anything else the plan checks across
// the whole (module, roles, names, fields) is corrected here instead of
// failing a long run.
export function mergeEntityBatch(
  accumulated: IpEntity[],
  output: { entities: EntityDraft[] },
  targets: DomainClass[],
  context: PlanContext,
  allClassIds: Set<string>,
): IpEntity[] {
  const entities = accumulated.map((entity) => ({ ...entity }));
  const ids = new Set(entities.map((entity) => entity.localId));
  const names = new Set(entities.map((entity) => entity.name));
  const inBatch = new Set(targets.map((cls) => cls.localId));
  const drawn = new Set<string>();
  const firstModule = [...context.moduleIds][0]!;
  for (const draft of output.entities) {
    const classId = draft.classLocalId;
    if (!classId) invalid('Una entidad no indica la clase del diagrama que persiste.');
    if (!inBatch.has(classId!)) {
      if (allClassIds.has(classId!) && entities.some((entity) => entity.classLocalId === classId))
        continue;
      invalid('Una entidad persiste una clase que no es de este lote.');
    }
    if (drawn.has(classId!)) invalid('El lote repite la entidad de una clase.');
    drawn.add(classId!);
    const fieldNames = new Set<string>();
    const fields = draft.fields
      .filter((field) => {
        if ((IMPLEMENTATION_RESERVED_FIELDS as readonly string[]).includes(field.name))
          return false;
        if (fieldNames.has(field.name)) return false;
        fieldNames.add(field.name);
        return true;
      })
      .map((field) =>
        field.type === 'ENUM' && !field.enumValues.length
          ? { ...field, type: 'STRING' as const }
          : field.type !== 'ENUM' && field.enumValues.length
            ? { ...field, enumValues: [] }
            : field,
      );
    if (!fields.length)
      fields.push({ name: 'name', type: 'STRING', required: true, unique: false, enumValues: [] });
    entities.push({
      ...draft,
      localId: unique(draft.localId, ids, '-'),
      name: unique(draft.name, names),
      moduleLocalId: context.moduleIds.has(draft.moduleLocalId) ? draft.moduleLocalId : firstModule,
      fields,
      relations: [],
      readRoles: roleList(draft.readRoles, context),
      writeRoles: roleList(draft.writeRoles, context),
      relatedSourceCodes: cited(draft.relatedSourceCodes, context),
    });
  }
  return entities;
}

export const classesWithoutPlanEntity = (entities: IpEntity[], targets: DomainClass[]) => {
  const done = new Set(entities.map((entity) => entity.classLocalId));
  return targets.filter((cls) => !done.has(cls.localId));
};

const FIELD_TYPES: [RegExp, IpEntity['fields'][number]['type']][] = [
  [/^(int|integer|long|number|entero)/i, 'INT'],
  [/^(decimal|float|double|money|currency|monto)/i, 'DECIMAL'],
  [/^(bool)/i, 'BOOLEAN'],
  [/^(datetime|timestamp)/i, 'DATETIME'],
  [/^(date|fecha)/i, 'DATE'],
  [/^(text|texto)/i, 'TEXT'],
];

// Last resort for a class the model never answered for: its entity comes from
// the class itself, with the types read from its attributes.
export function fillMissingEntities(
  accumulated: IpEntity[],
  missing: DomainClass[],
  allClasses: DomainClass[],
  context: PlanContext,
  moduleOf: (cls: DomainClass) => string | undefined,
): IpEntity[] {
  const entities = [...accumulated];
  const ids = new Set(entities.map((entity) => entity.localId));
  const names = new Set(entities.map((entity) => entity.name));
  const enums = new Map(
    allClasses
      .filter((cls) => cls.stereotype === 'ENUMERATION')
      .map((cls) => [key(cls.name), cls] as const),
  );
  const firstModule = [...context.moduleIds][0]!;
  for (const cls of missing) {
    const fieldNames = new Set<string>();
    const fields: IpEntity['fields'] = [];
    for (const attribute of cls.attributes) {
      const name = camel(attribute.name);
      if ((IMPLEMENTATION_RESERVED_FIELDS as readonly string[]).includes(name)) continue;
      if (fieldNames.has(name)) continue;
      fieldNames.add(name);
      const closedSet = enums.get(key(attribute.type));
      const values = closedSet
        ? [
            ...new Set(
              closedSet.attributes.map((value) => words(value.name).join('_').toUpperCase()),
            ),
          ].filter((value) => /^[A-Z]/.test(value))
        : [];
      fields.push({
        name,
        type: values.length
          ? 'ENUM'
          : (FIELD_TYPES.find(([pattern]) => pattern.test(attribute.type))?.[1] ?? 'STRING'),
        required: attribute.required,
        unique: false,
        enumValues: values,
      });
    }
    if (!fields.length)
      fields.push({ name: 'name', type: 'STRING', required: true, unique: false, enumValues: [] });
    const module = moduleOf(cls);
    entities.push({
      localId: unique(`entity-${slug(cls.name)}`, ids),
      name: unique(pascal(cls.name), names),
      moduleLocalId: module && context.moduleIds.has(module) ? module : firstModule,
      classLocalId: cls.localId,
      ...(cls.description ? { description: cls.description.slice(0, 500) } : {}),
      fields,
      relations: [],
      operations: ['LIST', 'GET', 'CREATE', 'UPDATE', 'DELETE'],
      readRoles: [],
      writeRoles: [],
      relatedSourceCodes: cited(cls.relatedSourceCodes, context),
    });
  }
  return entities;
}

// Relations are not asked of the model: they follow from the class diagram.
// The many side holds a MANY_TO_ONE to the one side; one-to-one and
// many-to-many sit on the relationship's origin. Inheritance has no relation.
export function addRelations(entities: IpEntity[], relationships: ClassRelationship[]): IpEntity[] {
  const result = entities.map((entity) => ({ ...entity, relations: [...entity.relations] }));
  const byClass = new Map(result.map((entity) => [entity.classLocalId, entity]));
  const joined = new Set<string>();
  for (const relationship of relationships) {
    if (relationship.kind === 'INHERITANCE') continue;
    const a = byClass.get(relationship.fromLocalId);
    const b = byClass.get(relationship.toLocalId);
    if (!a || !b || a === b) continue;
    // Two entities may be related in more than one way: only the same label
    // between them is a repeat.
    const pair = `${[a.localId, b.localId].sort().join('|')}|${key(relationship.label ?? relationship.kind)}`;
    if (joined.has(pair)) continue;
    joined.add(pair);
    const { swap, cardinality } = conceptualCardinality(relationship);
    // The "one" end and the end that holds the relation.
    const one = swap ? b : a;
    const many = swap ? a : b;
    const holder = cardinality === 'ONE_TO_MANY' ? many : a;
    const target = holder === a ? (cardinality === 'ONE_TO_MANY' ? one : b) : one;
    const taken = new Set([
      ...holder.fields.map((f) => f.name),
      ...holder.relations.map((r) => r.name),
    ]);
    const oneMultiplicity = swap ? relationship.toMultiplicity : relationship.fromMultiplicity;
    holder.relations.push({
      name: unique(camel(target.name), taken),
      kind:
        cardinality === 'ONE_TO_MANY'
          ? 'MANY_TO_ONE'
          : cardinality === 'ONE_TO_ONE'
            ? 'ONE_TO_ONE'
            : 'MANY_TO_MANY',
      targetEntityLocalId: target.localId,
      required: cardinality === 'ONE_TO_MANY' && oneMultiplicity === '1',
    });
  }
  return result;
}

export interface RoutesAccumulated {
  routes: IpRoute[];
  customEndpoints: IpEndpoint[];
}

const endpointKey = (endpoint: Pick<IpEndpoint, 'method' | 'path'>) =>
  `${endpoint.method} ${endpoint.path}`;

// Adds one batch's routes and custom endpoints. A route shows one of the
// batch's screens; its actions are kept only when the screen has them and an
// operation or endpoint that exists serves them.
// The model writes path parameters in lower case ([saleid], :saleid); they are
// camelCase names, so a trailing "id" is capitalised.
export const camelParams = (value: string) =>
  value.replace(/([:[])([a-z][a-z0-9]*[a-z0-9])id(?![A-Za-z0-9])/g, '$1$2Id');
const camelAction = <A extends LooseImplementationRoute['actions'][number]>(action: A): A => ({
  ...action,
  ...(action.endpoint ? { endpoint: camelParams(action.endpoint) } : {}),
  ...(action.navigation
    ? {
        navigation: {
          ...action.navigation,
          routePath: camelParams(action.navigation.routePath),
          ...(action.navigation.sourceEndpoint
            ? { sourceEndpoint: camelParams(action.navigation.sourceEndpoint) }
            : {}),
        },
      }
    : {}),
});

// An action that creates a record of its own entity (POST) receives the
// fields a person enters for it: required, neither read-only, internal nor
// given by the server. A model may leave one out (a price), and nothing could
// fill it. Records an action derives from its input (seats from a layout) are
// left alone.
function withCreatedFields(accumulated: RoutesAccumulated, entities: IpEntity[]) {
  const byId = new Map(entities.map((entity) => [entity.localId, entity]));
  return {
    ...accumulated,
    customEndpoints: accumulated.customEndpoints.map((endpoint) => {
      const body = endpoint.contract?.body;
      if (!body || body.type !== 'OBJECT' || endpoint.method !== 'POST') return endpoint;
      const names = new Set((body.properties ?? []).map((property) => property.name));
      const fields = (endpoint.dataAccess ?? [])
        .filter(
          (access) =>
            access.entityLocalId === endpoint.entityLocalId && access.operations.includes('CREATE'),
        )
        .flatMap((access) => byId.get(access.entityLocalId)?.fields ?? []);
      // An input the record stores as one of a set of values takes that set
      // (a payment method given as free text would not fit the column).
      const enums = new Map(
        fields.filter((field) => field.type === 'ENUM').map((field) => [field.name, field]),
      );
      const properties = (body.properties ?? []).map((property) => {
        const field = enums.get(property.name);
        return field && property.value.type === 'STRING'
          ? {
              ...property,
              value: { ...property.value, type: 'ENUM' as const, enumValues: field.enumValues },
            }
          : property;
      });
      const aligned = properties.some((property, index) => property !== body.properties![index]);
      const missing = fields.filter(
        (field) =>
          field.required &&
          !field.readOnly &&
          !field.internal &&
          field.serverDefault === undefined &&
          !names.has(field.name) &&
          (names.add(field.name), true),
      );
      if (!missing.length && !aligned) return endpoint;
      return {
        ...endpoint,
        contract: {
          ...endpoint.contract!,
          body: {
            ...body,
            properties: [
              ...properties,
              ...missing.map((field) => ({
                name: field.name,
                required: true,
                value: {
                  type: field.type === 'TEXT' ? ('STRING' as const) : field.type,
                  ...(field.description ? { description: field.description } : {}),
                  ...(field.type === 'ENUM' ? { enumValues: field.enumValues } : {}),
                },
              })),
            ],
          },
        },
      };
    }),
  };
}

// A batch may refer to what another batch was to define. Once all are in, a
// context query that is no GET endpoint with a contract is dropped, and so is
// a navigation to a route nobody drew (its action is then settled like any
// unserved one); a navigation whose result query cannot give the identifier
// becomes a plain one.
function dropDanglingReferences(accumulated: RoutesAccumulated): RoutesAccumulated {
  const queries = new Map(
    accumulated.customEndpoints
      .filter((endpoint) => endpoint.method === 'GET' && endpoint.contract)
      .map((endpoint) => [endpointKey(endpoint), endpoint]),
  );
  const paths = new Set(accumulated.routes.map((route) => route.path));
  const gives = (navigation: NonNullable<IpRoute['actions'][number]['navigation']>) => {
    const response = queries.get(navigation.sourceEndpoint ?? '')?.contract?.response;
    const shape = navigation.collectionField
      ? response?.properties?.find((field) => field.name === navigation.collectionField)?.value
          .items
      : response;
    const id = shape?.properties?.find((field) => field.name === navigation.idField);
    return (
      id?.value.type === 'UUID' &&
      id.required !== false &&
      !id.value.nullable &&
      navigation.routePath.split('[').length === 2
    );
  };
  return {
    // A write takes an input object and a read none, and the page a write
    // opens on success must exist and get its identifier from the response.
    customEndpoints: accumulated.customEndpoints.map((endpoint) => {
      const contract = endpoint.contract;
      if (!contract) return endpoint;
      const writes = ['POST', 'PATCH', 'PUT'].includes(endpoint.method);
      const next = contract.successNavigation;
      const id = contract.response.properties?.find((field) => field.name === next?.idField);
      const opens =
        next &&
        next.routePath.split('[').length === 2 &&
        paths.has(next.routePath) &&
        id &&
        id.required !== false &&
        !id.value.nullable &&
        ['STRING', 'UUID'].includes(id.value.type);
      const { body, successNavigation: _next, ...rest } = contract;
      void _next;
      return {
        ...endpoint,
        contract: {
          ...rest,
          ...(writes ? { body: body ?? { type: 'OBJECT' as const, properties: [] } } : {}),
          ...(opens ? { successNavigation: next } : {}),
        },
      };
    }),
    routes: accumulated.routes.map((route) => {
      const contextQueries = route.contextQueries?.filter((query) => queries.has(query));
      const read = new Set([
        ...(contextQueries ?? []),
        ...route.actions.flatMap((action) => (action.endpoint ? [action.endpoint] : [])),
      ]);
      return {
        ...route,
        contextQueries: contextQueries?.length ? contextQueries : undefined,
        actions: route.actions.flatMap((action): IpRoute['actions'] => {
          const navigation = action.navigation;
          if (!navigation) return [action];
          if (!paths.has(navigation.routePath)) return [];
          if (
            navigation.sourceEndpoint &&
            !(read.has(navigation.sourceEndpoint) && gives(navigation))
          )
            return [{ label: action.label, navigation: { routePath: navigation.routePath } }];
          return [action];
        }),
      };
    }),
  };
}

// What serves an action: the endpoint when it exists, else the route it opens
// (finishRoutes checks the route exists once every batch is in), else the
// operation when the entity offers it; null when none does. A strict answer
// fills every key, so an operation next to an endpoint or a navigation is
// usually filler: the more specific choice wins.
function serveAction(
  action: {
    label: string;
    operation?: IpEntity['operations'][number];
    endpoint?: string;
    navigation?: IpRoute['actions'][number]['navigation'];
  },
  entity: IpEntity | undefined,
  endpointKeys: Set<string>,
): IpRoute['actions'][number] | null {
  if (action.endpoint && endpointKeys.has(action.endpoint))
    return { label: action.label, endpoint: action.endpoint };
  if (action.navigation) return { label: action.label, navigation: action.navigation };
  if (action.operation && entity?.operations.includes(action.operation))
    return { label: action.label, operation: action.operation };
  return null;
}

export function mergeRouteBatch(
  accumulated: RoutesAccumulated,
  output: { routes: LooseImplementationRoute[]; customEndpoints: IpEndpoint[] },
  targets: BlueprintScreen[],
  entities: IpEntity[],
  context: PlanContext,
  allScreenIds: Set<string>,
): RoutesAccumulated {
  output = {
    routes: output.routes.map((route) => ({
      ...route,
      path: camelParams(route.path),
      ...(route.contextQueries ? { contextQueries: route.contextQueries.map(camelParams) } : {}),
      actions: route.actions.map(camelAction),
    })),
    customEndpoints: output.customEndpoints.map((endpoint) => ({
      ...endpoint,
      path: camelParams(endpoint.path),
    })),
  };
  const routes = [...accumulated.routes];
  const endpoints = [...accumulated.customEndpoints];
  const endpointKeys = new Set(endpoints.map(endpointKey));
  const firstModule = [...context.moduleIds][0]!;
  const entityById = new Map(entities.map((entity) => [entity.localId, entity]));
  const screens = new Map(targets.map((screen) => [screen.localId, screen]));
  for (const endpoint of output.customEndpoints) {
    if (endpointKeys.has(endpointKey(endpoint))) continue;
    endpointKeys.add(endpointKey(endpoint));
    endpoints.push({
      ...endpoint,
      // Built-in operations and views belong to local authentication, which a
      // batch does not define; a strict answer fills these keys anyway.
      builtin: undefined,
      moduleLocalId: context.moduleIds.has(endpoint.moduleLocalId)
        ? endpoint.moduleLocalId
        : firstModule,
      entityLocalId:
        endpoint.entityLocalId && entityById.has(endpoint.entityLocalId)
          ? endpoint.entityLocalId
          : undefined,
      roles: roleList(endpoint.roles, context),
      relatedSourceCodes: cited(endpoint.relatedSourceCodes, context),
    });
  }
  const paths = new Set(routes.map((route) => route.path));
  const done = new Set(routes.map((route) => route.screenLocalId));
  for (const route of output.routes) {
    const screen = route.screenLocalId ? screens.get(route.screenLocalId) : undefined;
    // A route of no screen (often one the model adds, such as sign-out) is
    // skipped; a screen it left without a route is asked for again.
    if (!route.screenLocalId) continue;
    if (!screen) {
      if (allScreenIds.has(route.screenLocalId!) && done.has(route.screenLocalId)) continue;
      invalid('Una ruta muestra una pantalla que no es de este lote.');
    }
    const entity = route.entityLocalId ? entityById.get(route.entityLocalId) : undefined;
    const labels = new Set([...screen!.primaryActions, ...screen!.secondaryActions]);
    const seenLabels = new Set<string>();
    // One server per action: the operation when the entity offers it, else the
    // endpoint when it exists; an action neither serves is dropped.
    const actions: IpRoute['actions'] = [];
    for (const action of route.actions) {
      if (!labels.has(action.label) || seenLabels.has(action.label)) continue;
      const served = serveAction(action, entity, endpointKeys);
      if (!served) continue;
      seenLabels.add(action.label);
      actions.push(served);
    }
    routes.push({
      ...route,
      builtinView: undefined,
      // A path ending in a parameter takes the suffix as its own segment.
      path: unique(route.path, paths, route.path.endsWith(']') ? '/' : '-'),
      moduleLocalId: context.moduleIds.has(route.moduleLocalId)
        ? route.moduleLocalId
        : (entity?.moduleLocalId ?? firstModule),
      entityLocalId: entity?.localId,
      actions,
      relatedSourceCodes: cited(route.relatedSourceCodes, context),
    });
  }
  return { routes, customEndpoints: endpoints };
}

// The primary actions of the routes of these screens that nothing serves yet
// and that no CRUD operation of the route's entity would (finishRoutes does
// that one): what the model is asked for once more.
export function pendingActions(
  accumulated: RoutesAccumulated,
  targets: BlueprintScreen[],
  entities: IpEntity[],
) {
  const entityById = new Map(entities.map((entity) => [entity.localId, entity]));
  const screens = new Map(targets.map((screen) => [screen.localId, screen]));
  return accumulated.routes.flatMap((route) => {
    const screen = route.screenLocalId ? screens.get(route.screenLocalId) : undefined;
    if (!screen) return [];
    const entity = route.entityLocalId ? entityById.get(route.entityLocalId) : undefined;
    const served = new Set(route.actions.map((action) => action.label));
    const pending = screen.primaryActions.filter((label) => {
      if (served.has(label)) return false;
      const operation = ACTION_OPERATIONS.find(([pattern]) => pattern.test(label))?.[1];
      return !(operation && entity?.operations.includes(operation));
    });
    return pending.length
      ? [
          {
            screenLocalId: screen.localId,
            path: route.path,
            entityLocalId: route.entityLocalId,
            pendingActions: pending,
          },
        ]
      : [];
  });
}

// Adds the endpoints of the follow-up and attaches each pending action to its
// route when the operation or the endpoint it names exists.
export function mergeActionBatch(
  accumulated: RoutesAccumulated,
  output: {
    routes: { screenLocalId: string; actions: LooseImplementationRoute['actions'] }[];
    customEndpoints: IpEndpoint[];
  },
  screens: BlueprintScreen[],
  entities: IpEntity[],
  context: PlanContext,
): RoutesAccumulated {
  const screenById = new Map(screens.map((screen) => [screen.localId, screen]));
  output = {
    ...output,
    routes: output.routes.map((route) => ({ ...route, actions: route.actions.map(camelAction) })),
  };
  const withEndpoints = mergeRouteBatch(
    accumulated,
    { routes: [], customEndpoints: output.customEndpoints },
    [],
    entities,
    context,
    new Set(),
  );
  const endpointKeys = new Set(withEndpoints.customEndpoints.map(endpointKey));
  const entityById = new Map(entities.map((entity) => [entity.localId, entity]));
  const routes = withEndpoints.routes.map((route) => {
    const given = output.routes.find((item) => item.screenLocalId === route.screenLocalId);
    if (!given) return route;
    const entity = route.entityLocalId ? entityById.get(route.entityLocalId) : undefined;
    const taken = new Set(route.actions.map((action) => action.label));
    const added: IpRoute['actions'] = [];
    const own = new Set(screenById.get(route.screenLocalId ?? '')?.primaryActions ?? []);
    for (const action of given.actions) {
      if (taken.has(action.label) || !own.has(action.label)) continue;
      const served = serveAction(action, entity, endpointKeys);
      if (!served) continue;
      taken.add(action.label);
      added.push(served);
    }
    return added.length ? { ...route, actions: [...route.actions, ...added] } : route;
  });
  return { routes, customEndpoints: withEndpoints.customEndpoints };
}

export const screensWithoutRoute = (accumulated: RoutesAccumulated, targets: BlueprintScreen[]) => {
  const done = new Set(accumulated.routes.map((route) => route.screenLocalId));
  return targets.filter((screen) => !done.has(screen.localId));
};

// Last resort for a screen the model drew no route for: one that shows it.
export function fillMissingRoutes(
  accumulated: RoutesAccumulated,
  missing: BlueprintScreen[],
  context: PlanContext,
): RoutesAccumulated {
  const paths = new Set(accumulated.routes.map((route) => route.path));
  const firstModule = [...context.moduleIds][0]!;
  return {
    customEndpoints: accumulated.customEndpoints,
    routes: [
      ...accumulated.routes,
      ...missing.map((screen): IpRoute => ({
        path: unique(`/${slug(screen.name)}`, paths, '-'),
        screenName: screen.name,
        screenLocalId: screen.localId,
        moduleLocalId: firstModule,
        kind: 'CUSTOM',
        actions: [],
        relatedSourceCodes: cited(screen.relatedSourceCodes, context),
      })),
    ],
  };
}

const ACTION_OPERATIONS: [RegExp, IpEntity['operations'][number]][] = [
  [/(crear|nuev[oa]|registr|agreg|añad|alta|create|new|add)/i, 'CREATE'],
  [/(edit|modific|actualiz|update)/i, 'UPDATE'],
  [/(elimin|borrar|quitar|delete|remove)/i, 'DELETE'],
  [/(ver|detalle|consult|abrir|view|detail|open)/i, 'GET'],
  [/(list|busc|filtr|search|filter)/i, 'LIST'],
];

// Last word on routes: a primary action no operation serves yet is served by
// the CRUD operation its label names, when the route's entity offers it; an
// endpoint no action uses is dropped.
const READ_ACTION =
  /(consult|^ver\b|exhib|exam|list|busc|filtr|compar|descarg|export|revis|mostr|abrir|detalle|actualizar la consulta)/i;

export function finishRoutes(
  accumulated: RoutesAccumulated,
  screens: BlueprintScreen[],
  entities: IpEntity[],
  roles: string[] = [],
): RoutesAccumulated {
  accumulated = withCreatedFields(
    dropDanglingReferences(bindAuthenticationActions(accumulated)),
    entities,
  );
  const entityById = new Map(entities.map((entity) => [entity.localId, entity]));
  const screenById = new Map(screens.map((screen) => [screen.localId, screen]));
  const routes = accumulated.routes.map((route) => {
    const entity = route.entityLocalId ? entityById.get(route.entityLocalId) : undefined;
    const screen = route.screenLocalId ? screenById.get(route.screenLocalId) : undefined;
    if (!entity || !screen) return route;
    const served = new Set(route.actions.map((action) => action.label));
    const extra = screen.primaryActions
      .filter((label) => !served.has(label))
      .flatMap((label): IpRoute['actions'] => {
        const operation = ACTION_OPERATIONS.find(([pattern]) => pattern.test(label))?.[1];
        return operation && entity.operations.includes(operation) ? [{ label, operation }] : [];
      });
    return extra.length ? { ...route, actions: [...route.actions, ...extra] } : route;
  });
  // An action still unserved is served by an endpoint of its route: a query
  // (GET at the route's path, shared) when it only reads, else a numbered POST. Roles come from the route's entity, or are all of them.
  const endpoints = [...accumulated.customEndpoints];
  const known = new Set(endpoints.map(endpointKey));
  const served = routes.map((route) => {
    const screen = route.screenLocalId ? screenById.get(route.screenLocalId) : undefined;
    const apiPath = route.path.replace(/\[([a-z][A-Za-z0-9]*)\]/g, ':$1');
    if (!screen || apiPath === '/') return route;
    const entity = route.entityLocalId ? entityById.get(route.entityLocalId) : undefined;
    const done = new Set(route.actions.map((action) => action.label));
    const extra: IpRoute['actions'] = [];
    let generic = [...known].filter((key) => key.startsWith(`POST ${apiPath}/actions/`)).length;
    for (const label of screen.primaryActions.filter((item) => !done.has(item))) {
      const reads = READ_ACTION.test(label);
      // A writing action nothing named gets a neutral, numbered endpoint of its
      // route (the quality check asks for it to be renamed).
      const path = reads ? apiPath : `${apiPath}/actions/${++generic}`;
      const endpoint = `${reads ? 'GET' : 'POST'} ${path}`;
      if (!known.has(endpoint)) {
        known.add(endpoint);
        const allowed = (reads ? entity?.readRoles : entity?.writeRoles)?.length
          ? reads
            ? entity!.readRoles
            : entity!.writeRoles
          : roles;
        endpoints.push({
          moduleLocalId: route.moduleLocalId,
          method: reads ? 'GET' : 'POST',
          path,
          summary: (reads
            ? `Consulta de los datos de la pantalla «${screen.name}».`
            : `Acción «${label}» de la pantalla «${screen.name}».`
          ).slice(0, 300),
          ...(route.entityLocalId ? { entityLocalId: route.entityLocalId } : {}),
          roles: allowed,
        });
      }
      extra.push({ label, endpoint });
    }
    return extra.length ? { ...route, actions: [...route.actions, ...extra] } : route;
  });
  // An endpoint is kept when an action, a context query or a navigation reads it.
  const used = new Set(
    served.flatMap((route) => [
      ...(route.contextQueries ?? []),
      ...route.actions.flatMap((a) => [a.endpoint, a.navigation?.sourceEndpoint]),
    ]),
  );
  return {
    routes: served,
    customEndpoints: endpoints.filter((endpoint) => used.has(endpointKey(endpoint))),
  };
}

// One unit and one integration test per module, and an end-to-end test for
// each module that has routes: predictable, so they are not asked of the model.
export function derivedTests(
  modules: IpModule[],
  routes: IpRoute[],
): ImplementationPlanBody['tests'] {
  return modules.flatMap((module) => [
    {
      moduleLocalId: module.localId,
      kind: 'UNIT' as const,
      description: `Pruebas unitarias de las reglas del módulo ${module.name}.`,
    },
    {
      moduleLocalId: module.localId,
      kind: 'INTEGRATION' as const,
      description: `Pruebas de integración de la API del módulo ${module.name}.`,
    },
    ...(routes.some((route) => route.moduleLocalId === module.localId)
      ? [
          {
            moduleLocalId: module.localId,
            kind: 'E2E' as const,
            description: `Pruebas de extremo a extremo de las pantallas del módulo ${module.name}.`,
          },
        ]
      : []),
  ]);
}

// Where each part of the plan comes from, when the model cited nothing: the
// plan is built from the frozen design, so its modules come from the generation
// plan and the software architecture, its entities from the conceptual model
// and the class diagram, its routes from the UI blueprint and the navigation,
// and its endpoints from the system architecture.
export interface PlanProvenance {
  modules: string[];
  entities: string[];
  routes: string[];
  endpoints: string[];
}
const withProvenance = <T extends { relatedSourceCodes?: string[] }>(items: T[], codes: string[]) =>
  items.map((item) =>
    item.relatedSourceCodes?.length || !codes.length
      ? item
      : { ...item, relatedSourceCodes: codes },
  );
export function fillProvenance(
  skeleton: ImplementationSkeleton,
  entities: IpEntity[],
  routes: RoutesAccumulated,
  provenance: PlanProvenance,
) {
  return {
    skeleton: { ...skeleton, modules: withProvenance(skeleton.modules, provenance.modules) },
    entities: withProvenance(entities, provenance.entities),
    routes: {
      routes: withProvenance(routes.routes, provenance.routes),
      customEndpoints: withProvenance(routes.customEndpoints, provenance.endpoints),
    },
  };
}

export function finishImplementationPlan(
  skeleton: ImplementationSkeleton,
  entities: IpEntity[],
  routes: RoutesAccumulated,
  designBaselineId: string,
): ImplementationPlanBody {
  // The CRUD operations some screen uses, as `entity:operation`.
  const used = new Set(
    routes.routes.flatMap((route) =>
      route.actions.flatMap((action) =>
        route.entityLocalId && action.operation
          ? [`${route.entityLocalId}:${action.operation}`]
          : [],
      ),
    ),
  );
  // Where each CRUD operation is served, as the generated API exposes it.
  const crud: Record<IpEntity['operations'][number], [string, boolean]> = {
    LIST: ['GET', false],
    CREATE: ['POST', false],
    GET: ['GET', true],
    UPDATE: ['PATCH', true],
    DELETE: ['DELETE', true],
  };
  const signature = (method: string, path: string) =>
    `${method} ${path.replace(/:[a-zA-Z0-9]+/g, '{}')}`;
  const custom = new Set(routes.customEndpoints.map((e) => signature(e.method, e.path)));
  entities = entities.map((entity) => {
    const base = collectionPath(entity.name);
    const operations = entity.operations.filter((operation) => {
      if (used.has(`${entity.localId}:${operation}`)) return true;
      // A record with a required read-only field the server gives no value (an
      // amount or a date its business action computes) is created only by that
      // action: a generic CREATE no screen uses could not fill it.
      if (
        operation === 'CREATE' &&
        entity.localId !== skeleton.authentication.local?.userEntityLocalId &&
        entity.fields.some(
          (field) => field.readOnly && field.required && field.serverDefault === undefined,
        )
      )
        return false;
      // A business endpoint at the same method and path (a delete with its own
      // rule) replaces the generic operation no screen uses.
      const [method, item] = crud[operation];
      return !custom.has(signature(method, item ? `${base}/:id` : base));
    });
    return operations.length === entity.operations.length ? entity : { ...entity, operations };
  });
  const body = {
    ...skeleton,
    entities,
    customEndpoints: routes.customEndpoints,
    routes: routes.routes,
    tests: derivedTests(skeleton.modules, routes.routes),
  };
  const checked = implementationPlanContentSchema.safeParse({ ...body, designBaselineId });
  if (!checked.success) return invalid('El plan reunido contiene elementos inválidos.');
  const { designBaselineId: _id, ...plan } = checked.data;
  void _id;
  return plan;
}
