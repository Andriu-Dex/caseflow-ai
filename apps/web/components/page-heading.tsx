'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '../lib/api';
import {
  computeConstructionStepState,
  computeStepState,
  CONSTRUCTION_STEPS,
  CONSTRUCTION_STEP_NUMBER,
  PIPELINE_STEPS,
  ROUTE_STEP_NUMBER,
  TOTAL_CONSTRUCTION_STEPS,
  TOTAL_PIPELINE_STEPS,
} from '../lib/stage-links';
import { useConstructionState } from '../lib/use-construction-state';

// Reinforces "where am I in the process" on every pipeline stage page
// (spec: Home is the map, each stage confirms its own position in it) —
// derives the step number from the same ROUTE_STEP_NUMBER map the sidebar
// stepper uses, so the two never disagree. When the current step's own
// readiness condition is already satisfied, also surfaces an explicit
// "continue" link to the next pipeline step, since nothing else on a stage
// page tells the user where to go next once they're done here.
export function PageHeading({ title, projectId }: { title: string; projectId?: string }) {
  const pathname = usePathname();
  const step = ROUTE_STEP_NUMBER[pathname];
  const constructionStep = CONSTRUCTION_STEP_NUMBER[pathname];

  const readiness = useQuery({
    queryKey: ['readiness', projectId],
    queryFn: () =>
      api.readiness?.get ? api.readiness.get(projectId!) : Promise.resolve(undefined),
    enabled: Boolean(projectId) && Boolean(step),
  });

  const construction = useConstructionState(constructionStep ? projectId : undefined);

  const stages = readiness.data?.stages;
  const state = step
    ? computeStepState(pathname, stages)
    : constructionStep
      ? computeConstructionStepState(pathname, construction.data)
      : 'unknown';

  const next = step
    ? PIPELINE_STEPS.find((s) => s.step === step + 1)
    : constructionStep
      ? constructionStep < TOTAL_CONSTRUCTION_STEPS
        ? CONSTRUCTION_STEPS.find((s) => s.step === constructionStep + 1)
        : { step: 6, href: '/readiness', label: 'Preparación / Exportar' }
      : undefined;

  return (
    <div>
      {step ? (
        <p className="text-xs font-medium tracking-wide text-primary uppercase">
          Paso {step} de {TOTAL_PIPELINE_STEPS}
        </p>
      ) : constructionStep ? (
        <p className="text-xs font-medium tracking-wide text-primary uppercase">
          Fase de Construcción · Paso {constructionStep} de {TOTAL_CONSTRUCTION_STEPS}
        </p>
      ) : null}
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      {state === 'satisfied' && next ? (
        <Link
          href={next.href}
          className="group mt-2.5 inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-sm font-medium text-emerald-800 shadow-xs transition-all hover:border-emerald-400 hover:bg-emerald-100 hover:shadow-sm active:scale-[0.99] dark:border-emerald-600/70 dark:bg-emerald-900/40 dark:text-emerald-200 dark:hover:border-emerald-500 dark:hover:bg-emerald-900/70"
        >
          <CheckCircle2
            className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
          <span>Este paso está completo — continuar a {next.label}</span>
          <ArrowRight
            className="size-4 shrink-0 text-emerald-600 transition-transform duration-200 group-hover:translate-x-1 dark:text-emerald-400"
            aria-hidden="true"
          />
        </Link>
      ) : null}
    </div>
  );
}
