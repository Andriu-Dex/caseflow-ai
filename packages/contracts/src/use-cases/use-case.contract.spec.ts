import { describe, expect, it } from 'vitest';
import { useCaseGenerationOutputSchema, useCaseInputSchema } from './use-case.contract';
const step = { actor: 'Usuario', action: 'Confirma la operación' };
describe('Use Case contracts', () => {
  it('accepts a normalized use case and requires a main flow and requirement', () => {
    const base = {
      name: 'Registrar pedido',
      objective: 'Registrar un pedido',
      primaryActor: 'Cliente',
      secondaryActors: [],
      preconditions: [],
      postconditions: [],
      mainFlow: [step],
      alternativeFlows: [],
      relatedRequirementVersionIds: ['11111111-1111-4111-8111-111111111111'],
    };
    expect(useCaseInputSchema.safeParse(base).success).toBe(true);
    expect(useCaseInputSchema.safeParse({ ...base, mainFlow: [] }).success).toBe(false);
    expect(
      useCaseInputSchema.safeParse({ ...base, relatedRequirementVersionIds: [] }).success,
    ).toBe(false);
  });
  it('rejects duplicate candidate and source identifiers', () => {
    const candidate = {
      candidateId: 'cu-a',
      name: 'A',
      objective: 'O',
      primaryActor: 'U',
      secondaryActors: [],
      preconditions: [],
      postconditions: [],
      mainFlow: [step],
      alternativeFlows: [],
      relatedRequirementSourceIds: ['r1', 'r1'],
    };
    expect(useCaseGenerationOutputSchema.safeParse({ candidates: [candidate] }).success).toBe(
      false,
    );
    expect(
      useCaseGenerationOutputSchema.safeParse({
        candidates: [
          { ...candidate, relatedRequirementSourceIds: ['r1'] },
          { ...candidate, relatedRequirementSourceIds: ['r2'] },
        ],
      }).success,
    ).toBe(false);
  });
});
