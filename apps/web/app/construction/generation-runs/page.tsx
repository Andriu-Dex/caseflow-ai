'use client';

import Link from 'next/link';
import { useFailureToast } from '../../../lib/use-failure-toast';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  Cpu,
  Database,
  Download,
  FileCode,
  Layers,
  Layout,
  Play,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  GenerationRunResponse,
  SandboxRunResponse,
  SandboxValidationStage,
} from '@caseflow-ai/contracts';
import { Button } from '@caseflow-ai/ui';
import { api, ApiError } from '../../../lib/api';
import { PageHeading } from '../../../components/page-heading';
import { DockerSetupAssistant } from '../../../components/docker-setup-assistant';
import { QueryState, RequireActiveProject } from '../../../components/query-state';
import { ConstructionFooter } from '../../../components/construction-footer';
import { EmptyState } from '../../../components/artifact-actions';
import { AuthedDownloadButton } from '../../../components/authed-media';

const STATUS_LABELS: Record<GenerationRunResponse['status'], string> = {
  QUEUED: 'En cola',
  GENERATING: 'Generando',
  GENERATED: 'Generado',
  FAILED: 'Falló',
};

const LINK_LABELS = { IMPLEMENTS: 'Implementa', TESTS: 'Prueba', CONFIGURES: 'Configura' };

const isActive = (run: GenerationRunResponse) =>
  run.status === 'QUEUED' || run.status === 'GENERATING';

function FileViewer({
  projectId,
  runId,
  fileId,
}: {
  projectId: string;
  runId: string;
  fileId: string;
}) {
  const [copied, setCopied] = useState(false);
  const file = useQuery({
    queryKey: ['generated-file', projectId, runId, fileId],
    queryFn: () => api.generationRuns.file(projectId, runId, fileId),
  });

  async function copyContent() {
    if (!file.data?.content) return;
    try {
      await navigator.clipboard.writeText(file.data.content);
      setCopied(true);
      toast.success('Código copiado al portapapeles');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('No se pudo copiar el código');
    }
  }

  return (
    <QueryState isLoading={file.isLoading} error={file.error}>
      {file.data ? (
        <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border/70 bg-card p-3.5 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2.5">
            <h3 className="break-all font-mono text-xs font-semibold text-foreground flex items-center gap-1.5">
              <FileCode className="size-3.5 text-primary shrink-0" />
              {file.data.path}
            </h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyContent}
              className="h-7 text-xs gap-1.5"
            >
              {copied ? (
                <>
                  <Check className="size-3 text-emerald-600" />
                  Copiado
                </>
              ) : (
                <>
                  <Copy className="size-3" />
                  Copiar código
                </>
              )}
            </Button>
          </div>
          {file.data.traceLinks && file.data.traceLinks.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Trazabilidad hacia el diseño y análisis:
              </span>
              <ul className="flex flex-wrap gap-1.5 text-xs" aria-label="Trazabilidad">
                {file.data.traceLinks.map((link) => (
                  <li
                    key={`${link.sourceArtifactVersionId}-${link.planElement}`}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                      link.linkType === 'IMPLEMENTS'
                        ? 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300'
                        : link.linkType === 'TESTS'
                          ? 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300'
                          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    <span>
                      {LINK_LABELS[link.linkType]} {link.code} v{link.versionNumber}
                    </span>
                    <span className="text-muted-foreground font-mono"> · {link.planElement}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <pre className="max-h-[32rem] overflow-auto rounded-lg border border-border/80 bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground">
            <code>{file.data.content}</code>
          </pre>
        </div>
      ) : null}
    </QueryState>
  );
}

function RunFiles({ projectId, run }: { projectId: string; run: GenerationRunResponse }) {
  const [fileId, setFileId] = useState<string>();
  const [fileFilter, setFileFilter] = useState('');
  const files = useQuery({
    queryKey: ['generated-files', projectId, run.id],
    queryFn: () => api.generationRuns.files(projectId, run.id),
    enabled: run.status === 'GENERATED',
  });

  if (run.status !== 'GENERATED') return null;

  const allFiles = files.data?.items ?? [];
  const filtered = fileFilter.trim()
    ? allFiles.filter((f) => f.path.toLowerCase().includes(fileFilter.toLowerCase()))
    : allFiles;

  return (
    <QueryState isLoading={files.isLoading} error={files.error}>
      <div className="flex flex-col gap-3">
        {/* Search bar for files */}
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={fileFilter}
            onChange={(e) => setFileFilter(e.target.value)}
            placeholder="Filtrar archivos generados (api, web, prisma...)..."
            aria-label="Filtrar archivos"
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-7 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {fileFilter ? (
            <button
              type="button"
              onClick={() => setFileFilter('')}
              aria-label="Limpiar filtro de archivos"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <ul className="flex max-h-[32rem] flex-col overflow-auto rounded-lg border border-border/80 bg-card/60 p-1 text-xs">
            {filtered.map((file) => {
              const isSelected = file.id === fileId;
              const isApi = file.path.startsWith('apps/api');
              const isWeb = file.path.startsWith('apps/web');
              const isPrisma = file.path.startsWith('prisma');
              return (
                <li key={file.id}>
                  <button
                    type="button"
                    onClick={() => setFileId(file.id)}
                    className={`flex w-full items-center gap-1.5 break-all rounded px-2 py-1.5 text-left font-mono transition-colors ${
                      isSelected
                        ? 'bg-primary/10 font-semibold text-primary'
                        : 'text-foreground hover:bg-muted/80'
                    }`}
                  >
                    {isApi ? (
                      <Server className="size-3.5 shrink-0 text-blue-500" aria-hidden="true" />
                    ) : isWeb ? (
                      <Layout className="size-3.5 shrink-0 text-purple-500" aria-hidden="true" />
                    ) : isPrisma ? (
                      <Database className="size-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
                    ) : (
                      <FileCode
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    <span className="truncate">{file.path}</span>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 ? (
              <li className="p-3 text-center text-xs text-muted-foreground">
                No hay archivos que coincidan con el filtro.
              </li>
            ) : null}
          </ul>
          {fileId ? (
            <FileViewer projectId={projectId} runId={run.id} fileId={fileId} />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">
                Seleccione un archivo de la lista para ver su código fuente y enlaces de
                trazabilidad.
              </p>
            </div>
          )}
        </div>
      </div>
    </QueryState>
  );
}

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
};

const REPAIR_LABELS = {
  PATCHED: 'reparación aplicada',
  NO_PATCH: 'sin reparación',
  REJECTED: 'propuesta descartada',
};

const sandboxActive = (r: SandboxRunResponse) => r.status === 'QUEUED' || r.status === 'RUNNING';
const sandboxActiveStatus = (status: string) => status === 'QUEUED' || status === 'RUNNING';
const sandboxErrored = (status: string) => status === 'ERROR';
const generationActive = (status: string) => status === 'QUEUED' || status === 'GENERATING';
const generationFailed = (status: string) => status === 'FAILED';

// Validation is a separate state from generation (AGENTS.md §25): only READY
// offers the project for download.
function RunValidation({ projectId, runId }: { projectId: string; runId: string }) {
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState(false);
  const attempts = useQuery({
    queryKey: ['sandbox-runs', projectId, runId],
    queryFn: () => api.generationRuns.sandboxRuns(projectId, runId),
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

  async function start() {
    setStarting(true);
    try {
      await api.generationRuns.validate(projectId, runId);
      toast.success('Validación encolada.');
      await queryClient.invalidateQueries({ queryKey: ['sandbox-runs', projectId, runId] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo iniciar la validación.');
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3.5 border-t border-border/60 pt-3.5">
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
          <ol className="flex flex-col gap-3">
            {items.map((attempt) => (
              <li
                key={attempt.id}
                className={`rounded-xl border p-4 shadow-2xs transition-colors ${
                  attempt.status === 'READY'
                    ? 'border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/10'
                    : attempt.status === 'FAILED' || attempt.status === 'VALIDATION_FAILED'
                      ? 'border-destructive/30 bg-destructive/5'
                      : 'border-border/80 bg-card'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${
                        attempt.status === 'READY'
                          ? 'bg-emerald-500 text-white'
                          : attempt.status === 'FAILED' || attempt.status === 'VALIDATION_FAILED'
                            ? 'bg-destructive text-white'
                            : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {attempt.attemptNumber}
                    </span>
                    <strong>
                      Intento {attempt.attemptNumber}: {SANDBOX_STATUS_LABELS[attempt.status]}
                      {attempt.status === 'RUNNING' && attempt.currentStage
                        ? ` · ${STAGE_LABELS[attempt.currentStage]}`
                        : ''}
                    </strong>
                  </div>
                  {attempt.status === 'READY' && attempt.snapshotId ? (
                    <AuthedDownloadButton
                      url={api.generationRuns.snapshotArchiveUrl(projectId, attempt.snapshotId)}
                      filename={`proyecto-generado-${attempt.snapshotId}.zip`}
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    >
                      <Download className="size-4" aria-hidden="true" />
                      Descargar ZIP
                    </AuthedDownloadButton>
                  ) : null}
                </div>

                {attempt.stages.length ? (
                  <div className="mt-3 flex flex-col gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Pipeline de Validación (7 etapas):
                    </span>
                    <ul className="flex flex-wrap gap-1.5" aria-label="Etapas">
                      {attempt.stages.map((stage) => (
                        <li
                          key={stage.stage}
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${
                            stage.passed
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                              : 'border-destructive/40 bg-destructive/10 text-destructive'
                          }`}
                        >
                          {stage.passed ? (
                            <CheckCircle2
                              className="size-3.5 text-emerald-600 dark:text-emerald-400"
                              aria-hidden="true"
                            />
                          ) : (
                            <XCircle className="size-3.5 text-destructive" aria-hidden="true" />
                          )}
                          <span>{STAGE_LABELS[stage.stage]}</span>
                          {stage.timedOut ? (
                            <span className="text-[10px] text-destructive font-semibold">
                              (tiempo agotado)
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {attempt.errorMessage ? (
                  <p className="mt-2.5 text-xs text-destructive font-medium bg-destructive/10 border border-destructive/20 rounded p-2">
                    {attempt.errorMessage}
                  </p>
                ) : null}

                {attempt.stages
                  .filter((stage) => !stage.passed)
                  .map((stage) => (
                    <details
                      key={stage.stage}
                      className="mt-2.5 rounded-lg border border-border/60 bg-muted/20 p-2"
                    >
                      <summary className="cursor-pointer text-xs font-semibold text-foreground hover:text-primary">
                        Evidencia de {STAGE_LABELS[stage.stage].toLowerCase()}
                      </summary>
                      <pre className="mt-1.5 max-h-64 overflow-auto rounded bg-muted/60 p-2.5 font-mono text-xs leading-relaxed">
                        {stage.output}
                      </pre>
                    </details>
                  ))}

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
                    {attempt.repair.findings.map((finding) => (
                      <p
                        key={finding}
                        className="mt-1 text-amber-800 dark:text-amber-300 font-medium"
                      >
                        Hallazgo: {finding}
                      </p>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
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
    </div>
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
  const [openRunId, setOpenRunId] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const chosenPlan = planVersionId ?? approvedPlans[0]?.version.id;

  async function start() {
    if (!chosenPlan) return;
    setSubmitting(true);
    try {
      const run = await api.generationRuns.start(projectId, chosenPlan);
      toast.success('Generación encolada.');
      setOpenRunId(run.id);
      await queryClient.invalidateQueries({ queryKey: ['generation-runs', projectId] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo iniciar la generación.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Generación de código" projectId={projectId} />

      {/* Banner Ejecutivo Hito Final */}
      <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-linear-to-br from-primary/5 via-card to-background p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-sm text-foreground">
                  Generación de Código Fuente y Sandbox
                </h2>
                <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
                  CASEFLOW_WEB_TS_V1
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Construcción determinista de modular monolith TypeScript (NestJS + Next.js + Prisma)
                a partir del diseño congelado.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              <Sparkles className="size-3" />
              Fase de Construcción · Paso 5 de 5 (Hito Final)
            </span>
          </div>
        </div>
      </div>

      <DockerSetupAssistant />

      <p className="text-sm text-muted-foreground">
        Genere el proyecto web a partir de un plan de implementación aprobado. Cada generación queda
        registrada como historial y cada archivo enlaza a las versiones aprobadas que implementa.
        Generar no equivale a validar: la validación se ejecuta aparte, en un entorno aislado.
      </p>

      {/* Nueva generación */}
      <section className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
        <div className="flex items-center gap-2 border-b border-border/40 pb-2.5">
          <Cpu className="size-4 text-primary" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Nueva generación de software
          </h2>
        </div>
        <QueryState isLoading={plans.isLoading} error={plans.error}>
          {approvedPlans.length ? (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-xs">
                <span className="font-medium text-foreground">
                  Plan de implementación aprobado:
                </span>
                <select
                  className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium"
                  value={chosenPlan ?? ''}
                  onChange={(e) => setPlanVersionId(e.target.value)}
                >
                  {approvedPlans.map((plan) => (
                    <option key={plan.version.id} value={plan.version.id}>
                      {plan.code} · {plan.title} (v{plan.version.versionNumber})
                    </option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                className="self-start text-xs gap-1.5 font-semibold h-8"
                disabled={submitting || !chosenPlan}
                onClick={start}
              >
                <Play className="size-3.5" aria-hidden="true" />
                {submitting ? 'Iniciando…' : 'Generar proyecto'}
              </Button>
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
            Generaciones Realizadas ({runs.data?.items.length ?? 0})
          </h2>
        </div>
        <QueryState isLoading={runs.isLoading} error={runs.error}>
          {runs.data?.items.length ? (
            <ul className="flex flex-col gap-3">
              {runs.data.items.map((run) => (
                <li
                  key={run.id}
                  className="rounded-xl border border-border/80 bg-card p-4 shadow-2xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                          run.status === 'GENERATED'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : run.status === 'GENERATING'
                              ? 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300'
                              : run.status === 'QUEUED'
                                ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                : 'border-destructive/30 bg-destructive/10 text-destructive'
                        }`}
                      >
                        {run.status === 'GENERATED' ? (
                          <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />
                        ) : run.status === 'QUEUED' ? (
                          <Clock className="size-3 text-amber-600 dark:text-amber-400" />
                        ) : run.status === 'GENERATING' ? (
                          <Sparkles className="size-3 text-blue-600 dark:text-blue-400 animate-spin" />
                        ) : (
                          <XCircle className="size-3 text-destructive" />
                        )}
                        <strong>
                          {STATUS_LABELS[run.status]}
                          {run.status === 'GENERATED' ? ` · ${run.fileCount} archivos` : ''}
                        </strong>
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {run.targetTemplateIdentifier} v{run.targetTemplateVersion} ·{' '}
                      {new Date(run.createdAt).toLocaleString('es-EC')}
                    </span>
                  </div>
                  {run.errorMessage ? (
                    <p
                      role="alert"
                      className="mt-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive font-medium"
                    >
                      {run.errorMessage}
                    </p>
                  ) : null}
                  {run.warnings.length ? (
                    <div className="mt-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
                      <span className="font-semibold block mb-1">Advertencias detectadas:</span>
                      <ul className="flex flex-col gap-1">
                        {run.warnings.map((warning) => (
                          <li key={warning} className="flex gap-1.5 items-start">
                            <AlertTriangle
                              className="mt-0.5 size-3.5 shrink-0"
                              aria-hidden="true"
                            />
                            <span>{warning}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {run.status === 'GENERATED' ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 h-8 text-xs gap-1.5"
                      onClick={() => setOpenRunId(openRunId === run.id ? undefined : run.id)}
                    >
                      <Code2 className="size-3.5 text-primary" />
                      {openRunId === run.id ? 'Ocultar archivos' : 'Ver archivos'}
                    </Button>
                  ) : null}
                  {openRunId === run.id ? (
                    <div className="mt-3.5">
                      <RunFiles projectId={projectId} run={run} />
                    </div>
                  ) : null}
                  {run.status === 'GENERATED' ? (
                    <RunValidation projectId={projectId} runId={run.id} />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Aún no hay generaciones">
              Apruebe un plan de implementación y genere el proyecto desde aquí.
            </EmptyState>
          )}
        </QueryState>
      </section>

      <ConstructionFooter projectId={projectId} step={5} />
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
