'use client';

import { AlertTriangle, Check, Sparkles, X, XCircle } from 'lucide-react';
import { Button } from '@caseflow-ai/ui';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ApiError, type GenerationCandidate, type GenerationResult } from '../lib/api';

export interface CandidateFilter {
  id: string;
  label: string;
  matches: (candidate: GenerationCandidate) => boolean;
}

// The review step between Generate and Accept ("AI Output → Candidate →
// Human Review → Official Artifact"; accepting is not approving — the new
// artifacts still start as drafts with their own approval).
//
// A page shows each proposal either as a line (`describe`) or as a full card
// (`renderCard`), may offer filters, and may declare which proposals each one
// depends on so they are selected together.
export function CandidateReview({
  generation,
  describe,
  renderDetail,
  renderCard,
  filters,
  dependenciesOf,
  defaultSelected,
  onAccept,
  onDismiss,
}: {
  generation: GenerationResult;
  describe: (candidate: GenerationCandidate) => string;
  renderDetail?: (candidate: GenerationCandidate) => ReactNode;
  renderCard?: (candidate: GenerationCandidate, index: number) => ReactNode;
  filters?: CandidateFilter[];
  dependenciesOf?: (candidate: GenerationCandidate) => string[];
  defaultSelected?: string[];
  onAccept: (candidateIds: string[]) => Promise<void>;
  onDismiss: () => void;
}) {
  const candidates = generation.candidates;
  const [selected, setSelected] = useState<string[]>(
    defaultSelected ?? candidates.map((c) => c.id),
  );
  const [filterId, setFilterId] = useState<string>('all');
  const [busy, setBusy] = useState(false);
  const total = candidates.length;
  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const filter = filters?.find((f) => f.id === filterId);
  const visible = filter ? candidates.filter(filter.matches) : candidates;
  const allVisibleSelected = visible.every((c) => selected.includes(c.id));
  const hasInvalidSelection = candidates.some(
    (candidate) =>
      selected.includes(candidate.id) &&
      candidate.qualityFindings?.some((finding) => finding.severity === 'ERROR'),
  );

  // Every proposal a selection needs, transitively.
  function withDependencies(ids: string[]): string[] {
    const result = new Set(ids);
    const pending = [...ids];
    while (pending.length) {
      const candidate = byId.get(pending.pop()!);
      for (const dependency of (candidate && dependenciesOf?.(candidate)) ?? [])
        if (!result.has(dependency)) {
          result.add(dependency);
          pending.push(dependency);
        }
    }
    return [...result];
  }
  // Every selected proposal that needs, transitively, one of these.
  function withDependents(ids: string[], among: string[]): string[] {
    const result = new Set(ids);
    let grew = true;
    while (grew) {
      grew = false;
      for (const id of among)
        if (!result.has(id)) {
          const candidate = byId.get(id);
          if (candidate && dependenciesOf?.(candidate).some((d) => result.has(d))) {
            result.add(id);
            grew = true;
          }
        }
    }
    return [...result];
  }

  const label = (id: string) => {
    const index = candidates.findIndex((c) => c.id === id);
    return `«${byId.get(id)?.name ?? `Propuesta ${index + 1}`}»`;
  };

  function toggle(id: string) {
    if (selected.includes(id)) {
      const removed = withDependents([id], selected);
      setSelected((prev) => prev.filter((x) => !removed.includes(x)));
      if (removed.length > 1)
        toast.info(
          `También se quitó ${removed
            .filter((x) => x !== id)
            .map(label)
            .join(', ')}, que depende de esta propuesta.`,
        );
    } else {
      const added = withDependencies([id]).filter((x) => !selected.includes(x));
      setSelected((prev) => [...prev, ...added]);
      if (added.length > 1)
        toast.info(
          `También se seleccionó ${added
            .filter((x) => x !== id)
            .map(label)
            .join(', ')}, de la que depende.`,
        );
    }
  }

  function toggleVisible() {
    const ids = visible.map((c) => c.id);
    if (allVisibleSelected) {
      const removed = withDependents(ids, selected);
      setSelected((prev) => prev.filter((x) => !removed.includes(x)));
    } else setSelected((prev) => [...new Set([...prev, ...withDependencies(ids)])]);
  }

  async function accept() {
    setBusy(true);
    try {
      await onAccept(selected);
      toast.success(
        selected.length === 1
          ? 'Se incorporó 1 propuesta. Revísela y apruébela cuando esté lista.'
          : `Se incorporaron ${selected.length} propuestas. Revíselas y apruébelas cuando estén listas.`,
      );
      onDismiss();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'No se pudieron incorporar las propuestas.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-primary/30 bg-card shadow-sm">
      <header className="flex flex-col gap-3 border-b border-border bg-primary/5 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Sparkles className="size-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                La IA generó {total} {total === 1 ? 'propuesta' : 'propuestas'}
              </h2>
              <p className="text-xs text-muted-foreground">
                Elija cuáles incorporar al proyecto. Podrá editarlas y aprobarlas después.
              </p>
            </div>
          </div>
          <Button
            variant="link"
            size="sm"
            type="button"
            onClick={toggleVisible}
            className="text-xs font-medium"
          >
            {allVisibleSelected ? 'Quitar selección' : 'Seleccionar todas'}
          </Button>
        </div>
        {filters?.length ? (
          <div role="tablist" aria-label="Filtrar propuestas" className="flex flex-wrap gap-1.5">
            {[{ id: 'all', label: 'Todas', matches: () => true }, ...filters].map((f) => {
              const count = candidates.filter(f.matches).length;
              const active = filterId === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilterId(f.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f.label}
                  <span
                    className={`rounded-full px-1.5 text-[10px] ${active ? 'bg-primary-foreground/20' : 'bg-muted'}`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </header>

      <ul
        className={`flex max-h-[60vh] flex-col overflow-y-auto ${
          renderCard ? 'gap-3 bg-muted/30 p-3' : 'divide-y divide-border'
        }`}
      >
        {visible.map((c) => {
          const checked = selected.includes(c.id);
          const index = candidates.indexOf(c);
          return (
            <li key={c.id}>
              <label
                className={`flex cursor-pointer items-start gap-3 text-sm transition-all ${
                  renderCard
                    ? `rounded-lg border bg-card p-4 shadow-xs hover:shadow-sm ${
                        checked
                          ? 'border-primary/60 ring-1 ring-primary/20'
                          : 'border-border opacity-70 hover:opacity-100'
                      }`
                    : `px-4 py-2.5 hover:bg-muted/40 ${checked ? '' : 'opacity-60'}`
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 accent-primary"
                  checked={checked}
                  onChange={() => toggle(c.id)}
                  aria-label={c.name ? `Incorporar ${c.name}` : undefined}
                />
                <span className="min-w-0 flex-1 text-foreground">
                  {renderCard ? (
                    renderCard(c, index)
                  ) : (
                    <>
                      {describe(c)}
                      {renderDetail?.(c)}
                    </>
                  )}
                  {c.qualityFindings?.length ? <QualityFindings candidate={c} /> : null}
                </span>
              </label>
            </li>
          );
        })}
        {visible.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">
            No hay propuestas con este filtro.
          </li>
        ) : null}
      </ul>

      {/* Room on the right for the floating theme toggle. */}
      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3 sm:pr-20">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={onDismiss}
          className="text-muted-foreground h-8 px-2"
        >
          <X className="size-4" aria-hidden="true" />
          Descartar
        </Button>
        <Button
          variant="default"
          size="sm"
          type="button"
          onClick={accept}
          disabled={busy || selected.length === 0 || hasInvalidSelection}
        >
          <Check className="size-4" aria-hidden="true" />
          {busy ? 'Incorporando…' : `Incorporar ${selected.length} de ${total}`}
        </Button>
      </footer>
    </section>
  );
}

function QualityFindings({ candidate }: { candidate: GenerationCandidate }) {
  return (
    <span className="mt-3 block space-y-1.5 rounded-md border border-amber-200 bg-amber-50/60 p-2.5 text-xs dark:border-amber-900/60 dark:bg-amber-950/30">
      {candidate.qualityFindings!.map((finding, index) => (
        <span
          key={`${finding.code}-${index}`}
          className={`flex items-start gap-1.5 ${
            finding.severity === 'ERROR' ? 'text-destructive' : 'text-amber-800 dark:text-amber-300'
          }`}
        >
          {finding.severity === 'ERROR' ? (
            <XCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>
            {finding.severity === 'ERROR' ? 'Error' : 'Revisar'}: {finding.message}
          </span>
        </span>
      ))}
      <span className="block text-muted-foreground">
        Estas comprobaciones no verifican la fidelidad semántica; compare la propuesta con las
        fuentes antes de aprobarla.
      </span>
    </span>
  );
}
