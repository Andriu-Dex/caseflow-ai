'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Download,
  Eye,
  FileCode,
  FileText,
  Layers,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button } from '@caseflow-ai/ui';
import Link from 'next/link';
import { api, downloadFile } from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';
import { STAGE_LINKS } from '../../lib/stage-links';
import { HtmlPreviewDialog } from '../../components/html-preview-dialog';

const CONSISTENCY_RULE_LABELS: Record<string, string> = {
  'Mockup Association': 'Asociación de boceto',
  'Unique Use Case Name': 'Nombre de caso de uso único',
  'Requirement Use Case Coverage': 'Cobertura requisito → caso de uso',
  'Navigation Blueprint Consistency': 'Consistencia navegación → plano de interfaz',
  QUALITY_REQUIREMENT_DESIGN: 'Requisito no funcional → diseño',
  CONTEXT_REQUIREMENT: 'Contexto → requisito',
  REQUIREMENT_USE_CASE_SCREEN: 'Requisito → caso de uso → pantalla',
  ENTITY_CLASS_PLAN: 'Entidad → clase → plan de implementación',
  NAVIGATION_SCREEN_ROUTE: 'Navegación → pantalla → ruta',
  ACTION_ENDPOINT: 'Acción de pantalla → operación o endpoint',
};

function downloadJson(projectId: string): Promise<void> {
  return downloadFile(api.export.url(projectId, 'json'), `proyecto-${projectId}.json`);
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

  const [filter, setFilter] = useState<'all' | 'satisfied' | 'pending'>('all');
  const [downloading, setDownloading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const stages = readiness.data?.stages ?? [];
  const done = stages.filter((s) => s.satisfied).length;
  const total = stages.length;
  const percentage = total > 0 ? Math.round((done / total) * 100) : 0;
  const isReady = readiness.data?.ready ?? false;
  const nothingApproved = readiness.data !== undefined && done === 0;

  const filteredStages = useMemo(() => {
    if (filter === 'satisfied') return stages.filter((s) => s.satisfied);
    if (filter === 'pending') return stages.filter((s) => !s.satisfied);
    return stages;
  }, [stages, filter]);

  async function handleDownloadJson() {
    setDownloading(true);
    try {
      await downloadJson(projectId);
    } catch {
      toast.error('No se pudo generar el documento. Intente nuevamente.');
    } finally {
      setDownloading(false);
    }
  }

  const issues = consistency.data?.issues ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* Page Heading & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Preparación y exportación</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Revise qué partes del proyecto están completas y descargue el documento con todo lo
            aprobado.
          </p>
        </div>
        {readiness.data ? (
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                isReady
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700'
                  : 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700'
              }`}
            >
              {isReady ? (
                <CheckCircle2 className="size-3.5 text-emerald-600" />
              ) : (
                <Layers className="size-3.5 text-blue-600" />
              )}
              {isReady ? 'Listo para construcción' : 'Pipeline en curso'}
            </span>
          </div>
        ) : null}
      </div>

      {/* KPI Cards Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            <CheckCircle2 className="size-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Etapas Completadas</p>
            <p className="text-lg font-bold text-foreground">
              {done} <span className="text-xs font-normal text-muted-foreground">de {total}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
            <Sparkles className="size-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Progreso Global</p>
            <p className="text-lg font-bold text-foreground">
              {percentage}%{' '}
              <span className="text-xs font-normal text-muted-foreground">de pipeline</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs">
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${
              issues.length > 0
                ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
            }`}
          >
            {issues.length > 0 ? (
              <ShieldAlert className="size-5" />
            ) : (
              <ShieldCheck className="size-5" />
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Consistencia Formal</p>
            <p className="text-lg font-bold text-foreground">
              {issues.length === 0 ? (
                '0 incidencias'
              ) : (
                <>
                  {issues.length}{' '}
                  <span className="text-xs font-normal text-muted-foreground">
                    {issues.length === 1 ? 'incidencia' : 'incidencias'}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Export Deliverables Card */}
      <section className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <Download className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              Centro de Exportación y Entregables
            </h2>
          </div>
          <span className="text-xs text-muted-foreground font-medium">
            Entregables canónicos de la plataforma
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* HTML Export Card */}
          <div className="flex flex-col justify-between rounded-lg border border-border/70 bg-muted/20 p-3.5 transition-all hover:border-primary/40 hover:bg-muted/30">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <FileText className="size-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  Documento del proyecto (HTML)
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Documento maestro interactivo con diagramas, especificaciones completas,
                trazabilidad y diseño aprobado.
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button
                variant="default"
                size="sm"
                type="button"
                disabled={nothingApproved}
                title={nothingApproved ? 'Aún no hay nada aprobado para exportar.' : undefined}
                onClick={() => setPreviewOpen(true)}
                className="inline-flex items-center gap-1.5 shadow-2xs"
              >
                <Eye className="size-4" aria-hidden="true" />
                Documento del proyecto (HTML)
              </Button>
            </div>
          </div>

          {/* JSON Export Card */}
          <div className="flex flex-col justify-between rounded-lg border border-border/70 bg-muted/20 p-3.5 transition-all hover:border-primary/40 hover:bg-muted/30">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <FileCode className="size-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-foreground">
                  Datos estructurados (JSON)
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Paquete canónico de entidades, versiones históricas y matriz de relaciones para
                auditoría e integraciones externas.
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={nothingApproved || downloading}
                title={nothingApproved ? 'Aún no hay nada aprobado para exportar.' : undefined}
                onClick={handleDownloadJson}
                className="inline-flex items-center gap-1.5 shadow-2xs"
              >
                {downloading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="size-4" aria-hidden="true" />
                )}
                {downloading ? 'Generando…' : 'Datos estructurados (JSON)'}
              </Button>
            </div>
          </div>
        </div>

        {nothingApproved ? (
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-amber-300/80 bg-amber-50/70 p-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertCircle className="size-4 shrink-0 text-amber-600" />
            <span>Aún no hay nada aprobado para exportar.</span>
          </div>
        ) : null}

        <HtmlPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          url={api.export.url(projectId, 'html')}
          filename={`proyecto-${projectId}.html`}
          title="Documento del proyecto"
        />
      </section>

      {/* Checklist and Stages Section */}
      <QueryState isLoading={readiness.isLoading} error={readiness.error}>
        {readiness.data ? (
          <div className="flex flex-col gap-4">
            {/* Progress Header */}
            <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">
                  {readiness.data.ready ? 'Proyecto completo' : 'En progreso'}
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  {done} de {total} etapas completas ({percentage}%)
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${total ? (done / total) * 100 : 0}%` }}
                />
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 pt-2 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    filter === 'all'
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  Todas ({total})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('satisfied')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    filter === 'satisfied'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  Completadas ({done})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('pending')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    filter === 'pending'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  Pendientes ({total - done})
                </button>
              </div>
            </div>

            {/* Stages List */}
            <ul className="flex flex-col gap-2.5">
              {filteredStages.map((stage) => {
                const stageIndex = stages.findIndex((s) => s.key === stage.key) + 1;
                return (
                  <li
                    key={stage.key}
                    className={`rounded-xl border p-4 shadow-2xs transition-all duration-150 ${
                      stage.satisfied
                        ? 'border-emerald-300/80 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/20'
                        : 'border-border/80 bg-card hover:border-primary/30 hover:bg-muted/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 font-mono text-xs font-semibold text-muted-foreground">
                          {stageIndex}
                        </span>
                        <span className="flex items-center gap-2 font-semibold text-sm text-foreground truncate">
                          {stage.satisfied ? (
                            <CheckCircle2
                              className="size-4 shrink-0 text-emerald-600"
                              aria-hidden="true"
                            />
                          ) : (
                            <Circle
                              className="size-4 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                          )}
                          <span className="truncate">{stage.label}</span>
                        </span>
                      </div>
                      {!stage.satisfied && STAGE_LINKS[stage.key] ? (
                        <Link
                          href={STAGE_LINKS[stage.key]!}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline shrink-0"
                        >
                          <span>Ir a completar</span>
                          <ArrowRight className="size-3" />
                        </Link>
                      ) : null}
                    </div>

                    <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground pl-8.5">
                      {stage.summary}
                    </p>

                    {stage.blockers.map((b, i) => (
                      <div
                        key={i}
                        className="mt-2 ml-8.5 flex items-start gap-1.5 rounded-md border border-amber-300/80 bg-amber-50/70 p-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
                      >
                        <AlertCircle
                          className="mt-0.5 size-3.5 shrink-0 text-amber-600"
                          aria-hidden="true"
                        />
                        <span>{b}</span>
                      </div>
                    ))}

                    {stage.warnings.length ? (
                      <details className="mt-2 ml-8.5 text-xs text-muted-foreground">
                        <summary className="cursor-pointer font-medium hover:text-foreground">
                          {stage.warnings.length}{' '}
                          {stage.warnings.length === 1 ? 'sugerencia' : 'sugerencias'}
                        </summary>
                        <ul className="mt-1.5 list-inside list-disc pl-2 space-y-0.5">
                          {stage.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </QueryState>

      {/* Consistency Report Section */}
      <div className="mt-4 rounded-xl border border-border/80 bg-card p-5 shadow-2xs">
        <div className="mb-4 flex items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Reporte de Consistencia</h2>
          </div>
          {consistency.data ? (
            <Badge variant="outline" className="font-mono text-xs">
              {consistency.data.totalArtifacts} artefactos evaluados
            </Badge>
          ) : null}
        </div>

        <QueryState isLoading={consistency.isLoading} error={consistency.error}>
          {consistency.data ? (
            <div className="flex flex-col gap-4">
              {consistency.data.issues.length === 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                  <p className="flex items-center gap-2 font-medium text-sm">
                    <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
                    No se encontraron problemas de consistencia. El proyecto mantiene coherencia
                    formal completa.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {consistency.data.issues.map((issue, idx) => (
                    <li
                      key={idx}
                      className={`rounded-xl border p-3.5 shadow-2xs ${
                        issue.severity === 'ERROR'
                          ? 'border-red-200 bg-red-50/70 text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200'
                          : 'border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <AlertCircle
                          className={`size-4.5 shrink-0 mt-0.5 ${
                            issue.severity === 'ERROR' ? 'text-red-600' : 'text-amber-600'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-xs sm:text-sm">
                              [{CONSISTENCY_RULE_LABELS[issue.rule] ?? issue.rule}]
                            </span>
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                issue.severity === 'ERROR'
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                              }`}
                            >
                              {issue.severity === 'ERROR' ? 'Crítico' : 'Observación'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs sm:text-sm font-normal opacity-95">
                            {issue.message}
                          </p>
                          {issue.affectedArtifactIds.length > 0 ? (
                            <p className="mt-2 text-xs opacity-80 flex flex-wrap items-center gap-1.5">
                              <span className="font-medium">Artefactos afectados:</span>{' '}
                              {issue.affectedArtifactIds.map((id) => (
                                <Link
                                  key={id}
                                  href={`/projects/${projectId}/artifacts/${id}`}
                                  className="inline-flex items-center gap-0.5 rounded border border-current/20 px-1.5 py-0.5 font-mono text-[11px] underline hover:opacity-100"
                                >
                                  {id.split('-')[0]}
                                </Link>
                              ))}
                            </p>
                          ) : null}
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
