'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button, Input } from '@caseflow-ai/ui';
import { api, ApiError } from '../lib/api';
import { useActiveProject } from '../lib/active-project';

export function ProjectSwitcher() {
  const { projectId, setProjectId } = useActiveProject();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const workspaces = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api.workspaces.list(),
  });
  const workspaceId = workspaces.data?.items[0]?.id;

  const projects = useQuery({
    queryKey: ['projects', workspaceId],
    queryFn: () => api.projects.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  if (workspaces.isLoading || projects.isLoading) {
    return <div className="text-sm text-muted-foreground">Cargando proyectos…</div>;
  }
  if (workspaces.isError || !workspaceId) {
    return (
      <div className="text-sm text-destructive">
        No hay un workspace de desarrollo configurado. Ejecute{' '}
        <code className="rounded bg-muted px-1">pnpm db:seed:dev</code>.
      </div>
    );
  }

  const items = projects.data?.items ?? [];

  async function handleCreate() {
    if (!name.trim() || !workspaceId) return;
    setError(null);
    try {
      const created = await api.projects.create({ workspaceId, name: name.trim() });
      await queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] });
      setProjectId(created.id);
      setName('');
      setCreating(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo crear el proyecto.');
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="project-select" className="sr-only">
        Proyecto activo
      </label>
      <select
        id="project-select"
        className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-xs"
        value={projectId ?? ''}
        onChange={(e) => setProjectId(e.target.value || null)}
      >
        <option value="" disabled>
          {items.length ? 'Seleccionar proyecto…' : 'Sin proyectos todavía'}
        </option>
        {items.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {creating ? (
        <span className="flex items-center gap-1">
          <Input
            autoFocus
            aria-label="Nombre del nuevo proyecto"
            className="h-9 w-48"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del proyecto"
          />
          <Button type="button" size="sm" onClick={handleCreate}>
            Crear
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(false)}>
            Cancelar
          </Button>
        </span>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Nuevo proyecto
        </Button>
      )}
      {error ? <span className="text-sm text-destructive">{error}</span> : null}
    </div>
  );
}
