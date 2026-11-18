'use client';

import { AcceptanceReport } from './acceptance-report';
import Link from 'next/link';
import { DeploymentPanel } from './deployment-panel';
import { useFailureToast } from '../../../lib/use-failure-toast';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Terminal,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  type GenerationRunResponse,
  type SandboxRunResponse,
  type SandboxValidationStage,
  SANDBOX_VALIDATION_STAGES,
} from '@caseflow-ai/contracts';
import { Button } from '@caseflow-ai/ui';
import { api, ApiError } from '../../../lib/api';
import { QueryState } from '../../../components/query-state';
import { AuthedDownloadButton } from '../../../components/authed-media';
import { formatDuration, useElapsed } from '../../../components/generation-overlay';
import { Confetti } from '../../../components/confetti';
import {
  ProjectQuickstartDialog,
  HIDE_QUICKSTART_KEY,
} from '../../../components/project-quickstart-dialog';

const SANDBOX_STATUS_LABELS: Record<SandboxRunResponse['status'], string> = {
  QUEUED: 'En cola',
  RUNNING: 'Validando',
  READY: 'Listo',
  FAILED: 'Falló (se intentó reparar)',
  VALIDATION_FAILED: 'Validación fallida',
  ERROR: 'Entorno no disponible',
};

const STAGE_LABELS: Record<SandboxValidationStage, string> = {
  INSTALL: 'Instalación',
  LINT: 'Lint',
  TYPECHECK: 'Tipos',
  TEST: 'Pruebas',
  BUILD: 'Compilación',
  STRUCTURE: 'Estructura',
  TRACEABILITY: 'Trazabilidad',
  E2E: 'Pruebas en navegador',
};

const REPAIR_LABELS = {
  PATCHED: 'reparación aplicada',
  NO_PATCH: 'sin reparación',
  REJECTED: 'propuesta descartada',
};

const sandboxActive = (r: SandboxRunResponse) => r.status === 'QUEUED' || r.status === 'RUNNING';
const sandboxActiveStatus = (status: string) => status === 'QUEUED' || status === 'RUNNING';
const sandboxErrored = (status: string) => status === 'ERROR';

function StageErrorEvidence({ stage, output }: { stage: SandboxValidationStage; output: string }) {
  const [copied, setCopied] = useState(false);

  async function copyError() {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      toast.success('Salida copiada al portapapeles');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('No se pudo copiar');
    }
  }

  return (
    <details
      open
      className="mt-2.5 rounded-lg border border-destructive/30 bg-card overflow-hidden shadow-2xs group"
    >
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-destructive hover:text-destructive/80 flex items-center justify-between bg-destructive/10 select-none">
        <span className="flex items-center gap-1.5">
          <XCircle className="size-3.5 shrink-0 text-destructive" aria-hidden="true" />
          Evidencia de {STAGE_LABELS[stage].toLowerCase()}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-normal hidden sm:inline">
            (clic para alternar)
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              copyError();
            }}
            className="inline-flex items-center gap-1 rounded border border-border/60 bg-background px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
          >
            {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
            {copied ? 'Copiado' : 'Copiar salida'}
          </button>
        </div>
      </summary>
      <pre className="max-h-48 overflow-auto border-t border-border/40 bg-slate-950 p-3 font-mono text-[11px] text-slate-100 dark:bg-black/90 leading-relaxed select-text">
        {output}
      </pre>
    </details>
  );
}

function ValidationAttemptItem({
  projectId,
  run,
  attempt,
  primaryRole,
}: {
  projectId: string;
  run: GenerationRunResponse;
  attempt: SandboxRunResponse;
  primaryRole?: string;
}) {
  const [quickstartOpen, setQuickstartOpen] = useState(false);
  const isRunning = attempt.status === 'RUNNING' || attempt.status === 'QUEUED';
  const elapsed = useElapsed(isRunning ? (attempt.startedAt ?? attempt.createdAt) : null);
  const durationMs =
    attempt.startedAt && attempt.finishedAt
      ? new Date(attempt.finishedAt).getTime() - new Date(attempt.startedAt).getTime()
      : 0;

  const failedResult = attempt.stages.find((s) => !s.passed);
  // When RUNNING and there is already a failed stage, the backend is actively
  // executing the autoRepair LLM diagnostic and computing patches!
  const isDiagnosingRepair = attempt.status === 'RUNNING' && Boolean(failedResult);

  // Compute which stage is actively executing in Docker
  const activeStage =
    attempt.currentStage ??
    (!failedResult && attempt.stages.length < SANDBOX_VALIDATION_STAGES.length
      ? SANDBOX_VALIDATION_STAGES[attempt.stages.length]
      : null);

  return (
    <li
      className={`rounded-xl border p-4 shadow-2xs transition-all ${
        attempt.status === 'READY'
          ? 'border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-950/15'
          : attempt.status === 'FAILED' || attempt.status === 'VALIDATION_FAILED'
            ? 'border-destructive/30 bg-destructive/5'
            : isRunning
              ? 'border-primary/40 bg-card shadow-xs ring-1 ring-primary/20'
              : 'border-border/80 bg-card'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${
              attempt.status === 'READY'
                ? 'bg-emerald-500 text-white shadow-xs'
                : attempt.status === 'FAILED' || attempt.status === 'VALIDATION_FAILED'
                  ? 'bg-destructive text-white shadow-xs'
                  : isRunning
                    ? 'bg-primary text-primary-foreground animate-pulse'
                    : 'bg-primary/10 text-primary'
            }`}
          >
            {isRunning ? <Loader2 className="size-3.5 animate-spin" /> : attempt.attemptNumber}
          </span>
          <strong className="text-foreground text-xs font-semibold">
            Intento {attempt.attemptNumber}: {SANDBOX_STATUS_LABELS[attempt.status]}
            {attempt.status === 'RUNNING' && isDiagnosingRepair
              ? ' · Auto-reparación en curso con IA'
              : attempt.status === 'RUNNING' && (attempt.currentStage || activeStage)
                ? ` · ${STAGE_LABELS[(attempt.currentStage || activeStage) as SandboxValidationStage] ?? 'Validando'}`
                : ''}
          </strong>

          {isRunning ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-medium text-primary">
              <Clock className="size-3 animate-spin" />
              {formatDuration(elapsed)} transcurridos
            </span>
          ) : durationMs > 0 ? (
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
              <Clock className="size-3" />
              Duración: {formatDuration(durationMs)}
            </span>
          ) : null}
        </div>

        {attempt.status === 'READY' && attempt.snapshotId ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setQuickstartOpen(true)}
              className="inline-flex items-center gap-1.5 h-8 rounded-lg border border-border/80 bg-background px-3 text-xs font-semibold text-foreground shadow-2xs hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all duration-150"
            >
              <Terminal className="size-3.5" aria-hidden="true" />
              Cómo probarlo
            </Button>
            <AuthedDownloadButton
              url={api.generationRuns.snapshotArchiveUrl(projectId, attempt.snapshotId)}
              filename={`proyecto-generado-${attempt.snapshotId}.zip`}
              onClick={() => {
                try {
                  if (localStorage.getItem(HIDE_QUICKSTART_KEY) !== 'true') {
                    setQuickstartOpen(true);
                  }
                } catch {
                  // ignore
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              <Download className="size-4" aria-hidden="true" />
              Descargar ZIP
            </AuthedDownloadButton>
            <Link
              href={`/construction/user-manual?snapshotId=${attempt.snapshotId}`}
              className="inline-flex items-center gap-1.5 h-8 rounded-lg border border-border/80 bg-background px-3 text-xs font-semibold text-foreground shadow-2xs hover:border-indigo-500/40 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all duration-150"
            >
              <BookOpen
                className="size-3.5 text-indigo-500 dark:text-indigo-400 shrink-0"
                aria-hidden="true"
              />
              Manual de usuario
            </Link>
          </div>
        ) : null}
      </div>
      {attempt.status === 'READY' && attempt.snapshotId ? (
        <DeploymentPanel projectId={projectId} snapshotId={attempt.snapshotId} />
      ) : null}

      {/* Validation stages, always visible */}
      <div className="mt-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
          <span className="font-semibold uppercase tracking-wider text-muted-foreground">
            Etapas de validación:
          </span>
          <span className="font-mono text-muted-foreground text-[10px]">
            {attempt.status === 'READY'
              ? '7/7 etapas superadas'
              : failedResult
                ? `Falló en ${STAGE_LABELS[failedResult.stage]}`
                : isRunning
                  ? `${attempt.stages.length}/7 completadas`
                  : `${attempt.stages.filter((s) => s.passed).length}/7 superadas`}
          </span>
        </div>

        <ul className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2" aria-label="Etapas">
          {SANDBOX_VALIDATION_STAGES.map((stageKey, idx) => {
            const stageResult = attempt.stages.find((s) => s.stage === stageKey);
            const isStagePassed = stageResult?.passed === true;
            const isStageFailed = stageResult && !stageResult.passed;
            const isStageActive =
              isRunning &&
              !failedResult &&
              (stageKey === attempt.currentStage || stageKey === activeStage);
            const isStageSkipped = !stageResult && Boolean(failedResult);

            let badgeClass = 'border-border/60 bg-muted/15 text-muted-foreground/60';
            let icon = (
              <span className="flex size-4 items-center justify-center rounded-full bg-muted/40 font-mono text-[9px] text-muted-foreground">
                {idx + 1}
              </span>
            );

            if (isStagePassed) {
              badgeClass =
                'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-medium';
              icon = (
                <CheckCircle2
                  className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                  aria-hidden="true"
                />
              );
            } else if (isStageFailed) {
              badgeClass = 'border-destructive/40 bg-destructive/10 text-destructive font-semibold';
              icon = <XCircle className="size-3.5 text-destructive shrink-0" aria-hidden="true" />;
            } else if (isStageActive) {
              badgeClass =
                'border-primary/50 bg-primary/10 text-primary font-semibold ring-1 ring-primary/30 shadow-2xs';
              icon = (
                <Loader2
                  className="size-3.5 animate-spin text-primary shrink-0"
                  aria-hidden="true"
                />
              );
            } else if (isStageSkipped) {
              badgeClass =
                'border-border/30 bg-muted/10 text-muted-foreground/50 line-through decoration-muted-foreground/40';
            }

            return (
              <li
                key={stageKey}
                className={`flex flex-col gap-1 rounded-lg border p-2 text-xs transition-colors ${badgeClass}`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {icon}
                  <span className="truncate font-medium">{STAGE_LABELS[stageKey]}</span>
                </div>
                <div className="text-[10px] font-mono leading-none">
                  {isStagePassed ? (
                    stageResult.durationMs > 0 ? (
                      <span className="opacity-80">
                        {(stageResult.durationMs / 1000).toFixed(1)}s
                      </span>
                    ) : (
                      <span className="opacity-80">Ok</span>
                    )
                  ) : isStageFailed ? (
                    <span className="text-destructive font-bold">
                      {stageResult.timedOut ? '(tiempo agotado)' : 'Falló'}
                    </span>
                  ) : isStageActive ? (
                    <span className="text-primary font-semibold flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-primary animate-ping" />
                      Ejecutando…
                    </span>
                  ) : isStageSkipped ? (
                    <span className="text-muted-foreground/60 text-[9px]">Omitida</span>
                  ) : (
                    <span className="text-muted-foreground/60 text-[9px]">Pendiente</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Banner de diagnóstico y auto-reparación activo */}
      {isDiagnosingRepair && failedResult ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-amber-500/40 bg-linear-to-r from-amber-500/15 via-indigo-500/10 to-amber-500/15 p-3.5 shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
            <Sparkles className="size-4 animate-spin text-amber-500 shrink-0" />
            <span>IA diagnosticando causa raíz y generando parche de auto-reparación…</span>
            <span className="ml-auto rounded-full border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] text-amber-800 dark:text-amber-300">
              Ronda {attempt.attemptNumber} de 3
            </span>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
            La etapa{' '}
            <strong className="text-foreground font-semibold">
              {STAGE_LABELS[failedResult.stage]}
            </strong>{' '}
            no superó la validación. El modelo está examinando los registros de error y el código
            fuente generado para generar correcciones sin intervención humana. El siguiente intento
            se lanzará automáticamente al aplicar el parche.
          </p>
          <div className="mt-2.5 flex items-center gap-2 text-[11px] font-mono text-amber-800 dark:text-amber-300">
            <div className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-amber-500 animate-ping" />
              <span>Calculando parche correctivo</span>
            </div>
            <span className="text-muted-foreground/60">·</span>
            <span>Límite máximo: 3 rondas</span>
          </div>
        </div>
      ) : null}

      {/* Banner de ejecución en Docker */}
      {isRunning && !isDiagnosingRepair ? (
        <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
          <span>
            Ejecutando validación en contenedor Docker aislado: etapa{' '}
            <strong className="text-foreground font-semibold">
              {STAGE_LABELS[(attempt.currentStage || activeStage) as SandboxValidationStage] ??
                'iniciando'}
            </strong>
            … Esto puede tomar 1 o 2 minutos.
          </span>
        </div>
      ) : null}

      {attempt.errorMessage ? (
        <p className="mt-2.5 text-xs text-destructive font-medium bg-destructive/10 border border-destructive/20 rounded p-2">
          {attempt.errorMessage}
        </p>
      ) : null}

      {/* Evidencia de salidas fallidas */}
      {attempt.stages
        .filter((stage) => !stage.passed)
        .map((stage) => (
          <StageErrorEvidence key={stage.stage} stage={stage.stage} output={stage.output} />
        ))}

      {/* Resultados de la auto-reparación previa */}
      {attempt.repair ? (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 font-semibold mb-1">
            <RefreshCw className="size-3.5" />
            <span>
              Ronda de reparación {attempt.repair.roundNumber}:{' '}
              {REPAIR_LABELS[attempt.repair.status]}.
            </span>
          </div>
          <p className="text-muted-foreground">{attempt.repair.explanation}</p>
          {attempt.repair.patchedPaths.length ? (
            <p className="mt-1 font-mono text-[11px] text-foreground">
              Archivos modificados: {attempt.repair.patchedPaths.join(', ')}
            </p>
          ) : null}
          {attempt.repair.findings.map((finding, idx) => (
            <p
              key={`${finding}-${idx}`}
              className="mt-1 text-amber-800 dark:text-amber-300 font-medium"
            >
              Hallazgo: {finding}
            </p>
          ))}
        </div>
      ) : null}

      {quickstartOpen ? (
        <ProjectQuickstartDialog
          open={quickstartOpen}
          onOpenChange={setQuickstartOpen}
          targetTemplateIdentifier={run.targetTemplateIdentifier}
          targetTemplateVersion={run.targetTemplateVersion}
          primaryRole={primaryRole}
        />
      ) : null}
    </li>
  );
}

// Validation is a separate state from generation: only READY
// offers the project for download.
export function RunValidation({
  projectId,
  run,
  primaryRole,
}: {
  projectId: string;
  run: GenerationRunResponse;
  primaryRole?: string;
}) {
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [viewAllAttempts, setViewAllAttempts] = useState(false);
  const prevStatusesRef = useRef<Map<string, string>>(new Map());
  const celebratedAttemptsRef = useRef<Set<string>>(new Set());

  const attempts = useQuery({
    queryKey: ['sandbox-runs', projectId, run.id],
    queryFn: () => api.generationRuns.sandboxRuns(projectId, run.id),
    refetchInterval: (query) => (query.state.data?.items.some(sandboxActive) ? 3000 : false),
  });
  useFailureToast(
    attempts.data?.items,
    sandboxActiveStatus,
    sandboxErrored,
    'La validación no pudo completarse.',
  );
  const items = attempts.data?.items ?? [];
  const last = items.at(-1);
  const canStart = !last || last.status === 'ERROR';

  const activeAttemptId =
    selectedAttemptId && items.some((i) => i.id === selectedAttemptId)
      ? selectedAttemptId
      : (last?.id ?? null);
  const activeAttempt = items.find((i) => i.id === activeAttemptId) ?? last;
  const isViewingOldAttempt = Boolean(activeAttempt && last && activeAttempt.id !== last.id);

  useEffect(() => {
    for (const item of items) {
      const prevStatus = prevStatusesRef.current.get(item.id);
      if (
        prevStatus &&
        (prevStatus === 'RUNNING' || prevStatus === 'QUEUED') &&
        item.status === 'READY' &&
        !celebratedAttemptsRef.current.has(item.id)
      ) {
        celebratedAttemptsRef.current.add(item.id);
        setShowConfetti(true);
        toast.success('¡Proyecto validado con éxito! Se superaron las 7 etapas de Docker Sandbox.');
        break;
      }
      prevStatusesRef.current.set(item.id, item.status);
    }
  }, [items]);

  async function start() {
    setStarting(true);
    try {
      await api.generationRuns.validate(projectId, run.id);
      toast.success('Validación encolada.');
      await queryClient.invalidateQueries({ queryKey: ['sandbox-runs', projectId, run.id] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo iniciar la validación.');
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3.5 border-t border-border/60 pt-3.5">
      {showConfetti ? <Confetti onComplete={() => setShowConfetti(false)} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Validación en entorno aislado (Sandbox Docker)
          </h3>
        </div>
        {canStart && !attempts.isLoading ? (
          <Button
            type="button"
            size="sm"
            disabled={starting}
            onClick={start}
            className="text-xs gap-1.5 h-8 font-semibold"
          >
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {starting ? 'Iniciando…' : last ? 'Reintentar validación' : 'Validar proyecto'}
          </Button>
        ) : null}
      </div>

      <QueryState isLoading={attempts.isLoading} error={attempts.error}>
        {items.length ? (
          <div className="flex flex-col gap-3">
            {/* Selector de intentos por pestañas/pills cuando hay más de 1 intento */}
            {items.length > 1 ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/40 p-2 sm:px-3 text-xs shadow-2xs">
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  role="group"
                  aria-label="Intentos de validación"
                >
                  <span className="text-[11px] font-semibold text-muted-foreground mr-1">
                    Intentos ({items.length}):
                  </span>
                  {items.map((item, idx) => {
                    const isSelected = !viewAllAttempts && item.id === activeAttempt?.id;
                    const isReady = item.status === 'READY';
                    const isFailed =
                      item.status === 'FAILED' || item.status === 'VALIDATION_FAILED';
                    const isRunning = item.status === 'RUNNING' || item.status === 'QUEUED';
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => {
                          setSelectedAttemptId(item.id);
                          setViewAllAttempts(false);
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                          isSelected
                            ? 'bg-primary text-primary-foreground shadow-2xs font-semibold'
                            : 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground border border-border/60 shadow-2xs'
                        }`}
                      >
                        {isReady ? (
                          <CheckCircle2
                            className={`size-3 shrink-0 ${
                              isSelected
                                ? 'text-primary-foreground'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          />
                        ) : isFailed ? (
                          <XCircle
                            className={`size-3 shrink-0 ${
                              isSelected ? 'text-primary-foreground' : 'text-destructive'
                            }`}
                          />
                        ) : isRunning ? (
                          <Loader2
                            className={`size-3 animate-spin shrink-0 ${
                              isSelected ? 'text-primary-foreground' : 'text-primary'
                            }`}
                          />
                        ) : null}
                        <span>Intento {item.attemptNumber}</span>
                        {isReady ? (
                          <span
                            className={`text-[10px] font-bold px-1 rounded ${
                              isSelected
                                ? 'bg-primary-foreground/20 text-primary-foreground'
                                : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                            }`}
                          >
                            Listo
                          </span>
                        ) : isRunning ? (
                          <span
                            className={`text-[10px] font-bold px-1 rounded animate-pulse ${
                              isSelected
                                ? 'bg-primary-foreground/20 text-primary-foreground'
                                : 'bg-primary/10 text-primary'
                            }`}
                          >
                            Validando
                          </span>
                        ) : null}
                        {idx === items.length - 1 ? (
                          <span className="text-[10px] opacity-75 font-mono">· actual</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setViewAllAttempts(!viewAllAttempts)}
                  className="h-7 px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  {viewAllAttempts
                    ? 'Ver sólo intento activo'
                    : `Ver todos (${items.length}) en lista`}
                </Button>
              </div>
            ) : null}

            {/* Aviso contextual cuando se consulta un intento histórico */}
            {!viewAllAttempts && isViewingOldAttempt && last && activeAttempt ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs text-primary">
                <span>
                  Consultando el <strong>Intento {activeAttempt.attemptNumber}</strong>. El último
                  es el <strong>Intento {last.attemptNumber}</strong> (
                  {SANDBOX_STATUS_LABELS[last.status]}).
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedAttemptId(last.id)}
                  className="font-semibold underline hover:text-primary/80 shrink-0"
                >
                  Ir al intento {last.attemptNumber}
                </button>
              </div>
            ) : null}

            {/* Renderizado de intentos */}
            {viewAllAttempts ? (
              <ol className="flex flex-col gap-3">
                {items.map((attempt) => (
                  <ValidationAttemptItem
                    key={attempt.id}
                    projectId={projectId}
                    run={run}
                    attempt={attempt}
                    primaryRole={primaryRole}
                  />
                ))}
              </ol>
            ) : activeAttempt ? (
              <ol className="flex flex-col gap-3">
                <ValidationAttemptItem
                  key={activeAttempt.id}
                  projectId={projectId}
                  run={run}
                  attempt={activeAttempt}
                  primaryRole={primaryRole}
                />
              </ol>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-6 text-center">
            <ShieldCheck className="mx-auto size-8 text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Aún no se ha validado. La validación instala, revisa, prueba y compila el proyecto en
              un contenedor Docker aislado; solo un proyecto verificado y listo se puede descargar.
            </p>
          </div>
        )}
      </QueryState>
      <AcceptanceReport
        projectId={projectId}
        runId={run.id}
        refreshKey={`${last?.id ?? 'none'}-${last?.status ?? ''}`}
      />
    </div>
  );
}
