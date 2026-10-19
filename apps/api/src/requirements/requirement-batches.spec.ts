import { describe, expect, it } from 'vitest';
import {
  completeRequirementGenerationOutputSchema,
  acceptRequirementsRequestSchema,
} from '@caseflow-ai/contracts';
import {
  planRequirementBatches,
  mergeRequirementBatch,
  mergeRequirementDependencies,
  type CodedRequirementContext,
} from './requirement-batches';
const context: CodedRequirementContext = {
  problemStatement: 'Manual records',
  objective: 'Centralize records',
  additionalContext: 'Pending permissions',
  actors: [{ name: 'User', description: 'Operator' }],
  scope: [],
  needs: Array.from({ length: 55 }, (_, i) => ({
    code: `N-${i + 1}`,
    description: `Capability ${i + 1}`,
  })),
  businessRules: [{ code: 'RN-1', description: 'Keep history' }],
  constraints: [{ code: 'RES-1', description: 'Accessible' }],
  mustCover: [...Array.from({ length: 55 }, (_, i) => `N-${i + 1}`), 'RN-1'],
};
const candidate = (candidateId: string, code: string, dependencies: string[] = []) => ({
  candidateId,
  requirementType: 'FUNCTIONAL' as const,
  name: `Record ${code}`,
  description: `The system records ${code}.`,
  priority: 'HIGH' as const,
  actors: ['User'],
  preconditions: [],
  postconditions: [],
  dependencyCandidateIds: dependencies,
  contextItemCodes: [code],
});
describe('Requirement batches', () => {
  it('assigns every item once without a twenty-candidate global cap', () => {
    const batches = planRequirementBatches(context);
    expect(batches.flat()).toEqual(
      [...context.needs, ...context.businessRules, ...context.constraints].map((item) => item.code),
    );
    expect(batches.every((batch) => batch.length <= 8)).toBe(true);
    expect(
      completeRequirementGenerationOutputSchema.safeParse({
        candidates: context.needs.map((item, i) => candidate(`c${i}`, item.code)),
        suggestions: [],
      }).success,
    ).toBe(true);
    expect(
      acceptRequirementsRequestSchema.safeParse({
        candidateIds: Array.from(
          { length: 55 },
          (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        ),
      }).success,
    ).toBe(true);
  });
  it('preserves cross-batch dependencies and attaches rules without duplicating a capability', () => {
    const first = mergeRequirementBatch(
      [],
      [],
      { candidates: [candidate('a', 'N-1')], suggestions: [], coverageUpdates: [] },
      ['N-1'],
      context,
      0,
      'run1',
    );
    const second = mergeRequirementBatch(
      first.candidates,
      [],
      {
        candidates: [candidate('a', 'N-2', ['B1-C1'])],
        suggestions: [],
        coverageUpdates: [
          {
            candidateId: 'B1-C1',
            contextItemCodes: ['RN-1'],
            description: 'Record N-1 while keeping history.',
          },
        ],
      },
      ['N-2', 'RN-1'],
      context,
      1,
      'run2',
    );
    expect(second.candidates[0]).toMatchObject({
      aiRunId: 'run2',
      description: 'Record N-1 while keeping history.',
      contextItemCodes: ['N-1', 'RN-1'],
    });
    expect(second.candidates[1]).toMatchObject({
      candidateId: 'B2-C1',
      aiRunId: 'run2',
      dependencyCandidateIds: ['B1-C1'],
    });
    expect(first.candidates[0]!.contextItemCodes).toEqual(['N-1']);
  });
  it('rejects unknown codes, missing coverage, unknown dependencies and foreign updates', () => {
    const merge = (output: Parameters<typeof mergeRequirementBatch>[2]) =>
      mergeRequirementBatch([], [], output, ['N-1'], context, 0, 'run');
    expect(() =>
      merge({ candidates: [candidate('a', 'N-999')], suggestions: [], coverageUpdates: [] }),
    ).toThrow('no existen');
    expect(() => merge({ candidates: [], suggestions: [], coverageUpdates: [] })).toThrow(
      'obligatorios',
    );
    expect(() =>
      merge({
        candidates: [candidate('a', 'N-1', ['outside'])],
        suggestions: [],
        coverageUpdates: [],
      }),
    ).toThrow('dependencia inexistente');
    expect(() =>
      merge({
        candidates: [],
        suggestions: [],
        coverageUpdates: [
          { candidateId: 'outside', contextItemCodes: ['N-1'], description: 'Record N-1.' },
        ],
      }),
    ).toThrow('propuesta inexistente');
  });
  it('rejects cycles and missing coverage during final dependency review', () => {
    const two = {
      ...context,
      needs: context.needs.slice(0, 2),
      businessRules: [],
      constraints: [],
      mustCover: ['N-1', 'N-2'],
    };
    const candidates = [candidate('a', 'N-1'), candidate('b', 'N-2')];
    expect(() =>
      mergeRequirementDependencies(
        candidates,
        {
          dependencies: [
            { candidateId: 'a', dependsOnCandidateId: 'b' },
            { candidateId: 'b', dependsOnCandidateId: 'a' },
          ],
        },
        two,
        [],
      ),
    ).toThrow('cíclicas');
    expect(() =>
      mergeRequirementDependencies(candidates.slice(0, 1), { dependencies: [] }, two, []),
    ).toThrow('contexto obligatorio');
  });
});
