'use client';

import { useMemo, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Search } from 'lucide-react';
import { Input } from '@caseflow-ai/ui';

// Extracted text (Markdown since DEC-125; older text has its structure
// rebuilt) shown as a readable document.

export type TextBlock =
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'paragraph'; text: string };

const LIST_MARKER = /^(?:[-•*·▪●–]|=>|->)\s+/;
const NUMBERED_HEADING = /^\d+(?:\.\d+)*[.)]?\s+\S/;

// A short line written mostly in capitals, or a short numbered title in
// capitals ("1. CALIDAD DEL SOFTWARE"), reads as a heading.
function isHeading(line: string): boolean {
  if (line.length > 90) return false;
  const letters = line.replace(/[^\p{L}]/gu, '');
  if (letters.length < 3) return false;
  const upper = letters.replace(/[^\p{Lu}]/gu, '').length;
  const mostlyUpper = upper / letters.length >= 0.7;
  return mostlyUpper && (NUMBERED_HEADING.test(line) || !/[.:;,]$/.test(line));
}

export function structureText(text: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    // Bullets first: an item may well be in capitals ("- ISO 9001").
    const marker = LIST_MARKER.exec(line);
    if (marker) {
      flush();
      const item = line.slice(marker[0].length);
      const last = blocks.at(-1);
      if (last?.type === 'list') last.items.push(item);
      else blocks.push({ type: 'list', items: [item] });
      continue;
    }
    if (isHeading(line)) {
      flush();
      blocks.push({ type: 'heading', text: line });
      continue;
    }
    // A word cut at the end of a line ("informa-" + "ción") is joined back.
    const previous = paragraph.at(-1);
    if (previous?.endsWith('-') && /^\p{Ll}/u.test(line))
      paragraph[paragraph.length - 1] = previous.slice(0, -1) + line;
    else paragraph.push(line);
  }
  flush();
  return blocks;
}

const normalize = (value: string) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');

// Text extracted before DEC-125 has no Markdown: its structure is rebuilt.
const MARKDOWN_BLOCK = /^(?:#{1,6} |[-*+] |\d+\. |\| |---$|> )/m;
export function toMarkdown(text: string): string {
  if (MARKDOWN_BLOCK.test(text)) return text;
  return structureText(text)
    .map((block) =>
      block.type === 'heading'
        ? `## ${block.text}`
        : block.type === 'list'
          ? block.items.map((item) => `- ${item}`).join('\n')
          : block.text,
    )
    .join('\n\n');
}

function countMatches(text: string, query: string): number {
  const needle = normalize(query.trim());
  if (!needle) return 0;
  return normalize(text).split(needle).length - 1;
}

// Wraps every occurrence of the query in <mark>, inside the rendered
// document, ignoring case and accents. In NFC every accented letter is one
// character, so removing its accent keeps positions aligned.
type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};
const MARK_CLASS = ['rounded-sm', 'bg-amber-200', 'px-0.5', 'dark:bg-amber-500/40'];
function markMatches(node: HastNode, needle: string) {
  if (!node.children) return;
  node.children = node.children.flatMap((child): HastNode[] => {
    if (child.type !== 'text') {
      markMatches(child, needle);
      return [child];
    }
    const text = (child.value ?? '').normalize('NFC');
    const haystack = normalize(text);
    const parts: HastNode[] = [];
    let from = 0;
    for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, from)) {
      if (at > from) parts.push({ type: 'text', value: text.slice(from, at) });
      parts.push({
        type: 'element',
        tagName: 'mark',
        properties: { className: MARK_CLASS },
        children: [{ type: 'text', value: text.slice(at, at + needle.length) }],
      });
      from = at + needle.length;
    }
    if (!parts.length) return [child];
    if (from < text.length) parts.push({ type: 'text', value: text.slice(from) });
    return parts;
  });
}
const highlight = (query: string) => () => (tree: HastNode) => {
  const needle = normalize(query.trim());
  if (needle) markMatches(tree, needle);
};

// The document look: a page with serif headings in the theme color, roomy
// paragraphs, lists, tables and page breaks. HTML inside the text is never
// rendered (react-markdown ignores it), and unsafe link URLs are dropped.
const DOCUMENT_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="mt-8 mb-4 font-serif text-3xl leading-tight font-bold text-primary first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-8 mb-3 font-serif text-2xl leading-snug font-bold text-primary first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-6 mb-2 font-serif text-xl font-semibold text-primary first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-5 mb-2 font-serif text-lg font-semibold text-foreground first:mt-0">
      {children}
    </h4>
  ),
  p: ({ children }) => <p className="my-3 leading-7">{children}</p>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="my-3 ml-6 list-disc space-y-1.5 marker:text-primary">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 ml-6 list-decimal space-y-1.5 marker:text-primary">{children}</ol>
  ),
  li: ({ children }) => <li className="pl-1 leading-7">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-4 border-primary/40 pl-4 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-8 border-dashed border-border" />,
  table: ({ children }) => (
    <div className="my-5 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-muted px-4 py-2.5 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-border px-4 py-2.5 align-top">{children}</td>,
  code: ({ children }) => (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]">{children}</code>
  ),
};

// The source's text shown as a readable document, with an in-document search.
// `className` sizes the scrolling page (a fixed height in the card, the full
// height in the side-by-side view).
export function ReadableText({
  text,
  label,
  className = 'max-h-[40rem]',
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const markdown = useMemo(() => toMarkdown(text), [text]);
  const matches = useMemo(() => countMatches(text, query), [text, query]);
  const rehypePlugins = useMemo(() => [highlight(query)], [query]);
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label={`Buscar en ${label}`}
            placeholder="Buscar en el texto"
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {query.trim() ? (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {matches === 1 ? '1 coincidencia' : `${matches} coincidencias`}
          </span>
        ) : null}
      </div>
      <article
        aria-label={label}
        className={`overflow-auto rounded-lg border border-border bg-muted/30 p-3 sm:p-6 ${className}`}
      >
        <div className="mx-auto max-w-[75ch] rounded-md bg-white px-6 py-8 text-[1.02rem] text-zinc-800 shadow-sm ring-1 ring-black/5 sm:px-12 sm:py-10 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-white/10">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={rehypePlugins}
            components={DOCUMENT_COMPONENTS}
          >
            {markdown}
          </ReactMarkdown>
        </div>
      </article>
    </div>
  );
}
