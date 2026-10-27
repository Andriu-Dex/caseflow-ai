import type { MockupAppContext } from '@caseflow-ai/integrations';
import type { MockupFidelityReview } from '@caseflow-ai/contracts';

type Requirements = NonNullable<MockupAppContext['approvedRequirements']>;
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
const words: Record<string, number> = {
  un: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
};
const amount = '(\\d+|uno|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)';
const valueOf = (value: string) => words[value] ?? Number(value);
const subjectOf = (value: string) => value.replace(/s$/, '');

// Text analysis only: never executes HTML or treats this as a security sanitizer.
export function mockupHtmlText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, encoded: string) => {
      const code =
        encoded[0]!.toLowerCase() === 'x' ? parseInt(encoded.slice(1), 16) : Number(encoded);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    })
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos);/gi, ' ')
    .replace(
      /&(aacute|eacute|iacute|oacute|uacute|ntilde);/gi,
      (_, name: string) =>
        ({ aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ' })[
          name.toLowerCase()
        ]!,
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function limits(text: string) {
  return [
    ...normalize(text).matchAll(
      new RegExp(`(?:([a-z]+)\\s+)?maxim[oa](?:\\s+de)?\\s*:?\\s*${amount}\\s+([a-z]+)`, 'g'),
    ),
  ].map((match) => ({
    value: valueOf(match[2]!),
    subject: subjectOf(
      match[1] && !['como', 'un', 'el', 'al'].includes(match[1]) ? match[1] : match[3]!,
    ),
    text: match[0],
  }));
}

function periods(text: string) {
  return [
    ...normalize(text).matchAll(
      new RegExp(`${amount}\\s+(dias?|horas?)(?:\\s+(naturales|lectivos|habiles))?\\b`, 'g'),
    ),
  ].map((match) => ({
    hours: valueOf(match[1]!) * (match[2]!.startsWith('dia') ? 24 : 1),
    qualifier: match[3] ?? '',
    text: match[0],
  }));
}

export function reviewMockupHtml(
  requirements: Requirements,
  screens: { screenLocalId: string; html: string | null; blueprintText: string }[],
): MockupFidelityReview {
  const findings: MockupFidelityReview['findings'] = [];
  const approvedText = requirements.map((item) => item.description).join('\n');
  const approvedLimits = limits(approvedText);
  for (const screen of screens) {
    const add = (finding: Omit<(typeof findings)[number], 'screenLocalId'>) =>
      findings.push({ screenLocalId: screen.screenLocalId, ...finding });
    if (screen.html === null || !mockupHtmlText(screen.html)) {
      add({
        severity: 'ERROR',
        code: 'HTML_UNAVAILABLE',
        message:
          'No se pudo analizar el HTML de esta pantalla. Revise su disponibilidad antes de aprobar.',
        expected: 'HTML disponible',
        observed: null,
      });
      continue;
    }
    if (!requirements.length)
      add({
        severity: 'WARNING',
        code: 'NO_APPROVED_REQUIREMENTS',
        message: 'No hay requisitos aprobados con los que contrastar esta pantalla.',
        expected: null,
        observed: null,
      });
    const text = mockupHtmlText(screen.html);
    for (const actual of limits(text)) {
      const expected = [
        ...new Map(
          approvedLimits
            .filter((item) => item.subject === actual.subject)
            .map((item) => [item.value, item]),
        ).values(),
      ];
      if (expected.length === 1 && actual.value !== expected[0]!.value)
        add({
          severity: 'ERROR',
          code: 'CONTRADICTORY_LIMIT',
          message: 'El máximo mostrado contradice el requisito aprobado.',
          expected: expected[0]!.text,
          observed: actual.text,
        });
      else if (
        !limits(`${approvedText}\n${screen.blueprintText}`).some(
          (item) => item.subject === actual.subject && item.value === actual.value,
        )
      )
        add({
          severity: 'WARNING',
          code: 'UNSUPPORTED_QUANTITY',
          message:
            'El máximo mostrado no tiene respaldo numérico identificable en el plano o los requisitos. Revíselo.',
          expected: null,
          observed: actual.text,
        });
    }
    const backedPeriods = periods(`${approvedText}\n${screen.blueprintText}`);
    for (const actual of periods(text)) {
      if (
        !backedPeriods.some(
          (item) => item.hours === actual.hours && item.qualifier === actual.qualifier,
        )
      )
        add({
          severity: 'WARNING',
          code: 'UNSUPPORTED_QUANTITY',
          message:
            'El plazo mostrado no tiene respaldo identificable en el plano o los requisitos. Revíselo.',
          expected: null,
          observed: actual.text,
        });
    }
    // Compare retention only where both texts explicitly describe conservation.
    const retained = (input: string) =>
      [
        ...normalize(input).matchAll(
          new RegExp(
            `(?:conserv[a-z]*|reten[a-z]*)[^.;\\n]{0,100}?${amount}\\s+(?:dias?|horas?)\\b`,
            'g',
          ),
        ),
      ]
        .filter((match) => !/\bno\b|\bsin\b/.test(match[0]))
        .flatMap((match) => periods(match[0]));
    const expectedRetention = [
      ...new Map(retained(approvedText).map((item) => [item.hours, item])).values(),
    ];
    if (expectedRetention.length === 1)
      for (const actual of retained(text))
        if (actual.hours < expectedRetention[0]!.hours)
          add({
            severity: 'ERROR',
            code: 'CONTRADICTORY_RETENTION',
            message: 'La conservación mostrada es inferior a la exigida.',
            expected: expectedRetention[0]!.text,
            observed: actual.text,
          });
  }
  return {
    requirementVersionIds: requirements.map((item) => item.versionId),
    contextVersionIds: [
      ...new Set(
        requirements.flatMap((item) => (item.contextVersionId ? [item.contextVersionId] : [])),
      ),
    ],
    scope: 'HTML_HEURISTIC',
    findings,
  };
}
