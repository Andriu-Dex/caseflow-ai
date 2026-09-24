'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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
    return <div className="text-sm text-gray-500">Cargando proyectos…</div>;
  }
  if (workspaces.isError || !workspaceId) {
    return (
      <div className="text-sm text-red-600">
        No hay un workspace de desarrollo configurado. Ejecute{' '}
        <code className="rounded bg-gray-100 px-1">pnpm db:seed:dev</code>.
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
        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
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
          <input
            autoFocus
            aria-label="Nombre del nuevo proyecto"
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del proyecto"
          />
          <button
            type="button"
            onClick={handleCreate}
            className="rounded-md bg-gray-900 px-2 py-1 text-sm text-white"
          >
            Crear
          </button>
          <button
            type="button"
            onClick={() => setCreating(false)}
            className="text-sm text-gray-500"
          >
            Cancelar
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-700 hover:bg-gray-50"
        >
          + Nuevo proyecto
        </button>
      )}
      {error ? <span className="text-sm text-red-600">{error}</span> : null}
    </div>
  );
}
