'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MockupResponse } from '@caseflow-ai/contracts';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@caseflow-ai/ui';
import { api, ApiError, type ArtifactVersionStatus } from '../../../lib/api';
import { QueryState, RequireActiveProject } from '../../../components/query-state';
import { PageHeading } from '../../../components/page-heading';
import { StatusBadge } from '../../../components/status-badge';
import { TrustedDiagram } from '../../../components/trusted-svg';
import {
  ApproveAllButton,
  ArchiveButton,
  EmptyState,
  approveDirectly,
  isPendingApproval,
} from '../../../components/artifact-actions';

function MockupPreview({ mockupId, projectId }: { mockupId: string; projectId: string }) {
  const preview = useQuery({
    queryKey: ['mockup-preview', projectId, mockupId],
    queryFn: () => api.mockups.getPreview(projectId, mockupId),
  });
  if (preview.isLoading)
    return <p className="text-sm text-muted-foreground">Cargando vista previa…</p>;
  if (!preview.data) return null;
  return <TrustedDiagram svg={preview.data.svg} caption="Boceto de la interfaz" />;
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
  const [creatingVersionId, setCreatingVersionId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const approvedBlueprints = (blueprints.data?.items ?? []).filter(
    (b) => b.version.status === 'APPROVED',
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['mockups', projectId] });
    queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
  }

  async function createMockup(uiBlueprintVersionId: string) {
    setCreatingVersionId(uiBlueprintVersionId);
    try {
      await api.mockups.create(projectId, uiBlueprintVersionId);
      toast.success('Boceto generado.');
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo generar el boceto.');
    } finally {
      setCreatingVersionId(null);
    }
  }

  const transitionFor = (m: MockupResponse) => (status: ArtifactVersionStatus) =>
    api.mockups.transition(projectId, m.id, m.version.id, status);

  async function approveOne(m: MockupResponse) {
    setApprovingId(m.id);
    try {
      await approveDirectly(transitionFor(m));
      toast.success(`${m.code} aprobado.`);
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo aprobar el boceto.');
    } finally {
      setApprovingId(null);
    }
  }

  async function transition(m: MockupResponse, status: ArtifactVersionStatus) {
    try {
      await transitionFor(m)(status);
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    }
  }

  const items = mockups.data?.items ?? [];
  const pending = items.filter((m) => isPendingApproval(m.version.status));

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Mockups" projectId={projectId} />
      <p className="text-sm text-muted-foreground">
        Cada boceto se genera a partir de un UI Blueprint aprobado y muestra cómo se organizarán las
        pantallas. Si cambia el blueprint, genere un boceto nuevo.
      </p>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Generar boceto</h2>
          <ApproveAllButton
            pending={pending}
            approve={(id) => approveDirectly(transitionFor(items.find((m) => m.id === id)!))}
            onDone={invalidate}
          />
        </div>
        {approvedBlueprints.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Cuando tenga un UI Blueprint aprobado podrá generar aquí su boceto.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {approvedBlueprints.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2">
                <span>
                  <span className="font-mono text-xs text-muted-foreground">{b.code}</span>{' '}
                  {b.title}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={creatingVersionId === b.version.id}
                  onClick={() => createMockup(b.version.id)}
                >
                  {creatingVersionId === b.version.id ? 'Generando…' : 'Generar boceto'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <QueryState isLoading={mockups.isLoading} error={mockups.error}>
        {items.length === 0 ? (
          <EmptyState title="Aún no hay bocetos">
            Genere un boceto a partir de un UI Blueprint aprobado.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-4">
            {items.map((m) => (
              <li key={m.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{m.code}</span>
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
                    <ArchiveButton
                      projectId={projectId}
                      artifactId={m.id}
                      code={m.code}
                      onDone={invalidate}
                    />
                  </div>
                </div>
                <div className="mt-2">
                  <MockupPreview mockupId={m.id} projectId={projectId} />
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
