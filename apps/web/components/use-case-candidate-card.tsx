'use client';

import { useState, type MouseEvent } from 'react';
import { ChevronDown, Link2, User, Users } from 'lucide-react';
import { UseCaseRelationChips } from './use-case-relations';
import type { GenerationCandidate } from '../lib/api';
import { AlternativeFlows, FlowSteps, type AlternativeFlow, type FlowStep } from './use-case-flow';

// One AI-proposed use case as a card: what it achieves, who takes part,
// which requirements it realises and, on demand, its flows.

type Candidate = GenerationCandidate & {
  objective?: string;
  primaryActor?: string;
  secondaryActors?: string[];
  preconditions?: string[];
  postconditions?: string[];
  mainFlow?: FlowStep[];
  alternativeFlows?: AlternativeFlow[];
  sources?: { requirementVersionId: string }[];
  relations?: { kind: 'INCLUDE' | 'EXTEND'; targetCandidateId: string }[];
};

export const useCaseRequirementIds = (candidate: GenerationCandidate) =>
  ((candidate as Candidate).sources ?? []).map((s) => s.requirementVersionId);

export function UseCaseCandidateCard({
  candidate,
  index,
  requirementCode,
  candidateName = () => undefined,
}: {
  candidate: GenerationCandidate;
  index: number;
  requirementCode: (versionId: string) => { code: string; name: string } | undefined;
  // Name of another proposal of the same generation, for its relations.
  candidateName?: (candidateId: string) => string | undefined;
}) {
  const c = candidate as Candidate;
  const [expanded, setExpanded] = useState(false);
  const mainFlow = c.mainFlow ?? [];
  const alternatives = c.alternativeFlows ?? [];
  // The card sits inside the selection label: its button must not toggle it.
  const toggle = (event: MouseEvent) => {
    event.preventDefault();
    setExpanded((v) => !v);
  };
  return (
    <span className="flex flex-col gap-2.5">
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="mr-1 font-mono">#{index + 1}</span>
        <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 font-medium text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300">
          <User className="size-3" aria-hidden="true" />
          {c.primaryActor}
        </span>
        <span>
          {mainFlow.length} {mainFlow.length === 1 ? 'paso' : 'pasos'}
          {alternatives.length
            ? ` · ${alternatives.length} ${alternatives.length === 1 ? 'flujo alternativo' : 'flujos alternativos'}`
            : ''}
        </span>
      </span>
      <span className="text-base leading-snug font-semibold text-foreground">{c.name}</span>
      {c.objective ? (
        <span
          className={`text-sm leading-relaxed text-foreground/80 ${expanded ? '' : 'line-clamp-2'}`}
        >
          {c.objective}
        </span>
      ) : null}
      {useCaseRequirementIds(candidate).length ? (
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Link2 className="size-3.5" aria-hidden="true" />
          Realiza:
          {useCaseRequirementIds(candidate).map((id) => {
            const requirement = requirementCode(id);
            return (
              <span
                key={id}
                title={requirement?.name}
                className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-px font-mono text-[11px] font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300"
              >
                {requirement?.code ?? 'Requisito'}
              </span>
            );
          })}
        </span>
      ) : null}
      <UseCaseRelationChips
        relations={(c.relations ?? []).map((r) => ({
          kind: r.kind,
          label: candidateName(r.targetCandidateId) ?? r.targetCandidateId,
        }))}
      />
      {(c.secondaryActors ?? []).length ? (
        <span className="flex flex-wrap items-center gap-1.5">
          <Users className="size-3.5 text-muted-foreground" aria-label="Actores secundarios" />
          {c.secondaryActors!.map((actor) => (
            <span
              key={actor}
              className="rounded-md bg-muted px-2 py-0.5 text-xs text-foreground/80"
            >
              {actor}
            </span>
          ))}
        </span>
      ) : null}
      {expanded ? (
        <span className="flex flex-col gap-3 rounded-md bg-muted/40 p-3">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Flujo principal
          </span>
          <FlowSteps steps={mainFlow} />
          {alternatives.length ? (
            <>
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Flujos alternativos
              </span>
              <AlternativeFlows flows={alternatives} />
            </>
          ) : null}
        </span>
      ) : null}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="inline-flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline"
      >
        {expanded ? 'Ver menos' : 'Ver flujos'}
        <ChevronDown
          className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
    </span>
  );
}
