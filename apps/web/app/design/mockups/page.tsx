'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@caseflow-ai/ui';
import { api, ApiError } from '../../../lib/api';
import { QueryState, RequireActiveProject } from '../../../components/query-state';
import { PageHeading } from '../../../components/page-heading';
import { StatusBadge } from '../../../components/status-badge';
import { TrustedDiagram } from '../../../components/trusted-svg';

function MockupCard({ mockupId, projectId }: { mockupId: string; projectId: string }) {
  const preview = useQuery({
    queryKey: ['mockup-preview', projectId, mockupId],
    queryFn: () => api.mockups.getPreview(projectId, mockupId),
  });
  if (preview.isLoading)
    return <p className="text-sm text-muted-foreground">Cargando vista previa…</p>;
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
  const [creatingVersionId, setCreatingVersionId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const approvedBlueprints = (blueprints.data?.items ?? []).filter(
    (b) => b.version.status === 'APPROVED',
  );

  async function createMockup(uiBlueprintVersionId: string) {
    setError(null);
    setCreatingVersionId(uiBlueprintVersionId);
    try {
      await api.mockups.create(projectId, uiBlueprintVersionId);
      queryClient.invalidateQueries({ queryKey: ['mockups', projectId] });
      queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo generar el mockup.');
    } finally {
      setCreatingVersionId(null);
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
      queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    }
  }

  async function approveDirectly(id: string, versionId: string) {
    setError(null);
    setApprovingId(id);
    try {
      await api.mockups.transition(projectId, id, versionId, 'IN_REVIEW');
      await api.mockups.transition(projectId, id, versionId, 'APPROVED');
      queryClient.invalidateQueries({ queryKey: ['mockups', projectId] });
      queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo aprobar el mockup.');
    } finally {
      setApprovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Mockups" projectId={projectId} />
      <p className="text-sm text-muted-foreground">
        Un Mockup es una vista previa determinística generada a partir de un UI Blueprint aprobado —
        nunca una captura de pantalla real.
      </p>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Generar Mockup</h2>
        {approvedBlueprints.length === 0 ? (
          <p className="text-sm text-muted-foreground">Se requiere un UI Blueprint APPROVED.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {approvedBlueprints.map((b) => (
              <li key={b.id} className="flex items-center justify-between">
                <span>
                  {b.code} — {b.title}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={creatingVersionId === b.version.id}
                  onClick={() => createMockup(b.version.id)}
                >
                  {creatingVersionId === b.version.id ? 'Generando…' : 'Generar Mockup'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <QueryState isLoading={mockups.isLoading} error={mockups.error}>
        {mockups.data && mockups.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay Mockups todavía.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {mockups.data?.items.map((m) => (
              <li key={m.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{m.code}</span>
                  <StatusBadge status={m.version.status} />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.version.status === 'DRAFT' || m.version.status === 'GENERATED' ? (
                    // "Enviar a revisión" stays hidden until multi-user review
                    // ships (see sources/page.tsx); approveDirectly still
                    // drives IN_REVIEW.
                    <button
                      type="button"
                      onClick={() => approveDirectly(m.id, m.version.id)}
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
                        onClick={() => transition(m.id, m.version.id, 'APPROVED')}
                        className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700"
                      >
                        Aprobar
                      </button>
                      <button
                        type="button"
                        onClick={() => transition(m.id, m.version.id, 'CHANGES_REQUESTED')}
                        className="rounded-md border border-destructive/40 px-3 py-1 text-sm text-destructive hover:bg-destructive/5"
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
