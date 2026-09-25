'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '../../../lib/api';
import { QueryState, RequireActiveProject } from '../../../components/query-state';
import { StatusBadge } from '../../../components/status-badge';
import { TrustedDiagram } from '../../../components/trusted-svg';

function MockupCard({ mockupId, projectId }: { mockupId: string; projectId: string }) {
  const preview = useQuery({
    queryKey: ['mockup-preview', projectId, mockupId],
    queryFn: () => api.mockups.getPreview(projectId, mockupId),
  });
  if (preview.isLoading) return <p className="text-sm text-gray-500">Cargando vista previa…</p>;
  if (!preview.data) return null;
  return (
    <TrustedDiagram
      svg={preview.data.svg}
      caption="Vista previa generada — no es una captura real"
    />
  );
}

function MockupsContent({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const mockups = useQuery({
    queryKey: ['mockups', projectId],
    queryFn: () => api.mockups.list(projectId),
  });
  const blueprints = useQuery({
    queryKey: ['structured-analysis', 'UI_BLUEPRINT', projectId],
    queryFn: () => api.structuredAnalysis.list(projectId, 'UI_BLUEPRINT'),
  });
  const [error, setError] = useState<string | null>(null);
  const approvedBlueprints = (blueprints.data?.items ?? []).filter(
    (b) => b.version.status === 'APPROVED',
  );

  async function createMockup(uiBlueprintVersionId: string) {
    setError(null);
    try {
      await api.mockups.create(projectId, uiBlueprintVersionId);
      queryClient.invalidateQueries({ queryKey: ['mockups', projectId] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo generar el mockup.');
    }
  }

  async function transition(
    id: string,
    versionId: string,
    status: 'IN_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED',
  ) {
    try {
      await api.mockups.transition(projectId, id, versionId, status);
      queryClient.invalidateQueries({ queryKey: ['mockups', projectId] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-gray-900">Mockups</h1>
      <p className="text-sm text-gray-500">
        Un Mockup es una vista previa determinística generada a partir de un UI Blueprint aprobado —
        nunca una captura de pantalla real.
      </p>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Generar Mockup</h2>
        {approvedBlueprints.length === 0 ? (
          <p className="text-sm text-gray-500">Se requiere un UI Blueprint APPROVED.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {approvedBlueprints.map((b) => (
              <li key={b.id} className="flex items-center justify-between">
                <span>
                  {b.code} — {b.title}
                </span>
                <button
                  type="button"
                  onClick={() => createMockup(b.version.id)}
                  className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
                >
                  Generar Mockup
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <QueryState isLoading={mockups.isLoading} error={mockups.error}>
        {mockups.data && mockups.data.items.length === 0 ? (
          <p className="text-sm text-gray-500">No hay Mockups todavía.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {mockups.data?.items.map((m) => (
              <li key={m.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-gray-500">{m.code}</span>
                  <StatusBadge status={m.version.status} />
                </div>
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
                </div>
                <div className="mt-2">
                  <MockupCard mockupId={m.id} projectId={projectId} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}

export default function MockupsPage() {
  return (
    <RequireActiveProject>
      {(projectId) => <MockupsContent projectId={projectId} />}
    </RequireActiveProject>
  );
}
