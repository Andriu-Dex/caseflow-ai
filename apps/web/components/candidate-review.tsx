'use client';

import { useState } from 'react';
import type { GenerationCandidate, GenerationResult } from '../lib/api';
import { CandidateBadge } from './status-badge';

// The candidate-review step between Generate and Accept (spec: "AI Output →
// Candidate → Human Review → Official Artifact", "ACCEPT != APPROVE" — the
// resulting Artifact still starts DRAFT/GENERATED and needs its own
// approval lifecycle afterward).
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
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await onAccept(selected);
      onDismiss();
    } catch {
      setError('No se pudieron aceptar los candidatos seleccionados.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <CandidateBadge />
        <span className="text-sm text-purple-900">
          Revise los candidatos antes de aceptarlos. Aceptar crea artefactos oficiales en estado
          borrador — todavía requieren su propia aprobación.
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {generation.candidates.map((c) => (
          <li key={c.id} className="flex items-start gap-2 rounded-md bg-card p-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={selected.includes(c.id)}
              onChange={() => toggle(c.id)}
            />
            <span>{describe(c)}</span>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={accept}
          disabled={busy || selected.length === 0}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {busy ? 'Aceptando…' : `Aceptar seleccionados (${selected.length})`}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-sm text-muted-foreground underline"
        >
          Descartar
        </button>
      </div>
    </div>
  );
}
