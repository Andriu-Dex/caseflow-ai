'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  CheckCheck,
  Circle,
  ExternalLink,
  Loader2,
  RotateCcw,
  Rocket,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import type { WorkflowReviewItem, WorkflowStage } from '@caseflow-ai/contracts';
import { Button, Card, CardContent, Textarea } from '@caseflow-ai/ui';
import { api, ApiError, type ArtifactVersionStatus } from '../lib/api';
import { PageHeading } from './page-heading';
import { QueryState } from './query-state';
import { StatusBadge } from './status-badge';

const STAGE_LABELS: Record<WorkflowStage, string> = {
  SOURCE: 'Idea inicial como fuente',
  CONTEXT: 'Contexto del proyecto',
  REQUIREMENTS: 'Requisitos',
  USE_CASES: 'Casos de uso',
  USE_CASE_DIAGRAM: 'Diagrama de casos de uso',
  DATA_MODEL: 'Modelo de datos',
  CLASS_DIAGRAM: 'Diagrama de clases',
  NAVIGATION_TREE: 'Navegación',
  SOFTWARE_ARCHITECTURE: 'Arquitectura de software',
  SYSTEM_ARCHITECTURE: 'Arquitectura de sistema',
  UI_BLUEPRINT: 'Plano de interfaz',
  DESIGN_THEME: 'Tema y colores',
  MOCKUP: 'Bocetos',
  GENERATION_PLAN: 'Plan de generación',
  CONCEPTUAL_DOMAIN_MODEL: 'Modelo conceptual',
  PLANNING_REVIEW: 'Su revisión de la planificación',
  DESIGN_BASELINE: 'Aprobación de diseño',
  IMPLEMENTATION_PLAN: 'Plan de implementación',
  IMPLEMENTATION_REVIEW: 'Su revisión del plan de implementación',
  CODE_GENERATION: 'Generación de código',
  SANDBOX_VALIDATION: 'Validación en el entorno aislado',
};

// Where each reviewed artifact is edited.
const STAGE_PAGES: Partial<Record<WorkflowStage, string>> = {
  SOURCE: '/sources',
  CONTEXT: '/context',
  REQUIREMENTS: '/requirements',
  USE_CASES: '/use-cases',
  DATA_MODEL: '/data-model',
  CLASS_DIAGRAM: '/class-diagram',
  NAVIGATION_TREE: '/design/navigation',
  SOFTWARE_ARCHITECTURE: '/design/software-architecture',
  SYSTEM_ARCHITECTURE: '/design/system-architecture',
  UI_BLUEPRINT: '/design/ui-blueprint',
  DESIGN_THEME: '/design/theme',
  MOCKUP: '/design/mockups',
  GENERATION_PLAN: '/construction/generation-plan',
  CONCEPTUAL_DOMAIN_MODEL: '/construction/conceptual-model',
  IMPLEMENTATION_PLAN: '/construction/implementation-plan',
};

function ReviewSection({
  projectId,
  runId,
  stage,
  busy,
  onApprove,
}: {
  projectId: string;
  runId: string;
  stage: WorkflowStage;
  busy: boolean;
  onApprove: () => void;
}) {
  const review = useQuery({
    queryKey: ['workflow-review', projectId, runId, stage],
    queryFn: () => api.workflowRuns.review(projectId, runId),
  });
  const groups = new Map<WorkflowStage, WorkflowReviewItem[]>();
  for (const item of review.data?.items ?? [])
    groups.set(item.stage, [...(groups.get(item.stage) ?? []), item]);
  const planning = stage === 'PLANNING_REVIEW';

  return (
    <Card className="border-primary/40">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-2 text-sm">
          <UserCheck className="mt-0.5 size-4 text-primary" aria-hidden="true" />
          <div>
            <p className="font-medium">
              {planning
                ? 'La planificación está lista para su revisión.'
                : 'El plan de implementación está listo para su revisión.'}
            </p>
            <p className="text-muted-foreground">
              Abra cada elemento para revisarlo o editarlo. Editar crea una versión nueva; si lo que
              dependía de él ya no corresponde, regenérelo desde su página antes de aprobar.
            </p>
          </div>
        </div>
        <QueryState isLoading={review.isLoading} error={review.error}>
          <div className="flex flex-col gap-3">
            {[...groups].map(([group, items]) => (
              <section key={group}>
                <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {STAGE_LABELS[group]}
                </h3>
                <ul className="flex flex-col gap-1">
                  {items.map((item) => (
                    <li key={item.versionId} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
                      <span className="flex-1">
                        {item.title}{' '}
                        <span className="text-muted-foreground">(v{item.versionNumber})</span>
                      </span>
                      <StatusBadge status={item.status as ArtifactVersionStatus} />
                      {STAGE_PAGES[group] ? (
                        <Link
                          href={STAGE_PAGES[group]!}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          Revisar <ExternalLink className="size-3" aria-hidden="true" />
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </QueryState>
        <Button type="button" className="self-start" disabled={busy} onClick={onApprove}>
          <CheckCheck className="size-4" aria-hidden="true" />
          {planning ? 'Aprobar todo y congelar el diseño' : 'Aprobar el plan y construir'}
        </Button>
      </CardContent>
    </Card>
  );
}

// EXPRESS and BUILD_ONLY routes (DEC-116): the prompt, stage-by-stage
// progress, the EXPRESS bulk reviews and the result.
export function WorkflowRunPanel({ projectId, title }: { projectId: string; title: string }) {
  const queryClient = useQueryClient();
  const runs = useQuery({
    queryKey: ['workflow-runs', projectId],
    queryFn: () => api.workflowRuns.list(projectId),
    refetchInterval: (query) =>
      query.state.data?.items.some((r) => r.status === 'QUEUED' || r.status === 'RUNNING')
        ? 3000
        : false,
  });
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const run = runs.data?.items[0];

  async function act(action: () => Promise<unknown>, failure: string) {
    setBusy(true);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ['workflow-runs', projectId] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : failure);
    } finally {
      setBusy(false);
    }
  }

  const done = new Set(run?.completedStages);
  return (
    <div className="flex flex-col gap-6">
      <PageHeading title={title} projectId={projectId} />
      <QueryState isLoading={runs.isLoading} error={runs.error}>
        {!run ? (
          <Card>
            <CardContent className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">¿Qué aplicación quiere construir?</span>
                <Textarea
                  rows={5}
                  maxLength={4000}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </label>
              <Button
                type="button"
                className="self-start"
                disabled={busy || !prompt.trim()}
                onClick={() =>
                  act(
                    () => api.workflowRuns.start(projectId, prompt.trim()),
                    'No se pudo iniciar la ejecución.',
                  )
                }
              >
                <Rocket className="size-4" aria-hidden="true" />
                Comenzar
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="text-sm">
                <p className="text-xs font-medium text-muted-foreground uppercase">Idea inicial</p>
                <p className="mt-1 whitespace-pre-wrap">{run.prompt}</p>
              </CardContent>
            </Card>
            {run.status === 'FAILED' ? (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
              >
                <AlertTriangle className="size-4 text-destructive" aria-hidden="true" />
                <span className="flex-1">{run.errorMessage}</span>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    act(() => api.workflowRuns.retry(projectId, run.id), 'No se pudo reintentar.')
                  }
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Reintentar desde esta etapa
                </Button>
              </div>
            ) : null}
            {run.status === 'AWAITING_REVIEW' && run.currentStage ? (
              <ReviewSection
                projectId={projectId}
                runId={run.id}
                stage={run.currentStage}
                busy={busy}
                onApprove={() =>
                  act(
                    () => api.workflowRuns.approve(projectId, run.id),
                    'No se pudo aprobar la revisión.',
                  )
                }
              />
            ) : null}
            {run.status === 'COMPLETED' ? (
              <p className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                El código se generó y su validación en el entorno aislado está en curso. Revise el
                resultado y descargue el proyecto en{' '}
                <Link href="/construction/generation-runs" className="font-medium underline">
                  Generación de código
                </Link>
                .
              </p>
            ) : null}
            <ol className="flex flex-col gap-1.5" aria-label="Etapas">
              {run.stages.map((stage) => {
                const current = run.currentStage === stage;
                const state = done.has(stage)
                  ? 'done'
                  : current && run.status === 'FAILED'
                    ? 'failed'
                    : current && run.status === 'AWAITING_REVIEW'
                      ? 'review'
                      : current
                        ? 'running'
                        : 'pending';
                return (
                  <li key={stage} className="flex items-center gap-2 text-sm">
                    {state === 'done' ? (
                      <Check className="size-4 text-emerald-600" aria-label="Completada" />
                    ) : state === 'failed' ? (
                      <AlertTriangle className="size-4 text-destructive" aria-label="Falló" />
                    ) : state === 'review' ? (
                      <UserCheck
                        className="size-4 text-primary"
                        aria-label="Esperando su revisión"
                      />
                    ) : state === 'running' ? (
                      <Loader2 className="size-4 animate-spin text-primary" aria-label="En curso" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground" aria-label="Pendiente" />
                    )}
                    <span className={state === 'pending' ? 'text-muted-foreground' : ''}>
                      {STAGE_LABELS[stage]}
                    </span>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </QueryState>
    </div>
  );
}
