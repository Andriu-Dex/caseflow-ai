import { estimateTokens } from '@caseflow-ai/ai';
import { splitIntoSections, type SourceSection } from '../knowledge-base/source-sections';

// What the context proposal reads from each source (DEC-127), within a
// fixed budget so it always fits one request. Every source keeps its report;
// the budget for text is shared fairly: short sources go whole, and what they
// leave goes to the longer ones, which are sent as excerpts — their sections
// closest to their own report, in document order.

export interface ContextSourceInput {
  versionId: string;
  code: string;
  title: string;
  text: string;
  report?: unknown;
}

export type ContextSourceEntry =
  | { code: string; title: string; report?: unknown; extractedText: string }
  | { code: string; title: string; report?: unknown; partial: true; excerpts: SourceSection[] };

// Words of four or more letters, cut to five so "pedidos" meets "pedido".
const stems = (text: string) =>
  new Set(
    text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 4)
      .map((word) => word.slice(0, 5)),
  );

function excerpts(source: ContextSourceInput, budgetTokens: number): SourceSection[] {
  const sections = splitIntoSections(source.text);
  const wanted = stems(JSON.stringify(source.report ?? ''));
  const scored = sections.map((section, index) => {
    const words = stems(`${section.heading ?? ''} ${section.content}`);
    let score = 0;
    for (const word of words) if (wanted.has(word)) score += 1;
    return { section, index, score, tokens: estimateTokens(JSON.stringify(section)) };
  });
  // Best first; without a report (no score) the document's own order.
  const chosen: typeof scored = [];
  let used = 0;
  for (const item of [...scored].sort((a, b) => b.score - a.score || a.index - b.index)) {
    if (used + item.tokens > budgetTokens) continue;
    chosen.push(item);
    used += item.tokens;
  }
  return chosen.sort((a, b) => a.index - b.index).map((item) => item.section);
}

export function planContextInput(
  sources: readonly ContextSourceInput[],
  budgetTokens: number,
): { entries: ContextSourceEntry[]; partialVersionIds: string[] } {
  const head = (s: ContextSourceInput) => ({
    code: s.code,
    title: s.title,
    ...(s.report ? { report: s.report } : {}),
  });
  const base = sources.reduce((sum, s) => sum + estimateTokens(JSON.stringify(head(s))), 0);
  const textTokens = sources.map((s) => estimateTokens(JSON.stringify(s.text)));
  // ponytail: reports are never cut; if they alone exceed the budget the
  // request may still be too large for the smallest provider.
  let remaining = Math.max(0, budgetTokens - base);
  const allocation: number[] = [];
  let left = sources.length;
  for (const index of sources.map((_, i) => i).sort((a, b) => textTokens[a]! - textTokens[b]!)) {
    allocation[index] = Math.min(textTokens[index]!, Math.floor(remaining / left));
    remaining -= allocation[index]!;
    left -= 1;
  }
  const partialVersionIds: string[] = [];
  const entries = sources.map((source, index): ContextSourceEntry => {
    if (allocation[index]! >= textTokens[index]!)
      return { ...head(source), extractedText: source.text };
    partialVersionIds.push(source.versionId);
    return { ...head(source), partial: true, excerpts: excerpts(source, allocation[index]!) };
  });
  return { entries, partialVersionIds };
}
