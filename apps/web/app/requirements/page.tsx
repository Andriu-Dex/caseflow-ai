'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError, type GenerationResult } from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';
import { StatusBadge } from '../../components/status-badge';
import { CandidateReview } from '../../components/candidate-review';
import { RequirementManualForm } from '../../components/requirement-manual-form';

function RequirementsContent({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const requirements = useQuery({
    queryKey: ['requirements', projectId],
    queryFn: () => api.requirements.list(projectId),
  });
  const quality = useQuery({
    queryKey: ['requirements-quality', projectId],
    queryFn: () => api.requirements.qualityReport(projectId),
  });
  const context = useQuery({
    queryKey: ['context', projectId],
    queryFn: () => api.context.getCurrent(projectId),
    retry: false,
  });

  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openDetail, setOpenDetail] = useState<string | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['requirements', projectId] });
    queryClient.invalidateQueries({ queryKey: ['requirements-quality', projectId] });
  }

  async function handleGenerate() {
    setError(null);
    if (!context.data || context.data.version.status !== 'APPROVED') {
      setError('Apruebe el Contexto del Proyecto antes de generar Requisitos.');
      return;
    }
    try {
      const result = await api.requirements.generate(projectId, context.data.version.id);
      setGeneration(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo generar (¿IA deshabilitada?).');
    }
  }

  async function transition(
    requirementId: string,
    versionId: string,
    status: 'IN_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED',
  ) {
    try {
      await api.requirements.transition(projectId, requirementId, versionId, status);
      invalidate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    }
  }

  const items = requirements.data?.items ?? [];
  const rf = items.filter((r) => r.requirement.requirementType === 'FUNCTIONAL').length;
  const rnf = items.filter((r) => r.requirement.requirementType === 'NON_FUNCTIONAL').length;
  const warningCount = quality.data?.issues.length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-gray-900">Requisitos</h1>

      <section className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 text-sm">
        <span>
          <strong>{rf}</strong> RF
        </span>
        <span>
          <strong>{rnf}</strong> RNF
        </span>
        <span className="text-amber-700">
          <strong>{warningCount}</strong> advertencia(s) de calidad (ISO/IEC/IEEE 29148:2018)
        </span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={handleGenerate}
            className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50"
          >
            Generar con IA
          </button>
          <button
            type="button"
            onClick={() => setShowManualForm((v) => !v)}
            className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50"
          >
            Crear manualmente
          </button>
        </div>
      </section>
      <p className="-mt-4 text-xs text-gray-500">
        La generación con IA requiere un proveedor configurado. Si no está disponible, use
        &quot;Crear manualmente&quot;.
      </p>

      {showManualForm ? (
        <RequirementManualForm
          projectId={projectId}
          onCreated={() => {
            invalidate();
            setShowManualForm(false);
          }}
          onCancel={() => setShowManualForm(false)}
        />
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {generation ? (
        <CandidateReview
          generation={generation}
          describe={(c) =>
            `${c.requirementType === 'FUNCTIONAL' ? 'RF' : 'RNF'} — ${c.name}: ${String(c.description ?? '').slice(0, 140)}`
          }
          onAccept={async (ids) => {
            await api.requirements.accept(projectId, generation.id, ids);
            invalidate();
          }}
          onDismiss={() => setGeneration(null)}
        />
      ) : null}

      <QueryState isLoading={requirements.isLoading} error={requirements.error}>
        {items.length === 0 ? (
          <p className="text-sm text-gray-500">
            No hay requisitos todavía. Genérelos con IA (requiere Contexto APPROVED) o continúe con
            el flujo manual una vez disponible.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((r) => (
              <li key={r.id} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-mono text-xs text-gray-500">{r.code}</span>{' '}
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium">
                      {r.requirement.requirementType === 'FUNCTIONAL' ? 'RF' : 'RNF'}
                    </span>{' '}
                    <span className="font-medium text-gray-900">{r.requirement.name}</span>{' '}
                    <span className="text-xs text-gray-500">({r.requirement.priority})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={r.version.status} />
                    <button
                      type="button"
                      onClick={() => setOpenDetail(openDetail === r.id ? null : r.id)}
                      className="text-sm text-gray-600 underline"
                    >
                      {openDetail === r.id ? 'Ocultar' : 'Detalle'}
                    </button>
                  </div>
                </div>
                {openDetail === r.id ? (
                  <div className="mt-2 flex flex-col gap-2 border-t border-gray-100 pt-2 text-sm text-gray-700">
                    <p>{r.requirement.description}</p>
                    {r.requirement.actors.length ? (
                      <p>
                        <strong>Actores:</strong> {r.requirement.actors.join(', ')}
                      </p>
                    ) : null}
                    {r.requirement.preconditions.length ? (
                      <p>
                        <strong>Precondiciones:</strong> {r.requirement.preconditions.join('; ')}
                      </p>
                    ) : null}
                    {r.requirement.postconditions.length ? (
                      <p>
                        <strong>Postcondiciones:</strong> {r.requirement.postconditions.join('; ')}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {r.version.status === 'DRAFT' || r.version.status === 'GENERATED' ? (
                        <button
                          type="button"
                          onClick={() => transition(r.id, r.version.id, 'IN_REVIEW')}
                          className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
                        >
                          Enviar a revisión
                        </button>
                      ) : null}
                      {r.version.status === 'IN_REVIEW' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => transition(r.id, r.version.id, 'APPROVED')}
                            className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700"
                          >
                            Aprobar
                          </button>
                          <button
                            type="button"
                            onClick={() => transition(r.id, r.version.id, 'CHANGES_REQUESTED')}
                            className="rounded-md border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
                          >
                            Solicitar cambios
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}

export default function RequirementsPage() {
  return (
    <RequireActiveProject>
      {(projectId) => <RequirementsContent projectId={projectId} />}
    </RequireActiveProject>
  );
}
