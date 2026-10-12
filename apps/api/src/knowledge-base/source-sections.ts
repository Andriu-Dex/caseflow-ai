// Splits a source's Markdown text (DEC-125) into sections of bounded size
// that follow its structure (DEC-127): a part never mixes two headings, never
// cuts a paragraph, list or table unless that block alone is too large, and
// carries the path of headings it belongs to ("Requisitos › Pedidos").

export interface SourceSection {
  heading: string | null;
  content: string;
}

export const SECTION_TARGET_CHARACTERS = 2_000;
export const SECTION_MAX_CHARACTERS = 3_000;

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const PAGE_BREAK = /^-{3,}$/;
const isTable = (block: string) => block.startsWith('|');

// A block too large on its own is cut at line boundaries; a table repeats
// its header row in every piece so each one still reads as a table.
function splitBlock(block: string, max: number): string[] {
  const lines = block.split('\n');
  const header = isTable(block) && lines.length > 2 ? lines.slice(0, 2) : [];
  const body = lines.slice(header.length);
  const pieces: string[] = [];
  let current: string[] = [];
  const size = (rows: string[]) => [...header, ...rows].join('\n').length;
  for (const line of body) {
    if (current.length && size([...current, line]) > max) {
      pieces.push([...header, ...current].join('\n'));
      current = [];
    }
    // A single line longer than the limit (a huge paragraph) is cut at the
    // last space before it.
    let rest = line;
    while (size([rest]) > max) {
      const room = max - size(['']);
      const cut = rest.lastIndexOf(' ', room) > room / 2 ? rest.lastIndexOf(' ', room) : room;
      pieces.push([...header, rest.slice(0, cut).trimEnd()].join('\n'));
      rest = rest.slice(cut).trimStart();
    }
    if (rest) current.push(rest);
  }
  if (current.length) pieces.push([...header, ...current].join('\n'));
  return pieces;
}

export function splitIntoSections(
  markdown: string,
  { target = SECTION_TARGET_CHARACTERS, max = SECTION_MAX_CHARACTERS } = {},
): SourceSection[] {
  const sections: SourceSection[] = [];
  const path: string[] = [];
  let parts: string[] = [];
  const heading = () => (path.length ? path.filter(Boolean).join(' › ') : null);
  const flush = () => {
    if (parts.length) sections.push({ heading: heading(), content: parts.join('\n\n') });
    parts = [];
  };

  for (const raw of markdown.split(/\n\s*\n/)) {
    let block = raw.trim();
    if (!block || PAGE_BREAK.test(block)) continue;
    // A heading may be followed by text without a blank line between them.
    const [first, ...rest] = block.split('\n');
    const match = HEADING.exec(first!);
    if (match) {
      flush();
      const level = match[1]!.length;
      path.length = level - 1;
      path[level - 1] = match[2]!;
      block = rest.join('\n').trim();
      if (!block) continue;
    }
    for (const piece of block.length > max ? splitBlock(block, max) : [block]) {
      const length = parts.join('\n\n').length;
      if (parts.length && length + 2 + piece.length > target) flush();
      parts.push(piece);
    }
  }
  flush();
  return sections;
}
