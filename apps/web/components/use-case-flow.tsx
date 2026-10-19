'use client';

import { GitBranch } from 'lucide-react';

// A use case's flows as readable numbered steps: "Actor: action".

export interface FlowStep {
  actor: string;
  action: string;
}
export interface AlternativeFlow {
  name: string;
  condition: string;
  steps: FlowStep[];
}

export function FlowSteps({ steps }: { steps: FlowStep[] }) {
  return (
    <ol className="flex flex-col gap-1.5">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
            {i + 1}
          </span>
          <span className="text-foreground/85">
            <span className="font-medium text-foreground">{step.actor}:</span> {step.action}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function AlternativeFlows({ flows }: { flows: AlternativeFlow[] }) {
  return (
    <div className="flex flex-col gap-3">
      {flows.map((flow, i) => (
        <div key={i} className="rounded-md border border-dashed border-border p-3">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-foreground">
            <GitBranch className="size-3.5 text-muted-foreground" aria-hidden="true" />
            {flow.name}
          </p>
          <p className="mb-2 text-xs text-muted-foreground">Cuando: {flow.condition}</p>
          <FlowSteps steps={flow.steps} />
        </div>
      ))}
    </div>
  );
}
