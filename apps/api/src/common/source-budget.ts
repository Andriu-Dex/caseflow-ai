import { estimateTokens } from '@caseflow-ai/ai';

// DEC-140: the analysis sent to a design generation is the whole approved
// analysis. Past a hundred requirements and use cases that is too much text for
// one fast, focused call, so it is sent in less detail instead of being refused:
// every requirement and use case still goes in, only how much of each does.
export const SOURCE_BUDGET_TOKENS = 90_000;

type Plain = Record<string, unknown>;

// Level 0 is the full content; each next level drops the least useful detail.
export function requirementLevels(full: Plain): Plain[] {
  const { name, description, requirementType, priority, actors } = full;
  return [
    full,
    { name, description, requirementType, priority, actors },
    { name, requirementType, priority },
  ];
}

type Step = { action: string };
export function useCaseLevels(full: Plain): Plain[] {
  const mainFlow = (full.mainFlow as Step[] | undefined) ?? [];
  const alternativeFlows = (full.alternativeFlows as { name: string; condition: string }[]) ?? [];
  const { name, objective, primaryActor, secondaryActors, preconditions, postconditions } = full;
  return [
    full,
    {
      name,
      objective,
      primaryActor,
      secondaryActors,
      preconditions,
      postconditions,
      mainFlow: mainFlow.map((step) => step.action),
      alternativeFlows: alternativeFlows.map(({ name, condition }) => ({ name, condition })),
    },
    {
      name,
      objective,
      primaryActor,
      secondaryActors,
      postconditions,
      mainFlow: mainFlow.map((step) => step.action),
    },
    { name, objective, primaryActor, secondaryActors },
  ];
}

export interface BudgetItem<T> {
  kind: 'REQUIREMENT' | 'USE_CASE' | 'OTHER';
  // Richest first. "OTHER" items keep their only level.
  levels: T[];
}

// Use cases lose detail before requirements do: their flows are the bulk.
const STEPS: { USE_CASE: number; REQUIREMENT: number }[] = [
  { USE_CASE: 0, REQUIREMENT: 0 },
  { USE_CASE: 1, REQUIREMENT: 0 },
  { USE_CASE: 2, REQUIREMENT: 0 },
  { USE_CASE: 3, REQUIREMENT: 0 },
  { USE_CASE: 3, REQUIREMENT: 1 },
  { USE_CASE: 3, REQUIREMENT: 2 },
];

export function fitToBudget<T>(
  items: BudgetItem<T>[],
  budgetTokens = SOURCE_BUDGET_TOKENS,
): { items: T[]; reduced: boolean } {
  const pick = (step: (typeof STEPS)[number]) =>
    items.map((item) => {
      const level = item.kind === 'OTHER' ? 0 : step[item.kind];
      return item.levels[Math.min(level, item.levels.length - 1)]!;
    });
  let chosen = pick(STEPS[0]!);
  let reduced = false;
  for (const step of STEPS) {
    chosen = pick(step);
    reduced = step !== STEPS[0];
    if (estimateTokens(JSON.stringify(chosen)) <= budgetTokens) break;
  }
  return { items: chosen, reduced };
}
