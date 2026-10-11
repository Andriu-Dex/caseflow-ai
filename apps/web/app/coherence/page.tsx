'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { COHERENCE_CHAINS, type CoherenceChain } from '@caseflow-ai/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@caseflow-ai/ui';
import { api } from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';
import { PageHeading } from '../../components/page-heading';

// Coherence matrix (DEC-121, ADR-006): each chain between planning stages,
// with what is missing and where it is fixed.

const CHAIN_LABELS: Record<CoherenceChain, { title: string; description: string }> = {
  CONTEXT_REQUIREMENT: {
    title: 'Contexto → requisito',
    description:
      'Cada necesidad y regla de negocio del contexto aprobado la atiende un requisito aprobado; las restricciones se muestran como observación.',
  },
  REQUIREMENT_USE_CASE_SCREEN: {
    title: 'Requisito → caso de uso → pantalla',
    description:
      'Cada requisito funcional se realiza en un caso de uso, y cada caso de uso aparece en una pantalla.',
  },
  ENTITY_CLASS_PLAN: {
    title: 'Entidad → clase → plan de implementación',
    description:
      'Cada entidad del modelo de datos tiene su clase, y cada clase su entidad en el modelo conceptual y en el plan.',
  },
  NAVIGATION_SCREEN_ROUTE: {
    title: 'Navegación → pantalla → ruta',
    description:
      'Cada nodo de navegación tiene su pantalla, y cada pantalla su ruta en el plan de implementación.',
  },
  ACTION_ENDPOINT: {
    title: 'Acción de pantalla → operación o endpoint',
    description:
      'Cada acción principal de una pantalla la atiende una operación o un endpoint, y cada endpoint atiende una acción.',
  },
};

// Chains fixed on a page other than their artifact type's.
const CHAIN_FIX_PAGES: Partial<Record<CoherenceChain, string>> = {
  CONTEXT_REQUIREMENT: '/requirements',
};
// Where each gap is fixed: the artifact that must change to cover it.
const FIX_PAGES: Record<string, string> = {
  REQUIREMENT: '/use-cases',
  CLASS_DIAGRAM: '/class-diagram',
  CONCEPTUAL_DOMAIN_MODEL: '/construction/conceptual-model',
  UI_BLUEPRINT: '/design/ui-blueprint',
  IMPLEMENTATION_PLAN: '/construction/implementation-plan',
};

function CoherenceContent({ projectId }: { projectId: string }) {
  const report = useQuery({
    queryKey: ['consistency', projectId],
    queryFn: () => api.consistency.get(projectId),
  });
  const issues = report.data?.issues ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageHeading title="Matriz de coherencia" projectId={projectId} />
        <p className="text-sm text-muted-foreground">
          Lo que se define en una etapa debe aparecer en las siguientes, y lo que aparece abajo debe
          venir de arriba. Aquí se ve qué falta y dónde corregirlo.
        </p>
      </div>
      <QueryState isLoading={report.isLoading} error={report.error}>
        {report.data ? (
          <>
            <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {report.data.coherenceRequired
                ? 'En este proyecto la coherencia es obligatoria: un artefacto con huecos no puede aprobarse ni congelarse en el diseño.'
                : 'Este proyecto se creó antes de la coherencia obligatoria: los huecos se muestran como advertencias y no bloquean aprobaciones.'}
            </p>
            {COHERENCE_CHAINS.map((chain) => {
              const gaps = issues.filter((issue) => issue.chain === chain);
              const open = gaps.filter((gap) => gap.severity !== 'OBSERVATION');
              return (
                <Card key={chain}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      {open.length ? (
                        <AlertCircle className="size-4 text-destructive" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                      )}
                      {CHAIN_LABELS[chain].title}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {CHAIN_LABELS[chain].description}
                    </p>
                  </CardHeader>
                  <CardContent>
                    {gaps.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Sin huecos en lo aprobado hasta ahora.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-2 text-sm">
                        {gaps.map((gap, i) => {
                          const href =
                            CHAIN_FIX_PAGES[chain] ??
                            (gap.artifactType ? FIX_PAGES[gap.artifactType] : undefined);
                          return (
                            <li key={i} className="flex flex-wrap items-baseline gap-2">
                              <span
                                className={
                                  gap.severity === 'ERROR'
                                    ? 'text-destructive'
                                    : gap.severity === 'OBSERVATION'
                                      ? 'text-muted-foreground'
                                      : 'text-amber-700 dark:text-amber-400'
                                }
                              >
                                {gap.message}
                              </span>
                              {href ? (
                                <Link href={href} className="text-primary underline">
                                  Corregir
                                </Link>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </>
        ) : null}
      </QueryState>
    </div>
  );
}

export default function CoherencePage() {
  return (
    <RequireActiveProject>
      {(projectId) => <CoherenceContent projectId={projectId} />}
    </RequireActiveProject>
  );
}
