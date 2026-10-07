'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCode,
  Play,
  ShieldCheck,
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
  const file = useQuery({
    queryKey: ['generated-file', projectId, runId, fileId],
    queryFn: () => api.generationRuns.file(projectId, runId, fileId),
  });
  return (
    <QueryState isLoading={file.isLoading} error={file.error}>
      {file.data ? (
        <div className="flex min-w-0 flex-col gap-3">
          <h3 className="break-all font-mono text-sm font-semibold">{file.data.path}</h3>
          <ul className="flex flex-wrap gap-2 text-xs" aria-label="Trazabilidad">
            {file.data.traceLinks.map((link) => (
              <li
                key={`${link.sourceArtifactVersionId}-${link.planElement}`}
                className="rounded border border-border px-2 py-0.5"
              >
                {LINK_LABELS[link.linkType]} {link.code} v{link.versionNumber}
                <span className="text-muted-foreground"> · {link.planElement}</span>
              </li>
            ))}
          </ul>
          <pre className="max-h-[32rem] overflow-auto rounded-md border border-border bg-muted p-3 text-xs">
            <code>{file.data.content}</code>
          </pre>
        </div>
      ) : null}
    </QueryState>
  );
}

function RunFiles({ projectId, run }: { projectId: string; run: GenerationRunResponse }) {
  const [fileId, setFileId] = useState<string>();
  const files = useQuery({
    queryKey: ['generated-files', projectId, run.id],
    queryFn: () => api.generationRuns.files(projectId, run.id),
    enabled: run.status === 'GENERATED',
  });
  if (run.status !== 'GENERATED') return null;
  return (
    <QueryState isLoading={files.isLoading} error={files.error}>
      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <ul className="flex max-h-[32rem] flex-col overflow-auto rounded-md border border-border text-xs">
          {files.data?.items.map((file) => (
            <li key={file.id}>
              <button
                type="button"
                onClick={() => setFileId(file.id)}
                className={`flex w-full items-center gap-1.5 break-all px-2 py-1 text-left font-mono hover:bg-accent ${
                  file.id === fileId ? 'bg-accent' : ''
                }`}
              >
                <FileCode className="size-3.5 shrink-0" aria-hidden="true" />
                {file.path}
              </button>
            </li>
          ))}
        </ul>
        {fileId ? (
          <FileViewer projectId={projectId} runId={run.id} fileId={fileId} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Seleccione un archivo para ver su contenido y su trazabilidad.
          </p>
        )}
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
    <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Validación en entorno aislado</h3>
        {canStart && !attempts.isLoading ? (
          <Button type="button" size="sm" disabled={starting} onClick={start}>
            <ShieldCheck className="size-4" aria-hidden="true" />
            {starting ? 'Iniciando…' : last ? 'Reintentar validación' : 'Validar proyecto'}
          </Button>
        ) : null}
      </div>
      <QueryState isLoading={attempts.isLoading} error={attempts.error}>
        {items.length ? (
          <ol className="flex flex-col gap-3">
            {items.map((attempt) => (
              <li key={attempt.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>
                    Intento {attempt.attemptNumber}: {SANDBOX_STATUS_LABELS[attempt.status]}
                    {attempt.status === 'RUNNING' && attempt.currentStage
                      ? ` · ${STAGE_LABELS[attempt.currentStage]}`
                      : ''}
                  </strong>
                  {attempt.status === 'READY' && attempt.snapshotId ? (
                    <AuthedDownloadButton
                      url={api.generationRuns.snapshotArchiveUrl(projectId, attempt.snapshotId)}
                      filename={`proyecto-generado-${attempt.snapshotId}.zip`}
                      className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
                    >
                      <Download className="size-4" aria-hidden="true" />
                      Descargar ZIP
                    </AuthedDownloadButton>
                  ) : null}
                </div>
                {attempt.stages.length ? (
                  <ul className="mt-2 flex flex-wrap gap-2" aria-label="Etapas">
                    {attempt.stages.map((stage) => (
                      <li
                        key={stage.stage}
                        className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs ${
                          stage.passed
                            ? 'border-emerald-600/40 text-emerald-700 dark:text-emerald-400'
                            : 'border-destructive/50 text-destructive'
                        }`}
                      >
                        {stage.passed ? (
                          <CheckCircle2 className="size-3.5" aria-hidden="true" />
                        ) : (
                          <XCircle className="size-3.5" aria-hidden="true" />
                        )}
                        {STAGE_LABELS[stage.stage]}
                        {stage.timedOut ? ' (tiempo agotado)' : ''}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {attempt.errorMessage ? (
                  <p className="mt-2 text-muted-foreground">{attempt.errorMessage}</p>
                ) : null}
                {attempt.stages
                  .filter((stage) => !stage.passed)
                  .map((stage) => (
                    <details key={stage.stage} className="mt-2">
                      <summary className="cursor-pointer text-xs">
                        Evidencia de {STAGE_LABELS[stage.stage].toLowerCase()}
                      </summary>
                      <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
                        {stage.output}
                      </pre>
                    </details>
                  ))}
                {attempt.repair ? (
                  <div className="mt-2 rounded bg-muted/60 p-2 text-xs">
                    <p>
                      Ronda de reparación {attempt.repair.roundNumber}:{' '}
                      {REPAIR_LABELS[attempt.repair.status]}. {attempt.repair.explanation}
                    </p>
                    {attempt.repair.patchedPaths.length ? (
                      <p className="mt-1 font-mono">{attempt.repair.patchedPaths.join(', ')}</p>
                    ) : null}
                    {attempt.repair.findings.map((finding) => (
                      <p key={finding} className="mt-1 text-amber-700 dark:text-amber-400">
                        Hallazgo: {finding}
                      </p>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aún no se ha validado. La validación instala, revisa, prueba y compila el proyecto en un
            contenedor aislado; solo un proyecto listo se puede descargar.
          </p>
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
      <DockerSetupAssistant />
      <p className="text-sm text-muted-foreground">
        Genere el proyecto web a partir de un plan de implementación aprobado. Cada generación queda
        registrada como historial y cada archivo enlaza a las versiones aprobadas que implementa.
        Generar no equivale a validar: la validación se ejecuta aparte, en un entorno aislado.
      </p>

      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Nueva generación</h2>
        <QueryState isLoading={plans.isLoading} error={plans.error}>
          {approvedPlans.length ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Plan de implementación aprobado</span>
              <select
                className="rounded-md border border-input bg-background px-2 py-1.5"
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
          ) : (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Aún no hay un plan de implementación aprobado.
            </p>
          )}
        </QueryState>
        <Button
          type="button"
          className="self-start"
          disabled={submitting || !chosenPlan}
          onClick={start}
        >
          <Play className="size-4" aria-hidden="true" />
          {submitting ? 'Iniciando…' : 'Generar proyecto'}
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Generaciones</h2>
        <QueryState isLoading={runs.isLoading} error={runs.error}>
          {runs.data?.items.length ? (
            <ul className="flex flex-col gap-3">
              {runs.data.items.map((run) => (
                <li key={run.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>
                      {STATUS_LABELS[run.status]}
                      {run.status === 'GENERATED' ? ` · ${run.fileCount} archivos` : ''}
                    </strong>
                    <span className="text-xs text-muted-foreground">
                      {run.targetTemplateIdentifier} v{run.targetTemplateVersion} ·{' '}
                      {new Date(run.createdAt).toLocaleString('es-EC')}
                    </span>
                  </div>
                  {run.errorMessage ? (
                    <p role="alert" className="mt-2 text-sm text-destructive">
                      {run.errorMessage}
                    </p>
                  ) : null}
                  {run.warnings.length ? (
                    <ul className="mt-2 flex flex-col gap-1 text-sm text-amber-700 dark:text-amber-400">
                      {run.warnings.map((warning) => (
                        <li key={warning} className="flex gap-1.5">
                          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                          {warning}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {run.status === 'GENERATED' ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => setOpenRunId(openRunId === run.id ? undefined : run.id)}
                    >
                      {openRunId === run.id ? 'Ocultar archivos' : 'Ver archivos'}
                    </Button>
                  ) : null}
                  {openRunId === run.id ? (
                    <div className="mt-3">
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
