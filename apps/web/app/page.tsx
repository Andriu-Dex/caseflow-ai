'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '../lib/api';
import { QueryState, RequireActiveProject } from '../components/query-state';

const STAGE_LINKS: Record<string, string> = {
  SOURCES: '/sources',
  CONTEXT: '/context',
  REQUIREMENTS: '/requirements',
  USE_CASES: '/use-cases',
  USE_CASE_DIAGRAM: '/use-cases',
  DATA_MODEL: '/data-model',
  ER_DIAGRAM: '/data-model',
  NAVIGATION: '/design/navigation',
  SOFTWARE_ARCHITECTURE: '/design/software-architecture',
  SYSTEM_ARCHITECTURE: '/design/system-architecture',
  UI_BLUEPRINT: '/design/ui-blueprint',
  MOCKUPS: '/design/mockups',
  IMPACT: '/traceability',
};

function HomeContent({ projectId }: { projectId: string }) {
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId),
  });
  const readiness = useQuery({
    queryKey: ['readiness', projectId],
    queryFn: () => api.readiness.get(projectId),
  });
  const staleness = useQuery({
    queryKey: ['staleness', projectId],
    queryFn: () => api.staleness.get(projectId),
  });

  const nextStage = readiness.data?.stages.find((s) => !s.satisfied);
  const staleContext = staleness.data?.entries.find(
    (e) =>
      e.artifactType === 'PROJECT_CONTEXT' &&
      e.impactState === 'NEWER_APPROVED_KNOWLEDGE_AVAILABLE',
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <QueryState isLoading={project.isLoading} error={project.error}>
          <h1 className="text-2xl font-semibold text-gray-900">{project.data?.name}</h1>
          {project.data?.description ? (
            <p className="mt-1 text-sm text-gray-600">{project.data.description}</p>
          ) : null}
        </QueryState>
      </section>

      <QueryState isLoading={readiness.isLoading} error={readiness.error}>
        {readiness.data ? (
          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-sm font-semibold ${
                  readiness.data.ready
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {readiness.data.ready ? '✓ LISTO' : '⏳ NO LISTO TODAVÍA'}
              </span>
              <span className="text-sm text-gray-500">
                {readiness.data.stages.filter((s) => s.satisfied).length} /{' '}
                {readiness.data.stages.length} etapas completas
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {readiness.data.stages.map((stage) => (
                <Link
                  key={stage.key}
                  href={STAGE_LINKS[stage.key] ?? '/readiness'}
                  title={stage.summary}
                  className={`rounded-md border px-2 py-2 text-center text-xs font-medium ${
                    stage.satisfied
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-gray-200 bg-gray-50 text-gray-600'
                  }`}
                >
                  {stage.satisfied ? '✓' : '·'} {stage.label}
                </Link>
              ))}
            </div>

            {nextStage ? (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <strong>Siguiente paso:</strong> {nextStage.nextAction ?? nextStage.summary}{' '}
                <Link href={STAGE_LINKS[nextStage.key] ?? '/readiness'} className="underline">
                  Ir a {nextStage.label}
                </Link>
              </div>
            ) : null}

            <Link href="/readiness" className="mt-3 inline-block text-sm text-gray-600 underline">
              Ver detalle completo de preparación →
            </Link>
          </section>
        ) : null}
      </QueryState>

      <QueryState isLoading={staleness.isLoading} error={staleness.error}>
        {staleContext ? (
          <section className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            ⚠ Newer approved knowledge available: el Contexto del Proyecto vigente no incluye
            conocimiento de fuentes aprobadas más recientes.{' '}
            <Link href="/context" className="underline">
              Revisar Contexto
            </Link>
          </section>
        ) : staleness.data &&
          staleness.data.entries.some((e) => e.impactState === 'POTENTIALLY_AFFECTED') ? (
          <section className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            Hay artefactos potencialmente afectados por conocimiento más reciente. Revisión
            recomendada.{' '}
            <Link href="/traceability" className="underline">
              Ver trazabilidad
            </Link>
          </section>
        ) : null}
      </QueryState>
    </div>
  );
}

export default function HomePage() {
  return (
    <RequireActiveProject>
      {(projectId) => <HomeContent projectId={projectId} />}
    </RequireActiveProject>
  );
}
