'use client';

import { useState, type MouseEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Gauge,
  Lightbulb,
  Link2,
  ListChecks,
  Minus,
  Target,
  Users,
} from 'lucide-react';
import type { ContextItemKind } from '@caseflow-ai/contracts';
import type { GenerationCandidate } from '../lib/api';
import { ContextCode } from './context-coverage';

// One AI-proposed requirement as a card: what it is, how important, who is
// involved, what it needs first and which other proposals it depends on.

type Candidate = GenerationCandidate & {
  requirementType?: 'FUNCTIONAL' | 'NON_FUNCTIONAL';
  description?: string;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  actors?: string[];
  preconditions?: string[];
  postconditions?: string[];
  outgoingDependencies?: { dependsOnCandidateId: string }[];
  contextItemCodes?: string[];
  suggested?: boolean;
  rationale?: string | null;
};

export type ContextItemLookup = Map<string, { kind: ContextItemKind; description: string }>;

export const requirementDependencies = (candidate: GenerationCandidate) =>
  ((candidate as Candidate).outgoingDependencies ?? []).map((d) => d.dependsOnCandidateId);

// What starts selected: the valid proposals derived from the context, never
// an idea beyond it, nor a proposal whose dependencies cannot be selected.
export function defaultRequirementSelection(candidates: GenerationCandidate[]) {
  const eligible = new Set(
    candidates
      .filter(
        (c) =>
          !(c as Candidate).suggested && !c.qualityFindings?.some((f) => f.severity === 'ERROR'),
      )
      .map((c) => c.id),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of candidates)
      if (eligible.has(c.id) && requirementDependencies(c).some((d) => !eligible.has(d))) {
        eligible.delete(c.id);
        changed = true;
      }
  }
  return [...eligible];
}

const TYPE = {
  FUNCTIONAL: {
    label: 'Funcional',
    icon: ListChecks,
    className:
      'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300',
  },
  NON_FUNCTIONAL: {
    label: 'No funcional',
    icon: Gauge,
    className:
      'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300',
  },
} as const;

const PRIORITY = {
  HIGH: {
    label: 'Prioridad alta',
    icon: ArrowUp,
    className:
      'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300',
  },
  MEDIUM: {
    label: 'Prioridad media',
    icon: Minus,
    className:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  },
  LOW: {
    label: 'Prioridad baja',
    icon: ArrowDown,
    className: 'border-border bg-muted text-muted-foreground',
  },
} as const;

function Pill({
  icon: Icon,
  label,
  className,
}: {
  icon: typeof ListChecks;
  label: string;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

function ConditionList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      <ul className="ml-4 list-disc space-y-0.5 text-sm text-foreground/85 marker:text-primary">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function RequirementCandidateCard({
  candidate,
  index,
  nameOf,
  contextItems,
}: {
  candidate: GenerationCandidate;
  index: number;
  nameOf: (candidateId: string) => string;
  contextItems?: ContextItemLookup;
}) {
  const c = candidate as Candidate;
  const [expanded, setExpanded] = useState(false);
  const type = TYPE[c.requirementType ?? 'FUNCTIONAL'];
  const priority = c.priority ? PRIORITY[c.priority] : undefined;
  const actors = c.actors ?? [];
  const preconditions = c.preconditions ?? [];
  const postconditions = c.postconditions ?? [];
  const dependencies = requirementDependencies(candidate);
  const codes = c.contextItemCodes ?? [];
  const hasMore = preconditions.length + postconditions.length > 0;
  // The card sits inside the selection label: its own buttons must not
  // toggle the checkbox.
  const toggleExpanded = (event: MouseEvent) => {
    event.preventDefault();
    setExpanded((v) => !v);
  };

  return (
    <span className="flex flex-col gap-2.5">
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-mono text-xs text-muted-foreground">#{index + 1}</span>
        <Pill icon={type.icon} label={type.label} className={type.className} />
        {priority ? (
          <Pill icon={priority.icon} label={priority.label} className={priority.className} />
        ) : null}
      </span>
      <span className="text-base leading-snug font-semibold text-foreground">{c.name}</span>
      {c.description ? (
        <span
          className={`text-sm leading-relaxed text-foreground/80 ${expanded ? '' : 'line-clamp-3'}`}
        >
          {c.description}
        </span>
      ) : null}
      {c.suggested && c.rationale ? (
        <span className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/70 p-2.5 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">Por qué considerarla: </span>
            {c.rationale}
          </span>
        </span>
      ) : null}
      {codes.length ? (
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Target className="size-3.5" aria-hidden="true" />
          Cubre:
          {codes.map((code) => {
            const item = contextItems?.get(code);
            return item ? (
              <ContextCode key={code} code={code} kind={item.kind} description={item.description} />
            ) : (
              <span
                key={code}
                title="Este código no existe en el contexto"
                className="rounded border border-destructive/40 px-1.5 py-px font-mono text-[11px] font-semibold text-destructive line-through"
              >
                {code}
              </span>
            );
          })}
        </span>
      ) : null}
      {actors.length ? (
        <span className="flex flex-wrap items-center gap-1.5">
          <Users className="size-3.5 text-muted-foreground" aria-label="Actores" />
          {actors.map((actor) => (
            <span
              key={actor}
              className="rounded-md bg-muted px-2 py-0.5 text-xs text-foreground/80"
            >
              {actor}
            </span>
          ))}
        </span>
      ) : null}
      {dependencies.length ? (
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Link2 className="size-3.5" aria-hidden="true" />
          Depende de:
          {dependencies.map((id) => (
            <span
              key={id}
              className="rounded-md border border-dashed border-border px-2 py-0.5 text-foreground/80"
            >
              {nameOf(id)}
            </span>
          ))}
        </span>
      ) : null}
      {expanded && hasMore ? (
        <span className="grid gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-2">
          <ConditionList title="Precondiciones" items={preconditions} />
          <ConditionList title="Postcondiciones" items={postconditions} />
        </span>
      ) : null}
      {hasMore || (c.description?.length ?? 0) > 220 ? (
        <button
          type="button"
          onClick={toggleExpanded}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline"
        >
          {expanded ? 'Ver menos' : hasMore ? 'Ver detalle y condiciones' : 'Ver más'}
          <ChevronDown
            className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      ) : null}
    </span>
  );
}
