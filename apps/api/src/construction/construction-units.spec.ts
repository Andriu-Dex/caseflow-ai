import { describe, expect, it } from 'vitest';
import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import { constructionUnits, type UnitFile } from './construction-units';

const plan = {
  modules: [{ localId: 'catalog', name: 'Catálogo', description: 'Productos y categorías.' }],
  entities: [
    {
      localId: 'product',
      name: 'Product',
      moduleLocalId: 'catalog',
      description: 'Producto del catálogo. Detalle.',
      operations: ['CREATE', 'LIST'],
      fields: [
        { name: 'name', label: 'Nombre' },
        { name: 'price', label: 'Precio' },
        { name: 'hash', internal: true },
      ],
    },
  ],
  customEndpoints: [
    {
      method: 'POST',
      path: '/sales/drafts',
      summary: 'Crear borrador de venta',
      moduleLocalId: 'catalog',
      roles: ['Cajero'],
    },
  ],
  routes: [
    {
      path: '/products/new',
      kind: 'FORM',
      screenName: 'Registro de producto',
      entityLocalId: 'product',
      actions: [{ label: 'Guardar producto' }],
    },
  ],
} as unknown as ImplementationPlanContent;
const file = (
  id: string,
  path: string,
  planElements: string[],
  origin: UnitFile['origin'] = 'TEMPLATE',
): UnitFile => ({
  id,
  path,
  origin,
  kind: 'SOURCE',
  planElements,
  traces: [{ code: 'RF-001', versionNumber: 2 }],
});

describe('construction units', () => {
  it('place each file in its most specific unit with a summary from the plan', () => {
    const units = constructionUnits(plan, [
      file(
        '00000000-0000-4000-8000-000000000001',
        'apps/web/app/products/new/page.tsx',
        ['module:catalog', 'entity:product', 'route:/products/new'],
        'MANUAL',
      ),
      file('00000000-0000-4000-8000-000000000002', 'apps/api/src/catalog/product.service.ts', [
        'module:catalog',
        'entity:product',
      ]),
      file(
        '00000000-0000-4000-8000-000000000003',
        'apps/api/src/sales/drafts.ts',
        ['endpoint:POST /sales/drafts'],
        'AI_ASSISTED',
      ),
      file('00000000-0000-4000-8000-000000000004', 'package.json', []),
    ]);
    expect(units.map((unit) => [unit.kind, unit.title, unit.files.length])).toEqual([
      ['SCREEN', 'Registro de producto', 1],
      ['ACTION', 'Crear borrador de venta', 1],
      ['ENTITY', 'Entidad Product', 1],
      ['PROJECT', 'Base del proyecto', 1],
    ]);
    expect(units[0]!.origins.MANUAL).toBe(1);
    expect(units[0]!.summary).toBe(
      'Pantalla de tipo formulario en /products/new, sobre la entidad Product. Acciones: Guardar producto.',
    );
    expect(units[1]!.summary).toContain('permitida a Cajero');
    expect(units[2]!.summary).toBe(
      'Producto del catálogo. Tiene 2 campos (Nombre y Precio) que permite crear y listar. Incluye el modelo de datos, su contrato de validación, el servicio y la API.',
    );
    expect(units[0]!.traces).toEqual([{ code: 'RF-001', versionNumber: 2 }]);
  });
});
