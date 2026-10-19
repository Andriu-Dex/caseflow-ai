'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowRight,
  CalendarDays,
  Check,
  FolderKanban,
  FolderPlus,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  PROJECT_LIST_SORTS,
  PROJECT_LIST_STATUSES,
  WORKFLOW_ROUTES,
  type ProjectResponse,
  type WorkflowRoute,
} from '@caseflow-ai/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@caseflow-ai/ui';
import { api, ApiError } from '../../lib/api';
import { QueryState } from '../../components/query-state';
import { useActiveProject } from '../../lib/active-project';
import { WORKFLOW_ROUTE_LABELS } from '../../components/workflow-route';
import { PaginationNav } from '../../components/pagination-nav';
import { NewProjectDialog } from '../../components/new-project-dialog';

function EditProjectDialog({
  project,
  onOpenChange,
}: {
  project: ProjectResponse;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.projects.update(project.id, {
        name: name.trim(),
        description: description.trim() || null,
      });
      // The list, the switcher and the header of the active project.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['project', project.id] }),
      ]);
      toast.success('Proyecto actualizado.');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo actualizar el proyecto.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="relative sm:max-w-lg p-6 gap-5 overflow-hidden">
        {/* Top accent gradient strip */}
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-primary/70 to-indigo-500" />

        <form onSubmit={handleSave} className="flex flex-col gap-5 w-full min-w-0">
          <div className="flex items-start gap-4 w-full min-w-0">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/25 shadow-xs ring-4 ring-primary/5 dark:bg-primary/15 dark:ring-primary/10">
              <Pencil className="size-5" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
                Editar proyecto
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Modifique los datos informativos. No afecta a sus artefactos, códigos ni versiones
                aprobadas.
              </DialogDescription>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/30 p-4 flex flex-col gap-4 w-full min-w-0">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor={`project-name-${project.id}`}
                className="text-xs font-semibold text-foreground"
              >
                Nombre
              </Label>
              <Input
                id={`project-name-${project.id}`}
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre del proyecto"
                className="h-9 text-sm bg-background border-border/80"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor={`project-description-${project.id}`}
                className="text-xs font-semibold text-foreground"
              >
                Descripción (opcional)
              </Label>
              <Textarea
                id={`project-description-${project.id}`}
                rows={3}
                maxLength={5000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Breve resumen de los objetivos del proyecto…"
                className="text-sm bg-background border-border/80 resize-none"
              />
            </div>
          </div>

          <DialogFooter className="-mx-6 -mb-6 mt-1 flex items-center justify-end gap-2 border-t border-border/50 bg-muted/25 px-6 py-4 rounded-b-2xl dark:bg-muted/10 w-[calc(100%+3rem)]">
            <Button
              type="button"
              variant="outline"
              className="border-border/80 hover:bg-muted font-medium"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving || !name.trim()}
              className="gap-2 font-medium shadow-xs"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Guardando…
                </>
              ) : (
                'Guardar'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
  const [deleting, setDeleting] = useState(false);
  const matches = confirmText.trim() === project.name;

  async function handleDelete() {
    if (!matches) return;
    setDeleting(true);
    try {
      await api.projects.delete(project.id, confirmText);
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar el proyecto.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="relative sm:max-w-lg p-6 gap-5 overflow-hidden">
        {/* Top destructive accent gradient strip */}
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-destructive via-red-500 to-rose-600" />

        <div className="flex items-start gap-4 w-full min-w-0">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive border border-destructive/25 shadow-xs ring-4 ring-destructive/5 dark:bg-destructive/15 dark:ring-destructive/10">
            <Trash2 className="size-5" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
              Eliminar proyecto
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Esta acción es{' '}
              <strong className="text-foreground font-semibold">permanente e irreversible</strong>.
            </DialogDescription>
          </div>
        </div>

        {/* Affected summary preview card */}
        <div className="rounded-xl border border-destructive/20 bg-destructive/[0.04] p-3.5 dark:border-destructive/30 dark:bg-destructive/[0.08] flex flex-col gap-2 w-full min-w-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-destructive shrink-0" aria-hidden="true" />
            <p className="text-xs font-semibold text-foreground">
              Se eliminará definitivamente el proyecto y todos sus artefactos:
            </p>
          </div>
          <div className="rounded-lg border border-destructive/20 bg-background/80 p-2.5 w-full min-w-0">
            <p className="text-sm font-semibold text-foreground break-all">{project.name}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Fuentes, requerimientos, casos de uso, diseños, líneas base y código generado.
            </p>
          </div>

          <div className="flex flex-col gap-1.5 pt-1 w-full min-w-0">
            <Label htmlFor="confirm-project-name" className="text-xs font-medium text-foreground">
              Para confirmar, escriba el nombre exacto:{' '}
              <strong className="text-destructive font-semibold">{project.name}</strong>
            </Label>
            <Input
              id="confirm-project-name"
              autoFocus
              className="bg-background text-sm border-destructive/30 focus-visible:ring-destructive/30"
              placeholder={project.name}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="-mx-6 -mb-6 mt-1 flex items-center justify-end gap-2 border-t border-border/50 bg-muted/25 px-6 py-4 rounded-b-2xl dark:bg-muted/10 w-[calc(100%+3rem)]">
          <Button
            type="button"
            variant="outline"
            className="border-border/80 hover:bg-muted font-medium"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!matches || deleting}
            onClick={handleDelete}
            className="gap-2 font-medium shadow-xs"
          >
            {deleting ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Eliminando…
              </>
            ) : (
              <>
                <Trash2 className="size-4" aria-hidden="true" />
                Eliminar definitivamente
              </>
            )}
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
  const [archiving, setArchiving] = useState(false);

  async function handleArchive() {
    setArchiving(true);
    try {
      await api.projects.archive(project.id);
      onArchived();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo archivar el proyecto.');
    } finally {
      setArchiving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="relative sm:max-w-lg p-6 gap-5 overflow-hidden">
        {/* Top amber accent gradient strip */}
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-amber-500 via-amber-400 to-orange-500" />

        <div className="flex items-start gap-4 w-full min-w-0">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25 shadow-xs ring-4 ring-amber-500/5 dark:ring-amber-500/10">
            <Archive className="size-5" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
              Archivar proyecto
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Archivarlo lo marca como inactivo sin borrar nada de su historial. Podrá restaurarlo
              cuando quiera.
            </DialogDescription>
          </div>
        </div>

        {/* Project detail card */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3.5 dark:border-amber-500/30 dark:bg-amber-500/[0.07] flex flex-col gap-2 w-full min-w-0">
          <div className="flex items-center gap-2">
            <FolderKanban
              className="size-4 text-amber-600 dark:text-amber-400 shrink-0"
              aria-hidden="true"
            />
            <p className="text-xs font-semibold text-foreground">Proyecto que se archivará:</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/80 p-2.5 w-full min-w-0">
            <p className="text-sm font-semibold text-foreground break-all">{project.name}</p>
            {project.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {project.description}
              </p>
            )}
          </div>
        </div>

        {/* Reassurance banner */}
        <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground w-full min-w-0">
          <AlertTriangle className="size-4 shrink-0 text-amber-500 mt-0.5" aria-hidden="true" />
          <span>
            Sus artefactos permanecerán intactos y protegidos. Ningún colaborador perderá datos.
          </span>
        </div>

        <DialogFooter className="-mx-6 -mb-6 mt-1 flex items-center justify-end gap-2 border-t border-border/50 bg-muted/25 px-6 py-4 rounded-b-2xl dark:bg-muted/10 w-[calc(100%+3rem)]">
          <Button
            type="button"
            variant="outline"
            className="border-border/80 hover:bg-muted font-medium"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={archiving}
            onClick={handleArchive}
            className="gap-2 font-medium shadow-xs bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-500"
          >
            {archiving ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Archivando…
              </>
            ) : (
              <>
                <Archive className="size-4" aria-hidden="true" />
                Archivar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectCard({ project, onDeleted }: { project: ProjectResponse; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState<'archive' | 'delete' | null>(null);
  const [editing, setEditing] = useState(false);
  const { projectId, setProjectId } = useActiveProject();
  const active = projectId === project.id;
  const archived = project.archivedAt !== null;

  return (
    <div
      className={`group relative flex flex-col justify-between rounded-xl border p-4 sm:p-5 transition-all duration-200 ease-out ${
        active
          ? 'border-primary/50 bg-gradient-to-b from-primary/[0.05] via-card to-card shadow-sm ring-1 ring-primary/20 dark:from-primary/[0.08]'
          : 'border-border/70 bg-card hover:border-border hover:shadow-md dark:border-border/60 dark:hover:border-border/90 hover:-translate-y-0.5'
      }`}
    >
      <div className="flex flex-col gap-3">
        {/* Top Header: Folder Icon + Name & Route Badge + Edit button */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`flex size-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105 ${
                active
                  ? 'bg-primary/15 text-primary border border-primary/25 shadow-xs'
                  : 'bg-muted/70 text-muted-foreground border border-border/50 group-hover:bg-primary/10 group-hover:text-primary transition-colors'
              }`}
            >
              <FolderKanban className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h3
                  className="truncate text-sm sm:text-base font-semibold leading-tight text-foreground transition-colors group-hover:text-primary"
                  title={project.name}
                >
                  {project.name}
                </h3>
                {active && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary border border-primary/20 shrink-0">
                    <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                    Activo
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="inline-flex items-center rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/40">
                  {WORKFLOW_ROUTE_LABELS[project.workflowRoute] ?? project.workflowRoute}
                </span>
                {archived && (
                  <span className="inline-flex items-center rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    Archivado
                  </span>
                )}
              </div>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-7.5 shrink-0 text-muted-foreground/70 hover:text-foreground hover:bg-muted"
            aria-label={`Editar el proyecto ${project.name}`}
            title="Editar nombre y descripción"
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-3.5" aria-hidden="true" />
          </Button>
        </div>

        {/* Description & metadata */}
        <div className="flex flex-col gap-1.5">
          {project.description ? (
            <p className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">
              {project.description}
            </p>
          ) : null}
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CalendarDays className="size-3.5 opacity-60" aria-hidden="true" />
            <span>
              Creado el{' '}
              {new Date(project.createdAt).toLocaleDateString('es', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Footer: Primary action on left, icon buttons on right */}
      <div className="mt-4 flex items-center justify-between gap-2 pt-3 border-t border-border/50">
        <div>
          {active ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled
              className="h-8 px-2.5 text-xs font-medium cursor-default bg-primary/10 text-primary border border-primary/20"
            >
              <Check className="size-3.5 mr-1 text-primary" aria-hidden="true" />
              Proyecto activo
            </Button>
          ) : (
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-8 px-3 text-xs font-medium shadow-xs group/btn"
              onClick={() => setProjectId(project.id)}
            >
              Usar este proyecto
              <ArrowRight
                className="ml-1 size-3.5 transition-transform duration-200 group-hover/btn:translate-x-0.5"
                aria-hidden="true"
              />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1">
          {archived ? (
            <RestoreProjectButton project={project} onRestored={onDeleted} />
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-8 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Archivar"
              title="Archivar proyecto"
              onClick={() => setConfirming('archive')}
            >
              <Archive className="size-3.5" aria-hidden="true" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/20 transition-colors"
            aria-label="Eliminar"
            title="Eliminar proyecto"
            onClick={() => setConfirming('delete')}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {editing ? <EditProjectDialog project={project} onOpenChange={setEditing} /> : null}
      {confirming === 'archive' ? (
        <ArchiveProjectDialog
          project={project}
          onOpenChange={(open) => setConfirming(open ? 'archive' : null)}
          onArchived={onDeleted}
        />
      ) : confirming === 'delete' ? (
        <DeleteProjectDialog
          project={project}
          onOpenChange={(open) => setConfirming(open ? 'delete' : null)}
          onDeleted={onDeleted}
        />
      ) : null}
    </div>
  );
}

function RestoreProjectButton({
  project,
  onRestored,
}: {
  project: ProjectResponse;
  onRestored: () => void;
}) {
  const [restoring, setRestoring] = useState(false);
  async function handleRestore() {
    setRestoring(true);
    try {
      await api.projects.unarchive(project.id);
      toast.success('Proyecto restaurado.');
      onRestored();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo restaurar el proyecto.');
    } finally {
      setRestoring(false);
    }
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 px-2.5 text-xs font-medium border-border/70 hover:bg-accent/60"
      disabled={restoring}
      onClick={handleRestore}
      title="Restaurar proyecto"
    >
      <ArchiveRestore className="size-3.5 mr-1 text-muted-foreground" aria-hidden="true" />
      {restoring ? 'Restaurando…' : 'Restaurar'}
    </Button>
  );
}

const PAGE_SIZE = 12;
const STATUS_LABELS: Record<(typeof PROJECT_LIST_STATUSES)[number], string> = {
  ACTIVE: 'Activos',
  ARCHIVED: 'Archivados',
  ALL: 'Todos',
};
const SORT_LABELS: Record<(typeof PROJECT_LIST_SORTS)[number], string> = {
  RECENT: 'Más recientes',
  UPDATED: 'Modificados recientemente',
  OLDEST: 'Más antiguos',
  NAME: 'Nombre (A-Z)',
};
const select =
  'h-9 rounded-lg border border-border/80 bg-card px-2.5 text-xs sm:text-sm text-foreground shadow-2xs transition-colors hover:border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 cursor-pointer dark:bg-card dark:border-border/60';

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const { setProjectId } = useActiveProject();
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: () => api.workspaces.list() });
  const workspaceId = workspaces.data?.items[0]?.id;
  const [creating, setCreating] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<(typeof PROJECT_LIST_STATUSES)[number]>('ACTIVE');
  const [route, setRoute] = useState<WorkflowRoute | ''>('');
  const [sort, setSort] = useState<(typeof PROJECT_LIST_SORTS)[number]>('RECENT');
  const [page, setPage] = useState(0);
  // The search waits for a pause in typing instead of querying per keystroke,
  // and only a different search goes back to the first page (on load it is
  // unchanged, so a quick click on Siguiente is not undone 300 ms later).
  useEffect(() => {
    const next = searchInput.trim();
    if (next === search) return;
    const timer = setTimeout(() => {
      setSearch(next);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, search]);
  const filters = {
    search: search || undefined,
    status,
    workflowRoute: route || undefined,
    sort,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };
  const projects = useQuery({
    queryKey: ['projects', workspaceId, filters],
    queryFn: () => api.projects.list(workspaceId!, filters),
    enabled: Boolean(workspaceId),
    placeholderData: keepPreviousData,
  });
  const total = projects.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Archiving or deleting the last card of a page leaves it empty: step back.
  useEffect(() => {
    if (projects.data && page > 0 && page >= pageCount) setPage(pageCount - 1);
  }, [projects.data, page, pageCount]);
  const filtered = Boolean(search) || status !== 'ACTIVE' || Boolean(route);

  function invalidate() {
    // Also refreshes the project switcher, which shares the prefix.
    queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
            <FolderKanban className="size-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">Proyectos</h1>
              {total > 0 ? (
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary border border-primary/20">
                  {total}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Explore, cree y configure los proyectos de su espacio de trabajo.
            </p>
          </div>
        </div>

        {workspaceId ? (
          <Button
            type="button"
            size="sm"
            className="gap-2 font-medium shadow-xs self-start sm:self-auto"
            onClick={() => setCreating(true)}
          >
            <Plus className="size-4" aria-hidden="true" />
            Nuevo proyecto
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:min-w-[260px] sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Buscar proyectos"
            placeholder="Buscar por nombre o descripción"
            className="h-9 pl-8 text-xs sm:text-sm bg-card border-border/80 shadow-2xs hover:border-border focus:border-primary"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <select
          aria-label="Estado"
          className={select}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(0);
          }}
        >
          {(['ACTIVE', 'ARCHIVED', 'ALL'] as const).map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value]}
            </option>
          ))}
        </select>
        <select
          aria-label="Ruta de trabajo"
          className={select}
          value={route}
          onChange={(e) => {
            setRoute(e.target.value as WorkflowRoute | '');
            setPage(0);
          }}
        >
          <option value="">Todas las rutas</option>
          {WORKFLOW_ROUTES.map((value) => (
            <option key={value} value={value}>
              {WORKFLOW_ROUTE_LABELS[value]}
            </option>
          ))}
        </select>
        <select
          aria-label="Ordenar por"
          className={select}
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as typeof sort);
            setPage(0);
          }}
        >
          {(['RECENT', 'UPDATED', 'OLDEST', 'NAME'] as const).map((value) => (
            <option key={value} value={value}>
              {SORT_LABELS[value]}
            </option>
          ))}
        </select>
        {filtered ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setSearchInput('');
              setSearch('');
              setStatus('ACTIVE');
              setRoute('');
              setPage(0);
            }}
          >
            <X className="size-3.5 mr-1" aria-hidden="true" />
            Limpiar filtros
          </Button>
        ) : null}
      </div>

      <QueryState
        isLoading={workspaces.isLoading || projects.isLoading}
        error={workspaces.error ?? projects.error}
      >
        {projects.data && projects.data.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/20 p-8 text-center sm:p-12">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted/80 text-muted-foreground border border-border/60 shadow-xs mb-3.5">
              {filtered ? (
                <Search className="size-6 text-muted-foreground" aria-hidden="true" />
              ) : (
                <FolderPlus className="size-6 text-primary" aria-hidden="true" />
              )}
            </div>
            <h3 className="text-base font-semibold text-foreground">
              {filtered ? 'No se encontraron proyectos' : 'Todavía no hay proyectos'}
            </h3>
            <p className="mt-1 max-w-sm text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {filtered
                ? 'Ningún proyecto coincide con los filtros. Intente ajustar los términos o restablecer los filtros.'
                : 'Todavía no hay proyectos activos. Cree su primer proyecto para comenzar con CASEFlow AI.'}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {filtered ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setSearchInput('');
                    setSearch('');
                    setStatus('ACTIVE');
                    setRoute('');
                    setPage(0);
                  }}
                >
                  <X className="size-3.5" aria-hidden="true" />
                  Limpiar filtros
                </Button>
              ) : workspaceId ? (
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5 shadow-xs"
                  onClick={() => setCreating(true)}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Crear primer proyecto
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <div
              className={`grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${
                projects.isPlaceholderData ? 'opacity-60' : ''
              }`}
            >
              {projects.data?.items.map((project) => (
                <ProjectCard key={project.id} project={project} onDeleted={invalidate} />
              ))}
            </div>
            <PaginationNav
              page={page}
              pageCount={pageCount}
              total={total}
              pageSize={PAGE_SIZE}
              setPage={setPage}
              itemLabel="proyectos"
              ariaLabel="Paginación de proyectos"
            />
          </>
        )}
      </QueryState>

      {creating && workspaceId ? (
        <NewProjectDialog
          open={creating}
          onOpenChange={setCreating}
          workspaceId={workspaceId}
          onCreated={async (id) => {
            await invalidate();
            setProjectId(id);
            toast.success('Proyecto creado y activado.');
          }}
        />
      ) : null}
    </div>
  );
}
