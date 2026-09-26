'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Circle, Download, FileText } from 'lucide-react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';
import { STAGE_LINKS } from '../../lib/stage-links';

function downloadExport(projectId: string, format: 'json' | 'html') {
  const a = document.createElement('a');
  a.href = api.export.url(projectId, format);
  a.download = `proyecto-${projectId}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function ReadinessContent({ projectId }: { projectId: string }) {
  const readiness = useQuery({
    queryKey: ['readiness', projectId],
    queryFn: () => api.readiness.get(projectId),
  });
  const done = readiness.data?.stages.filter((s) => s.satisfied).length ?? 0;
  const total = readiness.data?.stages.length ?? 0;

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
        <button
          type="button"
          onClick={() => downloadExport(projectId, 'html')}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          <FileText className="size-4" aria-hidden="true" />
          Documento del proyecto (HTML)
        </button>
        <button
          type="button"
          onClick={() => downloadExport(projectId, 'json')}
          className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted/40"
        >
          <Download className="size-4" aria-hidden="true" />
          Datos estructurados (JSON)
        </button>
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
