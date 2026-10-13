// Extracted text keeps the document's structure as Markdown (DEC-125):
// headings, paragraphs, lists and tables. Only marks are added; the words are
// the source's own. Pure functions, so every rule is unit-tested.

export interface PdfTextItem {
  str: string;
  y: number;
  fontSize: number;
  hasEOL: boolean;
}

interface PdfLine {
  text: string;
  fontSize: number;
  y: number;
}

const BULLET = /^(?:[•▪●◦‣·*-]|=>|->|–)\s*/;

// A table of contents entry: a title, dot leaders and a page number
// ("1.1 Necesidad de negocio . . . . 4"). Inside a table of contents, a
// numbered line ending in a page number is one too, even without leaders
// ("2 Actores y autorizaciones 5").
const TOC_LEADERS = /^(.*?\S)\s*(?:[.…·]\s*){3,}(\d{1,4})$/;
const TOC_NUMBERED = /^(\d+(?:\.\d+)*\.?\s+.*?\S)\s+(\d{1,4})$/;

// Only lines this short are tested: the patterns backtrack on long runs of
// dots, and no real entry is longer.
const MAX_TOC_LINE = 300;

// One entry per line, indented by its numbering depth, without the leaders.
function tocEntry(title: string, page: string): string {
  const number = /^(\d+(?:\.\d+)*)/.exec(title)?.[1];
  const depth = number ? number.split('.').filter(Boolean).length - 1 : 0;
  return `${'  '.repeat(Math.min(depth, 3))}- ${title} — ${page}`;
}

// A line that starts like Markdown syntax would be read as markup.
const escapeLine = (line: string) => line.replace(/^([#>|])/, '\\$1');

function pdfLines(items: readonly PdfTextItem[]): PdfLine[] {
  const lines: PdfLine[] = [];
  let parts: string[] = [];
  let size = 0;
  let y = 0;
  const end = () => {
    const text = parts.join('').replace(/\s+/g, ' ').trim();
    if (text) lines.push({ text, fontSize: size, y });
    parts = [];
    size = 0;
  };
  for (const item of items) {
    if (!parts.length) y = item.y;
    parts.push(item.str);
    if (item.str.trim()) size = Math.max(size, item.fontSize);
    if (item.hasEOL) end();
  }
  end();
  return lines;
}

// The body size is the font size most characters are written in.
function bodyFontSize(lines: readonly PdfLine[]): number {
  const weight = new Map<number, number>();
  for (const line of lines) {
    const size = Math.round(line.fontSize * 2) / 2;
    weight.set(size, (weight.get(size) ?? 0) + line.text.length);
  }
  let body = 0;
  let best = -1;
  for (const [size, chars] of weight)
    if (chars > best) {
      best = chars;
      body = size;
    }
  return body;
}

function headingLevel(line: PdfLine, body: number): number {
  if (!body || line.text.length > 120) return 0;
  const ratio = line.fontSize / body;
  return ratio >= 1.6 ? 1 : ratio >= 1.3 ? 2 : ratio >= 1.12 ? 3 : 0;
}

// One Markdown string per page ('' for a page without a text layer, which the
// caller reads with OCR). Headings come from font size relative to the
// document's body text; a vertical gap or a bullet starts a new block.
export function pdfPagesToMarkdown(pages: readonly (readonly PdfTextItem[])[]): string[] {
  const pageLines = pages.map(pdfLines);
  const body = bodyFontSize(pageLines.flat());
  return pageLines.map((lines) => {
    const blocks: string[] = [];
    let paragraph: string[] = [];
    let list: string[] = [];
    let toc: string[] = [];
    // The first line of a table of contents title that wrapped.
    let tocTitle: string | null = null;
    let previous: PdfLine | undefined;
    const flush = () => {
      if (paragraph.length) blocks.push(paragraph.join(' '));
      if (list.length) blocks.push(list.join('\n'));
      if (toc.length) blocks.push(toc.join('\n'));
      if (tocTitle) blocks.push(escapeLine(tocTitle));
      paragraph = [];
      list = [];
      toc = [];
      tocTitle = null;
    };
    for (const line of lines) {
      const entry =
        line.text.length > MAX_TOC_LINE
          ? null
          : (TOC_LEADERS.exec(line.text) ?? (toc.length ? TOC_NUMBERED.exec(line.text) : null));
      if (entry) {
        // Numbered lines just before the first leaders were entries already.
        if (
          !toc.length &&
          paragraph.length &&
          paragraph.every((p) => p.length <= MAX_TOC_LINE && TOC_NUMBERED.test(p))
        ) {
          toc = paragraph.map((p) => {
            const [, title, page] = TOC_NUMBERED.exec(p)!;
            return tocEntry(title!, page!);
          });
          paragraph = [];
        }
        if (paragraph.length || list.length) {
          const pending = tocTitle;
          tocTitle = null;
          flush();
          tocTitle = pending;
        }
        const title = tocTitle ? `${tocTitle} ${entry[1]}` : entry[1]!;
        toc.push(tocEntry(title, entry[2]!));
        tocTitle = null;
        previous = line;
        continue;
      }
      if (toc.length && !tocTitle && !headingLevel(line, body)) {
        tocTitle = line.text;
        previous = line;
        continue;
      }
      if (toc.length) flush();
      const level = headingLevel(line, body);
      const gap = previous ? Math.abs(previous.y - line.y) : 0;
      const spaced = previous ? gap > Math.max(previous.fontSize, line.fontSize) * 1.8 : false;
      if (level) {
        flush();
        // Consecutive heading lines of the same size are one wrapped title.
        const last = blocks.at(-1);
        const prefix = '#'.repeat(level) + ' ';
        if (
          last?.startsWith(prefix) &&
          previous &&
          headingLevel(previous, body) === level &&
          !spaced
        )
          blocks[blocks.length - 1] = `${last} ${line.text}`;
        else blocks.push(prefix + line.text);
      } else if (BULLET.test(line.text)) {
        if (paragraph.length) {
          blocks.push(paragraph.join(' '));
          paragraph = [];
        }
        list.push(`- ${line.text.replace(BULLET, '')}`);
      } else if (list.length && !spaced) {
        // A wrapped bullet continues on the next line.
        list[list.length - 1] += ` ${line.text}`;
      } else {
        if (spaced || list.length) flush();
        const last = paragraph.at(-1);
        // A word cut at the end of a line ("informa-" + "ción") is joined back.
        if (last?.endsWith('-') && /^\p{Ll}/u.test(line.text))
          paragraph[paragraph.length - 1] = last.slice(0, -1) + line.text;
        else paragraph.push(paragraph.length ? line.text : escapeLine(line.text));
      }
      previous = line;
    }
    flush();
    return blocks.join('\n\n');
  });
}

// Pages joined with a thematic break, so each slide or page stays apparent.
export const joinPages = (pages: readonly string[]) =>
  pages
    .map((page) => page.trim())
    .filter(Boolean)
    .join('\n\n---\n\n');

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};
const decode = (text: string) =>
  text.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity]!);

// The small, predictable HTML mammoth produces for a .docx (headings,
// paragraphs, lists, tables, emphasis, links) as Markdown. Anything else is
// reduced to its text.
export function docxHtmlToMarkdown(html: string): string {
  const blocks: string[] = [];
  const lists: { ordered: boolean; count: number }[] = [];
  let table: string[][] | null = null;
  let row: string[] | null = null;
  let cell: string | null = null;
  let text = '';
  let block: 'p' | 'li' | 'h' = 'p';
  let level = 0;
  let href: string | null = null;
  let linkText = '';

  const write = (value: string) => {
    if (href !== null) linkText += value;
    else if (cell !== null) cell += value;
    else text += value;
  };
  const endBlock = () => {
    const content = text.replace(/\s+/g, ' ').trim();
    text = '';
    if (!content) return;
    if (block === 'h') blocks.push(`${'#'.repeat(level)} ${content}`);
    else if (block === 'li') {
      const list = lists.at(-1);
      const marker = list?.ordered ? `${++list.count}.` : '-';
      blocks.push(`${'  '.repeat(Math.max(lists.length - 1, 0))}${marker} ${content}`);
    } else blocks.push(escapeLine(content));
  };

  for (const token of html.split(/(<[^>]+>)/)) {
    const tag = /^<(\/?)([a-z0-9]+)([^>]*)>$/i.exec(token);
    if (!tag) {
      if (token) write(decode(token));
      continue;
    }
    const [, closing, rawName, attributes] = tag;
    const name = rawName!.toLowerCase();
    const open = !closing;
    if (/^h[1-6]$/.test(name)) {
      if (open) {
        endBlock();
        block = 'h';
        level = Number(name[1]);
      } else {
        endBlock();
        block = 'p';
      }
    } else if (name === 'p') {
      if (cell !== null) {
        if (!open && cell) cell += ' ';
      } else if (open && block !== 'li') endBlock();
      else if (!open && block !== 'li') endBlock();
    } else if (name === 'ul' || name === 'ol') {
      if (open) {
        if (block === 'li') endBlock();
        lists.push({ ordered: name === 'ol', count: 0 });
      } else lists.pop();
      if (!lists.length) block = 'p';
    } else if (name === 'li') {
      if (open) {
        endBlock();
        block = 'li';
      } else {
        endBlock();
        if (!lists.length) block = 'p';
      }
    } else if (name === 'table') {
      if (open) {
        endBlock();
        table = [];
      } else if (table) {
        const rows = table.filter((r) => r.length);
        if (rows.length) {
          const width = Math.max(...rows.map((r) => r.length));
          const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')];
          const line = (r: string[]) => `| ${pad(r).join(' | ')} |`;
          blocks.push(
            [line(rows[0]!), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n'),
          );
        }
        table = null;
      }
    } else if (name === 'tr') {
      if (open) row = [];
      else if (row && table) {
        table.push(row);
        row = null;
      }
    } else if (name === 'td' || name === 'th') {
      if (open) cell = '';
      else if (cell !== null && row) {
        row.push(cell.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim());
        cell = null;
      }
    } else if (name === 'strong' || name === 'b') write('**');
    else if (name === 'em' || name === 'i') write('*');
    else if (name === 'br') write(cell !== null ? ' ' : '  \n');
    else if (name === 'a') {
      if (open) {
        const link = /href="(https?:[^"]+)"/i.exec(attributes ?? '');
        if (link) {
          href = decode(link[1]!);
          linkText = '';
        }
      } else if (href !== null) {
        const target = href;
        href = null;
        write(linkText.trim() ? `[${linkText.trim()}](${target})` : '');
      }
    }
  }
  endBlock();
  // Consecutive items stay one list.
  const isItem = (value: string) => /^\s*(?:-|\d+\.)\s/.test(value);
  return blocks
    .map((value, i) => (i && isItem(value) && isItem(blocks[i - 1]!) ? '\n' : '\n\n') + value)
    .join('')
    .trim();
}
