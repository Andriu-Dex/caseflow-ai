'use client';

import Link from 'next/link';
import { newestApprovedPlan, newestRunForPlan } from '../../../lib/construction-progress';
import { WorkingCopySummary } from './working-copy-summary';
import { ManualImplementationDialog } from './manual-implementation-dialog';
import { ScreenFindings } from './screen-findings';
import { useFailureToast } from '../../../lib/use-failure-toast';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  Clock,
  Code2,
  Cpu,
  Layers,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { type GenerationRunResponse, type ImplementationPlanContent } from '@caseflow-ai/contracts';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@caseflow-ai/ui';
import { api, ApiError } from '../../../lib/api';
import { PageHeading } from '../../../components/page-heading';
import { DockerSetupAssistant } from '../../../components/docker-setup-assistant';
import { QueryState, RequireActiveProject } from '../../../components/query-state';
import { EmptyState } from '../../../components/artifact-actions';
import { ActiveGenerationProgress } from '../../../components/active-generation-progress';
import { RunFiles } from './run-files';
import { RunValidation } from './run-validation';
import { GenerationEstimate } from './generation-estimate';
import { ReleaseNotes } from './release-notes';
import { DeliveryPlanPanel, useDeliveryPlan } from './delivery-plan-panel';

const STATUS_LABELS: Record<GenerationRunResponse['status'], string> = {
  QUEUED: 'En cola',
  GENERATING: 'Generando',
  GENERATED: 'Generado',
  FAILED: 'Falló',
  WORKING_COPY: 'Versión de trabajo · incompleta',
};

const isActive = (run: GenerationRunResponse) =>
  run.status === 'QUEUED' || run.status === 'GENERATING';

const generationActive = (status: string) => status === 'QUEUED' || status === 'GENERATING';
const generationFailed = (status: string) => status === 'FAILED';

function ArchiveRunDialog({
  run,
  onOpenChange,
  onConfirm,
  isArchiving,
}: {
  run: GenerationRunResponse;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
  isArchiving: boolean;
}) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-5 gap-3.5">
        <div className="flex items-start gap-3.5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
            <Archive className="size-5" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <DialogTitle className="text-base font-bold tracking-tight text-foreground">
              ¿Archivar generación de código?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              Se trasladará a la sección de archivadas para mantener despejada su vista de trabajo
              activa.
            </DialogDescription>
          </div>
        </div>

        {/* Ficha unificada de la corrida */}
        <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5 flex flex-col gap-2.5 w-full min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0 font-mono text-xs font-semibold text-foreground">
              <Cpu className="size-3.5 text-primary shrink-0" aria-hidden="true" />
              <span className="truncate">{run.targetTemplateIdentifier}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-semibold">
                v{run.targetTemplateVersion}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground shrink-0 font-mono">
              {new Date(run.createdAt).toLocaleDateString('es-EC', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                run.status === 'GENERATED'
                  ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                  : run.status === 'FAILED'
                    ? 'bg-destructive/15 text-destructive'
                    : 'bg-muted text-foreground'
              }`}
            >
              {run.status === 'GENERATED' ? (
                <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <XCircle className="size-3 text-destructive" />
              )}
              <span>{STATUS_LABELS[run.status]}</span>
            </span>
            {run.status === 'GENERATED' ? (
              <span className="text-xs text-muted-foreground">
                · {run.fileCount} archivos generados
              </span>
            ) : null}
          </div>
        </div>

        {/* Mensaje de tranquilidad */}
        <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <ShieldCheck
            className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
          <span>
            Los archivos, reportes de Docker y trazas se conservan intactos. Podrá reactivarla en
            cualquier momento.
          </span>
        </div>

        <DialogFooter className="mt-1 flex items-center justify-end gap-2 border-t border-border/50 pt-3">
          <Button
            type="button"
            variant="outline"
            className="border-border/80 hover:bg-muted font-medium text-xs h-8.5 px-3.5"
            onClick={() => onOpenChange(false)}
            disabled={isArchiving}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={isArchiving}
            onClick={onConfirm}
            className="gap-1.5 font-semibold shadow-xs bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-500 text-xs h-8.5 px-3.5"
          >
            {isArchiving ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                Archivando…
              </>
            ) : (
              <>
                <Archive className="size-3.5" aria-hidden="true" />
                Archivar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GenerationRunsContent({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const plans = useQuery({
    queryKey: ['structured-analysis', 'IMPLEMENTATION_PLAN', projectId],
    queryFn: () => api.structuredAnalysis.list(projectId, 'IMPLEMENTATION_PLAN'),
  });
  const runs = useQuery({
    queryKey: ['generation-runs', projectId],
    queryFn: () => api.generationRuns.list(projectId),
    refetchInterval: (query) => (query.state.data?.items.some(isActive) ? 2000 : false),
  });
  useFailureToast(
    runs.data?.items,
    generationActive,
    generationFailed,
    'No se pudo generar el proyecto.',
  );
  const approvedPlans = (plans.data?.items ?? []).filter((p) => p.version.status === 'APPROVED');
  const [planVersionId, setPlanVersionId] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const latestApprovedPlan = newestApprovedPlan(approvedPlans);
  const chosenPlan =
    (approvedPlans.some((plan) => plan.version.id === planVersionId) ? planVersionId : undefined) ??
    latestApprovedPlan?.version.id;
  // The first role of the plan this run was generated from (the roles are in the
  // plan's content, not in its version): the one the dev token example uses.
  const primaryRoleOf = (run: GenerationRunResponse): string | undefined => {
    const plan = (plans.data?.items ?? []).find(
      (p) => p.version.id === run.implementationPlanVersionId,
    );
    return plan?.kind === 'IMPLEMENTATION_PLAN'
      ? (plan.content as ImplementationPlanContent).authentication.roles[0]
      : undefined;
  };
  const hasActiveRun = (runs.data?.items ?? []).some(isActive);
  // ADR-024: all at once or in deliveries; a plan that already has a plan of
  // deliveries opens in deliveries.
  const deliveryPlan = useDeliveryPlan(projectId, chosenPlan);
  const [modeChoice, setMode] = useState<'all' | 'deliveries'>();
  const mode = modeChoice ?? (deliveryPlan.data ? 'deliveries' : 'all');
  const deliveryOf = (run: GenerationRunResponse) =>
    deliveryPlan.data?.deliveries.find((delivery) => delivery.id === run.deliveryId);
  // DEC-168: what generating would ask the AI for, before the person decides.
  const estimate = useQuery({
    queryKey: ['generation-estimate', projectId, chosenPlan, runs.data?.items.length],
    queryFn: () => api.generationRuns.estimate(projectId, chosenPlan!),
    enabled: Boolean(chosenPlan) && mode === 'all',
    retry: false,
  });
  // Archived runs leave the list but stay as history, and can be restored.
  const visibleRuns = (runs.data?.items ?? []).filter((run) => !run.archivedAt);
  const currentRun = newestRunForPlan(runs.data?.items ?? [], chosenPlan);
  const currentVisibleRun = currentRun && !currentRun.archivedAt ? currentRun : undefined;
  const historyRuns = visibleRuns.filter((run) => run.id !== currentVisibleRun?.id);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRunId, setHistoryRunId] = useState<string>();
  const archivedRuns = (runs.data?.items ?? []).filter((run) => run.archivedAt);
  const [showArchived, setShowArchived] = useState(false);
  const [archivingId, setArchivingId] = useState<string>();
  const [runToArchive, setRunToArchive] = useState<GenerationRunResponse | null>(null);

  async function setArchived(runId: string, archived: boolean) {
    setArchivingId(runId);
    try {
      await (archived
        ? api.generationRuns.archive(projectId, runId)
        : api.generationRuns.restore(projectId, runId));
      await queryClient.invalidateQueries({ queryKey: ['generation-runs', projectId] });
      toast.success(archived ? 'Generación archivada.' : 'Generación restaurada.');
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'No se pudo actualizar la generación.',
      );
    } finally {
      setArchivingId(undefined);
    }
  }

  async function start(workingCopy = false) {
    if (!chosenPlan || hasActiveRun) return;
    setSubmitting(true);
    try {
      await (workingCopy
        ? api.generationRuns.workingCopy(projectId, chosenPlan)
        : api.generationRuns.start(projectId, chosenPlan));
      toast.success(
        workingCopy
          ? 'Versión de trabajo integrada. No es una entrega oficial.'
          : 'Generación encolada.',
      );
      await queryClient.invalidateQueries({ queryKey: ['generation-runs', projectId] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo iniciar la generación.');
    } finally {
      setSubmitting(false);
    }
  }

  // What a run produced and what went wrong, shown first on every run.
  const runSummary = (run: GenerationRunResponse) => (
    <>
      {run.status === 'WORKING_COPY' ? (
        <WorkingCopySummary
          projectId={projectId}
          run={run}
          plan={
            plans.data?.items.find((plan) => plan.version.id === run.implementationPlanVersionId)
              ?.content as ImplementationPlanContent | undefined
          }
        />
      ) : null}
      {run.errorMessage ? (
        <p
          role="alert"
          className="mt-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive font-medium max-h-36 overflow-auto"
        >
          {run.errorMessage}
        </p>
      ) : null}
      {run.status === 'FAILED' ? <ScreenFindings projectId={projectId} run={run} /> : null}
      {run.warnings.length ? (
        <details className="mt-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300 group">
          <summary className="cursor-pointer font-semibold flex items-center justify-between select-none">
            <span className="flex items-center gap-1.5">
              <AlertTriangle
                className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
              {run.status === 'WORKING_COPY'
                ? `Detalles técnicos (${run.warnings.length} avisos)`
                : `${run.warnings.length} ${run.warnings.length === 1 ? 'advertencia detectada' : 'advertencias detectadas'}`}
            </span>
            <span className="text-[11px] font-normal opacity-75 group-open:hidden">
              (clic para ver detalles)
            </span>
            <span className="text-[11px] font-normal opacity-75 hidden group-open:inline">
              (ocultar)
            </span>
          </summary>
          <ul className="mt-2 flex flex-col gap-1 border-t border-amber-500/20 pt-2 max-h-60 overflow-auto">
            {run.warnings.map((warning, index) => (
              <li key={`${warning}-${index}`} className="flex gap-1.5 items-start">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );

  const renderRun = (run: GenerationRunResponse) => (
    <li key={run.id} className="rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2.5">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
              run.status === 'GENERATED'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : run.status === 'GENERATING'
                  ? 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300'
                  : run.status === 'QUEUED' || run.status === 'WORKING_COPY'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    : 'border-destructive/30 bg-destructive/10 text-destructive'
            }`}
          >
            {run.status === 'GENERATED' ? (
              <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />
            ) : run.status === 'WORKING_COPY' ? (
              <Code2 className="size-3 text-amber-600 dark:text-amber-400" />
            ) : run.status === 'QUEUED' ? (
              <Clock className="size-3 text-amber-600 dark:text-amber-400" />
            ) : run.status === 'GENERATING' ? (
              <Sparkles className="size-3 text-blue-600 dark:text-blue-400 animate-spin" />
            ) : (
              <XCircle className="size-3 text-destructive" />
            )}
            <strong>{STATUS_LABELS[run.status]}</strong>
            {run.status === 'GENERATED' || run.status === 'WORKING_COPY' ? (
              <span className="font-normal opacity-90">· {run.fileCount} archivos</span>
            ) : null}
          </span>
          {run.origin === 'MANUAL' ? (
            <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:text-sky-300">
              Manual
            </span>
          ) : null}
          {run.deliveryId ? (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {deliveryOf(run) ? `Entrega ${deliveryOf(run)!.position}` : 'Entrega'}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs text-muted-foreground font-mono">
            {run.targetTemplateIdentifier} v{run.targetTemplateVersion} ·{' '}
            {new Date(run.createdAt).toLocaleString('es-EC')}
          </span>
          {isActive(run) ? null : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs font-medium border-border/80 bg-background/80 hover:bg-amber-500/10 hover:border-amber-500/40 hover:text-amber-800 dark:hover:bg-amber-950/20 dark:hover:text-amber-300 text-muted-foreground shadow-2xs transition-colors"
              disabled={archivingId === run.id}
              onClick={() => setRunToArchive(run)}
            >
              <Archive className="size-3.5" aria-hidden="true" />
              Archivar
            </Button>
          )}
        </div>
      </div>
      {isActive(run) ? <ActiveGenerationProgress run={run} /> : null}
      {runSummary(run)}
      {run.status === 'GENERATED' || run.status === 'WORKING_COPY' ? (
        <Tabs defaultValue={run.status === 'GENERATED' ? 'validation' : 'code'} className="mt-3">
          <TabsList className="h-auto w-full flex-wrap justify-start">
            {run.status === 'GENERATED' ? (
              <TabsTrigger value="validation">Validación y despliegue</TabsTrigger>
            ) : null}
            <TabsTrigger value="code">Código ({run.fileCount} archivos)</TabsTrigger>
            {run.status === 'GENERATED' ? (
              <TabsTrigger value="notes">Notas de entrega</TabsTrigger>
            ) : null}
          </TabsList>
          {run.status === 'GENERATED' ? (
            // Mounted while hidden: validation keeps polling and notifying from any tab.
            <TabsContent value="validation" forceMount className="data-[state=inactive]:hidden">
              <RunValidation projectId={projectId} run={run} primaryRole={primaryRoleOf(run)} />
            </TabsContent>
          ) : null}
          <TabsContent value="code">
            <RunFiles projectId={projectId} run={run} />
          </TabsContent>
          {run.status === 'GENERATED' ? (
            <TabsContent value="notes">
              <ReleaseNotes projectId={projectId} runId={run.id} />
            </TabsContent>
          ) : null}
        </Tabs>
      ) : null}
    </li>
  );

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <PageHeading title="Generación de código" projectId={projectId} />

      <DockerSetupAssistant />

      {/* Nueva generación */}
      <section className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
        <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2.5">
          <div className="flex items-center gap-2">
            <Cpu className="size-4 text-primary" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Nueva construcción
            </h2>
          </div>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            A partir del plan de implementación aprobado
          </span>
        </div>
        <QueryState isLoading={plans.isLoading} error={plans.error}>
          {approvedPlans.length ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <label className="flex-1 flex flex-col gap-1.5 text-xs">
                  <span className="font-medium text-foreground">
                    Plan de implementación aprobado:
                  </span>
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-medium focus:border-primary focus:outline-none"
                    value={chosenPlan ?? ''}
                    onChange={(e) => setPlanVersionId(e.target.value)}
                    disabled={hasActiveRun}
                  >
                    {approvedPlans.map((plan) => (
                      <option key={plan.version.id} value={plan.version.id}>
                        {plan.code} · {plan.title} (v{plan.version.versionNumber})
                      </option>
                    ))}
                  </select>
                </label>

                {mode === 'all' ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      className={`text-xs gap-1.5 font-semibold h-8 shrink-0 transition-all ${
                        hasActiveRun
                          ? 'border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/10 cursor-not-allowed opacity-90'
                          : ''
                      }`}
                      disabled={submitting || !chosenPlan || hasActiveRun}
                      onClick={() => start()}
                    >
                      {submitting ? (
                        <>
                          <Sparkles
                            className="size-3.5 animate-spin text-primary"
                            aria-hidden="true"
                          />
                          Iniciando…
                        </>
                      ) : hasActiveRun ? (
                        <>
                          <Clock
                            className="size-3.5 animate-pulse text-amber-600 dark:text-amber-400"
                            aria-hidden="true"
                          />
                          Generación en curso…
                        </>
                      ) : (
                        <>
                          <Play className="size-3.5" aria-hidden="true" />
                          Generar proyecto
                        </>
                      )}
                    </Button>
                    {currentRun?.origin !== 'MANUAL' ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 text-xs"
                        disabled={!chosenPlan || hasActiveRun || submitting}
                        onClick={() => start(true)}
                      >
                        Preparar versión de trabajo
                      </Button>
                    ) : null}
                    <ManualImplementationDialog
                      projectId={projectId}
                      implementationPlanVersionId={chosenPlan}
                      disabled={submitting || hasActiveRun}
                      onImported={async () => {
                        await queryClient.invalidateQueries({
                          queryKey: ['generation-runs', projectId],
                        });
                      }}
                    />
                  </div>
                ) : null}
              </div>

              <Tabs value={mode} onValueChange={(value) => setMode(value as 'all' | 'deliveries')}>
                <TabsList aria-label="Modo de construcción">
                  <TabsTrigger value="all">Todo de una vez</TabsTrigger>
                  <TabsTrigger value="deliveries">Por entregas</TabsTrigger>
                </TabsList>
              </Tabs>
              {mode === 'deliveries' && chosenPlan ? (
                <DeliveryPlanPanel
                  projectId={projectId}
                  planVersionId={chosenPlan}
                  runs={runs.data?.items ?? []}
                  hasActiveRun={hasActiveRun}
                />
              ) : null}
              {mode === 'all' && estimate.data ? (
                <GenerationEstimate estimate={estimate.data} />
              ) : null}
              <Accordion type="single" collapsible>
                <AccordionItem value="info" className="border-b-0">
                  <AccordionTrigger className="py-1 text-xs text-muted-foreground">
                    Más información
                  </AccordionTrigger>
                  <AccordionContent className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                    <p>
                      Generar proyecto construye el código con la plantilla CASEFLOW_WEB_TS_V1
                      (NestJS, Next.js y Prisma) a partir del diseño congelado; su validación se
                      realiza después.
                    </p>
                    <p>
                      Preparar una versión de trabajo conserva el código disponible y sus
                      pendientes, sin nuevas inferencias. No es una entrega oficial.
                    </p>
                    <p>
                      Importar una implementación manual registra un proyecto construido fuera de
                      CASEFlow; se valida en el sandbox igual que uno generado.
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              {hasActiveRun ? (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle
                    className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                    aria-hidden="true"
                  />
                  <span>
                    Ya hay una generación de código en proceso para este proyecto. Espere a que
                    finalice para poder iniciar una nueva.
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Aún no hay un plan de implementación aprobado.
              </p>
              <Link href="/construction/implementation-plan">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 border-amber-500/40 text-amber-800 dark:text-amber-300"
                >
                  Ir a Plan de implementación
                  <ArrowRight className="size-3" />
                </Button>
              </Link>
            </div>
          )}
        </QueryState>
      </section>

      {/* Historial de generaciones */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Layers className="size-3.5 text-primary" />
            Generaciones ({visibleRuns.length})
          </h2>
        </div>
        <QueryState isLoading={runs.isLoading || plans.isLoading} error={runs.error || plans.error}>
          {currentVisibleRun ? (
            <ul className="flex flex-col gap-3" aria-label="Generación del plan seleccionado">
              {renderRun(currentVisibleRun)}
            </ul>
          ) : (
            <EmptyState
              title={
                currentRun?.archivedAt
                  ? 'La última generación de este plan está archivada'
                  : 'Aún no hay generaciones para el plan seleccionado'
              }
            >
              {currentRun?.archivedAt
                ? 'Puede restaurarla desde Archivadas. El historial se conserva.'
                : 'Seleccione un plan aprobado y prepare una versión de trabajo o genere el proyecto.'}
            </EmptyState>
          )}
          {historyRuns.length ? (
            <details
              className="mt-3 rounded-xl border border-border/80 bg-card"
              onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
            >
              <summary className="cursor-pointer p-3 text-sm font-medium">
                Historial de generaciones ({historyRuns.length})
              </summary>
              {historyOpen ? (
                <ul className="divide-y divide-border/60 border-t border-border/60">
                  {historyRuns.map((run) => (
                    <li key={run.id} className="p-3">
                      <button
                        type="button"
                        className="flex w-full flex-wrap items-center justify-between gap-2 text-left text-xs"
                        aria-expanded={historyRunId === run.id}
                        onClick={() =>
                          setHistoryRunId(historyRunId === run.id ? undefined : run.id)
                        }
                      >
                        <span>
                          {STATUS_LABELS[run.status]}
                          {run.origin === 'MANUAL' ? ' · Manual' : ''} ·{' '}
                          {new Date(run.createdAt).toLocaleString('es-EC')}
                          {run.implementationPlanVersionId !== chosenPlan
                            ? ' · Otro plan de implementación'
                            : ''}
                        </span>
                        <span className="font-medium text-primary">
                          {historyRunId === run.id ? 'Ocultar detalles' : 'Ver detalles'}
                        </span>
                      </button>
                      {historyRunId === run.id ? <ul className="mt-3">{renderRun(run)}</ul> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </details>
          ) : null}
        </QueryState>

        {/* Modal de confirmación para archivar */}
        {runToArchive ? (
          <ArchiveRunDialog
            run={runToArchive}
            onOpenChange={(open) => {
              if (!open) setRunToArchive(null);
            }}
            onConfirm={async () => {
              await setArchived(runToArchive.id, true);
              setRunToArchive(null);
            }}
            isArchiving={archivingId === runToArchive.id}
          />
        ) : null}

        {/* Archived runs, at the end like on the other screens: folded, each restorable. */}
        {archivedRuns.length ? (
          <section className="rounded-xl border border-border/80 bg-card shadow-2xs">
            <button
              type="button"
              onClick={() => setShowArchived(!showArchived)}
              aria-expanded={showArchived}
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {showArchived ? (
                <ChevronDown className="size-4" aria-hidden="true" />
              ) : (
                <ChevronRight className="size-4" aria-hidden="true" />
              )}
              <Archive className="size-4" aria-hidden="true" />
              Archivadas ({archivedRuns.length})
            </button>

            {showArchived ? (
              <ul className="flex flex-col divide-y divide-border/60 border-t border-border/60">
                {archivedRuns.map((run) => (
                  <li
                    key={run.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm"
                  >
                    <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      {run.targetTemplateIdentifier} v{run.targetTemplateVersion}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        run.status === 'GENERATED'
                          ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                          : run.status === 'FAILED'
                            ? 'border border-destructive/30 bg-destructive/10 text-destructive'
                            : 'border border-border/60 bg-muted text-foreground'
                      }`}
                    >
                      {run.status === 'GENERATED' ? (
                        <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <XCircle className="size-3 text-destructive" />
                      )}
                      <span>{STATUS_LABELS[run.status]}</span>
                      {run.status === 'GENERATED' ? (
                        <span className="font-mono text-[10px] opacity-80">
                          · {run.fileCount} archivos
                        </span>
                      ) : null}
                    </span>

                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      Generada: {new Date(run.createdAt).toLocaleString('es-EC')}
                    </span>

                    <span className="text-xs text-muted-foreground">
                      Archivada el {new Date(run.archivedAt!).toLocaleDateString('es')}
                    </span>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={archivingId === run.id}
                      onClick={() => void setArchived(run.id, false)}
                    >
                      {archivingId === run.id ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                          Restaurando…
                        </>
                      ) : (
                        <>
                          <RotateCcw className="size-3.5" aria-hidden="true" />
                          Restaurar
                        </>
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </section>
    </div>
  );
}

export default function GenerationRunsPage() {
  return (
    <RequireActiveProject>
      {(projectId) => <GenerationRunsContent projectId={projectId} />}
    </RequireActiveProject>
  );
}
