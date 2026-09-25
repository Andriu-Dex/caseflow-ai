'use client';

import { usePathname } from 'next/navigation';
import { ROUTE_STEP_NUMBER, TOTAL_PIPELINE_STEPS } from '../lib/stage-links';

// Reinforces "where am I in the process" on every pipeline stage page
// (spec: Home is the map, each stage confirms its own position in it) —
// derives the step number from the same ROUTE_STEP_NUMBER map the sidebar
// stepper uses, so the two never disagree.
export function PageHeading({ title }: { title: string }) {
  const pathname = usePathname();
  const step = ROUTE_STEP_NUMBER[pathname];
  return (
    <div>
      {step ? (
        <p className="text-xs font-medium tracking-wide text-primary uppercase">
          Paso {step} de {TOTAL_PIPELINE_STEPS}
        </p>
      ) : null}
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
    </div>
  );
}
