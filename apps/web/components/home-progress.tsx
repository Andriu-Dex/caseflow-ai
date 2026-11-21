'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  ExternalLink,
  Globe,
  Hammer,
  PartyPopper,
  Signpost,
} from 'lucide-react';
import type { ReadinessStage } from '@caseflow-ai/contracts';
import { Button, Card, CardContent, CardHeader } from '@caseflow-ai/ui';
import { api } from '../lib/api';
import { STAGE_LINKS, type ConstructionState } from '../lib/stage-links';
import { useConstructionState } from '../lib/use-construction-state';

const CONSTRUCTION_STEPS: {
  key: keyof ConstructionState;
  label: string;
  href: string;
}[] = [
  {
    key: 'hasApprovedGenerationPlan',
    label: 'Plan de generación',
    href: '/construction/generation-plan',
  },
  {
    key: 'hasApprovedConceptualModel',
    label: 'Modelo conceptual',
    href: '/construction/conceptual-model',
  },
  {
    key: 'hasDesignBaseline',
    label: 'Aprobación de diseño',
    href: '/construction/design-baseline',
  },
  {
    key: 'hasApprovedImplementationPlan',
    label: 'Plan de implementación',
    href: '/construction/implementation-plan',
  },
  { key: 'hasGeneratedCode', label: 'Código generado', href: '/construction/generation-runs' },
  { key: 'hasValidatedCode', label: 'Código validado', href: '/construction/generation-runs' },
];

type NextStep = { title: string; detail: string; reasons: string[]; href: string; action: string };

// The one thing to do next in the project, with why it is pending: the first
// incomplete planning step, then the construction, then publishing it.
function nextStep(
  stages: ReadinessStage[] | undefined,
  construction: ConstructionState | undefined,
  online: boolean,
): NextStep | 'DONE' | null {
  if (!stages || !construction) return null;
  const stage = stages.find((item) => !item.satisfied);
  if (stage)
    return {
      title: stage.label,
      detail: stage.nextAction ?? stage.summary,
      reasons: stage.blockers.slice(0, 3),
      href: STAGE_LINKS[stage.key] ?? '/readiness',
      action: `Ir a ${stage.label}`,
    };
  const step = CONSTRUCTION_STEPS.find((item) => !construction[item.key]);
  if (step)
    return {
      title: step.label,
      detail:
        step.key === 'hasValidatedCode'
          ? 'Valide el código en el entorno aislado para obtener una versión que se pueda desplegar.'
          : step.key === 'hasGeneratedCode'
            ? 'Genere el código o importe una implementación manual desde el plan aprobado.'
            : 'La planificación está completa: continúe con este paso de la construcción.',
      reasons: [],
      href: step.href,
      action: `Ir a ${step.label}`,
    };
  if (!online)
    return {
      title: 'Publicar la demostración',
      detail:
        'La versión validada está lista para desplegarse y presentarse con las cuentas de cada rol.',
      reasons: [],
      href: '/construction/generation-runs',
      action: 'Ir al despliegue',
    };
  return 'DONE';
}

function useHomeProgress(projectId: string, stages: ReadinessStage[] | undefined) {
  const construction = useConstructionState(projectId);
  const deployments = useQuery({
    queryKey: ['deployments', projectId],
    queryFn: () => api.deployments.list(projectId),
  });
  const running = deployments.data?.items.find((item) => item.status === 'RUNNING');
  const stopped = deployments.data?.items.find((item) => item.status === 'STOPPED');
  const next = nextStep(stages, construction.data, Boolean(running));
  const done = CONSTRUCTION_STEPS.filter((step) => construction.data?.[step.key]).length;

  return { construction, running, stopped, next, done };
}

type HomeProgressProps = { projectId: string; stages: ReadinessStage[] | undefined };

// The one thing to do next, at the top of the home page (8.3).
export function HomeNextStep({ projectId, stages }: HomeProgressProps) {
  const { next } = useHomeProgress(projectId, stages);
  return (
    <>
      {next === 'DONE' ? (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="flex flex-wrap items-center gap-3 pt-6">
            <PartyPopper className="size-5 text-emerald-600" aria-hidden="true" />
            <p className="text-sm font-medium">
              Todo listo: el proyecto está planificado, construido, validado y la demostración está
              en línea.
            </p>
          </CardContent>
        </Card>
      ) : next ? (
        <Card className="border-primary/30 bg-primary/5" aria-label="Siguiente paso">
          <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Signpost className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold">Siguiente paso: {next.title}</p>
                <p className="text-sm text-muted-foreground">{next.detail}</p>
                {next.reasons.length ? (
                  <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                    {next.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
            <Button asChild className="shrink-0 gap-1.5 self-start sm:self-center">
              <Link href={next.href}>
                {next.action}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

// Where the construction and the demonstration stand.
export function HomeConstruction({ projectId, stages }: HomeProgressProps) {
  const { construction, running, stopped, done } = useHomeProgress(projectId, stages);
  return (
    <Card aria-label="Construcción y demostración">
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Hammer className="size-4 text-primary" aria-hidden="true" />
          Construcción y demostración
        </h2>
        <span className="text-sm text-muted-foreground">
          {done} / {CONSTRUCTION_STEPS.length} pasos
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {CONSTRUCTION_STEPS.map((step) => {
            const complete = Boolean(construction.data?.[step.key]);
            return (
              <li key={step.key}>
                <Link
                  href={step.href}
                  className={`flex h-full items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted/60 ${
                    complete ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border'
                  }`}
                >
                  {complete ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span>{step.label}</span>
                  <span className="sr-only">{complete ? '(completo)' : '(pendiente)'}</span>
                </Link>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2.5 text-sm">
          <p className="flex items-center gap-2">
            <Globe className="size-4 text-muted-foreground" aria-hidden="true" />
            {running
              ? 'Demostración en línea'
              : stopped
                ? 'Demostración detenida'
                : 'La demostración aún no está publicada'}
          </p>
          <div className="flex flex-wrap gap-2">
            {running?.publicUrl ? (
              <Button asChild size="sm" className="gap-1.5">
                <a href={running.publicUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  Abrir la demostración
                </a>
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link href="/construction/generation-runs">Ver construcción y despliegue</Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
