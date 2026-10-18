'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Info,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import { COHERENCE_CHAINS, type CoherenceChain } from '@caseflow-ai/contracts';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@caseflow-ai/ui';
import { api } from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';
import { PageHeading } from '../../components/page-heading';

// Coherence matrix (DEC-121, ADR-006): each chain between planning stages,
// with what is missing and where it is fixed.

const CHAIN_LABELS: Record<CoherenceChain, { title: string; description: string }> = {
  QUALITY_REQUIREMENT_DESIGN: {
    title: 'Requisito no funcional → diseño',
    description:
      'Revise dónde se atienden los atributos de calidad. Una referencia identifica cobertura declarada; compruebe que las responsabilidades y decisiones realmente cumplan el requisito.',
  },
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

const CHAIN_STEPS: Record<CoherenceChain, string[]> = {
  QUALITY_REQUIREMENT_DESIGN: ['Requisito no funcional', 'Arquitectura y Diseño'],
  CONTEXT_REQUIREMENT: ['Contexto del proyecto', 'Requisitos aprobados'],
  REQUIREMENT_USE_CASE_SCREEN: ['Requisito funcional', 'Caso de uso', 'Pantalla UI'],
  ENTITY_CLASS_PLAN: ['Entidad de datos', 'Clase de dominio', 'Plan de implementación'],
  NAVIGATION_SCREEN_ROUTE: ['Nodo de navegación', 'Pantalla UI', 'Ruta en frontend'],
  ACTION_ENDPOINT: ['Acción interactiva', 'Operación o Endpoint'],
};

// Chains fixed on a page other than their artifact type's.
const CHAIN_FIX_PAGES: Partial<Record<CoherenceChain, string>> = {
  QUALITY_REQUIREMENT_DESIGN: '/design/software-architecture',
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

const FIX_PAGE_LABELS: Record<string, string> = {
  '/requirements': 'Requisitos',
  '/use-cases': 'Casos de uso',
  '/class-diagram': 'Diagrama de clases',
  '/construction/conceptual-model': 'Modelo conceptual',
  '/design/ui-blueprint': 'Plano de interfaz',
  '/design/software-architecture': 'Arquitectura de software',
  '/construction/implementation-plan': 'Plan de implementación',
};

function CoherenceContent({ projectId }: { projectId: string }) {
  const report = useQuery({
    queryKey: ['consistency', projectId],
    queryFn: () => api.consistency.get(projectId),
  });

  const [filter, setFilter] = useState<'all' | 'open' | 'satisfied'>('all');
  const issues = report.data?.issues ?? [];

  const chainStats = useMemo(() => {
    let satisfied = 0;
    let openCount = 0;
    let errorCount = 0;
    let warningCount = 0;

    for (const chain of COHERENCE_CHAINS) {
      const gaps = issues.filter((issue) => issue.chain === chain);
      const open = gaps.filter((gap) => gap.severity !== 'OBSERVATION');
      if (open.length === 0) {
        satisfied++;
      } else {
        openCount++;
      }
      for (const g of gaps) {
        if (g.severity === 'ERROR') errorCount++;
        else if (g.severity === 'WARNING') warningCount++;
      }
    }

    return { satisfied, openCount, errorCount, warningCount };
  }, [issues]);

  const filteredChains = useMemo(() => {
    return COHERENCE_CHAINS.filter((chain) => {
      const gaps = issues.filter((issue) => issue.chain === chain);
      const open = gaps.filter((gap) => gap.severity !== 'OBSERVATION');
      if (filter === 'open') return open.length > 0;
      if (filter === 'satisfied') return open.length === 0;
      return true;
    });
  }, [issues, filter]);

  const coveragePercent =
    COHERENCE_CHAINS.length > 0
      ? Math.round((chainStats.satisfied / COHERENCE_CHAINS.length) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageHeading title="Matriz de coherencia" projectId={projectId} />
        <p className="text-sm text-muted-foreground mt-0.5">
          Lo que se define en una etapa debe aparecer en las siguientes, y lo que aparece abajo debe
          venir de arriba. Aquí se ve qué falta y dónde corregirlo.
        </p>
      </div>

      <QueryState isLoading={report.isLoading} error={report.error}>
        {report.data ? (
          <>
            {/* KPI Overview Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs">
                <div
                  className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${
                    chainStats.satisfied === COHERENCE_CHAINS.length
                      ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                      : 'bg-primary/10 text-primary border-primary/20'
                  }`}
                >
                  <CheckCircle2 className="size-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Cadenas Coherentes</p>
                  <p className="text-lg font-bold text-foreground">
                    {chainStats.satisfied}{' '}
                    <span className="text-xs font-normal text-muted-foreground">
                      de {COHERENCE_CHAINS.length} ({coveragePercent}%)
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs">
                <div
                  className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${
                    chainStats.openCount > 0
                      ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                      : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                  }`}
                >
                  {chainStats.openCount > 0 ? (
                    <AlertTriangle className="size-5" />
                  ) : (
                    <ShieldCheck className="size-5" />
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Huecos Detectados</p>
                  <p className="text-lg font-bold text-foreground">
                    {chainStats.openCount === 0 ? (
                      '0 huecos abiertos'
                    ) : (
                      <>
                        {issues.length}{' '}
                        <span className="text-xs font-normal text-muted-foreground">
                          ({chainStats.errorCount} bloqueantes)
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs">
                <div
                  className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${
                    report.data.coherenceRequired
                      ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                      : 'bg-muted text-muted-foreground border-border'
                  }`}
                >
                  <Layers className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground font-medium">Régimen de Rigor</p>
                  <p className="text-sm font-semibold truncate text-foreground">
                    {report.data.coherenceRequired ? 'Obligatoria' : 'Permisiva'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {report.data.coherenceRequired ? 'Bloquea aprobaciones' : 'Modo informativo'}
                  </p>
                </div>
              </div>
            </div>

            {/* Policy Banner */}
            <div
              className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-sm ${
                report.data.coherenceRequired
                  ? 'border-blue-200 bg-blue-50/70 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200'
                  : 'border-border/70 bg-muted/40 text-muted-foreground'
              }`}
            >
              <Info
                className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400"
                aria-hidden="true"
              />
              <span>
                {report.data.coherenceRequired
                  ? 'En este proyecto la coherencia es obligatoria: un artefacto con huecos no puede aprobarse ni congelarse en el diseño.'
                  : 'Este proyecto se creó antes de la coherencia obligatoria: los huecos se muestran como advertencias y no bloquean aprobaciones.'}
              </span>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 border-b border-border/60 pb-2">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filter === 'all'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                Todas las cadenas ({COHERENCE_CHAINS.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('open')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filter === 'open'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                Con huecos pendientes ({chainStats.openCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter('satisfied')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  filter === 'satisfied'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                Satisfechas ({chainStats.satisfied})
              </button>
            </div>

            {/* Chains List */}
            <div className="flex flex-col gap-4">
              {filteredChains.map((chain) => {
                const gaps = issues.filter((issue) => issue.chain === chain);
                const open = gaps.filter((gap) => gap.severity !== 'OBSERVATION');
                const steps = CHAIN_STEPS[chain];
                return (
                  <Card
                    key={chain}
                    className={`rounded-xl border transition-all duration-200 shadow-2xs ${
                      open.length
                        ? 'border-amber-300/80 bg-card hover:border-amber-400'
                        : 'border-border/80 bg-card hover:border-primary/30'
                    }`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
                          {open.length ? (
                            <AlertCircle
                              className="size-4.5 text-destructive shrink-0"
                              aria-hidden="true"
                            />
                          ) : (
                            <CheckCircle2
                              className="size-4.5 text-emerald-600 shrink-0"
                              aria-hidden="true"
                            />
                          )}
                          <span>{CHAIN_LABELS[chain].title}</span>
                        </CardTitle>

                        <Badge
                          variant={open.length ? 'destructive' : 'secondary'}
                          className={`text-xs font-medium shrink-0 ${
                            !open.length
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : ''
                          }`}
                        >
                          {open.length ? `${open.length} por resolver` : 'Satisfecha'}
                        </Badge>
                      </div>

                      {/* Visual Pipeline Steps */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
                        {steps.map((step, idx) => (
                          <span key={step} className="inline-flex items-center gap-1.5">
                            <span className="rounded-md border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground">
                              {step}
                            </span>
                            {idx < steps.length - 1 ? (
                              <ChevronRight
                                className="size-3 text-muted-foreground"
                                aria-hidden="true"
                              />
                            ) : null}
                          </span>
                        ))}
                      </div>

                      <p className="text-xs sm:text-sm text-muted-foreground pt-1 leading-relaxed">
                        {CHAIN_LABELS[chain].description}
                      </p>
                    </CardHeader>

                    <CardContent className="pt-0">
                      {gaps.length === 0 ? (
                        <div className="flex items-center gap-2 rounded-lg border border-emerald-200/80 bg-emerald-50/50 p-3 text-xs sm:text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300">
                          <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                          <span>
                            Sin huecos en lo aprobado hasta ahora. Cobertura formal completa.
                          </span>
                        </div>
                      ) : (
                        <ul className="flex flex-col gap-2 text-sm">
                          {gaps.map((gap, i) => {
                            const href =
                              CHAIN_FIX_PAGES[chain] ??
                              (gap.artifactType ? FIX_PAGES[gap.artifactType] : undefined);
                            const targetLabel = href ? FIX_PAGE_LABELS[href] : null;

                            return (
                              <li
                                key={i}
                                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-lg border p-3 ${
                                  gap.severity === 'ERROR'
                                    ? 'border-red-200 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/20'
                                    : gap.severity === 'OBSERVATION'
                                      ? 'border-border/70 bg-muted/30'
                                      : 'border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20'
                                }`}
                              >
                                <div className="flex items-start gap-2 min-w-0 flex-1">
                                  {gap.severity === 'ERROR' ? (
                                    <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                                  ) : (
                                    <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                                  )}
                                  <div className="flex flex-col gap-0.5 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span
                                        className={`rounded px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider ${
                                          gap.severity === 'ERROR'
                                            ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                                            : gap.severity === 'OBSERVATION'
                                              ? 'bg-muted text-muted-foreground'
                                              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                                        }`}
                                      >
                                        {gap.severity === 'ERROR'
                                          ? 'Bloqueante'
                                          : gap.severity === 'OBSERVATION'
                                            ? 'Observación'
                                            : 'Advertencia'}
                                      </span>
                                    </div>
                                    <p
                                      className={`text-xs sm:text-sm font-medium ${
                                        gap.severity === 'ERROR'
                                          ? 'text-destructive'
                                          : gap.severity === 'OBSERVATION'
                                            ? 'text-muted-foreground'
                                            : 'text-amber-800 dark:text-amber-300'
                                      }`}
                                    >
                                      {gap.message}
                                    </p>
                                  </div>
                                </div>

                                {href ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    asChild
                                    className="shrink-0 text-xs font-medium h-8 hover:bg-primary/5 hover:text-primary"
                                  >
                                    <Link href={href} className="flex items-center gap-1.5">
                                      <span>Corregir{targetLabel ? ` en ${targetLabel}` : ''}</span>
                                      <ArrowRight className="size-3" />
                                    </Link>
                                  </Button>
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
            </div>
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
