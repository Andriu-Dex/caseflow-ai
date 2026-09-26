'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@caseflow-ai/ui';
import { api, ApiError, type GenerationResult } from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';
import { StatusBadge } from '../../components/status-badge';
import { CandidateReview } from '../../components/candidate-review';
import { TrustedDiagram } from '../../components/trusted-svg';
import { UseCaseManualForm } from '../../components/use-case-manual-form';
import { PageHeading } from '../../components/page-heading';

function UseCasesContent({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const useCases = useQuery({
    queryKey: ['use-cases', projectId],
    queryFn: () => api.useCases.list(projectId),
  });
  const validation = useQuery({
    queryKey: ['use-cases-academic', projectId],
    queryFn: () => api.useCases.academicValidation(projectId),
  });
  const requirements = useQuery({
    queryKey: ['requirements', projectId],
    queryFn: () => api.requirements.list(projectId),
  });

  const [selectedRequirements, setSelectedRequirements] = useState<string[]>([]);
  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const [diagram, setDiagram] = useState<{ svg: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingDiagram, setGeneratingDiagram] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const approvedRequirements = (requirements.data?.items ?? []).filter(
    (r) => r.version.status === 'APPROVED',
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['use-cases', projectId] });
    queryClient.invalidateQueries({ queryKey: ['use-cases-academic', projectId] });
    queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
  }

  async function generate() {
    setError(null);
    if (!selectedRequirements.length) {
      setError('Seleccione al menos un Requisito APPROVED.');
      return;
    }
    setGenerating(true);
    try {
      const result = await api.useCases.generate(projectId, selectedRequirements);
      setGeneration(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo generar (¿IA deshabilitada?).');
    } finally {
      setGenerating(false);
    }
  }

  async function transition(
    id: string,
    versionId: string,
    status: 'IN_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED',
  ) {
    try {
      await api.useCases.transition(projectId, id, versionId, status);
      invalidate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    }
  }

  async function approveDirectly(id: string, versionId: string) {
    setError(null);
    setApprovingId(id);
    try {
      await api.useCases.transition(projectId, id, versionId, 'IN_REVIEW');
      await api.useCases.transition(projectId, id, versionId, 'APPROVED');
      invalidate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo aprobar el caso de uso.');
    } finally {
      setApprovingId(null);
    }
  }

  const items = useCases.data?.items ?? [];
  const approvedVersionIds = items
    .filter((u) => u.version.status === 'APPROVED')
    .map((u) => u.version.id);

  async function generateDiagram() {
    setError(null);
    setGeneratingDiagram(true);
    try {
      const result = await api.useCaseDiagrams.generate(projectId, approvedVersionIds);
      setDiagram(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo generar el diagrama.');
    } finally {
      setGeneratingDiagram(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Casos de uso" projectId={projectId} />

      {validation.data ? (
        <section className="rounded-lg border border-border bg-card p-4 text-sm">
          <strong>{validation.data.approvedCount}</strong> / {validation.data.minimumRequired} casos
          de uso aprobados (mínimo académico para este entregable — no es un máximo del producto).
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Generar Casos de Uso con IA</h2>
        {approvedRequirements.length === 0 ? (
          <p className="text-sm text-muted-foreground">Se requieren Requisitos APPROVED.</p>
        ) : (
          <ul className="mb-2 flex flex-col gap-1 text-sm">
            {approvedRequirements.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`req-${r.id}`}
                  checked={selectedRequirements.includes(r.version.id)}
                  onChange={() =>
                    setSelectedRequirements((prev) =>
                      prev.includes(r.version.id)
                        ? prev.filter((id) => id !== r.version.id)
                        : [...prev, r.version.id],
                    )
                  }
                />
                <label htmlFor={`req-${r.id}`}>
                  {r.code} — {r.requirement.name}
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={generating} onClick={generate}>
            {generating ? 'Generando…' : 'Generar con IA'}
          </Button>
          <Button type="button" variant="outline" onClick={() => setShowManualForm((v) => !v)}>
            Crear manualmente
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          La generación con IA requiere un proveedor configurado. Si no está disponible, use
          &quot;Crear manualmente&quot;.
        </p>
      </section>

      {showManualForm ? (
        <UseCaseManualForm
          projectId={projectId}
          approvedRequirements={approvedRequirements}
          onCreated={() => {
            invalidate();
            setShowManualForm(false);
          }}
          onCancel={() => setShowManualForm(false)}
        />
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {generation ? (
        <CandidateReview
          generation={generation}
          describe={(c) => `${c.name}: ${String(c.objective ?? '').slice(0, 140)}`}
          onAccept={async (ids) => {
            await api.useCases.accept(projectId, generation.id, ids);
            invalidate();
          }}
          onDismiss={() => setGeneration(null)}
        />
      ) : null}

      <QueryState isLoading={useCases.isLoading} error={useCases.error}>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay casos de uso todavía.</p>
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
                        ({u.useCase.primaryActor})
                      </span>
                    </div>
                    <StatusBadge status={u.version.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {u.version.status === 'DRAFT' || u.version.status === 'GENERATED' ? (
                      // "Enviar a revisión" stays hidden until multi-user
                      // review ships (see sources/page.tsx); approveDirectly
                      // still drives IN_REVIEW.
                      <button
                        type="button"
                        onClick={() => approveDirectly(u.id, u.version.id)}
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
                          onClick={() => transition(u.id, u.version.id, 'APPROVED')}
                          className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700"
                        >
                          Aprobar
                        </button>
                        <button
                          type="button"
                          onClick={() => transition(u.id, u.version.id, 'CHANGES_REQUESTED')}
                          className="rounded-md border border-destructive/40 px-3 py-1 text-sm text-destructive hover:bg-destructive/5"
                        >
                          Solicitar cambios
                        </button>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>

            {approvedVersionIds.length > 0 ? (
              <section className="rounded-lg border border-border bg-card p-4">
                <h2 className="mb-2 text-sm font-semibold text-foreground">
                  Diagrama de casos de uso
                </h2>
                <Button
                  type="button"
                  variant="outline"
                  className="mb-2"
                  disabled={generatingDiagram}
                  onClick={generateDiagram}
                >
                  {generatingDiagram ? 'Generando…' : 'Generar diagrama a partir de los aprobados'}
                </Button>
                {diagram ? (
                  <TrustedDiagram svg={diagram.svg} caption="Diagrama de casos de uso aprobados" />
                ) : null}
              </section>
            ) : null}
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
