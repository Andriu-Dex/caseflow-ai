'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Database, FileCode, Layout, Search, Server, X } from 'lucide-react';
import { toast } from 'sonner';
import { type ConstructionUnit, type GenerationRunResponse } from '@caseflow-ai/contracts';
import { Button } from '@caseflow-ai/ui';
import { api } from '../../../lib/api';
import { QueryState } from '../../../components/query-state';

const LINK_LABELS = { IMPLEMENTS: 'Implementa', TESTS: 'Prueba', CONFIGURES: 'Configura' };

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

const UNIT_KINDS: Record<ConstructionUnit['kind'], string> = {
  SCREEN: 'Pantallas',
  ACTION: 'Acciones de negocio',
  ENTITY: 'Entidades',
  MODULE: 'Módulos',
  PROJECT: 'Base del proyecto',
};
const ORIGIN_LABELS: Record<keyof ConstructionUnit['origins'], string> = {
  TEMPLATE: 'Plantilla',
  DETERMINISTIC: 'Determinista',
  AI_ASSISTED: 'Asistido por IA',
  MANUAL: 'Ajuste manual',
};

// ADR-020: the generated code by construction unit (what was generated, its
// origin and traceability), with each file opened on demand.
const DESIGN_SOURCES: Record<NonNullable<ConstructionUnit['design']>['source'], string> = {
  COMPOSED: 'Compuesta desde el boceto',
  MANUAL: 'Escrita a mano',
  FUNCTIONAL: 'Página funcional, sin el diseño del boceto',
};
const OBSERVATION_LABELS: Record<string, string> = {
  MISSING_DATA_BINDING: 'Datos',
  MISSING_ACTION_BINDING: 'Acción',
  MISSING_FORM_BINDING: 'Formulario',
  UNSUPPORTED_LAYOUT: 'Composición',
  INVALID_PRESENTATION: 'Composición no válida',
};

// How a screen was built and what the approved blueprint describes that it
// does not do (DEC-164). Observations never block: they inform a decision
// to extend the plan, simplify the blueprint or keep the screen as it is.
function ScreenDesign({ design }: { design: NonNullable<ConstructionUnit['design']> }) {
  return (
    <div className="mt-1.5 text-[11px]">
      <p className="text-muted-foreground">Diseño: {DESIGN_SOURCES[design.source]}</p>
      {design.observations.length ? (
        <details className="mt-1">
          <summary className="cursor-pointer font-medium text-amber-700 dark:text-amber-300">
            {design.observations.length === 1
              ? '1 observación de cobertura'
              : `${design.observations.length} observaciones de cobertura`}{' '}
            frente al plano de interfaz
          </summary>
          <p className="mt-1 text-muted-foreground">
            Lo que el plano describe y esta pantalla no hace. No bloquea: puede ampliar el plan de
            implementación, simplificar el plano o dejarla como está.
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {design.observations.map((item, index) => (
              <li key={index}>
                <span className="font-medium">{OBSERVATION_LABELS[item.code] ?? item.code}:</span>{' '}
                {item.description}
              </li>
            ))}
          </ul>
          {design.acceptedJustification ? (
            <p className="mt-1 text-muted-foreground">
              Aceptadas con la justificación: {design.acceptedJustification}
            </p>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}

function RunUnits({ projectId, run }: { projectId: string; run: GenerationRunResponse }) {
  const [kind, setKind] = useState<ConstructionUnit['kind']>('SCREEN');
  const [filter, setFilter] = useState('');
  const [fileId, setFileId] = useState<string>();
  const units = useQuery({
    queryKey: ['construction-units', projectId, run.id],
    queryFn: () => api.generationRuns.units(projectId, run.id),
  });
  const items = units.data?.items ?? [];
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<string>();
  async function toggleReview(unit: ConstructionUnit) {
    setSaving(unit.id);
    try {
      await api.generationRuns.reviewUnit(projectId, run.id, {
        unitKey: unit.id,
        contentSha256: unit.contentSha256,
        reviewed: !unit.review,
      });
      await queryClient.invalidateQueries({ queryKey: ['construction-units', projectId, run.id] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la revisión.');
    } finally {
      setSaving(undefined);
    }
  }
  const reviewable = items.filter((unit) => unit.id !== 'evidence');
  const reviewed = reviewable.filter((unit) => unit.review).length;
  const term = filter.trim().toLowerCase();
  const shown = items.filter(
    (unit) =>
      unit.kind === kind &&
      (!term || `${unit.title} ${unit.module ?? ''} ${unit.summary}`.toLowerCase().includes(term)),
  );
  return (
    <QueryState isLoading={units.isLoading} error={units.error}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground" role="status">
          Revisadas {reviewed} de {reviewable.length} unidades. Marcar una unidad como revisada no
          cambia la validación ni el estado de la entrega; la marca se conserva mientras su código
          no cambie.
        </p>
        <div
          className="flex flex-wrap items-center gap-2"
          role="tablist"
          aria-label="Tipo de unidad"
        >
          {(Object.keys(UNIT_KINDS) as ConstructionUnit['kind'][]).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={kind === option}
              onClick={() => {
                setKind(option);
                setFileId(undefined);
              }}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                kind === option
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:bg-muted'
              }`}
            >
              {UNIT_KINDS[option]} ({items.filter((unit) => unit.kind === option).length})
            </button>
          ))}
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Buscar unidad…"
            aria-label="Buscar unidad"
            className="ml-auto h-8 w-56 rounded-md border border-input bg-background px-2.5 text-xs"
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <ul className="flex max-h-[36rem] flex-col gap-2 overflow-auto pr-1">
            {shown.map((unit) => (
              <li key={unit.id} className="rounded-lg border border-border/80 bg-card p-3 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{unit.title}</p>
                  {unit.origins.AI_ASSISTED && unit.kind !== 'PROJECT' ? (
                    <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                      Revisar primero: IA
                    </span>
                  ) : null}
                </div>
                {unit.module ? (
                  <p className="text-[11px] text-muted-foreground">Módulo: {unit.module}</p>
                ) : null}
                <p className="mt-1.5 leading-relaxed text-foreground/90">{unit.summary}</p>
                <p className="mt-1.5 flex flex-wrap gap-1">
                  {(Object.keys(unit.origins) as (keyof ConstructionUnit['origins'])[])
                    .filter((origin) => unit.origins[origin])
                    .map((origin) => (
                      <span key={origin} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                        {ORIGIN_LABELS[origin]}: {unit.origins[origin]}
                      </span>
                    ))}
                </p>
                {unit.traces.length ? (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Procede de:{' '}
                    {unit.traces
                      .slice(0, 8)
                      .map((trace) => `${trace.code} v${trace.versionNumber}`)
                      .join(', ')}
                    {unit.traces.length > 8 ? ` y ${unit.traces.length - 8} más` : ''}
                  </p>
                ) : null}
                {unit.design ? <ScreenDesign design={unit.design} /> : null}

                {unit.changes &&
                (unit.changes.added || unit.changes.changed || unit.changes.removed.length) ? (
                  <p className="mt-1 text-[11px] font-medium text-blue-700 dark:text-blue-300">
                    Respecto a la generación anterior: {unit.changes.added} añadidos,{' '}
                    {unit.changes.changed} cambiados, {unit.changes.removed.length} eliminados
                  </p>
                ) : unit.changes ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Sin cambios respecto a la generación anterior.
                  </p>
                ) : null}
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] font-medium text-primary">
                    Archivos ({unit.files.length})
                  </summary>
                  <ul className="mt-1 flex flex-col">
                    {unit.files.map((file) => (
                      <li key={file.id}>
                        <button
                          type="button"
                          onClick={() => setFileId(file.id)}
                          title={file.path}
                          className={`w-full truncate rounded px-1.5 py-1 text-left font-mono text-[11px] ${
                            file.id === fileId
                              ? 'bg-primary/10 font-semibold text-primary'
                              : 'hover:bg-muted'
                          }`}
                        >
                          {file.change && file.change !== 'UNCHANGED' ? (
                            <span className="mr-1 rounded bg-blue-500/10 px-1 text-[10px] font-sans font-semibold text-blue-700 dark:text-blue-300">
                              {file.change === 'ADDED' ? 'nuevo' : 'cambiado'}
                            </span>
                          ) : null}
                          {file.path}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {unit.changes?.removed.length ? (
                    <ul className="mt-1 text-[11px] text-muted-foreground">
                      {unit.changes.removed.map((path) => (
                        <li
                          key={path}
                          className="truncate px-1.5 font-mono line-through"
                          title={path}
                        >
                          {path}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </details>
                {unit.id !== 'evidence' ? (
                  <label className="mt-2 flex cursor-pointer items-center gap-2 border-t pt-2 text-[11px]">
                    <input
                      type="checkbox"
                      checked={Boolean(unit.review)}
                      disabled={saving === unit.id}
                      onChange={() => void toggleReview(unit)}
                    />
                    {unit.review
                      ? `Revisada por ${unit.review.reviewerName} el ${new Date(unit.review.reviewedAt).toLocaleString('es')}`
                      : 'Marcar como revisada'}
                  </label>
                ) : null}
              </li>
            ))}
            {!shown.length ? (
              <li className="p-3 text-center text-xs text-muted-foreground">
                No hay unidades que coincidan.
              </li>
            ) : null}
          </ul>
          {fileId ? (
            <FileViewer projectId={projectId} runId={run.id} fileId={fileId} />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">
                Elija una unidad y abra uno de sus archivos para ver el código y su trazabilidad.
              </p>
            </div>
          )}
        </div>
      </div>
    </QueryState>
  );
}

export function RunFiles({ projectId, run }: { projectId: string; run: GenerationRunResponse }) {
  const [view, setView] = useState<'units' | 'files'>('units');
  if (run.status !== 'GENERATED' && run.status !== 'WORKING_COPY') return null;
  const tab = (value: 'units' | 'files') =>
    `rounded px-2.5 py-1 ${view === value ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`;
  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex gap-1 self-start rounded-md border p-0.5 text-xs"
        role="tablist"
        aria-label="Vista del código"
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === 'units'}
          onClick={() => setView('units')}
          className={tab('units')}
        >
          Por unidades
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'files'}
          onClick={() => setView('files')}
          className={tab('files')}
        >
          Todos los archivos
        </button>
      </div>
      {view === 'units' ? (
        <RunUnits projectId={projectId} run={run} />
      ) : (
        <RunFileList projectId={projectId} run={run} />
      )}
    </div>
  );
}

function RunFileList({ projectId, run }: { projectId: string; run: GenerationRunResponse }) {
  const [fileId, setFileId] = useState<string>();

  const [fileFilter, setFileFilter] = useState('');
  const files = useQuery({
    queryKey: ['generated-files', projectId, run.id],
    queryFn: () => api.generationRuns.files(projectId, run.id),
    enabled: run.status === 'GENERATED' || run.status === 'WORKING_COPY',
  });

  if (run.status !== 'GENERATED' && run.status !== 'WORKING_COPY') return null;

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
