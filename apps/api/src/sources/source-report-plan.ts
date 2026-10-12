import { estimateTokens } from '@caseflow-ai/ai';
import type { SourceSection } from '../knowledge-base/source-sections';

// How a long source's report is planned (DEC-127): consecutive sections are
// grouped into parts that fit one request, and the parts' interpretations are
// merged in batches that fit one request too.

// Tokens kept for the instructions, the output schema and the JSON wrapping.
export const PROMPT_RESERVE_TOKENS = 1_500;
// Assumed when the provider's capacity is unknown: the smallest configured
// free tier (Groq, 8 000 tokens per minute), so a request always fits.
export const DEFAULT_CAPACITY_TOKENS = 8_000;
// A 500 000-character source makes about 30 parts at Groq's size.
export const MAX_REPORT_PARTS = 40;

export const inputBudget = (capacity: number | undefined) =>
  (capacity ?? DEFAULT_CAPACITY_TOKENS) - PROMPT_RESERVE_TOKENS;

const sectionTokens = (section: SourceSection) => estimateTokens(JSON.stringify(section));

export function planReportParts(
  sections: readonly SourceSection[],
  partTokens: number,
): SourceSection[][] {
  const parts: SourceSection[][] = [];
  let current: SourceSection[] = [];
  let size = 0;
  for (const section of sections) {
    const tokens = sectionTokens(section);
    if (current.length && size + tokens > partTokens) {
      parts.push(current);
      current = [];
      size = 0;
    }
    current.push(section);
    size += tokens;
  }
  if (current.length) parts.push(current);
  return parts;
}

// Batches of consecutive items whose JSON fits the budget. Each batch holds
// at least two items, so merging always shrinks the list and ends.
export function mergeBatches<T>(items: readonly T[], budgetTokens: number): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  for (const item of items) {
    const next = [...current, item];
    if (current.length >= 2 && estimateTokens(JSON.stringify(next)) > budgetTokens) {
      batches.push(current);
      current = [item];
    } else current = next;
  }
  if (current.length === 1 && batches.length) batches[batches.length - 1]!.push(current[0]!);
  else if (current.length) batches.push(current);
  return batches;
}
