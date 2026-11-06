import { describe, expect, it } from 'vitest';
import { mockupHtmlText, reviewMockupHtml } from './mockup-fidelity';

const requirements = [
  {
    code: 'RF-001',
    versionId: 'limit-version',
    description: 'Cada estudiante puede tener como máximo tres préstamos activos.',
  },
  {
    code: 'RNF-001',
    versionId: 'retention-version',
    description: 'Conservar auditoría al menos 365 días.',
  },
];
const review = (html: string | null, blueprintText = '') =>
  reviewMockupHtml(requirements, [{ screenLocalId: 'home', html, blueprintText }]);

describe('mockup HTML fidelity review', () => {
  it('blocks either direction of an explicit limit change, including a label before the maximum', () => {
    for (const html of [
      '<p>Préstamo máximo: 2 ejemplares por estudiante.</p>',
      '<p>Máximo 4 préstamos activos.</p>',
    ])
      expect(review(html).findings).toContainEqual(
        expect.objectContaining({
          code: 'CONTRADICTORY_LIMIT',
          severity: 'ERROR',
          screenLocalId: 'home',
        }),
      );
    expect(
      review('<p>Máximo 3 préstamos activos.</p><p>Conservar auditoría 365 días.</p>').findings,
    ).toEqual([]);
  });
  it('warns about new periods and maxima without assuming unrelated limits are equivalent', () => {
    expect(
      review('<p>Plazo: 15 días lectivos.</p><p>Máximo 8 caracteres.</p>').findings,
    ).toHaveLength(2);
    expect(review('<p>Plazo: 15 días lectivos.</p>', 'Plazo: 15 días lectivos.').findings).toEqual(
      [],
    );
    expect(review('<p>Máximo 8 caracteres.</p>').findings[0]).toMatchObject({
      severity: 'WARNING',
    });
  });
  it('detects reduced retention without interpreting illustrative dates as policies', () => {
    expect(review('<p>Conservar auditoría 1 día.</p>').findings).toContainEqual(
      expect.objectContaining({ code: 'CONTRADICTORY_RETENTION' }),
    );
    expect(review('<p>Fecha: 24/10/2024.</p>').findings).toEqual([]);
  });
  it('ignores scripts, comments and styles, decodes numeric text and preserves evidence versions', () => {
    const result = review(
      '<style>.x{content:"Máximo 9 préstamos"}</style><!-- Máximo 8 préstamos --><script>alert("Máximo 7 préstamos")</script><p>M&#225;ximo 2 pr&#233;stamos.</p>',
    );
    expect(result.findings).toHaveLength(1);
    expect(result.requirementVersionIds).toEqual(['limit-version', 'retention-version']);
    expect(mockupHtmlText('<p>&#x110000; &nbsp;</p>')).toBe('');
  });
  it('does not claim success when HTML or approved requirements are missing', () => {
    expect(review(null).findings[0]).toMatchObject({ code: 'HTML_UNAVAILABLE', severity: 'ERROR' });
    expect(review('<script>only script</script>').findings[0]?.code).toBe('HTML_UNAVAILABLE');
    expect(
      reviewMockupHtml([], [{ screenLocalId: 'home', html: '<p>Inicio</p>', blueprintText: '' }])
        .findings[0]?.code,
    ).toBe('NO_APPROVED_REQUIREMENTS');
  });
});
