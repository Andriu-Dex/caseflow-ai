'use client';

import { GenerationOverlay } from '../../components/generation-overlay';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RequirementResponse } from '@caseflow-ai/contracts';
import { ChevronDown, Download, ExternalLink, FileDown, Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@caseflow-ai/ui';
import {
  api,
  ApiError,
  downloadFile,
  openFileInNewTab,
  type ArtifactVersionStatus,
  type GenerationResult,
} from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';
import { PageHeading } from '../../components/page-heading';
import { CandidateReview } from '../../components/candidate-review';
import {
  RequirementCandidateCard,
  defaultRequirementSelection,
  requirementDependencies,
} from '../../components/requirement-candidate-card';
import { ContextCoverageSummary } from '../../components/context-coverage';
import { RequirementManualForm } from '../../components/requirement-manual-form';
import { RequirementList, RequirementsSummary } from '../../components/requirement-list';
import {
  AiUnavailableHint,
  ApproveAllButton,
  EmptyState,
  approveDirectly,
  isPendingApproval,
  useStaleArtifactIds,
} from '../../components/artifact-actions';

// PDF opens in a new tab, where the browser's own viewer previews it; Word
// has no in-browser preview, so it stays a direct download.
async function exportRequirements(projectId: string, format: 'pdf' | 'docx') {
  try {
    const url = api.requirements.exportUrl(projectId, format);
    if (format === 'pdf') await openFileInNewTab(url);
    else await downloadFile(url, `requisitos-${projectId}.docx`);
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'No se pudo exportar los requisitos.');
  }
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
  const coverage = useQuery({
    queryKey: ['requirements-coverage', projectId],
    queryFn: () => api.requirements.contextCoverage(projectId),
  });
  const stale = useStaleArtifactIds(projectId);

  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [editing, setEditing] = useState<RequirementResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const contextApproved = context.data?.version.status === 'APPROVED';

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['requirements', projectId] });
    queryClient.invalidateQueries({ queryKey: ['requirements-quality', projectId] });
    queryClient.invalidateQueries({ queryKey: ['requirements-coverage', projectId] });
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
      if (r.version.status === 'IN_REVIEW') await transitionFor(r)('APPROVED');
      else await approveDirectly(transitionFor(r));
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

  async function archive(r: RequirementResponse) {
    try {
      await api.artifacts.archive(projectId, r.id);
      toast.success(`${r.code} archivado.`);
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo archivar.');
      throw err;
    }
  }

  const items = requirements.data?.items ?? [];
  const pending = items.filter((r) => isPendingApproval(r.version.status));
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

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" disabled={generating} onClick={handleGenerate}>
            <Sparkles className="size-4" aria-hidden="true" />
            {generating ? 'Generando…' : 'Generar con IA'}
          </Button>
          <GenerationOverlay open={generating} />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEditing(null);
              setShowManualForm((v) => !v);
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Crear manualmente
          </Button>
          <ApproveAllButton
            pending={pending}
            approve={(id) => approveDirectly(transitionFor(items.find((r) => r.id === id)!))}
            onDone={invalidate}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="ml-auto"
                disabled={items.length === 0}
              >
                <FileDown className="size-4" aria-hidden="true" />
                Exportar aprobados
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => exportRequirements(projectId, 'pdf')}>
                <ExternalLink aria-hidden="true" />
                Ver en PDF
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportRequirements(projectId, 'docx')}>
                <Download aria-hidden="true" />
                Descargar Word
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <AiUnavailableHint />
        {items.length ? (
          <RequirementsSummary
            items={items}
            coverage={coverage.data}
            // While proposals are reviewed, their own summary says what is missing.
            showMissing={!generation}
          />
        ) : null}
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
          // Ideas beyond the context start unselected (DEC-126).
          defaultSelected={defaultRequirementSelection(generation.candidates)}
          summary={(selected) => (
            <ContextCoverageSummary
              subject="Las propuestas seleccionadas"
              items={(generation.coverage ?? []).map((item) => ({
                ...item,
                covered: item.coveredBy.some((id) => selected.includes(id)),
              }))}
            />
          )}
          optional={{
            title: 'Ideas para mejorar tu software',
            description:
              'La IA sugiere estas funciones aunque el contexto no las pide. Incorpore solo las que le aporten valor.',
            matches: (c) => c.suggested === true,
          }}
          describe={(c) =>
            `${c.requirementType === 'FUNCTIONAL' ? 'Funcional' : 'No funcional'} — ${c.name}: ${String(c.description ?? '').slice(0, 160)}`
          }
          renderCard={(c, index) => (
            <RequirementCandidateCard
              candidate={c}
              index={index}
              nameOf={(id) =>
                generation.candidates.find((x) => x.id === id)?.name ?? 'otra propuesta'
              }
              contextItems={
                new Map(
                  (generation.coverage ?? []).map((item) => [
                    item.code,
                    { kind: item.kind, description: item.description },
                  ]),
                )
              }
            />
          )}
          filters={[
            {
              id: 'functional',
              label: 'Funcionales',
              matches: (c) => c.requirementType === 'FUNCTIONAL',
            },
            {
              id: 'non-functional',
              label: 'No funcionales',
              matches: (c) => c.requirementType === 'NON_FUNCTIONAL',
            },
            { id: 'high', label: 'Prioridad alta', matches: (c) => c.priority === 'HIGH' },
          ]}
          dependenciesOf={requirementDependencies}
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
          <RequirementList
            items={items}
            issuesOf={(id) => issuesByRequirement.get(id) ?? []}
            isStale={(id) => stale.has(id)}
            approvingId={approvingId}
            actions={{
              approve: approveOne,
              requestChanges: (r) => transition(r, 'CHANGES_REQUESTED'),
              edit: (r) => {
                setShowManualForm(false);
                setEditing(r);
              },
              archive,
            }}
          />
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
