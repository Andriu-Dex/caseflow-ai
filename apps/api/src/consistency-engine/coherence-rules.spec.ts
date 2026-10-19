import { describe, expect, it } from 'vitest';
import { coherenceChecklist, coherenceGaps, upstreamFromSources } from './coherence-rules';

const upstream = upstreamFromSources([
  {
    code: 'DC-001',
    type: 'CLASS_DIAGRAM',
    content: {
      classes: [
        { localId: 'order', name: 'Pedido' },
        { localId: 'status', name: 'Estado', stereotype: 'ENUMERATION' },
      ],
    },
  },
  {
    code: 'UI-001',
    type: 'UI_BLUEPRINT',
    content: {
      screens: [
        { localId: 'orders', name: 'Pedidos', purpose: 'Ver', primaryActions: ['Crear pedido'] },
        { localId: 'report', name: 'Reporte', purpose: 'Ver' },
      ],
    },
  },
]);

const plan = {
  designBaselineId: '00000000-0000-4000-8000-000000000000',
  authentication: { required: false },
  modules: [{ localId: 'sales', name: 'Sales', description: 'Ventas' }],
  entities: [
    {
      localId: 'e',
      name: 'Order',
      moduleLocalId: 'sales',
      classLocalId: 'order',
      fields: [{ name: 'total', type: 'DECIMAL' }],
      operations: ['CREATE'],
    },
  ],
  customEndpoints: [
    { moduleLocalId: 'sales', method: 'POST', path: '/orders/:orderId/close', summary: 'Cerrar' },
  ],
  routes: [
    {
      path: '/orders',
      screenName: 'Pedidos',
      screenLocalId: 'orders',
      moduleLocalId: 'sales',
      kind: 'LIST',
      entityLocalId: 'e',
      actions: [{ label: 'Borrar', operation: 'CREATE' }],
    },
  ],
};

describe('coherence rules for the implementation plan (DEC-121)', () => {
  it('reports uncovered screens and actions, foreign actions and orphan endpoints', () => {
    expect(coherenceGaps('IMPLEMENTATION_PLAN', plan, upstream).map((gap) => gap.message)).toEqual([
      'La acción «Crear pedido» de la pantalla «Pedidos» no tiene una operación ni un endpoint que la atienda.',
      'La pantalla «Reporte» no tiene una ruta en el plan de implementación.',
      'La ruta /orders atiende la acción «Borrar», que la pantalla «Pedidos» no tiene.',
      'El endpoint POST /orders/:orderId/close no atiende ninguna acción de pantalla.',
    ]);
  });

  it('only requires persisted entities for ENTITY classes', () => {
    const gaps = coherenceGaps(
      'IMPLEMENTATION_PLAN',
      { ...plan, entities: [{ ...plan.entities[0], classLocalId: undefined }] },
      upstream,
    ).filter((gap) => gap.chain === 'ENTITY_CLASS_PLAN');
    expect(gaps.map((gap) => gap.message)).toEqual([
      'La clase «Pedido» no tiene una entidad persistente en el plan de implementación.',
      'La entidad «Order» del plan de implementación no indica qué clase del diagrama representa.',
    ]);
  });

  it('tells the AI what it must cover from the same upstream data', () => {
    expect(coherenceChecklist('IMPLEMENTATION_PLAN', upstream)).toEqual([
      'Una entidad persistente con classLocalId «order» para la clase «Pedido».',
      'Una ruta con screenLocalId «orders» para la pantalla «Pedidos», con estas acciones en actions: «Crear pedido».',
      'Una ruta con screenLocalId «report» para la pantalla «Reporte».',
    ]);
  });

  it('asks for nothing when the upstream stage is absent', () => {
    expect(
      coherenceGaps('UI_BLUEPRINT', { screens: [{ localId: 'a', name: 'A', purpose: 'B' }] }, {}),
    ).toEqual([]);
  });
});
