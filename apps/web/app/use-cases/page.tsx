'use client';

import { UseCaseGenerationPanel } from '../../components/use-case-generation-panel';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  RequirementResponse,
  UseCaseBulkAction,
  UseCaseResponse,
} from '@caseflow-ai/contracts';
import { ChevronDown, Gauge, ListChecks, Network, Plus, Search, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, Input } from '@caseflow-ai/ui';
import { api, ApiError, type ArtifactVersionStatus, type GenerationResult } from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';
import { CandidateReview } from '../../components/candidate-review';
import { DiagramViewer } from '../../components/diagram-viewer';
import { UseCaseManualForm } from '../../components/use-case-manual-form';
import { UseCaseCandidateCard } from '../../components/use-case-candidate-card';
import { UseCaseList, UseCasesSummary } from '../../components/use-case-list';
import { ArchivedArtifacts } from '../../components/archived-artifacts';
import { PageHeading } from '../../components/page-heading';
import {
  AiUnavailableHint,
  ApproveAllButton,
  EmptyState,
  approveDirectly,
  isPendingApproval,
  useStaleArtifactIds,
} from '../../components/artifact-actions';

// Approved requirements to generate from, grouped by type, with a search.
function RequirementSelector({
  requirements,
  selected,
  onChange,
}: {
  requirements: RequirementResponse[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLocaleLowerCase('es');
  const all = requirements.map((r) => r.version.id);
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const groups = [
    { type: 'FUNCTIONAL', title: 'Funcionales', icon: ListChecks },
    { type: 'NON_FUNCTIONAL', title: 'No funcionales', icon: Gauge },
  ] as const;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative sm:w-72">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Buscar requisitos aprobados"
            placeholder="Buscar requisitos"
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {selected.length} de {all.length} seleccionados
        </span>
        <Button
          variant="link"
          size="sm"
          type="button"
          className="ml-auto text-xs font-medium"
          onClick={() => onChange(selected.length === all.length ? [] : all)}
        >
          {selected.length === all.length ? 'Quitar selección' : 'Seleccionar todos'}
        </Button>
      </div>
      <div className="grid max-h-80 gap-4 overflow-y-auto rounded-md border border-border p-3 md:grid-cols-2">
        {groups.map((group) => {
          const rows = requirements.filter(
            (r) =>
              r.requirement.requirementType === group.type &&
              (!q || `${r.code} ${r.requirement.name}`.toLocaleLowerCase('es').includes(q)),
          );
          if (!rows.length) return null;
          const Icon = group.icon;
          return (
            <div key={group.type} className="flex flex-col gap-1">
              <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <Icon className="size-3.5" aria-hidden="true" />
                {group.title}
              </p>
              {rows.map((r) => (
                <label
                  key={r.id}
                  className="flex cursor-pointer items-start gap-2.5 rounded px-2 py-1.5 text-sm hover:bg-muted/40 transition-colors"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                    checked={selected.includes(r.version.id)}
                    onChange={() => toggle(r.version.id)}
                    aria-label={`${r.code} ${r.requirement.name}`}
                  />
                  <span className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span className="shrink-0 font-mono text-sm font-semibold text-muted-foreground">
                      {r.code}
                    </span>
                    <span className="text-foreground/90">{r.requirement.name}</span>
                  </span>
                </label>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
  const diagrams = useQuery({
    queryKey: ['use-case-diagrams', projectId],
    queryFn: () => api.useCaseDiagrams.list(projectId),
  });
  // The list is append-only (every regeneration adds a new DIA-NNN rather
  // than replacing one — spec §218.7), ordered oldest-first: the last item
  // is the current one to show.
  const diagram = diagrams.data?.items.at(-1) ?? null;
  const stale = useStaleArtifactIds(projectId);

  // null = "no manual selection yet": every approved requirement is selected.
  const [selected, setSelected] = useState<string[] | null>(null);
  // null = "no explicit preference yet": open only while there are no use
  // cases, then it stays as the user leaves it.
  const [generatorOpen, setGeneratorOpen] = useState<boolean | null>(null);
  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [editing, setEditing] = useState<UseCaseResponse | null>(null);
  const [generatingDiagram, setGeneratingDiagram] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const allRequirements = requirements.data?.items ?? [];
  const approvedRequirements = allRequirements.filter((r) => r.version.status === 'APPROVED');
  const selectedRequirements = selected ?? approvedRequirements.map((r) => r.version.id);
  const lookup = useMemo(
    () => new Map(allRequirements.map((r) => [r.version.id, r] as const)),
    [allRequirements],
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['use-cases', projectId] });
    queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
    queryClient.invalidateQueries({ queryKey: ['archived-artifacts', projectId] });
    queryClient.invalidateQueries({ queryKey: ['staleness', projectId] });
  }

  const transitionFor = (u: UseCaseResponse) => (status: ArtifactVersionStatus) =>
    api.useCases.transition(projectId, u.id, u.version.id, status);

  async function approveOne(u: UseCaseResponse) {
    setApprovingId(u.id);
    try {
      if (u.version.status === 'IN_REVIEW') await transitionFor(u)('APPROVED');
      else await approveDirectly(transitionFor(u));
      toast.success(`${u.code} aprobado.`);
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo aprobar el caso de uso.');
    } finally {
      setApprovingId(null);
    }
  }

  async function requestChanges(u: UseCaseResponse) {
    try {
      await transitionFor(u)('CHANGES_REQUESTED');
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    }
  }

  async function archive(u: UseCaseResponse) {
    try {
      await api.artifacts.archive(projectId, u.id);
      toast.success(`${u.code} archivado.`);
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo archivar.');
      throw err;
    }
  }

  // DEC-138: the whole batch or none of it; the reason comes from the server.
  async function bulk(action: UseCaseBulkAction, ids: string[]) {
    try {
      const { affected, skipped } = await api.useCases.bulk(projectId, action, ids);
      const done = {
        APPROVE: affected === 1 ? 'caso de uso aprobado' : 'casos de uso aprobados',
        ARCHIVE: affected === 1 ? 'caso de uso archivado' : 'casos de uso archivados',
        DELETE: affected === 1 ? 'caso de uso eliminado' : 'casos de uso eliminados',
      }[action];
      toast.success(`${affected} ${done}.`);
      if (skipped)
        toast.info(
          action === 'APPROVE'
            ? `${skipped} ya estaban aprobados o archivados y no se tocaron.`
            : `${skipped} ya estaban archivados.`,
        );
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo aplicar la acción.');
      throw err;
    }
  }

  const items = useCases.data?.items ?? [];
  const isGeneratorOpen = generatorOpen ?? items.length === 0;
  const pending = items.filter((u) => isPendingApproval(u.version.status));
  const approvedVersionIds = items
    .filter((u) => u.version.status === 'APPROVED')
    .map((u) => u.version.id);

  async function generateDiagram() {
    setGeneratingDiagram(true);
    try {
      await api.useCaseDiagrams.generate(projectId, approvedVersionIds);
      queryClient.invalidateQueries({ queryKey: ['use-case-diagrams', projectId] });
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

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => setGeneratorOpen(!isGeneratorOpen)}
            aria-expanded={isGeneratorOpen}
          >
            <Sparkles className="size-4" aria-hidden="true" />
            Generar con IA
            <ChevronDown
              className={`size-4 transition-transform ${isGeneratorOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEditing(null);
              setShowManualForm(true);
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Crear manualmente
          </Button>
          <ApproveAllButton
            pending={pending}
            approve={(id) => approveDirectly(transitionFor(items.find((u) => u.id === id)!))}
            approveMany={(ids) => bulk('APPROVE', ids)}
            onDone={invalidate}
          />
        </div>
        <AiUnavailableHint />

        {isGeneratorOpen ? (
          <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-card p-4 shadow-sm">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Generar casos de uso a partir de requisitos
              </h2>
              <p className="text-xs text-muted-foreground">
                Elija los requisitos aprobados en los que se basará la IA. Podrá revisar cada
                propuesta antes de incorporarla.
              </p>
            </div>
            {approvedRequirements.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Cuando haya requisitos aprobados podrá elegirlos aquí.
              </p>
            ) : (
              <RequirementSelector
                requirements={approvedRequirements}
                selected={selectedRequirements}
                onChange={setSelected}
              />
            )}
            <UseCaseGenerationPanel
              projectId={projectId}
              requirementVersionIds={selectedRequirements}
              onCompleted={setGeneration}
            />
          </div>
        ) : null}

        {items.length ? <UseCasesSummary items={items} requirements={allRequirements} /> : null}
      </section>

      {showManualForm || editing ? (
        <UseCaseManualForm
          key={editing?.id ?? 'new'}
          projectId={projectId}
          approvedRequirements={approvedRequirements}
          useCases={items}
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
          renderCard={(c, index) => (
            <UseCaseCandidateCard
              candidate={c}
              index={index}
              requirementCode={(versionId) => {
                const r = lookup.get(versionId);
                return r ? { code: r.code, name: r.requirement.name } : undefined;
              }}
              candidateName={(candidateId) =>
                generation.candidates.find((other) => other.candidateId === candidateId)?.name
              }
            />
          )}
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
            <UseCaseList
              items={items}
              lookup={lookup}
              isStale={(id) => stale.has(id)}
              approvingId={approvingId}
              actions={{
                approve: approveOne,
                requestChanges,
                edit: (u) => {
                  setShowManualForm(false);
                  setEditing(u);
                },
                archive,
                bulk,
              }}
            />

            <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Network className="size-4 text-primary" aria-hidden="true" />
                    Diagrama de casos de uso
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {approvedVersionIds.length
                      ? approvedVersionIds.length === 1
                        ? 'Incluirá el caso de uso aprobado.'
                        : `Incluirá los ${approvedVersionIds.length} casos de uso aprobados.`
                      : 'Se genera a partir de los casos de uso aprobados.'}
                  </p>
                </div>
                {approvedVersionIds.length ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={generatingDiagram}
                    onClick={generateDiagram}
                  >
                    {generatingDiagram
                      ? 'Generando…'
                      : diagram
                        ? 'Actualizar diagrama'
                        : 'Generar diagrama'}
                  </Button>
                ) : null}
              </div>
              {diagram ? (
                <DiagramViewer
                  svg={diagram.svg}
                  source={diagram.source}
                  sourceFormat={diagram.sourceFormat}
                  code={diagram.code}
                  caption="Diagrama de casos de uso aprobados"
                  pngUrl={api.useCaseDiagrams.diagramPngUrl(projectId, diagram.id)}
                  onSaveEdit={async (source) => {
                    await api.useCaseDiagrams.createManualVersion(projectId, diagram.id, source);
                    queryClient.invalidateQueries({ queryKey: ['use-case-diagrams', projectId] });
                    queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
                  }}
                />
              ) : null}
            </section>
          </>
        )}
      </QueryState>

      <ArchivedArtifacts projectId={projectId} types={['USE_CASE']} onRestored={invalidate} />
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
