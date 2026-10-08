'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@caseflow-ai/ui';

// Extracted text (often from PDFs, slides or OCR) shown as a readable
// document: headings, lists and paragraphs instead of raw lines.

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

// Marks every occurrence of the query, ignoring case and accents.
// In NFC every accented letter is one character, so removing its accent keeps
// positions aligned with the displayed text.
function highlight(raw: string, query: string): ReactNode {
  const text = raw.normalize('NFC');
  const needle = normalize(query.trim());
  if (!needle) return text;
  const haystack = normalize(text);
  const parts: ReactNode[] = [];
  let from = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, from)) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark
        key={at}
        className="rounded-sm bg-amber-200 px-0.5 text-foreground dark:bg-amber-500/40"
      >
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    from = at + needle.length;
  }
  parts.push(text.slice(from));
  return parts;
}

function countMatches(text: string, query: string): number {
  const needle = normalize(query.trim());
  if (!needle) return 0;
  return normalize(text).split(needle).length - 1;
}

export function ReadableText({ text, label }: { text: string; label: string }) {
  const [query, setQuery] = useState('');
  const blocks = useMemo(() => structureText(text), [text]);
  const matches = useMemo(() => countMatches(text, query), [text, query]);
  return (
    <div className="flex flex-col gap-3">
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
        className="max-h-144 overflow-auto rounded-lg border border-border bg-card px-6 py-5"
      >
        <div className="mx-auto flex max-w-[70ch] flex-col gap-3 text-[0.95rem] leading-relaxed text-foreground/90">
          {blocks.map((block, i) =>
            block.type === 'heading' ? (
              <h4
                key={i}
                className="mt-2 text-sm font-semibold tracking-wide text-foreground first:mt-0"
              >
                {highlight(block.text, query)}
              </h4>
            ) : block.type === 'list' ? (
              <ul key={i} className="ml-5 flex list-disc flex-col gap-1 marker:text-primary">
                {block.items.map((item, j) => (
                  <li key={j}>{highlight(item, query)}</li>
                ))}
              </ul>
            ) : (
              <p key={i}>{highlight(block.text, query)}</p>
            ),
          )}
        </div>
      </article>
    </div>
  );
}
