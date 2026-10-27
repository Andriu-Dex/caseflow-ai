import { describe, expect, it } from 'vitest';
import {
  actorCommitmentFindings,
  numericCommitmentFindings,
  accessScopeFindings,
} from './commitment-checks';

const requirement = {
  code: 'RNF-001',
  actors: [],
  description: 'Conservar los eventos durante 365 días.',
};
describe('declared commitment checks', () => {
  it('flags explicit access to other owners without treating a denial as permission', () => {
    const own = { ...requirement, description: 'Consultar únicamente sus documentos propios.' };
    expect(
      accessScopeFindings(own, ['Muestra los documentos de todos los usuarios.']),
    ).toHaveLength(1);
    expect(
      accessScopeFindings(own, [
        'No muestra documentos de otros usuarios.',
        'Deniega el acceso a documentos de otros usuarios.',
      ]),
    ).toEqual([]);
    expect(
      accessScopeFindings(requirement, ['Muestra los documentos de todos los usuarios.']),
    ).toEqual([]);
  });
  it('compares retention using the same unit', () => {
    expect(
      numericCommitmentFindings(requirement, 'Eliminar los eventos después de 24 horas.'),
    ).toEqual([
      expect.objectContaining({ kind: 'RETENTION', expected: '8760 horas', observed: '24 horas' }),
    ]);
    expect(
      numericCommitmentFindings(requirement, 'Conservar los eventos durante 8760 horas.'),
    ).toEqual([]);
  });
  it('does not infer retention from unrelated numbers or ambiguous policies', () => {
    expect(numericCommitmentFindings(requirement, 'Responder en 24 horas.')).toEqual([]);
    expect(
      numericCommitmentFindings(requirement, 'No eliminar los eventos antes de 24 horas.'),
    ).toEqual([]);
    expect(
      numericCommitmentFindings(requirement, 'Conservar 365 días y eliminar copias tras 24 horas.'),
    ).toEqual([]);
  });
  it('detects relaxed numeric limits including number words', () => {
    expect(
      numericCommitmentFindings(
        {
          ...requirement,
          description: 'Cada persona puede tener como máximo tres elementos activos.',
        },
        'Máximo de 5 elementos activos.',
      ),
    ).toEqual([expect.objectContaining({ kind: 'LIMIT', expected: '3', observed: '5' })]);
  });
  it('compares structured actors and leaves unspecified roles for human review', () => {
    expect(
      actorCommitmentFindings({ ...requirement, actors: ['Revisor'] }, 'Visitante'),
    ).toHaveLength(1);
    expect(actorCommitmentFindings({ ...requirement, actors: ['Revisor'] }, 'revisor')).toEqual([]);
    expect(actorCommitmentFindings(requirement, 'Visitante')).toEqual([]);
  });
});
