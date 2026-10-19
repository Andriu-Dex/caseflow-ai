'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { Button } from '@caseflow-ai/ui';
import { useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api';
import { StatusBadge } from './status-badge';

// What was archived stays reachable: it is listed here, newest first, and can
// be brought back. Restoring is never refused; a restore counts as a change of
// its stage, so what depends on it shows as out of date, and a warning says
// when it now competes with another approved one.
export function ArchivedArtifacts({
  projectId,
  types,
  onRestored,
}: {
  projectId: string;
  types: string[];
  onRestored: () => void;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const joined = types.join(',');
  const archived = useQuery({
    queryKey: ['archived-artifacts', projectId, joined],
    queryFn: () => api.artifacts.listArchived(projectId, types),
  });
  const items = archived.data?.items ?? [];
  if (!items.length) return null;

  async function restore(id: string, code: string) {
    setRestoringId(id);
    try {
      const result = await api.artifacts.restore(projectId, id);
      toast.success(`${code} restaurado.`);
      if (result.warning) toast.warning(result.warning);
      await client.invalidateQueries({ queryKey: ['archived-artifacts', projectId] });
      client.invalidateQueries({ queryKey: ['readiness', projectId] });
      client.invalidateQueries({ queryKey: ['staleness', projectId] });
      onRestored();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo restaurar.');
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <section className="rounded-xl border border-border/80 bg-card shadow-2xs">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="size-4" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-4" aria-hidden="true" />
        )}
        <Archive className="size-4" aria-hidden="true" />
        Archivados ({items.length})
      </button>
      {open ? (
        <ul className="flex flex-col divide-y divide-border/60 border-t border-border/60">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                {item.code}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground" title={item.title}>
                {item.title}
              </span>
              <StatusBadge status={item.status} />
              <span className="text-xs text-muted-foreground">
                Archivado el {new Date(item.archivedAt).toLocaleDateString('es')}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={restoringId === item.id}
                onClick={() => restore(item.id, item.code)}
                aria-label={`Restaurar ${item.code}`}
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                {restoringId === item.id ? 'Restaurando…' : 'Restaurar'}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
