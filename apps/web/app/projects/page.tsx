'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Search,
  Pencil,
  Trash2,
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
  Textarea,
} from '@caseflow-ai/ui';
import { api, ApiError } from '../../lib/api';
import { QueryState } from '../../components/query-state';
import { useActiveProject } from '../../lib/active-project';
import { WORKFLOW_ROUTE_LABELS } from '../../components/workflow-route';

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
      <DialogContent>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Editar proyecto</DialogTitle>
            <DialogDescription>
              Cambiar el nombre no afecta a sus artefactos, códigos ni versiones aprobadas.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`project-name-${project.id}`}>Nombre</Label>
            <Input
              id={`project-name-${project.id}`}
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`project-description-${project.id}`}>Descripción (opcional)</Label>
            <Textarea
              id={`project-description-${project.id}`}
              rows={3}
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? 'Guardando…' : 'Guardar'}
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar proyecto</DialogTitle>
          <DialogDescription>
            Esta acción es <strong>permanente e irreversible</strong>: se borrarán las fuentes y sus
            archivos, el contexto, los requisitos, los diseños, las líneas base, el código generado
            y todo el historial del proyecto, también lo aprobado. Si solo quiere dejar de usarlo,
            archívelo. Solo pueden eliminarlo su propietario y el propietario o los administradores
            del espacio de trabajo.
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archivar proyecto</DialogTitle>
          <DialogDescription>
            Archivarlo lo marca como inactivo sin borrar nada de su historial. Podrá restaurarlo
            cuando quiera.
          </DialogDescription>
        </DialogHeader>
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
  const [confirming, setConfirming] = useState<'archive' | 'delete' | null>(null);
  const [editing, setEditing] = useState(false);
  const { projectId, setProjectId } = useActiveProject();
  const active = projectId === project.id;
  const archived = project.archivedAt !== null;

  return (
    <Card
      className={`group relative flex flex-col overflow-hidden transition-all duration-300 ease-out hover:-translate-y-1 ${
        active
          ? 'border-primary bg-primary/5 shadow-md ring-1 ring-primary/20 dark:bg-primary/10'
          : 'hover:border-primary/40 hover:shadow-lg'
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-3 text-base font-semibold leading-tight text-foreground transition-colors duration-300 group-hover:text-primary">
            <div
              className={`flex size-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110 ${
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <FolderKanban className="size-4.5" aria-hidden="true" />
            </div>
            <span className="line-clamp-2">{project.name}</span>
          </CardTitle>
          <div className="flex shrink-0 items-center gap-1">
            {archived ? (
              <Badge variant="secondary" className="bg-muted/50">
                Archivado
              </Badge>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Editar el proyecto ${project.name}`}
              title="Editar nombre y descripción"
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-3.5 text-muted-foreground" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex flex-1 flex-col gap-3">
          {project.description ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
          ) : null}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="size-3.5 opacity-70" aria-hidden="true" />
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
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3 border-t border-border/40">
          <Button
            type="button"
            variant={active ? 'secondary' : 'default'}
            size="sm"
            className={active ? 'pointer-events-none font-medium' : 'group/btn font-medium'}
            onClick={() => setProjectId(project.id)}
          >
            {active ? (
              'Proyecto activo'
            ) : (
              <>
                Usar este proyecto
                <ArrowRight
                  className="ml-1 size-3.5 transition-transform duration-300 group-hover/btn:translate-x-1"
                  aria-hidden="true"
                />
              </>
            )}
          </Button>
          {archived ? (
            <RestoreProjectButton project={project} onRestored={onDeleted} />
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirming('archive')}
            >
              <Archive className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Archivar
            </Button>
          )}
          {/* DEC-134: any project can be deleted, approved history included. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-destructive/30 text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/20"
            onClick={() => setConfirming('delete')}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Eliminar
          </Button>
        </div>
      </CardContent>
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
    </Card>
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
    <Button type="button" variant="outline" size="sm" disabled={restoring} onClick={handleRestore}>
      <ArchiveRestore className="size-3.5 text-muted-foreground" aria-hidden="true" />
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
const select = 'h-9 rounded-md border border-input bg-background px-2 text-sm';

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: () => api.workspaces.list() });
  const workspaceId = workspaces.data?.items[0]?.id;
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
      <h1 className="text-xl font-semibold text-foreground">Proyectos</h1>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:w-72">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Buscar proyectos"
            placeholder="Buscar por nombre o descripción"
            className="pl-8"
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
            onClick={() => {
              setSearchInput('');
              setSearch('');
              setStatus('ACTIVE');
              setRoute('');
              setPage(0);
            }}
          >
            Limpiar filtros
          </Button>
        ) : null}
      </div>
      <QueryState
        isLoading={workspaces.isLoading || projects.isLoading}
        error={workspaces.error ?? projects.error}
      >
        {projects.data && projects.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filtered
              ? 'Ningún proyecto coincide con los filtros.'
              : 'Todavía no hay proyectos activos.'}
          </p>
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
            <nav
              aria-label="Paginación de proyectos"
              className="flex flex-col items-center justify-between gap-2 text-sm text-muted-foreground sm:flex-row"
            >
              <span>
                Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de{' '}
                {total} proyectos
              </span>
              {pageCount > 1 ? (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="size-4" aria-hidden="true" />
                    Anterior
                  </Button>
                  <span aria-live="polite">
                    Página {page + 1} de {pageCount}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page + 1 >= pageCount}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Siguiente
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
            </nav>
          </>
        )}
      </QueryState>
    </div>
  );
}
