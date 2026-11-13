import { describe, expect, it } from 'vitest';
import { acceptedDemoValues, planCurrency } from './demo-data.service';

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
            record({ name: 'Café de olla', price: '45.00', status: 'ACTIVE', since: '2026-03-01', stage: 'PUBLISHED', ghost: 'x' }),
            record({ name: 'Café de olla', price: '12,5', status: 'SOLD', since: 'ayer' }),
          ],
        },
        { model: 'Unknown', records: [record({ name: 'x' })] },
      ],
    });
    expect(accepted).toEqual({ Product: [{ name: 'Café de olla', price: '45.00', status: 'ACTIVE', since: '2026-03-01' }] });
  });
});

describe('plan currency', () => {
  it('is the ISO code the plan names most often', () => {
    const plan = { modules: [{ description: 'Ventas en USD; gastos en USD, nunca EUR.' }] } as never;
    expect(planCurrency(plan)).toBe('USD');
  });
});
