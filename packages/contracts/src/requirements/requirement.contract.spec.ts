import { describe, expect, it } from 'vitest';
import { requirementGenerationOutputSchema, requirementInputSchema } from './requirement.contract';
describe('requirement contracts', () => {
  it('trims and accepts a structured requirement', () =>
    expect(
      requirementInputSchema.parse({
        requirementType: 'FUNCTIONAL',
        name: ' Name ',
        description: ' Desc ',
        priority: 'HIGH',
      }),
    ).toMatchObject({ name: 'Name', actors: [] }));
  it.each([
    [[{ candidateId: 'a', dependencyCandidateIds: ['a'] }]],
    [[{ candidateId: 'a' }, { candidateId: 'a' }]],
    [[{ candidateId: 'a', dependencyCandidateIds: ['missing'] }]],
  ])('rejects invalid candidate dependencies', (c) =>
    expect(
      requirementGenerationOutputSchema.safeParse({
        candidates: c.map((x) => ({
          requirementType: 'FUNCTIONAL',
          name: 'N',
          description: 'D',
          priority: 'LOW',
          ...x,
        })),
      }).success,
    ).toBe(false),
  );
});
