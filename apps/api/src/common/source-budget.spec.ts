import { describe, expect, it } from 'vitest';
import { fitToBudget, requirementLevels, useCaseLevels, type BudgetItem } from './source-budget';

const requirement = (n: number) => ({
  name: `Requisito ${n}`,
  description: 'x'.repeat(200),
  requirementType: 'FUNCTIONAL',
  priority: 'MEDIUM',
  actors: ['Cajero'],
  preconditions: ['p'.repeat(100)],
  postconditions: ['q'.repeat(100)],
});
const useCase = (n: number) => ({
  name: `Caso ${n}`,
  objective: 'o'.repeat(100),
  primaryActor: 'Cajero',
  secondaryActors: ['Encargado'],
  preconditions: ['p'.repeat(100)],
  postconditions: ['q'.repeat(100)],
  mainFlow: Array.from({ length: 6 }, (_, i) => ({
    actor: 'Cajero',
    action: `Paso ${i} `.repeat(8),
  })),
  alternativeFlows: [
    {
      name: 'Alternativo',
      condition: 'c'.repeat(80),
      steps: [{ actor: 'Sistema', action: 'a'.repeat(150) }],
    },
  ],
});
const items = (reqs: number, ucs: number): BudgetItem<unknown>[] => [
  ...Array.from({ length: reqs }, (_, i) => ({
    kind: 'REQUIREMENT' as const,
    levels: requirementLevels(requirement(i)),
  })),
  ...Array.from({ length: ucs }, (_, i) => ({
    kind: 'USE_CASE' as const,
    levels: useCaseLevels(useCase(i)),
  })),
];

describe('fitToBudget', () => {
  it('sends everything in full when it fits', () => {
    const result = fitToBudget(items(5, 5), 60_000);
    expect(result.reduced).toBe(false);
    expect(result.items[5]).toHaveProperty('mainFlow');
    expect((result.items[5] as { mainFlow: unknown[] }).mainFlow[0]).toHaveProperty('actor');
  });

  it('trims use cases before requirements, never dropping a source', () => {
    const all = items(160, 105);
    const full = JSON.stringify(all.map((i) => i.levels[0])).length / 3;
    const result = fitToBudget(all, Math.floor(full * 0.9));
    expect(result.items).toHaveLength(265);
    expect(result.reduced).toBe(true);
    // Requirements keep their description; use cases lost alternative flow steps.
    expect(result.items[0]).toHaveProperty('description');
    const trimmed = result.items[160] as { mainFlow: unknown[]; alternativeFlows: object[] };
    expect(typeof trimmed.mainFlow[0]).toBe('string');
    expect(trimmed.alternativeFlows[0]).not.toHaveProperty('steps');
  });

  it('keeps every source even when nothing fits, at the lowest detail', () => {
    const result = fitToBudget(items(160, 105), 1_000);
    expect(result.items).toHaveLength(265);
    expect(result.items[0]).not.toHaveProperty('description');
    expect(result.items[200]).toEqual(
      expect.objectContaining({ name: 'Caso 40', primaryActor: 'Cajero' }),
    );
    expect(result.items[200]).not.toHaveProperty('mainFlow');
  });

  it('leaves other kinds of source untouched', () => {
    const model = { entities: [{ name: 'Pedido' }] };
    const result = fitToBudget<unknown>(
      [{ kind: 'OTHER', levels: [model] }, ...items(0, 200)],
      500,
    );
    expect(result.items[0]).toBe(model);
  });
});
