import { describe, expect, it } from 'vitest';
import {
  mergeUseCaseBatch,
  planUseCaseBatches,
  USE_CASE_BATCH_SIZE,
  type BatchCandidate,
} from './use-case-batches';

const candidate = (
  candidateId: string,
  name: string,
  codes: string[],
  relations: BatchCandidate['relations'] = [],
): BatchCandidate => ({
  candidateId,
  name,
  objective: name,
  primaryActor: 'Cajero',
  secondaryActors: [],
  preconditions: [],
  postconditions: [],
  mainFlow: [{ actor: 'Cajero', action: name }],
  alternativeFlows: [],
  relatedRequirementSourceIds: codes,
  relations,
});
const allowed = new Set(['RF-001', 'RF-002', 'RF-003', 'RNF-001']);

describe('planUseCaseBatches', () => {
  it('targets functional requirements in code order and leaves the rest as context', () => {
    const requirements = [
      { code: 'RNF-001', requirementType: 'NON_FUNCTIONAL' as const },
      ...Array.from({ length: USE_CASE_BATCH_SIZE + 1 }, (_, i) => ({
        code: `RF-${String(USE_CASE_BATCH_SIZE + 1 - i).padStart(3, '0')}`,
        requirementType: 'FUNCTIONAL' as const,
      })),
    ];
    const plan = planUseCaseBatches(requirements);
    expect(plan).toHaveLength(2);
    expect(plan[0]![0]).toBe('RF-001');
    expect(plan.flat()).not.toContain('RNF-001');
    expect(plan[1]).toHaveLength(1);
  });

  it('falls back to non-functional requirements when no functional one is chosen', () => {
    expect(planUseCaseBatches([{ code: 'RNF-001', requirementType: 'NON_FUNCTIONAL' }])).toEqual([
      ['RNF-001'],
    ]);
  });
});

describe('mergeUseCaseBatch', () => {
  it('renames proposals per batch and relates to proposals of earlier batches', () => {
    const first = mergeUseCaseBatch(
      [],
      { candidates: [candidate('a', 'Registrar venta', ['RF-001'])] },
      ['RF-001'],
      allowed,
      0,
    );
    const second = mergeUseCaseBatch(
      first,
      {
        candidates: [
          candidate(
            'x',
            'Cobrar venta',
            ['RF-002'],
            [{ kind: 'INCLUDE', targetCandidateId: 'B1-C1' }],
          ),
          candidate(
            'y',
            'Imprimir recibo',
            ['RF-002'],
            [{ kind: 'EXTEND', targetCandidateId: 'x' }],
          ),
        ],
      },
      ['RF-002'],
      allowed,
      1,
    );
    expect(second.map((c) => c.candidateId)).toEqual(['B1-C1', 'B2-C1', 'B2-C2']);
    expect(second[1]!.relations).toEqual([{ kind: 'INCLUDE', targetCandidateId: 'B1-C1' }]);
    expect(second[2]!.relations).toEqual([{ kind: 'EXTEND', targetCandidateId: 'B2-C1' }]);
    // The earlier batch's proposals are not changed in place.
    expect(first).toHaveLength(1);
  });

  it('folds a proposal named like an existing one into it instead of adding it twice', () => {
    const first = mergeUseCaseBatch(
      [],
      { candidates: [candidate('a', 'Registrar venta', ['RF-001'])] },
      ['RF-001'],
      allowed,
      0,
    );
    const second = mergeUseCaseBatch(
      first,
      {
        candidates: [
          candidate('x', 'registrar  VENTA', ['RF-002']),
          candidate('y', 'Anular venta', ['RF-002'], [{ kind: 'EXTEND', targetCandidateId: 'x' }]),
        ],
      },
      ['RF-002'],
      allowed,
      1,
    );
    expect(second.map((c) => c.name)).toEqual(['Registrar venta', 'Anular venta']);
    expect(second[0]!.relatedRequirementSourceIds).toEqual(['RF-001', 'RF-002']);
    // A relation to the folded proposal follows it to the existing one.
    expect(second[1]!.relations).toEqual([{ kind: 'EXTEND', targetCandidateId: 'B1-C1' }]);
  });

  it('rejects requirements that were not supplied, proposals that ignore the batch and unknown targets', () => {
    const merge = (c: BatchCandidate) =>
      mergeUseCaseBatch([], { candidates: [c] }, ['RF-001'], allowed, 0);
    expect(() => merge(candidate('a', 'A', ['RF-999']))).toThrow('no se suministraron');
    expect(() => merge(candidate('a', 'A', ['RF-002']))).toThrow('asignados al lote');
    expect(() =>
      merge(candidate('a', 'A', ['RF-001'], [{ kind: 'INCLUDE', targetCandidateId: 'nadie' }])),
    ).toThrow('inexistente');
  });

  it('drops self relations and repeated targets instead of failing the batch', () => {
    const result = mergeUseCaseBatch(
      [],
      {
        candidates: [
          candidate('a', 'A', ['RF-001']),
          candidate(
            'b',
            'B',
            ['RF-001'],
            [
              { kind: 'INCLUDE', targetCandidateId: 'b' },
              { kind: 'INCLUDE', targetCandidateId: 'a' },
              { kind: 'EXTEND', targetCandidateId: 'a' },
            ],
          ),
        ],
      },
      ['RF-001'],
      allowed,
      0,
    );
    expect(result[1]!.relations).toEqual([{ kind: 'INCLUDE', targetCandidateId: 'B1-C1' }]);
  });
});
