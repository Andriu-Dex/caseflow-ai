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
  const proposal = (candidateId: string, extra: Record<string, unknown> = {}) => ({
    candidateId,
    requirementType: 'FUNCTIONAL',
    name: 'N',
    description: 'D',
    priority: 'LOW',
    ...extra,
  });
  it('accepts ideas beyond the context that build on derived requirements', () => {
    const output = requirementGenerationOutputSchema.parse({
      candidates: [proposal('a', { contextItemCodes: ['N-1'] })],
      suggestions: [
        proposal('s', { rationale: 'Mejora la experiencia.', dependencyCandidateIds: ['a'] }),
      ],
    });
    expect(output.candidates[0]!.contextItemCodes).toEqual(['N-1']);
    expect(output.suggestions[0]!.rationale).toBe('Mejora la experiencia.');
    // Older outputs without codes or ideas still parse.
    expect(requirementGenerationOutputSchema.parse({ candidates: [proposal('a')] })).toMatchObject({
      candidates: [{ contextItemCodes: [] }],
      suggestions: [],
    });
  });
  it.each([
    [
      'a requirement depending on an idea',
      {
        candidates: [proposal('a', { dependencyCandidateIds: ['s'] })],
        suggestions: [proposal('s', { rationale: 'R' })],
      },
    ],
    ['an idea without a rationale', { candidates: [proposal('a')], suggestions: [proposal('s')] }],
    [
      'an idea sharing an id',
      { candidates: [proposal('a')], suggestions: [proposal('a', { rationale: 'R' })] },
    ],
  ])('rejects %s', (_, output) =>
    expect(requirementGenerationOutputSchema.safeParse(output).success).toBe(false),
  );
  it('validates the declared origin', () => {
    const base = { requirementType: 'FUNCTIONAL', name: 'N', description: 'D', priority: 'LOW' };
    const id = '00000000-0000-4000-8000-000000000001';
    expect(requirementInputSchema.parse(base).origin).toBeNull();
    expect(
      requirementInputSchema.safeParse({ ...base, origin: { kind: 'CONTEXT', contextItemIds: [] } })
        .success,
    ).toBe(false);
    expect(
      requirementInputSchema.safeParse({
        ...base,
        origin: { kind: 'CONTEXT', contextItemIds: [id, id] },
      }).success,
    ).toBe(false);
    expect(
      requirementInputSchema.safeParse({
        ...base,
        origin: { kind: 'USER_DECISION', justification: '  ' },
      }).success,
    ).toBe(false);
  });
});
