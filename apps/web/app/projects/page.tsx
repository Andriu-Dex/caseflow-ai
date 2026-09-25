'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, FolderKanban, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { ProjectResponse } from '@caseflow-ai/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@caseflow-ai/ui';
import { api, ApiError } from '../../lib/api';
import { QueryState } from '../../components/query-state';
import { useActiveProject } from '../../lib/active-project';

function DeleteProjectDialog({
  project,
  onOpenChange,
  onDeleted,
}: {
  project: ProjectResponse;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const matches = confirmText.trim() === project.name;

  async function handleDelete() {
    if (!matches) return;
    setDeleting(true);
    setError(null);
    try {
      await api.projects.delete(project.id);
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo eliminar el proyecto.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar proyecto</DialogTitle>
          <DialogDescription>
            Esta acción es <strong>permanente e irreversible</strong>: se borrarán todas las
            fuentes, el contexto, los requisitos y cualquier otro artefacto de este proyecto. Solo
            es posible mientras el proyecto no tenga nada aprobado.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5 text-sm">
          <Label htmlFor="confirm-project-name">
            Para confirmar, escriba el nombre exacto del proyecto: <strong>{project.name}</strong>
          </Label>
          <Input
            id="confirm-project-name"
            autoFocus
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!matches || deleting}
            onClick={handleDelete}
          >
            {deleting ? 'Eliminando…' : 'Eliminar definitivamente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveProjectDialog({
  project,
  onOpenChange,
  onArchived,
}: {
  project: ProjectResponse;
  onOpenChange: (open: boolean) => void;
  onArchived: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  async function handleArchive() {
    setArchiving(true);
    setError(null);
    try {
      await api.projects.archive(project.id);
      onArchived();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo archivar el proyecto.');
    } finally {
      setArchiving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archivar proyecto</DialogTitle>
          <DialogDescription>
            Este proyecto tiene artefactos aprobados, así que no puede eliminarse. Archivarlo lo
            marca como inactivo sin borrar su historial.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={archiving} onClick={handleArchive}>
            {archiving ? 'Archivando…' : 'Archivar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectCard({ project, onDeleted }: { project: ProjectResponse; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const { projectId, setProjectId } = useActiveProject();
  const active = projectId === project.id;
  const archived = project.archivedAt !== null;

  return (
    <Card className={active ? 'border-primary' : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderKanban className="size-4 shrink-0 text-primary" aria-hidden="true" />
          {project.name}
          {archived ? <Badge variant="secondary">Archivado</Badge> : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {project.description ? (
          <p className="text-sm text-muted-foreground">{project.description}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Creado el {new Date(project.createdAt).toLocaleDateString('es')}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={active ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setProjectId(project.id)}
          >
            {active ? 'Proyecto activo' : 'Usar este proyecto'}
          </Button>
          {project.hasApprovedArtifacts ? (
            archived ? null : (
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)}>
                <Archive className="size-3.5" aria-hidden="true" />
                Archivar
              </Button>
            )
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:bg-destructive/5"
              onClick={() => setConfirming(true)}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Eliminar
            </Button>
          )}
        </div>
      </CardContent>
      {confirming ? (
        project.hasApprovedArtifacts ? (
          <ArchiveProjectDialog
            project={project}
            onOpenChange={setConfirming}
            onArchived={onDeleted}
          />
        ) : (
          <DeleteProjectDialog
            project={project}
            onOpenChange={setConfirming}
            onDeleted={onDeleted}
          />
        )
      ) : null}
    </Card>
  );
}

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: () => api.workspaces.list() });
  const workspaceId = workspaces.data?.items[0]?.id;
  const projects = useQuery({
    queryKey: ['projects', workspaceId],
    queryFn: () => api.projects.list(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Proyectos</h1>
      <QueryState
        isLoading={workspaces.isLoading || projects.isLoading}
        error={workspaces.error ?? projects.error}
      >
        {projects.data && projects.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay proyectos.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.data?.items.map((project) => (
              <ProjectCard key={project.id} project={project} onDeleted={invalidate} />
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}
