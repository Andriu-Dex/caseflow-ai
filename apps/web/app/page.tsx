'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Clock, Info } from 'lucide-react';
import Link from 'next/link';
import { Badge, Card, CardContent, CardHeader } from '@caseflow-ai/ui';
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
      <Card className="border-t-4 border-t-primary">
        <CardContent>
          <QueryState isLoading={project.isLoading} error={project.error}>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {project.data?.name}
            </h1>
            {project.data?.description ? (
              <p className="mt-1 text-sm text-muted-foreground">{project.data.description}</p>
            ) : null}
          </QueryState>
        </CardContent>
      </Card>

      <QueryState isLoading={readiness.isLoading} error={readiness.error}>
        {readiness.data ? (
          <Card>
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <Badge
                variant={readiness.data.ready ? 'default' : 'secondary'}
                className={
                  readiness.data.ready
                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
                    : 'bg-amber-100 text-amber-800 hover:bg-amber-100'
                }
              >
                {readiness.data.ready ? (
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                ) : (
                  <Clock className="size-3.5" aria-hidden="true" />
                )}
                {readiness.data.ready ? 'LISTO' : 'NO LISTO TODAVÍA'}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {readiness.data.stages.filter((s) => s.satisfied).length} /{' '}
                {readiness.data.stages.length} etapas completas
              </span>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {readiness.data.stages.map((stage) => (
                  <Link
                    key={stage.key}
                    href={STAGE_LINKS[stage.key] ?? '/readiness'}
                    title={stage.summary}
                    className={`rounded-md border px-2 py-2 text-center text-xs font-medium transition-colors ${
                      stage.satisfied
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {stage.satisfied ? '✓' : '·'} {stage.label}
                  </Link>
                ))}
              </div>

              {nextStage ? (
                <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>
                    <strong>Siguiente paso:</strong> {nextStage.nextAction ?? nextStage.summary}{' '}
                    <Link
                      href={STAGE_LINKS[nextStage.key] ?? '/readiness'}
                      className="inline-flex items-center gap-0.5 underline"
                    >
                      Ir a {nextStage.label}
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  </span>
                </div>
              ) : null}

              <Link
                href="/readiness"
                className="mt-3 inline-flex items-center gap-1 text-sm text-muted-foreground underline"
              >
                Ver detalle completo de preparación
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </CardContent>
          </Card>
        ) : null}
      </QueryState>

      <QueryState isLoading={staleness.isLoading} error={staleness.error}>
        {staleContext ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Hay conocimiento aprobado más reciente disponible: el Contexto del Proyecto vigente no
              incluye conocimiento de fuentes aprobadas más recientes.{' '}
              <Link href="/context" className="underline">
                Revisar Contexto
              </Link>
            </span>
          </div>
        ) : staleness.data &&
          staleness.data.entries.some((e) => e.impactState === 'POTENTIALLY_AFFECTED') ? (
          <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Hay artefactos potencialmente afectados por conocimiento más reciente. Revisión
              recomendada.{' '}
              <Link href="/traceability" className="underline">
                Ver trazabilidad
              </Link>
            </span>
          </div>
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
