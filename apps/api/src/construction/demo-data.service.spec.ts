import { describe, expect, it, vi } from 'vitest';
import { implementationPlanContentSchema } from '@caseflow-ai/contracts';
import {
  DemoDataService,
  acceptedDemoValues,
  fillerValues,
  isFiller,
  planCurrency,
} from './demo-data.service';

const field = (name: string, type: string, extra: Record<string, unknown> = {}) => ({
  name,
  label: name,
  type,
  required: true,
  unique: false,
  enumValues: [] as string[],
  ...extra,
});
const entity = {
  model: 'Product',
  delegate: 'product',
  relations: [],
  fields: [
    field('name', 'STRING', { unique: true }),
    field('price', 'DECIMAL'),
    field('status', 'ENUM', { enumValues: ['ACTIVE', 'INACTIVE'] }),
    field('since', 'DATE'),
    field('stage', 'ENUM', { enumValues: ['DRAFT'], value: 'DRAFT' }),
  ],
};
const record = (values: Record<string, string>) => ({
  values: Object.entries(values).map(([name, value]) => ({ field: name, value })),
});

describe('demonstration values', () => {
  it('keep only values that satisfy each field of the plan', () => {
    const accepted = acceptedDemoValues([entity], {
      entities: [
        {
          model: 'Product',
          records: [
            record({
              name: 'Café de olla',
              price: '45.00',
              status: 'ACTIVE',
              since: '2026-03-01',
              stage: 'PUBLISHED',
              ghost: 'x',
            }),
            record({ name: 'Café de olla', price: '12,5', status: 'SOLD', since: 'ayer' }),
          ],
        },
        { model: 'Unknown', records: [record({ name: 'x' })] },
      ],
    });
    expect(accepted).toEqual({
      Product: [{ name: 'Café de olla', price: '45.00', status: 'ACTIVE', since: '2026-03-01' }],
    });
  });
});

describe('filler values', () => {
  it('tells filler from real business text', () => {
    for (const text of [
      'Cliente demo',
      'CLI-DEMO-006',
      'Texto de ejemplo',
      'Producto 3',
      '9cedfbd1a2',
      'Lorem ipsum',
    ])
      expect(isFiller(text), text).toBe(true);
    for (const text of [
      'Seco de pollo',
      'SUC-002',
      'Mesa 5',
      'Colegio San Gabriel',
      'Av. América N25-20',
    ])
      expect(isFiller(text), text).toBe(false);
  });

  it('drops filler from accepted values and lists it for a retry', () => {
    const proposal = {
      entities: [
        {
          model: 'Product',
          records: [
            record({ name: 'Producto 1', price: '3.50' }),
            record({ name: 'Locro de papa' }),
          ],
        },
      ],
    };
    expect(fillerValues(proposal)).toEqual(['Producto 1']);
    expect(acceptedDemoValues([entity], proposal).Product).toEqual([
      { price: '3.50' },
      { name: 'Locro de papa' },
    ]);
  });
});

describe('plan currency', () => {
  it('is the ISO code the plan names most often', () => {
    const plan = {
      modules: [{ description: 'Ventas en USD; gastos en USD, nunca EUR.' }],
    } as never;
    expect(planCurrency(plan)).toBe('USD');
  });
});

describe('DemoDataService.propose', () => {
  const plan = implementationPlanContentSchema.parse({
    designBaselineId: '11111111-1111-4111-8111-111111111111',
    authentication: { required: false },
    modules: [{ localId: 'sales', name: 'Sales', description: 'Ventas en USD' }],
    entities: [
      {
        localId: 'product',
        name: 'Product',
        moduleLocalId: 'sales',
        fields: [{ name: 'name', type: 'STRING' }],
        operations: ['LIST', 'CREATE'],
      },
    ],
  });
  const prisma = {
    project: { findUnique: vi.fn().mockResolvedValue({ language: 'ES' }) },
    generatedFile: { findFirst: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
  };
  const answer = (name: string) => ({
    data: {
      entities: [{ model: 'Product', records: [{ values: [{ field: 'name', value: name }] }] }],
    },
  });

  it('asks once more when the proposal reads as filler, naming what to replace', async () => {
    const generateStructured = vi
      .fn()
      .mockResolvedValueOnce(answer('Producto 1'))
      .mockResolvedValueOnce(answer('Locro de papa'));
    const result = await new DemoDataService(
      prisma as never,
      { generateStructured } as never,
    ).propose('p', 'b', 'r', 'Restaurante', plan);
    expect(generateStructured).toHaveBeenCalledTimes(2);
    expect(generateStructured.mock.calls[1]![0].messages[1].content).toContain('Producto 1');
    expect(result.values?.Product).toEqual([{ name: 'Locro de papa' }]);
  });
});
