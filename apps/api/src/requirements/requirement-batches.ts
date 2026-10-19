import { AIError } from '@caseflow-ai/ai';
import {
  completeRequirementGenerationOutputSchema,
  requirementBatchOutputSchema,
  requirementDependencyOutputSchema,
} from '@caseflow-ai/contracts';
import type { z } from 'zod';

export const REQUIREMENT_BATCH_SIZE = 8;
export type BatchOutput = z.infer<typeof requirementBatchOutputSchema>;
export type CompleteOutput = z.infer<typeof completeRequirementGenerationOutputSchema>;
export type BatchCandidate = CompleteOutput['candidates'][number] & { aiRunId?: string };
const withoutRun = (candidate: BatchCandidate) => {
  const data = { ...candidate };
  delete data.aiRunId;
  return data;
};
export interface CodedRequirementContext {
  problemStatement: string;
  objective: string;
  additionalContext: string | null;
  actors: { name: string; description: string | null }[];
  scope: { type: string; description: string }[];
  needs: { code: string; description: string }[];
  businessRules: { code: string; description: string }[];
  constraints: { code: string; description: string }[];
  mustCover: string[];
}

export function planRequirementBatches(context: CodedRequirementContext): string[][] {
  // A stable order for the immutable snapshot; every item is assigned once.
  return [context.needs, context.businessRules, context.constraints].flatMap((items) =>
    Array.from({ length: Math.ceil(items.length / REQUIREMENT_BATCH_SIZE) }, (_, index) =>
      items
        .slice(index * REQUIREMENT_BATCH_SIZE, (index + 1) * REQUIREMENT_BATCH_SIZE)
        .map((item) => item.code),
    ),
  );
}

const invalid = (message: string): never => {
  throw new AIError('AI_INVALID_OUTPUT', message);
};
export function mergeRequirementBatch(
  candidates: BatchCandidate[],
  suggestions: CompleteOutput['suggestions'],
  output: BatchOutput,
  targetCodes: string[],
  context: CodedRequirementContext,
  position: number,
  aiRunId: string,
): { candidates: BatchCandidate[]; suggestions: CompleteOutput['suggestions'] } {
  const knownCodes = new Set(
    [...context.needs, ...context.businessRules, ...context.constraints].map((item) => item.code),
  );
  const existing = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const all = [...output.candidates, ...output.suggestions];
  if (new Set(all.map((c) => c.candidateId)).size !== all.length)
    invalid('El lote repite identificadores de propuestas.');
  if (all.some((c) => existing.has(c.candidateId)))
    invalid('El lote reutiliza un identificador reservado.');
  const ids = new Map(
    all.map((candidate, index) => [candidate.candidateId, `B${position + 1}-C${index + 1}`]),
  );
  const validateCodes = (codes: string[]) => {
    if (codes.some((code) => !knownCodes.has(code)))
      invalid('El lote cita elementos que no existen en el contexto.');
  };
  const dependencies = (values: string[]) =>
    values.map(
      (id) =>
        ids.get(id) ??
        (existing.has(id) ? id : invalid('El lote cita una dependencia inexistente.')),
    );
  const next = candidates.map((candidate) => ({
    ...candidate,
    contextItemCodes: [...candidate.contextItemCodes],
  }));
  for (const update of output.coverageUpdates) {
    validateCodes(update.contextItemCodes);
    if (!update.contextItemCodes.some((code) => targetCodes.includes(code)))
      invalid('La revisión no atiende los elementos asignados al lote.');
    const candidate =
      next.find((value) => value.candidateId === update.candidateId) ??
      invalid('El lote intenta modificar una propuesta inexistente.');
    candidate.contextItemCodes = [
      ...new Set([...candidate.contextItemCodes, ...update.contextItemCodes]),
    ];
    candidate.description = update.description;
    candidate.aiRunId = aiRunId;
  }
  for (const candidate of output.candidates) {
    validateCodes(candidate.contextItemCodes);
    if (!candidate.contextItemCodes.some((code) => targetCodes.includes(code)))
      invalid('El requisito no atiende los elementos asignados al lote.');
    next.push({
      ...candidate,
      candidateId: ids.get(candidate.candidateId)!,
      dependencyCandidateIds: dependencies(candidate.dependencyCandidateIds),
      aiRunId,
    });
  }
  const nextSuggestions = [
    ...suggestions,
    ...output.suggestions.map((candidate) => ({
      ...candidate,
      candidateId: ids.get(candidate.candidateId)!,
      dependencyCandidateIds: dependencies(candidate.dependencyCandidateIds),
    })),
  ];
  if (nextSuggestions.length > 5) invalid('La generación excede las cinco sugerencias opcionales.');
  const covered = new Set(next.flatMap((candidate) => candidate.contextItemCodes));
  const missing = targetCodes.filter(
    (code) => context.mustCover.includes(code) && !covered.has(code),
  );
  if (missing.length) invalid(`El lote no cubrió elementos obligatorios: ${missing.join(', ')}.`);
  const checked = completeRequirementGenerationOutputSchema.safeParse({
    candidates: next.map(withoutRun),
    suggestions: nextSuggestions,
  });
  if (!checked.success)
    invalid(
      'Las propuestas del lote contienen dependencias inválidas o exceden los límites de seguridad.',
    );
  return { candidates: next, suggestions: nextSuggestions };
}

export function mergeRequirementDependencies(
  candidates: BatchCandidate[],
  output: z.infer<typeof requirementDependencyOutputSchema>,
  context: CodedRequirementContext,
  suggestions: CompleteOutput['suggestions'],
) {
  const ids = new Set(candidates.map((candidate) => candidate.candidateId));
  const next = candidates.map((candidate) => ({
    ...candidate,
    dependencyCandidateIds: [...candidate.dependencyCandidateIds],
  }));
  for (const link of output.dependencies) {
    if (!ids.has(link.candidateId) || !ids.has(link.dependsOnCandidateId))
      invalid('La revisión cita una dependencia inexistente.');
    const candidate = next.find((value) => value.candidateId === link.candidateId)!;
    if (!candidate.dependencyCandidateIds.includes(link.dependsOnCandidateId))
      candidate.dependencyCandidateIds.push(link.dependsOnCandidateId);
  }
  const checked = completeRequirementGenerationOutputSchema.safeParse({
    candidates: next.map(withoutRun),
    suggestions,
  });
  if (!checked.success) invalid('La revisión contiene dependencias inválidas o cíclicas.');
  const covered = new Set(next.flatMap((candidate) => candidate.contextItemCodes));
  if (context.mustCover.some((code) => !covered.has(code)))
    invalid('La generación no cubre todo el contexto obligatorio.');
  return next;
}
