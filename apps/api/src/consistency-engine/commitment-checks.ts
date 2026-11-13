// Conservative, deterministic checks over declared commitments. These detect
// explicit contradictions; they do not certify arbitrary natural-language rules.
export interface DeclaredRequirement {
  code: string;
  description: string;
  actors: string[];
}

export interface CommitmentFinding {
  kind: 'RETENTION' | 'LIMIT' | 'ACTOR' | 'ACCESS_SCOPE';
  requirementCode: string;
  expected: string;
  observed: string | null;
  message: string;
}

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
const numberWords: Record<string, number> = {
  uno: 1,
  un: 1,
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
const number = (value: string) => numberWords[value] ?? Number(value);
const amount = '(\\d+(?:[.,]\\d+)?|uno|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)';

function retentionHours(text: string): number[] {
  return text.split(/[.;\n]/).flatMap((sentence) => {
    if (!/conserv|reten|elimin|borr/.test(sentence) || /\bno\b|\bsin\b/.test(sentence)) return [];
    return [...sentence.matchAll(new RegExp(`${amount}\\s+(dias?|horas?)\\b`, 'g'))].map(
      (match) => number(match[1]!.replace(',', '.')) * (match[2]!.startsWith('dia') ? 24 : 1),
    );
  });
}

export function numericCommitmentFindings(
  requirement: DeclaredRequirement,
  evidence: string,
): CommitmentFinding[] {
  const source = normalize(requirement.description);
  const actual = normalize(evidence);
  const findings: CommitmentFinding[] = [];
  const expectedTimes = retentionHours(source);
  const actualTimes = retentionHours(actual);
  // Multiple periods can refer to different policies; leave those for review.
  if (expectedTimes.length === 1 && actualTimes.length === 1 && actualTimes[0]! < expectedTimes[0]!)
    findings.push({
      kind: 'RETENTION',
      requirementCode: requirement.code,
      expected: `${expectedTimes[0]} horas`,
      observed: `${actualTimes[0]} horas`,
      message: `La conservación declarada para ${requirement.code} es inferior a la exigida (${actualTimes[0]} frente a ${expectedTimes[0]} horas).`,
    });
  const limit = new RegExp(`(?:maximo(?: de)?|como maximo)\\s+${amount}\\b`, 'g');
  const quantities = (text: string) =>
    [...text.matchAll(limit)].map((match) => ({
      value: number(match[1]!),
      subject: text
        .slice(match.index + match[0].length)
        .trim()
        .match(/^[a-z]+/)?.[0],
    }));
  const expectedLimits = quantities(source);
  const actualLimits = quantities(actual);
  if (
    expectedLimits.length === 1 &&
    actualLimits.length === 1 &&
    expectedLimits[0]!.subject &&
    expectedLimits[0]!.subject === actualLimits[0]!.subject &&
    actualLimits[0]!.value > expectedLimits[0]!.value
  )
    findings.push({
      kind: 'LIMIT',
      requirementCode: requirement.code,
      expected: String(expectedLimits[0]!.value),
      observed: String(actualLimits[0]!.value),
      message: `El máximo declarado para ${requirement.code} excede el permitido (${actualLimits[0]!.value} frente a ${expectedLimits[0]!.value}).`,
    });
  return findings;
}

export function actorCommitmentFindings(
  requirement: DeclaredRequirement,
  primaryActor: string,
): CommitmentFinding[] {
  if (
    !requirement.actors.length ||
    requirement.actors.some((actor) => normalize(actor) === normalize(primaryActor))
  )
    return [];
  return [
    {
      kind: 'ACTOR',
      requirementCode: requirement.code,
      expected: requirement.actors.join(', '),
      observed: primaryActor,
      message: `El actor «${primaryActor}» del caso no figura entre los actores declarados para ${requirement.code}. Revise sus permisos antes de continuar.`,
    },
  ];
}

export function accessScopeFindings(
  requirement: DeclaredRequirement,
  steps: string[],
): CommitmentFinding[] {
  if (!/\bpropios?\b/.test(normalize(requirement.description))) return [];
  const contradiction = steps.find((step) => {
    const text = normalize(step);
    return (
      /consult|muestr|acced/.test(text) &&
      /de (?:todos los|otros|otras)\b/.test(text) &&
      !/\bno\b|\bsin\b|\bsolo\b|unicamente|impid|denieg|rechaz/.test(text)
    );
  });
  return contradiction
    ? [
        {
          kind: 'ACCESS_SCOPE',
          requirementCode: requirement.code,
          expected: 'Acceso únicamente a datos propios',
          observed: contradiction,
          message: `Un paso del caso permite consultar datos ajenos al alcance propio declarado en ${requirement.code}. Revise la autorización.`,
        },
      ]
    : [];
}
