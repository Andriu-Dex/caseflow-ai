'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DataModelResponse, DiagramResponse } from '@caseflow-ai/contracts';
import { Eye, EyeOff, Pencil, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@caseflow-ai/ui';
import { api, ApiError, type ArtifactVersionStatus, type GenerationResult } from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';
import { StatusBadge } from '../../components/status-badge';
import { CandidateReview } from '../../components/candidate-review';
import { DataModelManualForm } from '../../components/data-model-manual-form';
import { DiagramViewer } from '../../components/diagram-viewer';
import { PageHeading } from '../../components/page-heading';
import {
  AI_UNAVAILABLE_HINT,
  ApproveAllButton,
  ArchiveButton,
  EmptyState,
  approveDirectly,
  isPendingApproval,
} from '../../components/artifact-actions';

function DataModelContent({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const dataModels = useQuery({
    queryKey: ['data-models', projectId],
    queryFn: () => api.dataModels.list(projectId),
  });
  const requirements = useQuery({
    queryKey: ['requirements', projectId],
    queryFn: () => api.requirements.list(projectId),
  });
  const useCases = useQuery({
    queryKey: ['use-cases', projectId],
    queryFn: () => api.useCases.list(projectId),
  });

  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [diagrams, setDiagrams] = useState<Record<string, DiagramResponse>>({});
  const [showManualForm, setShowManualForm] = useState(false);
  const [editing, setEditing] = useState<DataModelResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const approvedRequirementIds = (requirements.data?.items ?? [])
    .filter((r) => r.version.status === 'APPROVED')
    .map((r) => r.version.id);
  const approvedUseCaseIds = (useCases.data?.items ?? [])
    .filter((u) => u.version.status === 'APPROVED')
    .map((u) => u.version.id);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['data-models', projectId] });
    queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
    setDiagrams({});
  }

  async function generate() {
    if (!approvedRequirementIds.length && !approvedUseCaseIds.length) {
      toast.info(
        'Apruebe requisitos o casos de uso primero: el modelo se genera a partir de ellos.',
      );
      return;
    }
    setGenerating(true);
    try {
      setGeneration(
        await api.dataModels.generate(projectId, approvedRequirementIds, approvedUseCaseIds),
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo generar el modelo de datos.');
    } finally {
      setGenerating(false);
    }
  }

  const transitionFor = (m: DataModelResponse) => (status: ArtifactVersionStatus) =>
    api.dataModels.transition(projectId, m.id, m.version.id, status);

  async function approveOne(m: DataModelResponse) {
    setApprovingId(m.id);
    try {
      await approveDirectly(transitionFor(m));
      toast.success(`${m.code} aprobado.`);
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo aprobar el modelo de datos.');
    } finally {
      setApprovingId(null);
    }
  }

  async function transition(m: DataModelResponse, status: ArtifactVersionStatus) {
    try {
      await transitionFor(m)(status);
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
      const diagram = await api.dataModels.getDiagram(projectId, id);
      setDiagrams((prev) => ({ ...prev, [id]: diagram }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo mostrar el diagrama.');
    }
  }

  const items = dataModels.data?.items ?? [];
  const pending = items.filter((m) => isPendingApproval(m.version.status));

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Modelo de datos" projectId={projectId} />

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={generating} onClick={generate}>
            <Sparkles className="size-4" aria-hidden="true" />
            {generating ? 'Generando…' : 'Generar con IA'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEditing(null);
              setShowManualForm((v) => !v);
            }}
          >
            Crear manualmente
          </Button>
          <div className="ml-auto">
            <ApproveAllButton
              pending={pending}
              approve={(id) => approveDirectly(transitionFor(items.find((m) => m.id === id)!))}
              onDone={invalidate}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          La IA usa los requisitos y casos de uso aprobados. {AI_UNAVAILABLE_HINT}
        </p>
      </section>

      {showManualForm || editing ? (
        <DataModelManualForm
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
            await api.dataModels.accept(projectId, generation.id, ids);
            invalidate();
          }}
          onDismiss={() => setGeneration(null)}
        />
      ) : null}

      <QueryState isLoading={dataModels.isLoading} error={dataModels.error}>
        {items.length === 0 ? (
          <EmptyState title="Aún no hay un modelo de datos">
            Genérelo con IA a partir de los requisitos y casos de uso aprobados, o defina las
            entidades manualmente.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((m) => (
              <li key={m.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{m.code}</span>{' '}
                    <span className="font-medium text-foreground">{m.dataModel.title}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {m.dataModel.entities.length}{' '}
                      {m.dataModel.entities.length === 1 ? 'entidad' : 'entidades'} ·{' '}
                      {m.dataModel.relationships.length}{' '}
                      {m.dataModel.relationships.length === 1 ? 'relación' : 'relaciones'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={m.version.status} />
                    {isPendingApproval(m.version.status) ? (
                      <button
                        type="button"
                        onClick={() => approveOne(m)}
                        disabled={approvingId === m.id}
                        className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {approvingId === m.id ? 'Aprobando…' : 'Aprobar'}
                      </button>
                    ) : null}
                    {m.version.status === 'IN_REVIEW' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => transition(m, 'APPROVED')}
                          className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700"
                        >
                          Aprobar
                        </button>
                        <button
                          type="button"
                          onClick={() => transition(m, 'CHANGES_REQUESTED')}
                          className="rounded-md border border-destructive/40 px-3 py-1 text-sm text-destructive hover:bg-destructive/5"
                        >
                          Solicitar cambios
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setShowManualForm(false);
                        setEditing(m);
                      }}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted/40"
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                      Editar
                    </button>
                    <ArchiveButton
                      projectId={projectId}
                      artifactId={m.id}
                      code={m.code}
                      onDone={invalidate}
                    />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                    className="text-muted-foreground underline"
                  >
                    {expandedId === m.id ? 'Ocultar entidades' : 'Ver entidades'}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleDiagram(m.id)}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    {diagrams[m.id] ? (
                      <EyeOff className="size-4" aria-hidden="true" />
                    ) : (
                      <Eye className="size-4" aria-hidden="true" />
                    )}
                    {diagrams[m.id] ? 'Ocultar diagrama' : 'Ver diagrama entidad-relación'}
                  </button>
                </div>
                {expandedId === m.id ? (
                  <ul className="mt-2 flex flex-col gap-1 border-t border-border pt-2 text-sm">
                    {m.dataModel.entities.map((e) => (
                      <li key={e.localId}>
                        <strong>{e.name}</strong>
                        {e.description ? ` — ${e.description}` : ''}
                        <span className="text-muted-foreground">
                          {' '}
                          ({e.attributes.map((a) => a.name).join(', ')})
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {diagrams[m.id] ? (
                  <DiagramViewer
                    svg={diagrams[m.id]!.svg}
                    source={diagrams[m.id]!.source}
                    sourceFormat={diagrams[m.id]!.sourceFormat}
                    code={m.code}
                    caption={`Diagrama entidad-relación de ${m.code}`}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}

export default function DataModelPage() {
  return (
    <RequireActiveProject>
      {(projectId) => <DataModelContent projectId={projectId} />}
    </RequireActiveProject>
  );
}
