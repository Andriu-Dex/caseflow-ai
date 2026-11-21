import { describe, expect, it } from 'vitest';
import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import { deliveryOrderProblems, moduleDependencies, proposeDeliveries } from './delivery-order';

const route = (moduleLocalId: string, screenName: string, extra: Record<string, unknown> = {}) => ({
  moduleLocalId,
  screenName,
  actions: [],
  ...extra,
});

// Access (users, sessions, roles) is the base; sales use the catalog's
// actions; the catalog and the menus need each other; reports need sales.
const plan = {
  authentication: {
    required: true,
    local: {
      userEntityLocalId: 'user',
      sessionEntityLocalId: 'session',
      roleRelation: 'roles',
    },
  },
  modules: ['access', 'reports', 'sales', 'catalog', 'menus'].map((localId) => ({
    localId,
    name: localId[0]!.toUpperCase() + localId.slice(1),
    description: localId,
  })),
  entities: [
    {
      localId: 'user',
      moduleLocalId: 'access',
      relations: [{ name: 'roles', targetEntityLocalId: 'role' }],
    },
    { localId: 'session', moduleLocalId: 'access', relations: [] },
    { localId: 'role', moduleLocalId: 'access', relations: [] },
    { localId: 'product', moduleLocalId: 'catalog', relations: [] },
    { localId: 'sale', moduleLocalId: 'sales', relations: [] },
  ],
  customEndpoints: [
    { method: 'POST', path: '/sales', moduleLocalId: 'sales' },
    { method: 'GET', path: '/menus/today', moduleLocalId: 'menus' },
    { method: 'GET', path: '/products/available', moduleLocalId: 'catalog' },
  ],
  routes: [
    route('access', 'Iniciar sesión', { builtinView: 'ACCOUNT_ACCESS' }),
    route('sales', 'Registrar venta', {
      actions: [{ label: 'Productos', endpoint: 'GET /products/available' }],
    }),
    route('catalog', 'Productos', {
      contextQueries: ['GET /menus/today'],
      // A link to a screen of a later module is not a dependency.
      actions: [{ label: 'Ver ventas', navigation: { routePath: '/sales' } }],
    }),
    route('menus', 'Menú del día', {
      entityLocalId: 'product',
      actions: [{ label: 'Editar', operation: 'UPDATE' }],
    }),
    route('reports', 'Ventas del día', {
      actions: [{ label: 'Registrar', endpoint: 'POST /sales' }],
    }),
  ],
} as unknown as ImplementationPlanContent;

describe('delivery order (ADR-024)', () => {
  it('finds which module needs which, and why', () => {
    const found = moduleDependencies(plan).map((d) => `${d.module}>${d.needs}`);
    expect(found.sort()).toEqual([
      'catalog>menus',
      'menus>catalog',
      'reports>sales',
      'sales>catalog',
    ]);
    expect(moduleDependencies(plan).find((d) => d.module === 'reports')?.reason).toBe(
      'la pantalla «Ventas del día» usa la acción POST /sales',
    );
  });

  it('proposes the base first, then modules in dependency order, joining modules that need each other', () => {
    expect(proposeDeliveries(plan)).toEqual([
      ['access'],
      ['catalog', 'menus'],
      ['sales'],
      ['reports'],
    ]);
    expect(deliveryOrderProblems(plan, proposeDeliveries(plan))).toEqual([]);
  });

  it('explains why an order cannot be built', () => {
    expect(
      deliveryOrderProblems(plan, [['access'], ['reports'], ['catalog', 'menus', 'sales']]),
    ).toEqual([
      '«Reports» necesita «Sales», que va en una entrega posterior: la pantalla «Ventas del día» usa la acción POST /sales.',
    ]);
    expect(
      deliveryOrderProblems(plan, [
        ['catalog', 'menus'],
        ['access', 'sales', 'reports'],
      ]),
    ).toEqual([
      'El módulo «Access» forma parte de la base (inicio de sesión, usuarios y roles) y debe ir en la entrega 0.',
    ]);
    expect(
      deliveryOrderProblems(plan, [['access', 'sales'], ['catalog', 'menus', 'sales'], []]),
    ).toEqual([
      'El módulo «Sales» está en dos entregas.',
      'La entrega 2 no tiene módulos.',
      'El módulo «Reports» no está en ninguna entrega.',
    ]);
  });

  it('forces nothing into delivery 0 when the project has no sign-in', () => {
    const open = {
      ...plan,
      authentication: { required: false },
      routes: plan.routes.slice(1),
    } as ImplementationPlanContent;
    expect(proposeDeliveries(open)[0]).toEqual(['access']);
    expect(
      deliveryOrderProblems(open, [['catalog', 'menus'], ['access'], ['sales'], ['reports']]),
    ).toEqual([]);
  });
});
