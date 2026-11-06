import { expect, it } from 'vitest';
import { dataModelReviewQuestions } from './data-model-review';
it('asks about minimal entities without inventing business fields or rejecting conceptual models', () => {
  expect(
    dataModelReviewQuestions({
      entities: [{ name: 'Registro', attributes: [{ name: 'id', primaryKey: true }] }],
    }),
  ).toEqual([expect.stringContaining('deliberadamente conceptual')]);
  expect(
    dataModelReviewQuestions({
      entities: [
        { name: 'Registro', attributes: [{ name: 'id', primaryKey: true }, { name: 'label' }] },
      ],
    }),
  ).toEqual([]);
  expect(dataModelReviewQuestions(null)).toEqual([]);
});
