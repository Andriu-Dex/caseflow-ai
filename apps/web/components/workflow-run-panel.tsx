'use client';

import { useFailureToast } from '../lib/use-failure-toast';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCheck,
  CheckCircle2,
  ExternalLink,
  Lightbulb,
  Loader2,
  Rocket,
  RotateCcw,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import type { WorkflowReviewItem, WorkflowStage } from '@caseflow-ai/contracts';
import { Button, Card, CardContent, Textarea } from '@caseflow-ai/ui';
import { api, ApiError, type ArtifactVersionStatus } from '../lib/api';
import { PageHeading } from './page-heading';
import { QueryState } from './query-state';
import { StatusBadge } from './status-badge';

const PROMPT_SUGGESTIONS = [
  'Sistema de gestión de inventario y pedidos con control de stock y proveedores',
  'Portal de reservas de citas y consultas médicas con historial de pacientes',
  'Plataforma académica para gestión de tutorías, notas y asesorías de estudiantes',
];

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
    <Card className="border-primary/40 shadow-xs relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-indigo-500 to-sky-500" />
      <CardContent className="flex flex-col gap-5 pt-6">
        <div className="flex items-start gap-3.5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/25 shadow-xs">
            <UserCheck className="size-5" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-bold text-base text-foreground">
              {planning
                ? 'La planificación está lista para su revisión'
                : 'El plan de implementación está listo para su revisión'}
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Abra cada elemento para revisarlo o editarlo. Editar crea una versión nueva; si lo que
              dependía de él ya no corresponde, regenérelo desde su página antes de aprobar.
            </p>
          </div>
        </div>
        <QueryState isLoading={review.isLoading} error={review.error}>
          <div className="flex flex-col gap-3.5">
            {[...groups].map(([group, items]) => (
              <div
                key={group}
                className="rounded-xl border border-border/70 bg-muted/25 p-4 flex flex-col gap-2.5"
              >
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <h3 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                    {STAGE_LABELS[group]}
                  </h3>
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {items.length} {items.length === 1 ? 'elemento' : 'elementos'}
                  </span>
                </div>
                <ul className="flex flex-col divide-y divide-border/40">
                  {items.map((item) => (
                    <li
                      key={item.versionId}
                      className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/50">
                          {item.code}
                        </span>
                        <span className="font-medium text-foreground truncate max-w-xs sm:max-w-md">
                          {item.title}{' '}
                          <span className="text-muted-foreground font-normal">
                            (v{item.versionNumber})
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <StatusBadge status={item.status as ArtifactVersionStatus} />
                        {STAGE_PAGES[group] ? (
                          <Link
                            href={STAGE_PAGES[group]!}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                          >
                            Revisar <ExternalLink className="size-3" aria-hidden="true" />
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </QueryState>
        <Button
          type="button"
          size="sm"
          className="self-start gap-2 shadow-xs font-medium"
          disabled={busy}
          onClick={onApprove}
        >
          <CheckCheck className="size-4" aria-hidden="true" />
          {planning ? 'Aprobar todo y congelar el diseño' : 'Aprobar el plan y construir'}
        </Button>
      </CardContent>
    </Card>
  );
}

const runActive = (status: string) => status === 'QUEUED' || status === 'RUNNING';
const runFailed = (status: string) => status === 'FAILED';

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
  useFailureToast(runs.data?.items, runActive, runFailed, 'La ejecución se detuvo.');
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
          <Card className="overflow-hidden border-border/80 shadow-xs relative">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-indigo-500 to-sky-500" />
            <CardContent className="pt-6 flex flex-col gap-5">
              <div className="flex items-start gap-3.5">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/25 shadow-xs">
                  <Sparkles className="size-5" aria-hidden="true" />
                </div>
                <div className="flex flex-col gap-1">
                  <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground">
                    Diseñe y construya su aplicación a partir de una idea
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    Describa el sistema que desea generar. CASEFlow AI ejecutará el pipeline
                    completo de análisis, diseño y generación de código de forma guiada y trazable.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="workflow-prompt"
                    className="text-xs font-semibold text-foreground uppercase tracking-wider"
                  >
                    ¿Qué aplicación quiere construir?
                  </label>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {prompt.length} / 4000
                  </span>
                </div>
                <Textarea
                  id="workflow-prompt"
                  rows={5}
                  maxLength={4000}
                  placeholder="Ejemplo: Sistema de inventario para tiendas con gestión de productos, órdenes de compra a proveedores, categorías y alertas de stock bajo..."
                  className="text-sm bg-background border-border/80 focus:border-primary focus:ring-1 focus:ring-primary/20 resize-y"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  O elija una idea de partida:
                </span>
                <div className="flex flex-wrap gap-2">
                  {PROMPT_SUGGESTIONS.map((sug, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setPrompt(sug)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/40 px-3 py-1.5 text-xs text-foreground/80 hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-all text-left"
                    >
                      <Lightbulb className="size-3.5 text-amber-500 shrink-0" aria-hidden="true" />
                      <span>{sug}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-border/50">
                <p className="text-[11px] text-muted-foreground">
                  Generación guiada conforme al TargetTemplate oficial CASEFLOW_WEB_TS_V1.
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="gap-2 font-medium shadow-xs self-start sm:self-auto"
                  disabled={busy || !prompt.trim()}
                  onClick={() =>
                    act(
                      () => api.workflowRuns.start(projectId, prompt.trim()),
                      'No se pudo iniciar la ejecución.',
                    )
                  }
                >
                  {busy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      Iniciando…
                    </>
                  ) : (
                    <>
                      <Rocket className="size-4" aria-hidden="true" />
                      Comenzar
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <Lightbulb className="size-4" aria-hidden="true" />
                  </div>
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Idea inicial del proyecto
                  </span>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                    run.status === 'COMPLETED'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700'
                      : run.status === 'FAILED'
                        ? 'bg-destructive/10 text-destructive border-destructive/25'
                        : run.status === 'AWAITING_REVIEW'
                          ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700'
                          : 'bg-primary/10 text-primary border-primary/25'
                  }`}
                >
                  {run.status === 'RUNNING' || run.status === 'QUEUED' ? (
                    <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                  ) : null}
                  {run.status === 'COMPLETED'
                    ? 'Completado'
                    : run.status === 'FAILED'
                      ? 'Error'
                      : run.status === 'AWAITING_REVIEW'
                        ? 'Esperando revisión'
                        : 'En ejecución'}
                </span>
              </div>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap pt-1">
                {run.prompt}
              </p>
            </div>

            {run.status === 'FAILED' ? (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm"
              >
                <AlertTriangle className="size-5 text-destructive shrink-0" aria-hidden="true" />
                <span className="flex-1 font-medium">{run.errorMessage}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-destructive/30 hover:bg-destructive/10"
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
              <div className="rounded-xl border border-emerald-300/80 bg-gradient-to-r from-emerald-50 via-emerald-50/50 to-background p-4 sm:p-5 dark:border-emerald-800 dark:from-emerald-950/30 dark:via-emerald-950/15 dark:to-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25">
                    <CheckCircle2 className="size-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-emerald-950 dark:text-emerald-200">
                      ¡Código generado y validado con éxito!
                    </h3>
                    <p className="text-xs sm:text-sm text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">
                      El proyecto ha completado todas las etapas de forward engineering. Puede
                      consultar las pruebas, la inspección en sandbox y descargar el archivo ZIP del
                      código fuente en la sección de generación.
                    </p>
                  </div>
                </div>
                <Button
                  asChild
                  size="sm"
                  className="gap-1.5 shadow-xs shrink-0 self-start sm:self-auto bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-500"
                >
                  <Link href="/construction/generation-runs">
                    Ver código generado
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            ) : null}

            <div className="rounded-xl border border-border/80 bg-card p-5 shadow-xs flex flex-col gap-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Progreso por etapas del pipeline
              </h3>
              <ol className="relative flex flex-col gap-0" aria-label="Etapas">
                {run.stages.map((stage, idx) => {
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
                  const isLast = idx === run.stages.length - 1;

                  return (
                    <li key={stage} className="relative flex items-start gap-3.5 pb-4 last:pb-0">
                      {/* Vertical connector line */}
                      {!isLast && (
                        <span
                          className={`absolute left-4 top-7 -bottom-1 w-0.5 -translate-x-1/2 transition-colors ${
                            done.has(stage) ? 'bg-emerald-500' : 'bg-border/60'
                          }`}
                          aria-hidden="true"
                        />
                      )}

                      {/* Node Icon */}
                      <div
                        className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all ${
                          state === 'done'
                            ? 'bg-emerald-500 text-white shadow-xs'
                            : state === 'failed'
                              ? 'bg-destructive text-white shadow-xs'
                              : state === 'review'
                                ? 'bg-amber-500 text-white ring-4 ring-amber-500/20 animate-pulse'
                                : state === 'running'
                                  ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                                  : 'bg-muted text-muted-foreground border border-border/70'
                        }`}
                      >
                        {state === 'done' ? (
                          <Check className="size-4" aria-label="Completada" />
                        ) : state === 'failed' ? (
                          <AlertTriangle className="size-4" aria-label="Falló" />
                        ) : state === 'review' ? (
                          <UserCheck className="size-4" aria-label="Esperando su revisión" />
                        ) : state === 'running' ? (
                          <Loader2 className="size-4 animate-spin" aria-label="En curso" />
                        ) : (
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {idx + 1}
                          </span>
                        )}
                      </div>

                      {/* Label & Details */}
                      <div className="flex flex-col gap-0.5 pt-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-medium ${
                              state === 'done'
                                ? 'text-foreground font-semibold'
                                : state === 'running' || state === 'review'
                                  ? 'text-foreground font-bold'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {STAGE_LABELS[stage]}
                          </span>
                          {state === 'running' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary border border-primary/20">
                              En curso
                            </span>
                          )}
                          {state === 'review' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400 border border-amber-500/25">
                              Requiere aprobación
                            </span>
                          )}
                          {state === 'done' && (
                            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                              ✓ Completada
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </>
        )}
      </QueryState>
    </div>
  );
}
