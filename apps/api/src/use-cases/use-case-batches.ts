import { AIError } from '@caseflow-ai/ai';
import type { useCaseBatchOutputSchema } from '@caseflow-ai/contracts';
import type { z } from 'zod';

// DEC-139: requirements per batch. Small enough that one response holds every
// proposal (flows included) without being cut by the output allowance.
export const USE_CASE_BATCH_SIZE = 6;

export type BatchOutput = z.infer<typeof useCaseBatchOutputSchema>;
export type BatchCandidate = BatchOutput['candidates'][number];

export interface PlannedRequirement {
  // The requirement's code: what the model sees and cites.
  code: string;
  requirementType: 'FUNCTIONAL' | 'NON_FUNCTIONAL';
}

const byCode = (a: PlannedRequirement, b: PlannedRequirement) =>
  a.code.localeCompare(b.code, undefined, { numeric: true });

// Functional requirements are the ones a user does something with; they are
// the targets, in code order. Non-functional ones go to every batch as shared
// context. If only non-functional ones were chosen, they become the targets.
export function planUseCaseBatches(requirements: PlannedRequirement[]): string[][] {
  const functional = requirements.filter((r) => r.requirementType === 'FUNCTIONAL').sort(byCode);
  const targets = functional.length ? functional : [...requirements].sort(byCode);
  return Array.from({ length: Math.ceil(targets.length / USE_CASE_BATCH_SIZE) }, (_, index) =>
    targets
      .slice(index * USE_CASE_BATCH_SIZE, (index + 1) * USE_CASE_BATCH_SIZE)
      .map((r) => r.code),
  );
}

const invalid = (message: string): never => {
  throw new AIError('AI_INVALID_OUTPUT', message);
};
const normalize = (name: string) =>
  name
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export interface MergeOptions {
  // Requirements given only as shared context: never a source of a use case.
  contextCodes?: Set<string>;
  // Actor names found in the chosen requirements.
  knownActors?: string[];
}

// "Administrador o Encargado de sucursal" is two actors, not one. When every
// part is a known actor, the first stays primary and the others become
// secondary; anything else is left as the model wrote it.
export function splitPrimaryActor(
  primary: string,
  secondary: string[],
  knownActors: string[],
): { primaryActor: string; secondaryActors: string[] } {
  const parts = primary
    .split(/\s*,\s*|\s+o\s+|\s+y\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
  const canonical = new Map(knownActors.map((name) => [name.toLocaleLowerCase('es'), name]));
  if (parts.length < 2 || parts.some((part) => !canonical.has(part.toLocaleLowerCase('es'))))
    return { primaryActor: primary, secondaryActors: secondary };
  const [first, ...rest] = parts.map((part) => canonical.get(part.toLocaleLowerCase('es'))!);
  return {
    primaryActor: first!,
    secondaryActors: [...new Set([...rest, ...secondary])].filter((name) => name !== first),
  };
}

// Adds one batch's proposals to those already accepted from earlier batches.
// A proposal named like an existing one is not added again: its requirements
// are folded into the existing one, and relations aimed at it follow.
export function mergeUseCaseBatch(
  accumulated: BatchCandidate[],
  output: BatchOutput,
  targetCodes: string[],
  allowedCodes: Set<string>,
  position: number,
  options: MergeOptions = {},
): BatchCandidate[] {
  const contextCodes = options.contextCodes ?? new Set<string>();
  const knownActors = options.knownActors ?? [];
  const sources = (codes: string[]) => codes.filter((code) => !contextCodes.has(code));
  const next = accumulated.map((candidate) => ({
    ...candidate,
    relatedRequirementSourceIds: [...candidate.relatedRequirementSourceIds],
    relations: [...candidate.relations],
  }));
  const byName = new Map(next.map((candidate) => [normalize(candidate.name), candidate]));
  const existingIds = new Set(next.map((candidate) => candidate.candidateId));
  // Where each local id of this response ended up.
  const finalId = new Map<string, string>();
  const added: { candidate: BatchCandidate; localId: string }[] = [];
  output.candidates.forEach((candidate, index) => {
    if (candidate.relatedRequirementSourceIds.some((code) => !allowedCodes.has(code)))
      invalid('El lote cita requisitos que no se suministraron.');
    if (!candidate.relatedRequirementSourceIds.some((code) => targetCodes.includes(code)))
      invalid('El caso de uso no atiende los requisitos asignados al lote.');
    if (existingIds.has(candidate.candidateId))
      invalid('El lote reutiliza un identificador reservado.');
    const duplicate = byName.get(normalize(candidate.name));
    if (duplicate) {
      duplicate.relatedRequirementSourceIds = [
        ...new Set([
          ...duplicate.relatedRequirementSourceIds,
          ...sources(candidate.relatedRequirementSourceIds),
        ]),
      ];
      finalId.set(candidate.candidateId, duplicate.candidateId);
      return;
    }
    const id = `B${position + 1}-C${index + 1}`;
    finalId.set(candidate.candidateId, id);
    const created = {
      ...candidate,
      candidateId: id,
      relatedRequirementSourceIds: sources(candidate.relatedRequirementSourceIds),
      ...splitPrimaryActor(candidate.primaryActor, candidate.secondaryActors, knownActors),
    };
    byName.set(normalize(candidate.name), created);
    added.push({ candidate: created, localId: candidate.candidateId });
  });
  for (const { candidate } of added) {
    const seen = new Set<string>();
    candidate.relations = candidate.relations.flatMap((relation) => {
      const target =
        finalId.get(relation.targetCandidateId) ??
        (existingIds.has(relation.targetCandidateId) ? relation.targetCandidateId : undefined) ??
        invalid('El lote cita una relación hacia un caso de uso inexistente.');
      if (target === candidate.candidateId || seen.has(target)) return [];
      seen.add(target);
      return [{ ...relation, targetCandidateId: target }];
    });
    next.push(candidate);
  }
  return next;
}
