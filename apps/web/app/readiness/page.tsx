'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';

function downloadExport(projectId: string, format: 'json' | 'html') {
  const a = document.createElement('a');
  a.href = api.export.url(projectId, format);
  a.download = `first-deliverable-${projectId}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function ReadinessContent({ projectId }: { projectId: string }) {
  const readiness = useQuery({
    queryKey: ['readiness', projectId],
    queryFn: () => api.readiness.get(projectId),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-gray-900">Preparación del First Deliverable</h1>

      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <span className="text-sm font-medium text-gray-700">Exportar:</span>
        <button
          type="button"
          onClick={() => downloadExport(projectId, 'json')}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Exportar JSON
        </button>
        <button
          type="button"
          onClick={() => downloadExport(projectId, 'html')}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Exportar reporte HTML
        </button>
      </section>

      <QueryState isLoading={readiness.isLoading} error={readiness.error}>
        {readiness.data ? (
          <>
            <div
              className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${
                readiness.data.ready
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {readiness.data.ready ? '✓ LISTO' : '⏳ NO LISTO TODAVÍA'}
            </div>

            <ul className="flex flex-col gap-2">
              {readiness.data.stages.map((stage) => (
                <li
                  key={stage.key}
                  className={`rounded-lg border p-3 ${
                    stage.satisfied
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-gray-900">
                      {stage.satisfied ? '✓' : '○'} {stage.label}
                    </span>
                    {stage.counts ? (
                      <span className="text-xs text-gray-500">
                        {Object.entries(stage.counts)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(' · ')}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{stage.summary}</p>
                  {stage.blockers.length ? (
                    <ul className="mt-1 list-inside list-disc text-sm text-red-700">
                      {stage.blockers.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  ) : null}
                  {stage.warnings.length ? (
                    <ul className="mt-1 list-inside list-disc text-sm text-amber-700">
                      {stage.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
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
