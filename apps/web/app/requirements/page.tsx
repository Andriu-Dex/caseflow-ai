'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RequirementResponse } from '@caseflow-ai/contracts';
import { Download, Pencil, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@caseflow-ai/ui';
import { api, ApiError, type ArtifactVersionStatus, type GenerationResult } from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';
import { StatusBadge } from '../../components/status-badge';
import { PageHeading } from '../../components/page-heading';
import { CandidateReview } from '../../components/candidate-review';
import { RequirementManualForm } from '../../components/requirement-manual-form';
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

const PRIORITY_LABELS: Record<string, string> = { HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja' };

function downloadRequirements(projectId: string, format: 'pdf' | 'docx') {
  const anchor = document.createElement('a');
  anchor.href = api.requirements.exportUrl(projectId, format);
  anchor.download = `requisitos-${projectId}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

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
  const stale = useStaleArtifactIds(projectId);

  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const [openDetail, setOpenDetail] = useState<string | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [editing, setEditing] = useState<RequirementResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const contextApproved = context.data?.version.status === 'APPROVED';

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['requirements', projectId] });
    queryClient.invalidateQueries({ queryKey: ['requirements-quality', projectId] });
    queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
    queryClient.invalidateQueries({ queryKey: ['staleness', projectId] });
  }

  async function handleGenerate() {
    if (!context.data || !contextApproved) {
      toast.info(
        'Primero apruebe el Contexto del proyecto; los requisitos se generan a partir de él.',
      );
      return;
    }
    setGenerating(true);
    try {
      setGeneration(await api.requirements.generate(projectId, context.data.version.id));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudieron generar los requisitos.');
    } finally {
      setGenerating(false);
    }
  }

  const transitionFor = (r: RequirementResponse) => (status: ArtifactVersionStatus) =>
    api.requirements.transition(projectId, r.id, r.version.id, status);

  async function approveOne(r: RequirementResponse) {
    setApprovingId(r.id);
    try {
      await approveDirectly(transitionFor(r));
      toast.success(`${r.code} aprobado.`);
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo aprobar el requisito.');
    } finally {
      setApprovingId(null);
    }
  }

  async function transition(r: RequirementResponse, status: ArtifactVersionStatus) {
    try {
      await transitionFor(r)(status);
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    }
  }

  const items = requirements.data?.items ?? [];
  const pending = items.filter((r) => isPendingApproval(r.version.status));
  const rf = items.filter((r) => r.requirement.requirementType === 'FUNCTIONAL').length;
  const rnf = items.length - rf;
  const issues = quality.data?.issues ?? [];
  const issuesByRequirement = new Map<string, typeof issues>();
  for (const issue of issues) {
    issuesByRequirement.set(issue.requirementId, [
      ...(issuesByRequirement.get(issue.requirementId) ?? []),
      issue,
    ]);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Requisitos" projectId={projectId} />

      <section className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-sm">
        <div className="flex flex-wrap items-center gap-4">
          <span>
            <strong>{rf}</strong> funcionales
          </span>
          <span>
            <strong>{rnf}</strong> no funcionales
          </span>
          {issues.length ? (
            <span className="text-amber-700 dark:text-amber-400">
              <strong>{issues.length}</strong>{' '}
              {issues.length === 1 ? 'sugerencia de calidad' : 'sugerencias de calidad'}
            </span>
          ) : null}
          <div className="ml-auto flex flex-wrap gap-2">
            <ApproveAllButton
              pending={pending}
              approve={(id) => approveDirectly(transitionFor(items.find((r) => r.id === id)!))}
              onDone={invalidate}
            />
            <Button type="button" variant="outline" disabled={generating} onClick={handleGenerate}>
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
            <Button
              type="button"
              variant="outline"
              disabled={items.length === 0}
              onClick={() => downloadRequirements(projectId, 'pdf')}
            >
              <Download className="size-4" aria-hidden="true" />
              Requisitos aprobados (PDF)
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={items.length === 0}
              onClick={() => downloadRequirements(projectId, 'docx')}
            >
              <Download className="size-4" aria-hidden="true" />
              Requisitos aprobados (Word)
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{AI_UNAVAILABLE_HINT}</p>
      </section>

      {showManualForm || editing ? (
        <RequirementManualForm
          key={editing?.id ?? 'new'}
          projectId={projectId}
          existingRequirements={items}
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
          describe={(c) =>
            `${c.requirementType === 'FUNCTIONAL' ? 'Funcional' : 'No funcional'} — ${c.name}: ${String(c.description ?? '').slice(0, 160)}`
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
          <EmptyState title="Aún no hay requisitos">
            {contextApproved
              ? 'Genérelos con IA a partir del Contexto del proyecto, o créelos manualmente.'
              : 'Cuando el Contexto del proyecto esté aprobado podrá generarlos con IA. Mientras tanto, puede crearlos manualmente.'}
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((r) => (
              <li key={r.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenDetail(openDetail === r.id ? null : r.id)}
                    className="text-left text-sm"
                  >
                    <span className="font-mono text-xs text-muted-foreground">{r.code}</span>{' '}
                    <span className="font-medium text-foreground">{r.requirement.name}</span>{' '}
                    <span className="text-xs text-muted-foreground">
                      · Prioridad {PRIORITY_LABELS[r.requirement.priority]?.toLowerCase()}
                    </span>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={r.version.status} />
                    {isPendingApproval(r.version.status) ? (
                      <button
                        type="button"
                        onClick={() => approveOne(r)}
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
                          onClick={() => transition(r, 'APPROVED')}
                          className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700"
                        >
                          Aprobar
                        </button>
                        <button
                          type="button"
                          onClick={() => transition(r, 'CHANGES_REQUESTED')}
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
                        setEditing(r);
                      }}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted/40"
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                      Editar
                    </button>
                    <ArchiveButton
                      projectId={projectId}
                      artifactId={r.id}
                      code={r.code}
                      onDone={invalidate}
                    />
                  </div>
                </div>
                {stale.has(r.id) ? <StaleNotice /> : null}
                {issuesByRequirement.has(r.id) ? (
                  <ul className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                    {issuesByRequirement.get(r.id)!.map((issue, idx) => (
                      <li
                        key={`${issue.code}-${idx}`}
                        className="text-xs text-amber-700 dark:text-amber-400"
                      >
                        Sugerencia: {issue.message}
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
