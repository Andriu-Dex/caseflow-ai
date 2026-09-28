'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '../lib/api';
import {
  computeStepState,
  PIPELINE_STEPS,
  ROUTE_STEP_NUMBER,
  TOTAL_PIPELINE_STEPS,
} from '../lib/stage-links';

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
  const readiness = useQuery({
    queryKey: ['readiness', projectId],
    queryFn: () => api.readiness.get(projectId!),
    enabled: Boolean(projectId),
  });
  const stages = readiness.data?.stages;
  const state = step ? computeStepState(pathname, stages) : 'unknown';
  const next = step ? PIPELINE_STEPS.find((s) => s.step === step + 1) : undefined;

  return (
    <div>
      {step ? (
        <p className="text-xs font-medium tracking-wide text-primary uppercase">
          Paso {step} de {TOTAL_PIPELINE_STEPS}
        </p>
      ) : null}
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      {state === 'satisfied' && next ? (
        <Link
          href={next.href}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
        >
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Este paso está completo — continuar a {next.label}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
