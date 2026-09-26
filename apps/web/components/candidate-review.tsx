'use client';

import { Check, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ApiError, type GenerationCandidate, type GenerationResult } from '../lib/api';

// The review step between Generate and Accept ("AI Output → Candidate →
// Human Review → Official Artifact"; accepting is not approving — the new
// artifacts still start as drafts with their own approval).
export function CandidateReview({
  generation,
  describe,
  onAccept,
  onDismiss,
}: {
  generation: GenerationResult;
  describe: (candidate: GenerationCandidate) => string;
  onAccept: (candidateIds: string[]) => Promise<void>;
  onDismiss: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(generation.candidates.map((c) => c.id));
  const [busy, setBusy] = useState(false);
  const total = generation.candidates.length;
  const allSelected = selected.length === total;

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-primary/5 px-4 py-3">
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
        <button
          type="button"
          onClick={() => setSelected(allSelected ? [] : generation.candidates.map((c) => c.id))}
          className="text-xs font-medium text-primary hover:underline"
        >
          {allSelected ? 'Quitar selección' : 'Seleccionar todas'}
        </button>
      </header>

      <ul className="flex max-h-96 flex-col divide-y divide-border overflow-y-auto">
        {generation.candidates.map((c) => {
          const checked = selected.includes(c.id);
          return (
            <li key={c.id}>
              <label
                className={`flex cursor-pointer items-start gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/40 ${
                  checked ? '' : 'opacity-60'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 accent-primary"
                  checked={checked}
                  onChange={() => toggle(c.id)}
                />
                <span className="text-foreground">{describe(c)}</span>
              </label>
            </li>
          );
        })}
      </ul>

      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/40"
        >
          <X className="size-4" aria-hidden="true" />
          Descartar
        </button>
        <button
          type="button"
          onClick={accept}
          disabled={busy || selected.length === 0}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Check className="size-4" aria-hidden="true" />
          {busy ? 'Incorporando…' : `Incorporar ${selected.length} de ${total}`}
        </button>
      </footer>
    </section>
  );
}
