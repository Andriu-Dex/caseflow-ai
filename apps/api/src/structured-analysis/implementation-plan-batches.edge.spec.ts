import { describe, expect, it } from 'vitest';
import {
  addRelations,
  fillMissingEntities,
  finishImplementationPlan,
  finishRoutes,
  mergeActionBatch,
  mergeEntityBatch,
  mergeRouteBatch,
  pendingActions,
  type BlueprintScreen,
  type DomainClass,
  type IpEntity,
  type PlanContext,
} from './implementation-plan-batches';

// Edge cases of the batches that draw the implementation plan: what is
// refused, skipped or filled in when the model's answer is incomplete.

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
const field = (name: string, type: string, extra: Record<string, unknown> = {}) => ({
  name,
  type,
  required: true,
  unique: false,
  enumValues: [],
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
  fields: [field('name', 'STRING')] as never,
  relations: [],
  operations: ['LIST', 'CREATE'],
  readRoles: [],
  writeRoles: [],
  ...extra,
});
const draft = (
  localId: string,
  classLocalId: string | undefined,
  extra: Record<string, unknown> = {},
) => {
  const { relations: _relations, ...rest } = entity(localId, classLocalId ?? '', {});
  void _relations;
  return { ...rest, classLocalId, ...extra };
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

const all = new Set(['ca', 'cb', 'cc']);

describe('mergeEntityBatch', () => {
  const merge = (
    drafts: unknown[],
    targets = [cls('ca', 'A'), cls('cb', 'B')],
    accumulated: IpEntity[] = [],
  ) => mergeEntityBatch(accumulated, { entities: drafts as never }, targets, context, all);

  it('refuses an entity with no class, of another batch or repeated in the batch', () => {
    expect(() => merge([draft('a', undefined)])).toThrow('no indica la clase');
    expect(() => merge([draft('x', 'cc')])).toThrow('no es de este lote');
    expect(() => merge([draft('a', 'ca'), draft('b', 'ca')])).toThrow('repite la entidad');
  });

  it('skips a class an earlier batch already detailed', () => {
    const earlier = entity('e1', 'cc');
    expect(merge([draft('x', 'cc')], [cls('ca', 'A')], [earlier])).toEqual([earlier]);
  });

  it('cleans the fields: reserved and repeated names go, a list without values or values without a list are fixed', () => {
    const [only] = merge([
      draft('a', 'ca', {
        fields: [
          field('id', 'STRING'),
          field('code', 'STRING'),
          field('code', 'INT'),
          field('kind', 'ENUM'),
          field('plain', 'STRING', { enumValues: ['X'] }),
          field('level', 'ENUM', { enumValues: ['LOW'] }),
        ],
      }),
    ]);
    expect(only!.fields.map((f) => [f.name, f.type, f.enumValues])).toEqual([
      ['code', 'STRING', []],
      ['kind', 'STRING', []],
      ['plain', 'STRING', []],
      ['level', 'ENUM', ['LOW']],
    ]);
  });

  it('gives an entity with no usable field a name field, and an unknown module the first one', () => {
    const [only] = merge([
      draft('a', 'ca', { fields: [field('id', 'STRING')], moduleLocalId: 'nope' }),
    ]);
    expect(only!.fields.map((f) => f.name)).toEqual(['name']);
    expect(only!.moduleLocalId).toBe('orders');
  });
});

describe('fillMissingEntities', () => {
  it('derives fields from the class: closed sets, types, repeats, no attributes and the module of the plan', () => {
    const attribute = (name: string, type: string, required = true) => ({
      name,
      type,
      visibility: 'PRIVATE',
      required,
    });
    const status = cls('st', 'Estado', {
      stereotype: 'ENUMERATION',
      attributes: [
        attribute('Activo', 'String'),
        attribute('activo', 'String'),
        attribute('1 cerrado', 'String'),
      ] as never,
    });
    const order = cls('co', '2 pedido', {
      description: 'D'.repeat(600),
      attributes: [
        attribute('estado', 'Estado'),
        attribute('estado', 'Estado'),
        attribute('id', 'UUID'),
        attribute('total', 'Decimal', false),
        attribute('rara', 'Cosa'),
      ] as never,
      relatedSourceCodes: ['RF-001', 'XX'],
    });
    const bare = cls('cb', 'Vacia');
    const [first, second] = fillMissingEntities(
      [],
      [order, bare],
      [order, bare, status],
      context,
      (candidate) => (candidate.localId === 'co' ? 'stock' : undefined),
    );
    expect(first!.name).toBe('E2Pedido');
    expect(first!.moduleLocalId).toBe('stock');
    expect(first!.description).toHaveLength(500);
    expect(first!.relatedSourceCodes).toEqual(['RF-001']);
    expect(Object.fromEntries(first!.fields.map((f) => [f.name, f.type]))).toMatchObject({
      estado: 'ENUM',
      total: 'DECIMAL',
      rara: 'STRING',
    });
    expect(first!.fields.find((f) => f.name === 'estado')!.enumValues).toEqual(['ACTIVO']);
    expect(second!.fields.map((f) => f.name)).toEqual(['name']);
    expect(second!.moduleLocalId).toBe('orders');
    expect(second!.description).toBeUndefined();
  });
});

describe('addRelations', () => {
  it('joins one-to-one and skips a relation with a missing end or to itself', () => {
    const entities = [entity('a', 'ca', { name: 'A' }), entity('b', 'cb', { name: 'B' })];
    const result = addRelations(entities, [
      {
        fromLocalId: 'ca',
        toLocalId: 'cb',
        kind: 'ASSOCIATION',
        fromMultiplicity: '1',
        toMultiplicity: '1',
      },
      { fromLocalId: 'ca', toLocalId: 'zz', kind: 'ASSOCIATION' },
      { fromLocalId: 'ca', toLocalId: 'ca', kind: 'ASSOCIATION' },
    ] as never);
    expect(result[0]!.relations.map((r) => r.kind)).toEqual(['ONE_TO_ONE']);
    expect(result[1]!.relations).toEqual([]);
  });
});

describe('routes', () => {
  const home = screen('home', { primaryActions: ['Nuevo'] });
  const orders = [entity('o', 'co', { operations: ['LIST', 'CREATE'] })];
  const base = { routes: [], customEndpoints: [] };
  const route = (extra: Record<string, unknown> = {}) => ({
    path: '/orders',
    screenName: 'Inicio',
    screenLocalId: 'home',
    moduleLocalId: 'orders',
    kind: 'LIST',
    actions: [],
    ...extra,
  });
  const endpoint = (extra: Record<string, unknown> = {}) => ({
    moduleLocalId: 'nope',
    method: 'POST',
    path: '/orders/:id/x',
    summary: 'X',
    entityLocalId: 'ghost',
    roles: ['Admin', 'Otro'],
    relatedSourceCodes: ['RF-001', 'XX'],
    ...extra,
  });
  const merge = (accumulated: unknown, routes: unknown[], endpoints: unknown[] = []) =>
    mergeRouteBatch(
      accumulated as never,
      { routes: routes as never, customEndpoints: endpoints as never },
      [home],
      orders,
      context,
      new Set(['home', 'other']),
    );

  it('cleans a custom endpoint (module, entity, roles, sources) and ignores a repeated one', () => {
    const merged = merge(base, [route()], [endpoint(), endpoint()]);
    expect(merged.customEndpoints).toHaveLength(1);
    expect(merged.customEndpoints[0]).toMatchObject({
      moduleLocalId: 'orders',
      roles: ['Admin'],
      relatedSourceCodes: ['RF-001'],
    });
    expect(merged.customEndpoints[0]!.entityLocalId).toBeUndefined();
    const kept = merge(base, [route()], [endpoint({ moduleLocalId: 'stock', entityLocalId: 'o' })]);
    expect(kept.customEndpoints[0]).toMatchObject({ moduleLocalId: 'stock', entityLocalId: 'o' });
  });

  it('refuses a route with no screen and skips the route of a screen already drawn', () => {
    expect(() => merge(base, [route({ screenLocalId: undefined })])).toThrow(
      'no indica la pantalla',
    );
    const earlier = { routes: [route({ screenLocalId: 'other' })], customEndpoints: [] };
    expect(merge(earlier, [route({ screenLocalId: 'other', path: '/x' })]).routes).toHaveLength(1);
  });

  it('takes the module of the route, or of its entity, or the first', () => {
    expect(
      merge(base, [route({ moduleLocalId: 'stock', entityLocalId: undefined })]).routes[0]!
        .moduleLocalId,
    ).toBe('stock');
    expect(
      merge(base, [route({ moduleLocalId: 'nope', entityLocalId: 'o' })]).routes[0]!.moduleLocalId,
    ).toBe('orders');
    expect(
      merge(base, [route({ moduleLocalId: 'nope', entityLocalId: 'ghost' })]).routes[0]!
        .moduleLocalId,
    ).toBe('orders');
  });

  it('does not ask for actions of a route with no known screen', () => {
    const unknown = {
      routes: [route({ screenLocalId: 'zz' }), route({ screenLocalId: undefined })],
      customEndpoints: [],
    };
    expect(pendingActions(unknown as never, [home], orders)).toEqual([]);
  });

  it('ignores answers for routes it did not ask about and actions the screen does not have', () => {
    const merged = mergeActionBatch(
      { routes: [route()], customEndpoints: [] } as never,
      {
        routes: [
          { screenLocalId: 'unknown', actions: [{ label: 'Nuevo', operation: 'CREATE' }] },
          {
            screenLocalId: 'home',
            actions: [{ label: 'Ajena', operation: 'CREATE' }, { label: 'Nuevo' }],
          },
        ],
        customEndpoints: [],
      } as never,
      [home],
      orders,
      context,
    );
    expect(merged.routes[0]!.actions).toEqual([]);
  });

  it('leaves the home route alone and gives a query the roles of the entity or of the plan', () => {
    const sale = screen('sale', { primaryActions: ['Examinar reporte'] });
    const withRoles = entity('o', 'co', { operations: ['GET'], readRoles: ['Admin'] });
    const done = finishRoutes(
      {
        routes: [
          route({ screenLocalId: 'sale', path: '/', entityLocalId: undefined }),
          route({ screenLocalId: 'sale', path: '/reports', entityLocalId: 'o' }),
          route({ screenLocalId: 'sale', path: '/stats', entityLocalId: undefined }),
        ] as never,
        customEndpoints: [],
      },
      [sale],
      [withRoles],
      ['Todos'],
    );
    expect(done.routes[0]!.actions).toEqual([]);
    const byPath = Object.fromEntries(done.customEndpoints.map((e) => [e.path, e.roles]));
    expect(byPath['/reports']).toEqual(['Admin']);
    expect(byPath['/stats']).toEqual(['Todos']);
  });
});

describe('finishing the plan', () => {
  it('refuses a plan whose pieces are invalid', () => {
    expect(() =>
      finishImplementationPlan(
        { authentication: { required: false, roles: [] }, modules: [], envVars: [] } as never,
        [],
        { routes: [], customEndpoints: [] },
        '11111111-1111-4111-8111-111111111111',
      ),
    ).toThrow('inválidos');
  });
});
