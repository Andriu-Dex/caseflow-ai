import { describe, expect, it } from 'vitest';
import {
  implementationPlanContentSchema,
  navigationTreeContentSchema,
  softwareArchitectureContentSchema,
  systemArchitectureContentSchema,
  uiBlueprintContentSchema,
} from './structured-analysis.contract';

describe('navigation tree content', () => {
  const home = { localId: 'home', label: 'Home', viewName: 'Home', kind: 'HOME' as const };

  it('accepts a valid tree with a parent/child relationship', () => {
    const orders = { ...home, localId: 'orders', label: 'Orders', parentLocalId: 'home' };
    expect(navigationTreeContentSchema.safeParse({ nodes: [home, orders] }).success).toBe(true);
  });

  it('rejects duplicate localId', () => {
    expect(navigationTreeContentSchema.safeParse({ nodes: [home, { ...home }] }).success).toBe(
      false,
    );
  });

  it('rejects a parentLocalId that does not exist', () => {
    expect(
      navigationTreeContentSchema.safeParse({
        nodes: [{ ...home, parentLocalId: 'missing' }],
      }).success,
    ).toBe(false);
  });

  it('rejects a node that is its own parent', () => {
    expect(
      navigationTreeContentSchema.safeParse({
        nodes: [{ ...home, parentLocalId: 'home' }],
      }).success,
    ).toBe(false);
  });

  it('rejects a parent chain that forms a cycle', () => {
    const a = { ...home, localId: 'a', parentLocalId: 'b' };
    const b = { ...home, localId: 'b', parentLocalId: 'a' };
    expect(navigationTreeContentSchema.safeParse({ nodes: [a, b] }).success).toBe(false);
  });
});

describe('software architecture content', () => {
  const base = { style: 'Modular monolith', decisions: [] };
  const api = { localId: 'api', name: 'API', responsibilities: [] };
  const web = { localId: 'web', name: 'Web', responsibilities: [] };

  it('accepts a valid architecture with a resolvable dependency', () => {
    expect(
      softwareArchitectureContentSchema.safeParse({
        ...base,
        components: [api, web],
        dependencies: [{ fromLocalId: 'web', toLocalId: 'api' }],
      }).success,
    ).toBe(true);
  });

  it('rejects duplicate component localId', () => {
    expect(
      softwareArchitectureContentSchema.safeParse({
        ...base,
        components: [api, { ...api }],
        dependencies: [],
      }).success,
    ).toBe(false);
  });

  it('rejects a dependency referencing a nonexistent component', () => {
    expect(
      softwareArchitectureContentSchema.safeParse({
        ...base,
        components: [api],
        dependencies: [{ fromLocalId: 'api', toLocalId: 'missing' }],
      }).success,
    ).toBe(false);
  });
});

describe('system architecture content', () => {
  const base = { boundary: 'Sistema' };
  const server = {
    localId: 'server',
    name: 'Server',
    kind: 'RUNTIME' as const,
    responsibilities: [],
  };
  const db = { localId: 'db', name: 'Database', kind: 'DATABASE' as const, responsibilities: [] };

  it('accepts a valid system with a resolvable link', () => {
    expect(
      systemArchitectureContentSchema.safeParse({
        ...base,
        nodes: [server, db],
        links: [{ fromLocalId: 'server', toLocalId: 'db' }],
      }).success,
    ).toBe(true);
  });

  it('rejects duplicate node localId', () => {
    expect(
      systemArchitectureContentSchema.safeParse({
        ...base,
        nodes: [server, { ...server }],
        links: [],
      }).success,
    ).toBe(false);
  });

  it('rejects a link referencing a nonexistent node', () => {
    expect(
      systemArchitectureContentSchema.safeParse({
        ...base,
        nodes: [server],
        links: [{ fromLocalId: 'server', toLocalId: 'missing' }],
      }).success,
    ).toBe(false);
  });
});

describe('UI blueprint content', () => {
  const screen = {
    localId: 'home',
    name: 'Inicio',
    purpose: 'Ver el panel',
    targetActors: [],
    relatedUseCaseCodes: [],
    sections: [],
    primaryActions: [],
    secondaryActions: [],
    principalData: [],
    forms: [],
    states: [],
  };

  it('accepts a valid blueprint', () => {
    expect(uiBlueprintContentSchema.safeParse({ screens: [screen] }).success).toBe(true);
  });

  it('rejects duplicate screen localId', () => {
    expect(uiBlueprintContentSchema.safeParse({ screens: [screen, { ...screen }] }).success).toBe(
      false,
    );
  });
});

describe('implementation plan route actions (DEC-121)', () => {
  const plan = (actions: unknown[]) => ({
    designBaselineId: '00000000-0000-4000-8000-000000000000',
    authentication: { required: false },
    modules: [{ localId: 'sales', name: 'Sales', description: 'Ventas' }],
    entities: [
      {
        localId: 'e',
        name: 'Order',
        moduleLocalId: 'sales',
        fields: [{ name: 'total', type: 'DECIMAL' }],
        operations: ['LIST', 'CREATE'],
      },
    ],
    customEndpoints: [
      {
        moduleLocalId: 'sales',
        method: 'POST',
        path: '/orders/:orderId/confirm',
        summary: 'Confirmar',
      },
    ],
    routes: [
      {
        path: '/orders',
        screenName: 'Pedidos',
        moduleLocalId: 'sales',
        kind: 'LIST',
        entityLocalId: 'e',
        actions,
      },
    ],
  });
  const messages = (actions: unknown[]) => {
    const result = implementationPlanContentSchema.safeParse(plan(actions));
    return result.success ? [] : result.error.issues.map((issue) => issue.message);
  };

  it('accepts actions served by an entity operation or an existing endpoint', () => {
    expect(
      messages([
        { label: 'Crear pedido', operation: 'CREATE' },
        { label: 'Confirmar', endpoint: 'POST /orders/:orderId/confirm' },
        { label: 'Ir a la página siguiente', operation: 'LIST', interaction: 'PAGINATE_NEXT' },
        { label: 'Ir a la página anterior', operation: 'LIST', interaction: 'PAGINATE_PREVIOUS' },
        { label: 'Consultar productos', operation: 'LIST', interaction: 'QUERY' },
        { label: 'Reintentar consulta', operation: 'LIST', interaction: 'REFETCH' },
      ]),
    ).toEqual([]);
  });

  it('accepts structured presentation labels on entity fields', () => {
    const custom = plan([]);
    custom.entities[0]!.fields = [
      { name: 'total', type: 'DECIMAL', label: 'Importe total USD' },
      { name: 'name', type: 'STRING', label: 'Denominación del producto' },
    ];
    expect(implementationPlanContentSchema.safeParse(custom).success).toBe(true);
  });

  it('rejects unserved operations, unknown endpoints and ambiguous actions', () => {
    expect(
      messages([{ label: 'Ambas', operation: 'LIST', endpoint: 'POST /orders/:orderId/confirm' }]),
    ).toEqual(['Cada acción la atiende una operación CRUD o un endpoint, exactamente uno.']);
    expect(
      messages([
        { label: 'Borrar', operation: 'DELETE' },
        { label: 'Pagar', endpoint: 'POST /orders/:orderId/pay' },
      ]),
    ).toEqual([
      'La acción «Borrar» usa la operación DELETE, que la entidad de la ruta no ofrece.',
      'La acción «Pagar» usa el endpoint POST /orders/:orderId/pay, que no existe.',
    ]);
  });

  it('validates interaction compatibility with route action operations', () => {
    const validActions = [
      { label: 'Siguiente', operation: 'LIST', interaction: 'PAGINATE_NEXT' },
      { label: 'Anterior', operation: 'LIST', interaction: 'PAGINATE_PREVIOUS' },
      { label: 'Consultar', operation: 'LIST', interaction: 'QUERY' },
      { label: 'Reintentar', operation: 'LIST', interaction: 'REFETCH' },
    ];
    expect(messages(validActions)).toEqual([]);

    const invalidPaginateWithCreate = [
      { label: 'Crear', operation: 'CREATE', interaction: 'PAGINATE_NEXT' },
    ];
    expect(messages(invalidPaginateWithCreate)).toEqual([
      'Las interacciones de paginación solo aplican a operaciones LIST o endpoints GET; las de consulta y recarga solo a operaciones de lectura.',
    ]);

    const invalidQueryWithCreate = [{ label: 'Crear', operation: 'CREATE', interaction: 'QUERY' }];
    expect(messages(invalidQueryWithCreate)).toEqual([
      'Las interacciones de paginación solo aplican a operaciones LIST o endpoints GET; las de consulta y recarga solo a operaciones de lectura.',
    ]);
  });
});
