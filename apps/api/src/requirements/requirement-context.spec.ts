import { describe, expect, it } from 'vitest';
import {
  byContextCode,
  candidateFindings,
  contextItems,
  coverage,
  sameItem,
} from './requirement-context';

const row = (id: string, position: number, description: string, version = 'v1') => ({
  id: `00000000-0000-4000-8000-00000000000${id}`,
  artifactVersionId: version,
  position,
  description,
});
const items = contextItems({
  needs: [row('1', 0, 'Registrar pedidos'), row('2', 1, 'Consultar pedidos')],
  businessRules: [row('3', 0, 'Todo pedido tiene un cliente')],
  constraints: [row('4', 0, 'Funciona en teléfonos')],
});

describe('Requirement ↔ context coherence (DEC-126)', () => {
  it('codes the context items by kind and position', () => {
    expect(items.map((i) => i.code)).toEqual(['N-1', 'N-2', 'RN-1', 'RES-1']);
  });

  it('flags unknown codes, a missing origin and unknown actors', () => {
    const context = { items, actors: ['Administrador'] };
    const check = (codes: string[], actors: string[], strict = true, suggested = false) =>
      candidateFindings({ suggested, contextItemCodes: codes, actors }, context, strict).map(
        (f) => `${f.severity}:${f.code}`,
      );
    expect(check(['N-1'], ['Administrador del sistema'])).toEqual([]);
    expect(check(['N-1', 'RN-7'], [])).toEqual(['ERROR:UNKNOWN_CONTEXT_CODE']);
    expect(check([], [])).toEqual(['ERROR:MISSING_CONTEXT_ORIGIN']);
    expect(check([], [], false)).toEqual(['WARNING:MISSING_CONTEXT_ORIGIN']);
    // An idea beyond the context cites nothing by design.
    expect(check([], ['Cajero'], true, true)).toEqual(['WARNING:UNKNOWN_ACTOR']);
  });

  it('counts a link to the same item in an older context version as coverage', () => {
    const older = contextItems({
      needs: [row('5', 0, '  registrar  PEDIDOS ', 'v0')],
      businessRules: [],
      constraints: [],
    })[0]!;
    expect(sameItem(older, items[0]!)).toBe(true);
    const result = coverage(items, [
      { label: 'RF-001', items: [older] },
      { label: 'RNF-001', items: [items[3]!] },
    ]);
    expect(result.map((i) => [i.code, i.mandatory, i.coveredBy])).toEqual([
      ['N-1', true, ['RF-001']],
      ['N-2', true, []],
      ['RN-1', true, []],
      ['RES-1', false, ['RNF-001']],
    ]);
  });

  it('orders cited items by kind and number, whatever order they were linked in', () =>
    expect(
      [...items]
        .reverse()
        .sort(byContextCode)
        .map((i) => i.code),
    ).toEqual(['N-1', 'N-2', 'RN-1', 'RES-1']));
});
