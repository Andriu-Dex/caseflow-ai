'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@caseflow-ai/ui';
import { api, ApiError, type GenerationResult } from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';
import { StatusBadge } from '../../components/status-badge';
import { PageHeading } from '../../components/page-heading';
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
  const [generating, setGenerating] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['requirements', projectId] });
    queryClient.invalidateQueries({ queryKey: ['requirements-quality', projectId] });
    queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
  }

  async function handleGenerate() {
    setError(null);
    if (!context.data || context.data.version.status !== 'APPROVED') {
      setError('Apruebe el Contexto del Proyecto antes de generar Requisitos.');
      return;
    }
    setGenerating(true);
    try {
      const result = await api.requirements.generate(projectId, context.data.version.id);
      setGeneration(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo generar (¿IA deshabilitada?).');
    } finally {
      setGenerating(false);
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

  async function approveDirectly(requirementId: string, versionId: string) {
    setError(null);
    setApprovingId(requirementId);
    try {
      await api.requirements.transition(projectId, requirementId, versionId, 'IN_REVIEW');
      await api.requirements.transition(projectId, requirementId, versionId, 'APPROVED');
      invalidate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo aprobar el requisito.');
    } finally {
      setApprovingId(null);
    }
  }

  const items = requirements.data?.items ?? [];
  const rf = items.filter((r) => r.requirement.requirementType === 'FUNCTIONAL').length;
  const rnf = items.filter((r) => r.requirement.requirementType === 'NON_FUNCTIONAL').length;
  const issues = quality.data?.issues ?? [];
  const warningCount = issues.length;
  const issuesByRequirement = new Map<string, typeof issues>();
  for (const issue of issues) {
    const existing = issuesByRequirement.get(issue.requirementId) ?? [];
    existing.push(issue);
    issuesByRequirement.set(issue.requirementId, existing);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Requisitos" projectId={projectId} />

      <section className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4 text-sm">
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
          <Button type="button" variant="outline" disabled={generating} onClick={handleGenerate}>
            {generating ? 'Generando…' : 'Generar con IA'}
          </Button>
          <Button type="button" variant="outline" onClick={() => setShowManualForm((v) => !v)}>
            Crear manualmente
          </Button>
        </div>
      </section>
      <p className="-mt-4 text-xs text-muted-foreground">
        La generación con IA requiere un proveedor configurado. Si no está disponible, use
        &quot;Crear manualmente&quot;.
      </p>

      {showManualForm ? (
        <RequirementManualForm
          projectId={projectId}
          existingRequirements={items}
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
          <p className="text-sm text-muted-foreground">
            No hay requisitos todavía. Genérelos con IA (requiere Contexto APPROVED) o continúe con
            el flujo manual una vez disponible.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((r) => (
              <li key={r.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{r.code}</span>{' '}
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                      {r.requirement.requirementType === 'FUNCTIONAL' ? 'RF' : 'RNF'}
                    </span>{' '}
                    <span className="font-medium text-foreground">{r.requirement.name}</span>{' '}
                    <span className="text-xs text-muted-foreground">
                      ({r.requirement.priority})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={r.version.status} />
                    <button
                      type="button"
                      onClick={() => setOpenDetail(openDetail === r.id ? null : r.id)}
                      className="text-sm text-muted-foreground underline"
                    >
                      {openDetail === r.id ? 'Ocultar' : 'Detalle'}
                    </button>
                  </div>
                </div>
                {issuesByRequirement.has(r.id) ? (
                  <ul className="mt-2 flex flex-col gap-1 border-t border-amber-100 pt-2">
                    {issuesByRequirement.get(r.id)!.map((issue, idx) => (
                      <li
                        key={`${issue.code}-${idx}`}
                        className="text-xs text-amber-700"
                        title={issue.rule}
                      >
                        ⚠ {issue.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {openDetail === r.id ? (
                  <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2 text-sm text-foreground/80">
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
                        // "Enviar a revisión" stays hidden until multi-user
                        // review ships (see sources/page.tsx); approveDirectly
                        // still drives IN_REVIEW.
                        <button
                          type="button"
                          onClick={() => approveDirectly(r.id, r.version.id)}
                          disabled={approvingId === r.id}
                          className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {approvingId === r.id ? 'Aprobando…' : 'Aprobar'}
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
                            className="rounded-md border border-destructive/40 px-3 py-1 text-sm text-destructive hover:bg-destructive/5"
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
