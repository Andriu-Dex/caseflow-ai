'use client';

import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StructuredAnalysisKind, StructuredAnalysisResponse } from '@caseflow-ai/contracts';
import { Eye, EyeOff, Pencil, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@caseflow-ai/ui';
import { api, ApiError, type ArtifactVersionStatus, type GenerationResult } from '../lib/api';
import { QueryState } from './query-state';
import { PageHeading } from './page-heading';
import { StatusBadge } from './status-badge';
import { CandidateReview } from './candidate-review';
import {
  NavigationManualForm,
  SoftwareArchitectureManualForm,
  SystemArchitectureManualForm,
  UiBlueprintManualForm,
} from './structured-manual-forms';
import { TrustedDiagram } from './trusted-svg';
import {
  AI_UNAVAILABLE_HINT,
  ApproveAllButton,
  ArchiveButton,
  EmptyState,
  approveDirectly,
  isPendingApproval,
} from './artifact-actions';

const MANUAL_FORMS: Record<
  StructuredAnalysisKind,
  (props: {
    projectId: string;
    initial?: StructuredAnalysisResponse;
    onCreated: () => void;
    onCancel: () => void;
  }) => React.JSX.Element
> = {
  NAVIGATION_TREE: NavigationManualForm,
  SOFTWARE_ARCHITECTURE: SoftwareArchitectureManualForm,
  SYSTEM_ARCHITECTURE: SystemArchitectureManualForm,
  UI_BLUEPRINT: UiBlueprintManualForm,
};

type SourceType =
  | 'REQUIREMENT'
  | 'USE_CASE'
  | 'DATA_MODEL'
  | 'NAVIGATION_TREE'
  | 'SOFTWARE_ARCHITECTURE'
  | 'SYSTEM_ARCHITECTURE';

// Mirrors the backend's ELIGIBLE_SOURCE_TYPES (structured-analysis.service.ts),
// which stays the authority: it rejects anything outside this set.
const ELIGIBLE_SOURCES: Record<StructuredAnalysisKind, SourceType[]> = {
  NAVIGATION_TREE: ['REQUIREMENT', 'USE_CASE', 'DATA_MODEL'],
  SOFTWARE_ARCHITECTURE: ['REQUIREMENT', 'USE_CASE', 'DATA_MODEL', 'NAVIGATION_TREE'],
  SYSTEM_ARCHITECTURE: ['REQUIREMENT', 'USE_CASE', 'DATA_MODEL', 'NAVIGATION_TREE'],
  UI_BLUEPRINT: [
    'NAVIGATION_TREE',
    'USE_CASE',
    'DATA_MODEL',
    'SOFTWARE_ARCHITECTURE',
    'SYSTEM_ARCHITECTURE',
  ],
};

const SOURCE_LABELS: Record<SourceType, string> = {
  REQUIREMENT: 'Requisitos',
  USE_CASE: 'Casos de uso',
  DATA_MODEL: 'Modelo de datos',
  NAVIGATION_TREE: 'Navegación',
  SOFTWARE_ARCHITECTURE: 'Arquitectura de software',
  SYSTEM_ARCHITECTURE: 'Arquitectura de sistema',
};

interface SourceOption {
  versionId: string;
  code: string;
  name: string;
}

async function loadApprovedSources(projectId: string, type: SourceType): Promise<SourceOption[]> {
  const approved = <T extends { version: { status: string } }>(items: T[]) =>
    items.filter((i) => i.version.status === 'APPROVED');
  switch (type) {
    case 'REQUIREMENT':
      return approved((await api.requirements.list(projectId)).items).map((r) => ({
        versionId: r.version.id,
        code: r.code,
        name: r.requirement.name,
      }));
    case 'USE_CASE':
      return approved((await api.useCases.list(projectId)).items).map((u) => ({
        versionId: u.version.id,
        code: u.code,
        name: u.useCase.name,
      }));
    case 'DATA_MODEL':
      return approved((await api.dataModels.list(projectId)).items).map((m) => ({
        versionId: m.version.id,
        code: m.code,
        name: m.dataModel.title,
      }));
    default:
      return approved((await api.structuredAnalysis.list(projectId, type)).items).map((s) => ({
        versionId: s.version.id,
        code: s.code,
        name: s.title,
      }));
  }
}

// Shared page for the four StructuredAnalysis kinds (Navegación,
// Arquitectura de software, Arquitectura de sistema, UI Blueprint).
export function StructuredKindPage({
  kind,
  title,
  projectId,
}: {
  kind: StructuredAnalysisKind;
  title: string;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['structured-analysis', kind, projectId],
    queryFn: () => api.structuredAnalysis.list(projectId, kind),
  });
  const sourceTypes = ELIGIBLE_SOURCES[kind];
  const sourceQueries = useQueries({
    queries: sourceTypes.map((type) => ({
      queryKey: ['eligible-sources', type, projectId],
      queryFn: () => loadApprovedSources(projectId, type),
    })),
  });
  const sourceGroups = sourceTypes
    .map((type, i) => ({ type, options: sourceQueries[i]?.data ?? [] }))
    .filter((g) => g.options.length > 0);
  const allSourceIds = sourceGroups.flatMap((g) => g.options.map((o) => o.versionId));

  const [selected, setSelected] = useState<string[] | null>(null);
  const selectedIds = selected ?? allSourceIds;
  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const [diagrams, setDiagrams] = useState<Record<string, string>>({});
  const [showManualForm, setShowManualForm] = useState(false);
  const [editing, setEditing] = useState<StructuredAnalysisResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const ManualForm = MANUAL_FORMS[kind];

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['structured-analysis', kind, projectId] });
    queryClient.invalidateQueries({ queryKey: ['eligible-sources'] });
    queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
    setDiagrams({});
  }

  function toggleSource(id: string) {
    setSelected(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
    );
  }

  async function generate() {
    if (!selectedIds.length) {
      toast.info('Seleccione al menos un elemento aprobado como base para la generación.');
      return;
    }
    setGenerating(true);
    try {
      setGeneration(await api.structuredAnalysis.generate(projectId, kind, selectedIds));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo generar la propuesta.');
    } finally {
      setGenerating(false);
    }
  }

  const transitionFor = (item: StructuredAnalysisResponse) => (status: ArtifactVersionStatus) =>
    api.structuredAnalysis.transition(projectId, kind, item.id, item.version.id, status);

  async function approveOne(item: StructuredAnalysisResponse) {
    setApprovingId(item.id);
    try {
      await approveDirectly(transitionFor(item));
      toast.success(`${item.code} aprobado.`);
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo aprobar.');
    } finally {
      setApprovingId(null);
    }
  }

  async function transition(item: StructuredAnalysisResponse, status: ArtifactVersionStatus) {
    try {
      await transitionFor(item)(status);
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    }
  }

  async function toggleDiagram(id: string) {
    if (diagrams[id]) {
      setDiagrams((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    try {
      const diagram = await api.structuredAnalysis.getDiagram(projectId, kind, id);
      setDiagrams((prev) => ({ ...prev, [id]: diagram.svg }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo mostrar el diagrama.');
    }
  }

  const items = list.data?.items ?? [];
  const pending = items.filter((i) => isPendingApproval(i.version.status));
  const loadingSources = sourceQueries.some((q) => q.isLoading);

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title={title} projectId={projectId} />

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" aria-hidden="true" />
              Generar con IA
            </span>
            <ApproveAllButton
              pending={pending}
              approve={(id) => approveDirectly(transitionFor(items.find((i) => i.id === id)!))}
              onDone={invalidate}
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingSources ? (
            <p className="text-sm text-muted-foreground">Cargando información aprobada…</p>
          ) : sourceGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              La IA trabaja a partir de lo ya aprobado en{' '}
              {sourceTypes.map((t) => SOURCE_LABELS[t].toLowerCase()).join(', ')}. Cuando haya
              elementos aprobados, aparecerán aquí para elegirlos.
            </p>
          ) : (
            <>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Elija qué información aprobada usar como base:
                </p>
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() =>
                    setSelected(selectedIds.length === allSourceIds.length ? [] : allSourceIds)
                  }
                >
                  {selectedIds.length === allSourceIds.length
                    ? 'Quitar selección'
                    : 'Seleccionar todo'}
                </button>
              </div>
              <div className="flex max-h-72 flex-col gap-3 overflow-y-auto rounded-md border border-border p-2">
                {sourceGroups.map((group) => (
                  <fieldset key={group.type}>
                    <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {SOURCE_LABELS[group.type]}
                    </legend>
                    <ul className="flex flex-col gap-1 text-sm">
                      {group.options.map((o) => (
                        <li key={o.versionId}>
                          <label className="flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(o.versionId)}
                              onChange={() => toggleSource(o.versionId)}
                            />
                            <span>
                              <span className="font-mono text-xs text-muted-foreground">
                                {o.code}
                              </span>{' '}
                              {o.name}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </fieldset>
                ))}
              </div>
            </>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={generating || sourceGroups.length === 0}
              onClick={generate}
            >
              <Sparkles className="size-4" aria-hidden="true" />
              {generating ? 'Generando…' : 'Generar'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(null);
                setShowManualForm((v) => !v);
              }}
            >
              Crear manualmente
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{AI_UNAVAILABLE_HINT}</p>
        </CardContent>
      </Card>

      {showManualForm || editing ? (
        <ManualForm
          key={editing?.id ?? 'new'}
          projectId={projectId}
          initial={editing ?? undefined}
          onCreated={() => {
            invalidate();
            setShowManualForm(false);
            setEditing(null);
          }}
          onCancel={() => {
            setShowManualForm(false);
            setEditing(null);
          }}
        />
      ) : null}

      {generation ? (
        <CandidateReview
          generation={generation}
          describe={(c) => String(c.title ?? c.name ?? c.candidateId)}
          onAccept={async (ids) => {
            await api.structuredAnalysis.accept(projectId, kind, generation.id, ids);
            invalidate();
          }}
          onDismiss={() => setGeneration(null)}
        />
      ) : null}

      <QueryState isLoading={list.isLoading} error={list.error}>
        {items.length === 0 ? (
          <EmptyState title={`Aún no hay ${title.toLowerCase()}`}>
            Genérela con IA a partir de lo aprobado en pasos anteriores, o créela manualmente.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.id}>
                <Card>
                  <CardContent>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm">
                        <span className="font-mono text-xs text-muted-foreground">{item.code}</span>{' '}
                        <span className="font-medium text-foreground">{item.title}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={item.version.status} />
                        {isPendingApproval(item.version.status) ? (
                          <Button
                            type="button"
                            size="sm"
                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                            disabled={approvingId === item.id}
                            onClick={() => approveOne(item)}
                          >
                            {approvingId === item.id ? 'Aprobando…' : 'Aprobar'}
                          </Button>
                        ) : null}
                        {item.version.status === 'IN_REVIEW' ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              className="bg-emerald-600 text-white hover:bg-emerald-700"
                              onClick={() => transition(item, 'APPROVED')}
                            >
                              Aprobar
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="border-destructive/40 text-destructive hover:bg-destructive/5"
                              onClick={() => transition(item, 'CHANGES_REQUESTED')}
                            >
                              Solicitar cambios
                            </Button>
                          </>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setShowManualForm(false);
                            setEditing(item);
                          }}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted/40"
                        >
                          <Pencil className="size-3.5" aria-hidden="true" />
                          Editar
                        </button>
                        <ArchiveButton
                          projectId={projectId}
                          artifactId={item.id}
                          code={item.code}
                          onDone={invalidate}
                        />
                      </div>
                    </div>
                    {/* UI Blueprint has no diagram: its visual form is the Mockup step. */}
                    {kind !== 'UI_BLUEPRINT' ? (
                      <button
                        type="button"
                        onClick={() => toggleDiagram(item.id)}
                        className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      >
                        {diagrams[item.id] ? (
                          <EyeOff className="size-4" aria-hidden="true" />
                        ) : (
                          <Eye className="size-4" aria-hidden="true" />
                        )}
                        {diagrams[item.id] ? 'Ocultar diagrama' : 'Ver diagrama'}
                      </button>
                    ) : null}
                    {diagrams[item.id] ? (
                      <TrustedDiagram
                        svg={diagrams[item.id]!}
                        caption={`${title} — ${item.code}`}
                      />
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
