'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Textarea } from '@caseflow-ai/ui';
import { Download, FileText, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { RequireActiveProject } from '../../components/query-state';
import type { BaselineResponse } from '@caseflow-ai/contracts';

async function downloadExport(
  projectId: string,
  id: string,
  format: 'json' | 'html',
): Promise<void> {
  const url =
    format === 'html'
      ? api.baselines.exportHtmlUrl(projectId, id)
      : api.baselines.exportJsonUrl(projectId, id);
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error('export request failed');
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `baseline-${id}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

function BaselinesContent({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const baselines = useQuery({
    queryKey: ['baselines', projectId],
    queryFn: () => api.baselines.list(projectId),
  });

  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const createMutation = useMutation({
    mutationFn: () =>
      api.baselines.create(projectId, { label, description: description || undefined }),
    onSuccess: () => {
      toast.success('Línea base creada exitosamente.');
      setLabel('');
      setDescription('');
      queryClient.invalidateQueries({ queryKey: ['baselines', projectId] });
    },
    onError: () => toast.error('Error al crear línea base.'),
    onSettled: () => setCreating(false),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    createMutation.mutate();
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Líneas Base</h1>
        <p className="text-sm text-muted-foreground">
          Gestione y descargue líneas base (snapshots inmutables) del proyecto.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-lg font-medium mb-4">Crear nueva línea base</h2>
        <form onSubmit={handleCreate} className="flex flex-col gap-4 max-w-md">
          <Input
            placeholder="Etiqueta (ej: v1.0.0)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
          />
          <Textarea
            placeholder="Descripción (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Button type="submit" disabled={creating || !label}>
            {creating ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <Plus className="size-4 mr-2" />
            )}
            Crear Línea Base
          </Button>
        </form>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Líneas base existentes</h2>
        {baselines.isLoading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Cargando...
          </div>
        ) : baselines.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay líneas base creadas.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {baselines.data?.map((baseline: BaselineResponse) => (
              <li
                key={baseline.id}
                className="rounded-lg border p-4 bg-card flex justify-between items-center"
              >
                <div>
                  <div className="font-medium">{baseline.label}</div>
                  {baseline.description && (
                    <div className="text-sm text-muted-foreground mt-1">{baseline.description}</div>
                  )}
                  <div className="text-xs text-muted-foreground mt-2">
                    Creado: {new Date(baseline.createdAt).toLocaleString()} por{' '}
                    {baseline.user?.displayName || baseline.createdByUserId}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadExport(projectId, baseline.id, 'html')}
                  >
                    <FileText className="size-4 mr-2" />
                    HTML
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadExport(projectId, baseline.id, 'json')}
                  >
                    <Download className="size-4 mr-2" />
                    JSON
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function BaselinesPage() {
  return (
    <RequireActiveProject>
      {(projectId) => <BaselinesContent projectId={projectId} />}
    </RequireActiveProject>
  );
}
