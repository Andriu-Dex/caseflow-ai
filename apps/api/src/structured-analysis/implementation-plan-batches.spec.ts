import { describe, expect, it } from 'vitest';
import {
  addRelations,
  classesWithoutPlanEntity,
  cleanSkeleton,
  derivedTests,
  fillMissingEntities,
  fillMissingRoutes,
  finishRoutes,
  mergeEntityBatch,
  mergeRouteBatch,
  screensWithoutRoute,
  type BlueprintScreen,
  type ClassRelationship,
  type DomainClass,
  type IpEntity,
  type PlanContext,
} from './implementation-plan-batches';

const context: PlanContext = {
  moduleIds: new Set(['orders', 'stock']),
  roles: new Set(['Admin']),
  sourceCodes: new Set(['RF-001']),
};
const cls = (localId: string, name: string, extra: Partial<DomainClass> = {}): DomainClass => ({
  localId,
  name,
  stereotype: 'ENTITY',
  attributes: [],
  methods: [],
  ...extra,
});
const entity = (
  localId: string,
  classLocalId: string,
  extra: Partial<IpEntity> = {},
): IpEntity => ({
  localId,
  name: `E${localId}`,
  moduleLocalId: 'orders',
  classLocalId,
  fields: [{ name: 'name', type: 'STRING', required: true, unique: false, enumValues: [] }],
  relations: [],
  operations: ['LIST', 'CREATE'],
  readRoles: [],
  writeRoles: [],
  ...extra,
});
const draft = (localId: string, classLocalId: string, extra: Partial<IpEntity> = {}) => {
  const { relations: _relations, ...rest } = entity(localId, classLocalId, extra);
  void _relations;
  return rest;
};
const screen = (localId: string, extra: Partial<BlueprintScreen> = {}): BlueprintScreen => ({
  localId,
  name: `Pantalla ${localId}`,
  purpose: 'Pantalla.',
  targetActors: [],
  relatedUseCaseCodes: [],
  sections: [],
  primaryActions: [],
  secondaryActions: [],
  principalData: [],
  forms: [],
  states: [],
  ...extra,
});

describe('cleanSkeleton', () => {
  const module = (localId: string, name: string) => ({
    localId,
    name,
    description: 'M.',
    relatedSourceCodes: ['RF-001', 'XX-1'],
  });
  const skeleton = (modules: ReturnType<typeof module>[]) => ({
    authentication: { required: true, roles: ['Admin', 'Admin'] },
    modules,
    envVars: [],
  });
  it('drops unknown sources and repeated roles, and refuses repeated modules', () => {
    const cleaned = cleanSkeleton(skeleton([module('a', 'Orders')]), context.sourceCodes);
    expect(cleaned.modules[0]!.relatedSourceCodes).toEqual(['RF-001']);
    expect(cleaned.authentication.roles).toEqual(['Admin']);
    expect(() =>
      cleanSkeleton(skeleton([module('a', 'Orders'), module('b', 'Orders')]), context.sourceCodes),
    ).toThrow('repite');
  });
});

describe('mergeEntityBatch', () => {
  const targets = [cls('a', 'A'), cls('b', 'B')];
  const all = new Set(['a', 'b', 'c']);
  it('corrects what the plan cross-checks instead of failing', () => {
    const merged = mergeEntityBatch(
      [],
      {
        entities: [
          draft('x', 'a', {
            moduleLocalId: 'nope',
            readRoles: ['Admin', 'Ghost'],
            fields: [
              { name: 'id', type: 'STRING', required: true, unique: false, enumValues: [] },
              { name: 'kind', type: 'ENUM', required: true, unique: false, enumValues: [] },
              { name: 'note', type: 'TEXT', required: false, unique: false, enumValues: ['X'] },
            ],
          }),
        ],
      },
      targets,
      context,
      all,
    );
    expect(merged[0]).toMatchObject({ moduleLocalId: 'orders', readRoles: ['Admin'] });
    expect(merged[0]!.fields).toEqual([
      expect.objectContaining({ name: 'kind', type: 'STRING' }),
      expect.objectContaining({ name: 'note', type: 'TEXT', enumValues: [] }),
    ]);
  });
  it('keeps names unique, drops a class already done and refuses an unknown one', () => {
    const first = mergeEntityBatch(
      [],
      { entities: [draft('x', 'a', { name: 'Thing' })] },
      targets,
      context,
      all,
    );
    const second = mergeEntityBatch(
      first,
      { entities: [draft('x', 'a'), draft('y', 'b', { name: 'Thing' })] },
      [cls('b', 'B')],
      context,
      all,
    );
    expect(second.map((e) => e.name)).toEqual(['Thing', 'Thing2']);
    const merge = (value: IpEntity) =>
      mergeEntityBatch([], { entities: [draft('z', value.classLocalId!)] }, targets, context, all);
    expect(() => merge(entity('z', 'nope'))).toThrow('no es de este lote');
  });
});

describe('fillMissingEntities', () => {
  it('makes the entity of a class from its attributes, reading types and enumerations', () => {
    const classes = [
      cls('a', 'Pedido de Compra', {
        attributes: [
          { name: 'Fecha de entrega', type: 'Date', visibility: 'PRIVATE', required: true },
          { name: 'Total', type: 'Decimal', visibility: 'PRIVATE', required: true },
          { name: 'Estado', type: 'EstadoPedido', visibility: 'PRIVATE', required: false },
          { name: 'id', type: 'UUID', visibility: 'PRIVATE', required: true },
        ],
      }),
      cls('e', 'EstadoPedido', {
        stereotype: 'ENUMERATION',
        attributes: [
          { name: 'Abierto', type: 'String', visibility: 'PUBLIC', required: true },
          { name: 'Cerrado', type: 'String', visibility: 'PUBLIC', required: true },
        ],
      }),
    ];
    const [filled] = fillMissingEntities([], [classes[0]!], classes, context, () => 'stock');
    expect(filled).toMatchObject({
      name: 'PedidoDeCompra',
      moduleLocalId: 'stock',
      classLocalId: 'a',
    });
    expect(filled!.fields).toEqual([
      expect.objectContaining({ name: 'fechaDeEntrega', type: 'DATE' }),
      expect.objectContaining({ name: 'total', type: 'DECIMAL' }),
      expect.objectContaining({ name: 'estado', type: 'ENUM', enumValues: ['ABIERTO', 'CERRADO'] }),
    ]);
    expect(classesWithoutPlanEntity([filled!], classes)).toEqual([classes[1]]);
  });
});

describe('addRelations', () => {
  const entities = [entity('o', 'co', { name: 'Order' }), entity('c', 'cc', { name: 'Customer' })];
  const rel = (relation: Partial<ClassRelationship>): ClassRelationship => ({
    fromLocalId: 'co',
    toLocalId: 'cc',
    kind: 'ASSOCIATION',
    ...relation,
  });
  it('puts the relation on the many side, pointing at the one side', () => {
    const [order, customer] = addRelations(entities, [
      rel({ fromMultiplicity: '*', toMultiplicity: '1' }),
    ]);
    expect(order!.relations).toEqual([
      { name: 'customer', kind: 'MANY_TO_ONE', targetEntityLocalId: 'c', required: true },
    ]);
    expect(customer!.relations).toEqual([]);
  });
  it('joins a pair once, maps one-to-one and many-to-many, and ignores inheritance', () => {
    const [a, b] = addRelations(entities, [
      rel({ fromMultiplicity: '*', toMultiplicity: '*' }),
      rel({ fromMultiplicity: '1', toMultiplicity: '1' }),
      rel({ kind: 'INHERITANCE' }),
    ]);
    expect(a!.relations.map((r) => r.kind)).toEqual(['MANY_TO_MANY']);
    expect(b!.relations).toEqual([]);
  });
});

describe('routes', () => {
  const home = screen('home', {
    primaryActions: ['Nuevo pedido', 'Confirmar'],
    secondaryActions: ['Ver'],
  });
  const orders = [entity('o', 'co', { operations: ['LIST', 'CREATE'] })];
  const allScreens = new Set(['home', 'other']);
  const route = (extra: Record<string, unknown> = {}) => ({
    path: '/orders',
    screenName: 'Inicio',
    screenLocalId: 'home',
    moduleLocalId: 'nope',
    kind: 'LIST' as const,
    entityLocalId: 'o',
    actions: [],
    ...extra,
  });
  const merge = (value: ReturnType<typeof route>[], endpoints: never[] = []) =>
    mergeRouteBatch(
      { routes: [], customEndpoints: [] },
      { routes: value as never, customEndpoints: endpoints },
      [home],
      orders,
      context,
      allScreens,
    );
  it('keeps only the actions the screen has and something real serves', () => {
    const merged = merge([
      route({
        actions: [
          { label: 'Nuevo pedido', operation: 'CREATE' },
          { label: 'Nuevo pedido', operation: 'LIST' },
          { label: 'Ver', operation: 'GET' },
          { label: 'Otra', operation: 'LIST' },
          { label: 'Confirmar', endpoint: 'POST /nada' },
        ],
      }),
    ]);
    expect(merged.routes[0]!.actions).toEqual([{ label: 'Nuevo pedido', operation: 'CREATE' }]);
    expect(merged.routes[0]).toMatchObject({ moduleLocalId: 'orders', entityLocalId: 'o' });
  });
  it('makes paths unique, refuses a screen of no batch and asks for the missing ones again', () => {
    const merged = merge([route(), route()]);
    expect(merged.routes.map((r) => r.path)).toEqual(['/orders', '/orders-2']);
    expect(() => merge([route({ screenLocalId: 'nope' })])).toThrow('no es de este lote');
    expect(screensWithoutRoute({ routes: [], customEndpoints: [] }, [home])).toEqual([home]);
    const filled = fillMissingRoutes({ routes: [], customEndpoints: [] }, [home], context);
    expect(filled.routes[0]).toMatchObject({ path: '/pantalla-home', kind: 'CUSTOM' });
  });
  it('serves a primary action by the CRUD operation its label names and drops unused endpoints', () => {
    const done = finishRoutes(
      {
        routes: [route({ moduleLocalId: 'orders' }) as never],
        customEndpoints: [
          {
            moduleLocalId: 'orders',
            method: 'POST',
            path: '/orders/:id/x',
            summary: 'X',
            roles: [],
          },
        ],
      },
      [home],
      orders,
    );
    expect(done.routes[0]!.actions).toEqual([{ label: 'Nuevo pedido', operation: 'CREATE' }]);
    expect(done.customEndpoints).toEqual([]);
  });
});

describe('derivedTests', () => {
  it('plans unit and integration tests per module, and end-to-end ones where there are routes', () => {
    const modules = [
      { localId: 'orders', name: 'Orders', description: 'O.' },
      { localId: 'stock', name: 'Stock', description: 'S.' },
    ];
    const tests = derivedTests(modules, [{ moduleLocalId: 'orders' } as never]);
    expect(tests.map((t) => `${t.moduleLocalId}:${t.kind}`)).toEqual([
      'orders:UNIT',
      'orders:INTEGRATION',
      'orders:E2E',
      'stock:UNIT',
      'stock:INTEGRATION',
    ]);
  });
});
