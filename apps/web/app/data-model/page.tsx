'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError, type GenerationResult } from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';
import { StatusBadge } from '../../components/status-badge';
import { CandidateReview } from '../../components/candidate-review';
import { TrustedDiagram } from '../../components/trusted-svg';

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
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [diagrams, setDiagrams] = useState<Record<string, string>>({});

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['data-models', projectId] });
  }

  async function generate() {
    setError(null);
    const approvedRequirementIds = (requirements.data?.items ?? [])
      .filter((r) => r.version.status === 'APPROVED')
      .map((r) => r.version.id);
    const approvedUseCaseIds = (useCases.data?.items ?? [])
      .filter((u) => u.version.status === 'APPROVED')
      .map((u) => u.version.id);
    try {
      const result = await api.dataModels.generate(
        projectId,
        approvedRequirementIds,
        approvedUseCaseIds,
      );
      setGeneration(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo generar (¿IA deshabilitada?).');
    }
  }

  async function transition(
    id: string,
    versionId: string,
    status: 'IN_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED',
  ) {
    try {
      await api.dataModels.transition(projectId, id, versionId, status);
      invalidate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    }
  }

  async function loadDiagram(id: string) {
    try {
      const diagram = await api.dataModels.getDiagram(projectId, id);
      setDiagrams((prev) => ({ ...prev, [id]: diagram.svg }));
    } catch {
      setError('No hay diagrama ER generado para este Modelo de Datos.');
    }
  }

  const items = dataModels.data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-gray-900">Modelo de datos</h1>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <button
          type="button"
          onClick={generate}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Generar Modelo de Datos con IA (a partir de Requisitos/Casos de Uso aprobados)
        </button>
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {generation ? (
        <CandidateReview
          generation={generation}
          describe={(c) => String(c.name ?? c.candidateId)}
          onAccept={async (ids) => {
            await api.dataModels.accept(projectId, generation.id, ids);
            invalidate();
          }}
          onDismiss={() => setGeneration(null)}
        />
      ) : null}

      <QueryState isLoading={dataModels.isLoading} error={dataModels.error}>
        {items.length === 0 ? (
          <p className="text-sm text-gray-500">No hay Modelo de Datos todavía.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((m) => (
              <li key={m.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-mono text-xs text-gray-500">{m.code}</span>{' '}
                    <span className="font-medium text-gray-900">{m.dataModel.title}</span>
                  </div>
                  <StatusBadge status={m.version.status} />
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {m.dataModel.entities.length} entidad(es), {m.dataModel.relationships.length}{' '}
                  relación(es)
                </p>
                <button
                  type="button"
                  onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                  className="mt-1 text-sm text-gray-600 underline"
                >
                  {expandedId === m.id ? 'Ocultar entidades' : 'Ver entidades'}
                </button>
                {expandedId === m.id ? (
                  <ul className="mt-2 flex flex-col gap-1 border-t border-gray-100 pt-2 text-sm">
                    {m.dataModel.entities.map((e) => (
                      <li key={e.localId}>
                        <strong>{e.name}</strong>
                        {e.description ? ` — ${e.description}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.version.status === 'DRAFT' || m.version.status === 'GENERATED' ? (
                    <button
                      type="button"
                      onClick={() => transition(m.id, m.version.id, 'IN_REVIEW')}
                      className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
                    >
                      Enviar a revisión
                    </button>
                  ) : null}
                  {m.version.status === 'IN_REVIEW' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => transition(m.id, m.version.id, 'APPROVED')}
                        className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700"
                      >
                        Aprobar
                      </button>
                      <button
                        type="button"
                        onClick={() => transition(m.id, m.version.id, 'CHANGES_REQUESTED')}
                        className="rounded-md border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
                      >
                        Solicitar cambios
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => loadDiagram(m.id)}
                    className="text-sm text-gray-600 underline"
                  >
                    Ver diagrama ER
                  </button>
                </div>
                {(() => {
                  const svg = diagrams[m.id];
                  return svg ? <TrustedDiagram svg={svg} /> : null;
                })()}
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
