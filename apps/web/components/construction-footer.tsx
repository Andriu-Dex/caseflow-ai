'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Lock, Sparkles } from 'lucide-react';
import { Button } from '@caseflow-ai/ui';
import { api } from '../lib/api';
import {
  CONSTRUCTION_STEPS,
  TOTAL_CONSTRUCTION_STEPS,
  firstBlockingConstructionStep,
} from '../lib/stage-links';
import { useConstructionState } from '../lib/use-construction-state';

// Previous / next buttons at the bottom of a construction step. The next one
// is disabled, with the reason, while this step (or an earlier one) is not
// approved: the same order the sidebar keeps. The prompt routes approve the
// steps automatically, so nothing is disabled there.
export function ConstructionFooter({ projectId, step }: { projectId: string; step: number }) {
  const construction = useConstructionState(projectId);
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId),
  });
  const route = project.data?.workflowRoute;
  const automatic = route === 'BUILD_ONLY' || route === 'EXPRESS';

  const previous = CONSTRUCTION_STEPS.find((item) => item.step === step - 1);
  const next = CONSTRUCTION_STEPS.find((item) => item.step === step + 1);
  const last = step === TOTAL_CONSTRUCTION_STEPS;
  const blocker =
    next && !automatic ? firstBlockingConstructionStep(next.href, construction.data) : null;

  return (
    <div className="mt-2 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 sm:flex-row">
      <Link href={previous?.href ?? '/traceability'}>
        <Button variant="outline" size="sm" className="gap-2 text-xs">
          <ArrowLeft className="size-3.5" />
          Anterior:{' '}
          {previous ? `${previous.label} (Paso ${previous.step})` : 'Trazabilidad (Paso 13)'}
        </Button>
      </Link>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="size-3.5 text-primary" />
        <span>
          Fase de Construcción · Paso {step} de {TOTAL_CONSTRUCTION_STEPS}
          {last ? ' (Hito Final)' : ''}
        </span>
      </div>

      {last || !next ? (
        <Link href="/readiness">
          <Button size="sm" className="gap-2 text-xs font-semibold">
            Ver Estado del Proyecto (Readiness)
            <ArrowRight className="size-3.5" />
          </Button>
        </Link>
      ) : blocker ? (
        <Button
          size="sm"
          className="gap-2 text-xs font-semibold"
          disabled
          title={`Complete primero «${blocker.label}» para continuar`}
        >
          <Lock className="size-3.5" aria-hidden="true" />
          Siguiente: {next.label} (Paso {next.step})
        </Button>
      ) : (
        <Link href={next.href}>
          <Button size="sm" className="gap-2 text-xs font-semibold">
            Siguiente: {next.label} (Paso {next.step})
            <ArrowRight className="size-3.5" />
          </Button>
        </Link>
      )}
    </div>
  );
}
