'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ProjectLanguage } from '@caseflow-ai/contracts';
import { toast } from 'sonner';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@caseflow-ai/ui';
import { api } from '../lib/api';
import { NewProjectDialog } from './new-project-dialog';
import { UpgradeRouteButton, WorkflowRouteBadge } from './workflow-route';
import { useActiveProject } from '../lib/active-project';

export function ProjectSwitcher() {
  const { projectId, setProjectId } = useActiveProject();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  const workspaces = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api.workspaces.list(),
  });
  const workspaceId = workspaces.data?.items[0]?.id;

  const projects = useQuery({
    // Only active projects, most recently touched first; the Projects page
    // has the full, filterable list.
    queryKey: ['projects', workspaceId, 'switcher'],
    queryFn: () =>
      api.projects.list(workspaceId!, { status: 'ACTIVE', sort: 'UPDATED', limit: 100 }),
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
  const active = items.find((project) => project.id === projectId);

  return (
    <div className="flex items-center gap-2">
      <Select
        value={projectId ?? undefined}
        onValueChange={(val) => setProjectId(val || null)}
        disabled={items.length === 0}
      >
        <SelectTrigger
          aria-label="Proyecto activo"
          className="h-9 w-[220px] bg-background shadow-xs font-medium"
        >
          <SelectValue
            placeholder={items.length ? 'Seleccionar proyecto…' : 'Sin proyectos todavía'}
          />
        </SelectTrigger>
        <SelectContent position="popper">
          {items.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {projectId ? (
        <ProjectLanguageSelect
          key={projectId}
          projectId={projectId}
          language={active?.language ?? 'ES'}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] })}
        />
      ) : null}
      {active ? (
        <>
          <WorkflowRouteBadge route={active.workflowRoute} />
          <UpgradeRouteButton
            key={active.id}
            projectId={active.id}
            route={active.workflowRoute}
            onUpgraded={() =>
              Promise.all([
                queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] }),
                queryClient.invalidateQueries({ queryKey: ['project', active.id] }),
              ])
            }
          />
        </>
      ) : null}
      <Button type="button" size="sm" variant="outline" onClick={() => setCreating(true)}>
        <Plus className="size-4" aria-hidden="true" />
        Nuevo proyecto
      </Button>
      <NewProjectDialog
        open={creating}
        onOpenChange={setCreating}
        workspaceId={workspaceId}
        onCreated={async (id) => {
          await queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] });
          setProjectId(id);
        }}
      />
    </div>
  );
}

function ProjectLanguageSelect({
  projectId,
  language,
  onChanged,
}: {
  projectId: string;
  language: ProjectLanguage;
  onChanged: () => Promise<unknown>;
}) {
  const [selected, setSelected] = useState<ProjectLanguage>(language);
  const [saving, setSaving] = useState(false);

  useEffect(() => setSelected(language), [language]);

  async function handleChange(next: ProjectLanguage) {
    setSelected(next);
    setSaving(true);
    try {
      await api.projects.updateLanguage(projectId, next);
      await onChanged();
      toast.success('Idioma de generación actualizado.');
    } catch {
      setSelected(language);
      toast.error('No se pudo actualizar el idioma de generación.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Select
      value={selected}
      disabled={saving}
      onValueChange={(val) => void handleChange(val as ProjectLanguage)}
    >
      <SelectTrigger
        aria-label="Idioma de generación con IA"
        className="h-9 w-[130px] bg-background shadow-xs font-medium"
      >
        <SelectValue placeholder="Idioma" />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value="ES">Español</SelectItem>
        <SelectItem value="EN">English</SelectItem>
      </SelectContent>
    </Select>
  );
}
