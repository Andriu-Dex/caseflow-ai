'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Circle, Download, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@caseflow-ai/ui';
import Link from 'next/link';
import { api } from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';
import { STAGE_LINKS } from '../../lib/stage-links';

// A plain <a download> gives no way to know whether the request failed or is
// still generating (image-heavy HTML exports take a moment) — fetching the
// blob ourselves lets the buttons show a loading state and a real error.
async function downloadExport(projectId: string, format: 'json' | 'html'): Promise<void> {
  const response = await fetch(api.export.url(projectId, format));
  if (!response.ok) throw new Error('export request failed');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `proyecto-${projectId}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function ReadinessContent({ projectId }: { projectId: string }) {
  const readiness = useQuery({
    queryKey: ['readiness', projectId],
    queryFn: () => api.readiness.get(projectId),
  });
  const consistency = useQuery({
    queryKey: ['consistency', projectId],
    queryFn: () => api.consistency.get(projectId),
  });
  const done = readiness.data?.stages.filter((s) => s.satisfied).length ?? 0;
  const total = readiness.data?.stages.length ?? 0;
  const [downloading, setDownloading] = useState<'json' | 'html' | null>(null);
  const nothingApproved = readiness.data !== undefined && done === 0;

  async function handleDownload(format: 'json' | 'html') {
    setDownloading(format);
    try {
      await downloadExport(projectId, format);
    } catch {
      toast.error('No se pudo generar el documento. Intente nuevamente.');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Preparación y exportación</h1>
        <p className="text-sm text-muted-foreground">
          Revise qué partes del proyecto están completas y descargue el documento con todo lo
          aprobado.
        </p>
      </div>

      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
        <span className="text-sm font-medium text-foreground/80">Exportar:</span>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          disabled={nothingApproved || downloading !== null}
          title={nothingApproved ? 'Aún no hay nada aprobado para exportar.' : undefined}
          onClick={() => handleDownload('html')}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {downloading === 'html' ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileText className="size-4" aria-hidden="true" />
          )}
          {downloading === 'html' ? 'Generando…' : 'Documento del proyecto (HTML)'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          disabled={nothingApproved || downloading !== null}
          title={nothingApproved ? 'Aún no hay nada aprobado para exportar.' : undefined}
          onClick={() => handleDownload('json')}
          className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted/40 disabled:opacity-50"
        >
          {downloading === 'json' ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="size-4" aria-hidden="true" />
          )}
          {downloading === 'json' ? 'Generando…' : 'Datos estructurados (JSON)'}
        </Button>
        {nothingApproved ? (
          <span className="text-xs text-muted-foreground">
            Aún no hay nada aprobado para exportar.
          </span>
        ) : null}
      </section>

      <QueryState isLoading={readiness.isLoading} error={readiness.error}>
        {readiness.data ? (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">
                  {readiness.data.ready ? 'Proyecto completo' : 'En progreso'}
                </span>
                <span className="text-muted-foreground">
                  {done} de {total} etapas completas
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${total ? (done / total) * 100 : 0}%` }}
                />
              </div>
            </div>

            <ul className="flex flex-col gap-2">
              {readiness.data.stages.map((stage) => (
                <li
                  key={stage.key}
                  className={`rounded-lg border p-3 ${
                    stage.satisfied
                      ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      {stage.satisfied ? (
                        <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                      ) : (
                        <Circle className="size-4 text-muted-foreground" aria-hidden="true" />
                      )}
                      {stage.label}
                    </span>
                    {!stage.satisfied && STAGE_LINKS[stage.key] ? (
                      <Link
                        href={STAGE_LINKS[stage.key]!}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Ir a completar
                      </Link>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{stage.summary}</p>
                  {stage.blockers.map((b, i) => (
                    <p
                      key={i}
                      className="mt-1 flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400"
                    >
                      <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      {b}
                    </p>
                  ))}
                  {stage.warnings.length ? (
                    <details className="mt-1 text-xs text-muted-foreground">
                      <summary className="cursor-pointer">
                        {stage.warnings.length}{' '}
                        {stage.warnings.length === 1 ? 'sugerencia' : 'sugerencias'}
                      </summary>
                      <ul className="mt-1 list-inside list-disc">
                        {stage.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </QueryState>

      <div className="mt-8">
        <h2 className="mb-4 text-xl font-semibold text-foreground">Reporte de Consistencia</h2>
        <QueryState isLoading={consistency.isLoading} error={consistency.error}>
          {consistency.data ? (
            <div className="flex flex-col gap-4">
              {consistency.data.issues.length === 0 ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400">
                  <p className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="size-5" />
                    No se encontraron problemas de consistencia.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {consistency.data.issues.map((issue, idx) => (
                    <li
                      key={idx}
                      className={`rounded-lg border p-3 ${
                        issue.severity === 'ERROR'
                          ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400'
                          : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400'
                      }`}
                    >
                      <div className="flex items-start gap-2 font-medium">
                        <AlertCircle className="size-5 shrink-0 mt-0.5" />
                        <div>
                          <p>
                            [{issue.rule}] {issue.message}
                          </p>
                          <p className="mt-1 text-sm opacity-80">
                            Artefactos afectados:{' '}
                            {issue.affectedArtifactIds.map((id) => (
                              <Link
                                key={id}
                                href={`/projects/${projectId}/artifacts/${id}`}
                                className="mr-2 underline hover:opacity-80"
                              >
                                {id.split('-')[0]}
                              </Link>
                            ))}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </QueryState>
      </div>
    </div>
  );
}

export default function ReadinessPage() {
  return (
    <RequireActiveProject>
      {(projectId) => <ReadinessContent projectId={projectId} />}
    </RequireActiveProject>
  );
}
