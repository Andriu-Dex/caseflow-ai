import { describe, expect, it } from 'vitest';
import { inputBudget, mergeBatches, planReportParts } from './source-report-plan';

const section = (n: number, chars = 300) => ({ heading: `S${n}`, content: 'x'.repeat(chars) });

describe('source report plan (DEC-127)', () => {
  it('sizes requests by the provider, or by the smallest free tier when unknown', () => {
    expect(inputBudget(1_048_576)).toBe(1_047_076);
    expect(inputBudget(undefined)).toBe(6_500);
  });

  it('groups consecutive sections into parts that fit, keeping their order', () => {
    const sections = Array.from({ length: 10 }, (_, i) => section(i));
    const parts = planReportParts(sections, 250);
    expect(parts.flat()).toEqual(sections);
    expect(parts.length).toBeGreaterThan(1);
    // ~110 tokens per section: two fit in 250, a third does not.
    expect(parts.every((part) => part.length === 2)).toBe(true);
  });

  it('gives a section larger than a part a part of its own', () =>
    expect(planReportParts([section(1, 3000), section(2)], 100).map((p) => p.length)).toEqual([
      1, 1,
    ]));

  it('merges in batches of at least two, so every round shrinks the list', () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ summary: 'y'.repeat(600), i }));
    const batches = mergeBatches(items, 450);
    expect(batches.flat()).toEqual(items);
    expect(batches.every((batch) => batch.length >= 2)).toBe(true);
    expect(batches.length).toBeLessThan(items.length);
    expect(mergeBatches(items, 1_000_000)).toEqual([items]);
  });
});
