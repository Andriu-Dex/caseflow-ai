import {
  contextItemCode,
  isMandatoryContextItem,
  type ContextItemKind,
  type ContextItemRef,
  type RequirementCoverageItem,
} from '@caseflow-ai/contracts';

// Requirements answer the Project Context (DEC-126): the context items get
// stable codes, AI proposals cite them, and coverage tells which needs and
// business rules no requirement answers yet. Pure functions; the service
// feeds them database rows.

type Row = { id: string; artifactVersionId: string; position: number; description: string };
export interface ContextDetailRows {
  needs: Row[];
  constraints: Row[];
  businessRules: Row[];
  actors?: { name: string }[];
}

export interface CandidateFinding {
  severity: 'ERROR' | 'WARNING';
  code: 'UNKNOWN_CONTEXT_CODE' | 'MISSING_CONTEXT_ORIGIN' | 'UNKNOWN_ACTOR';
  message: string;
}

const ref = (kind: ContextItemKind, row: Row): ContextItemRef => ({
  id: row.id,
  kind,
  code: contextItemCode(kind, row.position),
  description: row.description,
  contextVersionId: row.artifactVersionId,
});

export function contextItems(detail: ContextDetailRows): ContextItemRef[] {
  return [
    ...detail.needs.map((row) => ref('NEED', row)),
    ...detail.businessRules.map((row) => ref('BUSINESS_RULE', row)),
    ...detail.constraints.map((row) => ref('CONSTRAINT', row)),
  ];
}

// Links have no order of their own: show needs, then rules, then
// constraints, each by number (N-1 before N-2).
const KIND_ORDER = { NEED: 0, BUSINESS_RULE: 1, CONSTRAINT: 2 } as const;
export const byContextCode = (a: ContextItemRef, b: ContextItemRef) =>
  KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
  Number(a.code.split('-')[1]) - Number(b.code.split('-')[1]);

export function contextItemRef(link: {
  need: Row | null;
  constraint: Row | null;
  businessRule: Row | null;
}): ContextItemRef {
  if (link.need) return ref('NEED', link.need);
  if (link.businessRule) return ref('BUSINESS_RULE', link.businessRule);
  return ref('CONSTRAINT', link.constraint!);
}

// Case, accents and spacing never make two wordings different.
export const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim();

// The same item in another context version: same kind and same wording.
export const sameItem = (a: ContextItemRef, b: ContextItemRef) =>
  a.kind === b.kind && normalize(a.description) === normalize(b.description);

// "Administrador" and "Administrador del sistema" are the same actor.
function knownActor(actor: string, contextActors: string[]) {
  const name = normalize(actor);
  return contextActors.some((known) => {
    const other = normalize(known);
    return other.includes(name) || name.includes(other);
  });
}

export function candidateFindings(
  candidate: { suggested: boolean; contextItemCodes: string[]; actors: string[] },
  context: { items: ContextItemRef[]; actors: string[] },
  strict: boolean,
): CandidateFinding[] {
  const findings: CandidateFinding[] = [];
  if (!candidate.suggested) {
    const codes = new Set(context.items.map((item) => item.code));
    const unknown = candidate.contextItemCodes.filter((code) => !codes.has(code));
    if (unknown.length)
      findings.push({
        severity: 'ERROR',
        code: 'UNKNOWN_CONTEXT_CODE',
        message: `Cita elementos que no existen en el contexto: ${unknown.join(', ')}.`,
      });
    else if (!candidate.contextItemCodes.length)
      findings.push({
        severity: strict ? 'ERROR' : 'WARNING',
        code: 'MISSING_CONTEXT_ORIGIN',
        message: 'No indica qué necesidad, regla o restricción del contexto atiende.',
      });
  }
  if (context.actors.length) {
    const unknownActors = candidate.actors.filter((actor) => !knownActor(actor, context.actors));
    if (unknownActors.length)
      findings.push({
        severity: 'WARNING',
        code: 'UNKNOWN_ACTOR',
        message: `${unknownActors.length === 1 ? 'El actor' : 'Los actores'} ${unknownActors
          .map((a) => `«${a}»`)
          .join(', ')} no ${unknownActors.length === 1 ? 'aparece' : 'aparecen'} en el contexto.`,
      });
  }
  return findings;
}

// Which requirements (or proposals) answer each context item. A link to the
// same item in an older context version still counts.
export function coverage(
  items: ContextItemRef[],
  answers: { label: string; items: ContextItemRef[] }[],
): RequirementCoverageItem[] {
  return items.map((item) => ({
    ...item,
    mandatory: isMandatoryContextItem(item.kind),
    coveredBy: answers
      .filter((answer) =>
        answer.items.some((linked) => linked.id === item.id || sameItem(linked, item)),
      )
      .map((answer) => answer.label),
  }));
}
