'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DiagramResponse, UseCaseResponse } from '@caseflow-ai/contracts';
import { Network, Pencil, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@caseflow-ai/ui';
import { api, ApiError, type ArtifactVersionStatus, type GenerationResult } from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';
import { StatusBadge } from '../../components/status-badge';
import { CandidateReview } from '../../components/candidate-review';
import { DiagramViewer } from '../../components/diagram-viewer';
import { UseCaseManualForm } from '../../components/use-case-manual-form';
import { PageHeading } from '../../components/page-heading';
import {
  AI_UNAVAILABLE_HINT,
  ApproveAllButton,
  ArchiveButton,
  EmptyState,
  StaleNotice,
  approveDirectly,
  isPendingApproval,
  useStaleArtifactIds,
} from '../../components/artifact-actions';

function UseCasesContent({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const useCases = useQuery({
    queryKey: ['use-cases', projectId],
    queryFn: () => api.useCases.list(projectId),
  });
  const requirements = useQuery({
    queryKey: ['requirements', projectId],
    queryFn: () => api.requirements.list(projectId),
  });
  const stale = useStaleArtifactIds(projectId);

  // null = "no manual selection yet", so every approved requirement is
  // selected by default — avoids re-checking boxes for requirements the user
  // already approved one screen ago. Becomes an explicit array the moment
  // the user toggles anything, so their choice is never silently overridden.
  const [selected, setSelected] = useState<string[] | null>(null);
  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const [diagram, setDiagram] = useState<DiagramResponse | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [editing, setEditing] = useState<UseCaseResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingDiagram, setGeneratingDiagram] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const approvedRequirements = (requirements.data?.items ?? []).filter(
    (r) => r.version.status === 'APPROVED',
  );
  const allRequirementIds = approvedRequirements.map((r) => r.version.id);
  const selectedRequirements = selected ?? allRequirementIds;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['use-cases', projectId] });
    queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
    queryClient.invalidateQueries({ queryKey: ['staleness', projectId] });
  }

  async function generate() {
    if (!selectedRequirements.length) {
      toast.info('Seleccione al menos un requisito aprobado para generar casos de uso.');
      return;
    }
    setGenerating(true);
    try {
      setGeneration(await api.useCases.generate(projectId, selectedRequirements));
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'No se pudieron generar los casos de uso.',
      );
    } finally {
      setGenerating(false);
    }
  }

  const transitionFor = (u: UseCaseResponse) => (status: ArtifactVersionStatus) =>
    api.useCases.transition(projectId, u.id, u.version.id, status);

  async function approveOne(u: UseCaseResponse) {
    setApprovingId(u.id);
    try {
      await approveDirectly(transitionFor(u));
      toast.success(`${u.code} aprobado.`);
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo aprobar el caso de uso.');
    } finally {
      setApprovingId(null);
    }
  }

  async function transition(u: UseCaseResponse, status: ArtifactVersionStatus) {
    try {
      await transitionFor(u)(status);
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    }
  }

  const items = useCases.data?.items ?? [];
  const pending = items.filter((u) => isPendingApproval(u.version.status));
  const approvedVersionIds = items
    .filter((u) => u.version.status === 'APPROVED')
    .map((u) => u.version.id);

  async function generateDiagram() {
    setGeneratingDiagram(true);
    try {
      setDiagram(await api.useCaseDiagrams.generate(projectId, approvedVersionIds));
      queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
      toast.success('Diagrama de casos de uso generado.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo generar el diagrama.');
    } finally {
      setGeneratingDiagram(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Casos de uso" projectId={projectId} />

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Generar casos de uso con IA</h2>
          <ApproveAllButton
            pending={pending}
            approve={(id) => approveDirectly(transitionFor(items.find((u) => u.id === id)!))}
            onDone={invalidate}
          />
        </div>
        {approvedRequirements.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Cuando haya requisitos aprobados podrá elegirlos aquí como base para generar casos de
            uso.
          </p>
        ) : (
          <>
            <div className="mb-1 flex justify-end">
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() =>
                  setSelected(
                    selectedRequirements.length === allRequirementIds.length
                      ? []
                      : allRequirementIds,
                  )
                }
              >
                {selectedRequirements.length === allRequirementIds.length
                  ? 'Quitar selección'
                  : 'Seleccionar todos'}
              </button>
            </div>
            <ul className="mb-2 flex max-h-64 flex-col gap-1 overflow-y-auto text-sm">
              {approvedRequirements.map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`req-${r.id}`}
                    checked={selectedRequirements.includes(r.version.id)}
                    onChange={() =>
                      setSelected(
                        selectedRequirements.includes(r.version.id)
                          ? selectedRequirements.filter((id) => id !== r.version.id)
                          : [...selectedRequirements, r.version.id],
                      )
                    }
                  />
                  <label htmlFor={`req-${r.id}`}>
                    {r.code} — {r.requirement.name}
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={generating || approvedRequirements.length === 0}
            onClick={generate}
          >
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
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{AI_UNAVAILABLE_HINT}</p>
      </section>

      {showManualForm || editing ? (
        <UseCaseManualForm
          key={editing?.id ?? 'new'}
          projectId={projectId}
          approvedRequirements={approvedRequirements}
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
          describe={(c) => `${c.name}: ${String(c.objective ?? '').slice(0, 160)}`}
          onAccept={async (ids) => {
            await api.useCases.accept(projectId, generation.id, ids);
            invalidate();
          }}
          onDismiss={() => setGeneration(null)}
        />
      ) : null}

      <QueryState isLoading={useCases.isLoading} error={useCases.error}>
        {items.length === 0 ? (
          <EmptyState title="Aún no hay casos de uso">
            Genérelos con IA a partir de los requisitos aprobados, o créelos manualmente.
          </EmptyState>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {items.map((u) => (
                <li key={u.id} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm">
                      <span className="font-mono text-xs text-muted-foreground">{u.code}</span>{' '}
                      <span className="font-medium text-foreground">{u.useCase.name}</span>{' '}
                      <span className="text-xs text-muted-foreground">
                        · {u.useCase.primaryActor}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={u.version.status} />
                      {isPendingApproval(u.version.status) ? (
                        <button
                          type="button"
                          onClick={() => approveOne(u)}
                          disabled={approvingId === u.id}
                          className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {approvingId === u.id ? 'Aprobando…' : 'Aprobar'}
                        </button>
                      ) : null}
                      {u.version.status === 'IN_REVIEW' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => transition(u, 'APPROVED')}
                            className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700"
                          >
                            Aprobar
                          </button>
                          <button
                            type="button"
                            onClick={() => transition(u, 'CHANGES_REQUESTED')}
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
                          setEditing(u);
                        }}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted/40"
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                        Editar
                      </button>
                      <ArchiveButton
                        projectId={projectId}
                        artifactId={u.id}
                        code={u.code}
                        onDone={invalidate}
                      />
                    </div>
                  </div>
                  {stale.has(u.id) ? <StaleNotice /> : null}
                </li>
              ))}
            </ul>

            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Network className="size-4 text-primary" aria-hidden="true" />
                Diagrama de casos de uso
              </h2>
              {approvedVersionIds.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  El diagrama se genera a partir de los casos de uso aprobados.
                </p>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="mb-2"
                  disabled={generatingDiagram}
                  onClick={generateDiagram}
                >
                  {generatingDiagram
                    ? 'Generando…'
                    : `Generar diagrama (${approvedVersionIds.length} aprobados)`}
                </Button>
              )}
              {diagram ? (
                <DiagramViewer
                  svg={diagram.svg}
                  source={diagram.source}
                  sourceFormat={diagram.sourceFormat}
                  code={diagram.code}
                  caption="Diagrama de casos de uso aprobados"
                  onSaveEdit={async (source) => {
                    setDiagram(
                      await api.useCaseDiagrams.createManualVersion(projectId, diagram.id, source),
                    );
                    queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
                  }}
                />
              ) : null}
            </section>
          </>
        )}
      </QueryState>
    </div>
  );
}

export default function UseCasesPage() {
  return (
    <RequireActiveProject>
      {(projectId) => <UseCasesContent projectId={projectId} />}
    </RequireActiveProject>
  );
}
