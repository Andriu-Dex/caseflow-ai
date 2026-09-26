'use client';

import { useQuery } from '@tanstack/react-query';
import { Archive, CheckCheck, Inbox, RefreshCw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { api, ApiError, type ArtifactVersionStatus } from '../lib/api';

export const isPendingApproval = (status: ArtifactVersionStatus) =>
  status === 'DRAFT' || status === 'GENERATED';

// Single-member workspaces skip the separate reviewer hand-off, but still go
// through IN_REVIEW so the lifecycle (and its audit timestamps) stays intact
// for when multi-user review ships.
export async function approveDirectly(
  transition: (status: ArtifactVersionStatus) => Promise<unknown>,
) {
  await transition('IN_REVIEW');
  await transition('APPROVED');
}

export function ApproveAllButton({
  pending,
  approve,
  onDone,
}: {
  pending: { id: string; code: string }[];
  approve: (id: string) => Promise<unknown>;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  if (pending.length < 2) return null;

  async function run() {
    setBusy(true);
    const results = await Promise.allSettled(pending.map((p) => approve(p.id)));
    const failed = pending.filter((_, i) => results[i]!.status === 'rejected');
    setBusy(false);
    onDone();
    if (failed.length === 0) toast.success(`${pending.length} elementos aprobados.`);
    else
      toast.error(
        `Se aprobaron ${pending.length - failed.length} de ${pending.length}. No se pudo aprobar: ${failed.map((f) => f.code).join(', ')}.`,
      );
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
    >
      <CheckCheck className="size-4" aria-hidden="true" />
      {busy ? 'Aprobando…' : `Aprobar todos los pendientes (${pending.length})`}
    </button>
  );
}

export function ArchiveButton({
  projectId,
  artifactId,
  code,
  onDone,
}: {
  projectId: string;
  artifactId: string;
  code: string;
  onDone: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function archive() {
    setBusy(true);
    try {
      await api.artifacts.archive(projectId, artifactId);
      toast.success(`${code} archivado.`);
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo archivar.');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming)
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted/40"
      >
        <Archive className="size-3.5" aria-hidden="true" />
        Archivar
      </button>
    );
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      ¿Archivar {code}?
      <button
        type="button"
        onClick={archive}
        disabled={busy}
        className="rounded-md bg-amber-600 px-2 py-1 text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {busy ? 'Archivando…' : 'Sí, archivar'}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-muted-foreground underline"
      >
        Cancelar
      </button>
    </span>
  );
}

// Neutral "nothing here yet" state — a starting point, not a warning.
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-card/50 px-4 py-8 text-center">
      <Inbox className="size-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {children ? <p className="max-w-md text-sm text-muted-foreground">{children}</p> : null}
    </div>
  );
}

// Artifacts whose upstream knowledge changed since they were produced
// (deterministic StalenessService). Nothing is reset: the user just sees
// which items deserve a second look, right where they work on them.
export function useStaleArtifactIds(projectId: string) {
  const staleness = useQuery({
    queryKey: ['staleness', projectId],
    queryFn: () => api.staleness.get(projectId),
  });
  return new Set(
    (staleness.data?.entries ?? [])
      .filter((e) => e.impactState !== 'CURRENT')
      .map((e) => e.artifactId),
  );
}

export function StaleNotice() {
  return (
    <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
      <RefreshCw className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      La información de la que depende cambió desde que se creó. Revísela y edítela si hace falta.
    </p>
  );
}

export const AI_UNAVAILABLE_HINT =
  'Si la generación automática no está disponible en este momento, puede crearlo manualmente.';
