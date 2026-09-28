import { describe, expect, it } from 'vitest';
import { dataModelGenerationOutputSchema, dataModelInputSchema } from './data-model.contract';

const valid = {
  title: 'Modelo',
  modelKind: 'ER' as const,
  entities: [
    {
      localId: 'user',
      name: 'Usuario',
      attributes: [
        { name: 'id', type: 'UUID' as const, required: true, primaryKey: true, unique: true },
      ],
    },
  ],
  relationships: [],
};
describe('data model contracts', () => {
  it('accepts a bounded conceptual ER model', () =>
    expect(dataModelInputSchema.parse(valid)).toMatchObject(valid));
  it('rejects duplicate normalized names and composite keys', () => {
    expect(
      dataModelInputSchema.safeParse({
        ...valid,
        entities: [
          ...valid.entities,
          { ...valid.entities[0], localId: 'other', name: ' usuario ' },
        ],
      }).success,
    ).toBe(false);
    expect(
      dataModelInputSchema.safeParse({
        ...valid,
        entities: [
          {
            ...valid.entities[0],
            attributes: [
              ...valid.entities[0].attributes,
              { ...valid.entities[0].attributes[0], name: 'other' },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });
  it('rejects dangling candidate relationship references and invalid cardinalities', () => {
    const candidate = {
      candidates: [
        {
          candidateId: 'c1',
          ...valid,
          relationships: [
            {
              sourceEntityId: 'user',
              targetEntityId: 'missing',
              sourceCardinality: 'ONE',
              targetCardinality: 'MANY',
            },
          ],
        },
      ],
    };
    expect(dataModelGenerationOutputSchema.safeParse(candidate).success).toBe(false);
  });
});
