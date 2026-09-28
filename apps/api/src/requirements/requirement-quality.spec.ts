import { describe, expect, it } from 'vitest';
import { analyzeRequirementQuality, type RequirementForQualityCheck } from './requirement-quality';

function requirement(
  overrides: Partial<RequirementForQualityCheck> = {},
): RequirementForQualityCheck {
  return {
    id: 'r1',
    code: 'RF-001',
    name: 'Registrar pedido',
    description: 'El sistema debe permitir registrar un pedido con sus artículos.',
    origin: 'MANUAL',
    dependencyArtifactIds: [],
    sourceContextVersionId: null,
    aiRunId: null,
    ...overrides,
  };
}

describe('analyzeRequirementQuality', () => {
  it('reports no issues for a well-formed requirement set', () => {
    const report = analyzeRequirementQuality([requirement()]);
    expect(report).toMatchObject({ standard: 'ISO/IEC/IEEE 29148:2018-aligned', issues: [] });
  });

  it('flags a blank/insufficient description', () => {
    const report = analyzeRequirementQuality([requirement({ description: 'muy corto' })]);
    expect(report.issues).toContainEqual(
      expect.objectContaining({ rule: 'BLANK_DESCRIPTION', code: 'RF-001' }),
    );
  });

  it('flags an unjustified TBD/TBC placeholder', () => {
    const report = analyzeRequirementQuality([requirement({ description: 'Falta definir: TBD' })]);
    expect(report.issues).toContainEqual(expect.objectContaining({ rule: 'PLACEHOLDER_TEXT' }));
  });

  it('flags duplicate and self dependencies', () => {
    const report = analyzeRequirementQuality([
      requirement({ id: 'r1', dependencyArtifactIds: ['r2', 'r2', 'r1'] }),
      requirement({ id: 'r2', code: 'RF-002', name: 'Otro' }),
    ]);
    const r1Issues = report.issues
      .filter((issue) => issue.requirementId === 'r1')
      .map((i) => i.rule);
    expect(r1Issues).toContain('DUPLICATE_DEPENDENCY');
    expect(r1Issues).toContain('SELF_DEPENDENCY');
  });

  it('flags an unresolved dependency reference', () => {
    const report = analyzeRequirementQuality([
      requirement({ id: 'r1', dependencyArtifactIds: ['missing'] }),
    ]);
    expect(report.issues).toContainEqual(
      expect.objectContaining({ rule: 'UNRESOLVED_DEPENDENCY' }),
    );
  });

  it('flags missing provenance only for AI_GENERATED requirements', () => {
    const aiWithoutProvenance = analyzeRequirementQuality([
      requirement({ origin: 'AI_GENERATED', sourceContextVersionId: null, aiRunId: null }),
    ]);
    expect(aiWithoutProvenance.issues).toContainEqual(
      expect.objectContaining({ rule: 'MISSING_PROVENANCE' }),
    );
    const manual = analyzeRequirementQuality([requirement({ origin: 'MANUAL' })]);
    expect(manual.issues.some((issue) => issue.rule === 'MISSING_PROVENANCE')).toBe(false);
  });

  it('flags a possible multi-obligation description as a non-authoritative hint', () => {
    const report = analyzeRequirementQuality([
      requirement({
        description:
          'El sistema debe registrar el pedido. Además debe enviar un correo. Y también facturar.',
      }),
    ]);
    expect(report.issues).toContainEqual(
      expect.objectContaining({ rule: 'POSSIBLE_MULTI_OBLIGATION' }),
    );
  });

  it('flags duplicate normalized names across requirements', () => {
    const report = analyzeRequirementQuality([
      requirement({ id: 'r1', code: 'RF-001', name: '  Registrar Pedido ' }),
      requirement({ id: 'r2', code: 'RF-002', name: 'registrar pedido' }),
    ]);
    const duplicateCodes = report.issues
      .filter((issue) => issue.rule === 'DUPLICATE_NAME')
      .map((issue) => issue.code);
    expect(duplicateCodes.sort()).toEqual(['RF-001', 'RF-002']);
  });
});
