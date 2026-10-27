'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  BookOpen,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileCode,
  FileText,
  Info,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Send,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@caseflow-ai/ui';
import {
  editUserManualSchema,
  type EditUserManualRequest,
  type UserManualResponse,
} from '@caseflow-ai/contracts';
import { api, ApiError } from '../../../lib/api';
import { RequireActiveProject } from '../../../components/query-state';
import { AuthedDownloadButton, AuthedImage } from '../../../components/authed-media';
import { StatusBadge } from '../../../components/status-badge';
import { formatDuration, useElapsed } from '../../../components/generation-overlay';
import { PaginationNav } from '../../../components/pagination-nav';

const DOCKER_CAPTURE_PHASES = [
  {
    id: 'docker-boot',
    label: 'Sandbox Docker',
    sublabel: 'Arranque del contenedor y BD',
    icon: Server,
  },
  {
    id: 'auth-roles',
    label: 'Cuentas y roles',
    sublabel: 'Sesiones de prueba por rol',
    icon: ShieldCheck,
  },
  {
    id: 'navigation-capture',
    label: 'Navegación y capturas',
    sublabel: 'Recorrido de vistas de escritorio',
    icon: Camera,
  },
  {
    id: 'linking-manual',
    label: 'Vinculación de tareas',
    sublabel: 'Asociación a pasos del manual',
    icon: CheckCircle2,
  },
] as const;

const MANUAL_GENERATION_PHASES = [
  {
    id: 'structure',
    label: 'Estructuración inicial',
    sublabel: 'Rutas y pantallas de esta entrega',
    icon: BookOpen,
  },
  {
    id: 'sandbox-boot',
    label: 'Sandbox Docker',
    sublabel: 'Arranque de backend y frontend',
    icon: Server,
  },
  {
    id: 'captures',
    label: 'Capturas de pantalla',
    sublabel: 'Fotografías del estado inicial',
    icon: Camera,
  },
  {
    id: 'compilation',
    label: 'Manual para revisión',
    sublabel: 'Nueva versión candidata',
    icon: FileText,
  },
] as const;

const DOCKER_CAPTURE_TIPS = [
  'La aplicación se ejecuta en un entorno aislado con una base de datos vacía.',
  'Las sesiones de prueba corresponden a los roles documentados en el manual.',
  'Cada imagen muestra el estado inicial de una ruta; no comprueba operaciones completas.',
  'Las capturas se vinculan a una nueva versión del manual y requieren revisión.',
  'Las rutas que necesitan registros de prueba pueden quedar pendientes de captura.',
  'Puede tardar varios minutos mientras Docker prepara y ejecuta la aplicación.',
];

const MANUAL_GENERATION_TIPS = [
  'El manual utiliza las rutas y las pantallas de la versión exacta del software generado.',
  'Las instrucciones son una propuesta que debe revisarse en la aplicación.',
  'La obtención de capturas puede requerir varios minutos de preparación.',
  'Un fallo de captura conserva el esquema del flujo para su revisión manual.',
  'El HTML y el PDF se preparan al solicitar su descarga.',
];

function ManualGenerationProgressCard({
  mode = 'capture',
  queued = false,
}: {
  mode?: 'generate' | 'capture';
  queued?: boolean;
}) {
  const [startedAt] = useState(() => Date.now());
  const elapsed = useElapsed(startedAt);
  const [tipIndex, setTipIndex] = useState(0);

  const tips = mode === 'generate' ? MANUAL_GENERATION_TIPS : DOCKER_CAPTURE_TIPS;
  const phases = mode === 'generate' ? MANUAL_GENERATION_PHASES : DOCKER_CAPTURE_PHASES;

  useEffect(() => {
    const timer = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % tips.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [tips.length]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative overflow-hidden rounded-2xl border border-primary/25 bg-linear-to-br from-primary/5 via-card/95 to-indigo-500/5 p-4 sm:p-5 shadow-sm dark:border-primary/35 dark:bg-card/90"
    >
      {/* Ambient background glows */}
      <div
        className="pointer-events-none absolute -top-12 -right-12 size-40 rounded-full bg-primary/10 blur-2xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-12 -left-12 size-40 rounded-full bg-indigo-500/10 blur-2xl"
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col gap-4">
        {/* Header: Orbital animation + Info + Stats */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <div
              className="relative flex size-12 shrink-0 items-center justify-center"
              aria-hidden="true"
            >
              <div className="ai-orbit absolute inset-0 rounded-full border-2 border-primary/30 border-t-primary" />
              <div className="ai-orbit-reverse absolute inset-1.5 rounded-full border-2 border-indigo-500/25 border-b-indigo-500" />
              <div className="ai-pulse flex size-7 items-center justify-center rounded-full bg-primary/15 text-primary shadow-xs">
                {mode === 'generate' ? (
                  <Sparkles className="size-3.5 text-primary" />
                ) : (
                  <Camera className="size-3.5 text-primary" />
                )}
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-foreground tracking-tight">
                  {mode === 'generate'
                    ? 'Generando el manual visual…'
                    : 'Capturando pantallas en entorno aislado (Docker)'}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  <span className="size-1.5 rounded-full bg-primary animate-ping" />
                  {queued ? 'En cola' : 'Procesando'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {mode === 'generate'
                  ? 'Estructurando tareas y levantando sandbox Docker para capturas reales.'
                  : 'Ejecutando la aplicación generada para fotografiar cada ruta y rol.'}
              </p>
            </div>
          </div>

          <div className="flex items-baseline justify-between gap-3 sm:flex-col sm:items-end sm:gap-0.5 border-t border-border/40 pt-2 sm:border-0 sm:pt-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Sin porcentaje confirmado</span>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              Tiempo en esta vista:{' '}
              <span className="font-medium text-foreground">{formatDuration(elapsed)}</span>
            </p>
          </div>
        </div>

        {/* Progress Bar with animated shimmer */}
        <div className="space-y-1">
          <div
            role="progressbar"
            aria-label="Progreso de generación y capturas"
            aria-valuetext={queued ? 'En cola' : 'En ejecución; sin porcentaje disponible'}
            className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted/80 shadow-inner border border-border/40"
          >
            <div className="relative h-full w-1/3 animate-pulse rounded-full bg-linear-to-r from-primary via-indigo-500 to-blue-500 shadow-xs shadow-primary/30 motion-reduce:animate-none">
              <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
            </div>
          </div>
        </div>

        {/* Process activities */}
        <p className="text-[11px] text-muted-foreground">
          Actividades del proceso; su finalización no se confirma individualmente.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2.5 pt-0.5">
          {phases.map((phase) => {
            const Icon = phase.icon;
            return (
              <div
                key={phase.id}
                className="flex flex-col gap-1 rounded-xl border border-border/60 bg-muted/30 p-2.5 text-xs text-muted-foreground"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Icon className="size-3.5" />
                    <span className="font-semibold truncate">{phase.label}</span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight line-clamp-1">
                  {phase.sublabel}
                </p>
              </div>
            );
          })}
        </div>

        {/* Rotating Tips Box */}
        <div className="flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 text-primary shrink-0 animate-pulse" />
          <p className="leading-snug transition-opacity duration-300">{tips[tipIndex]}</p>
        </div>

        {/* Technical notice preserved */}
        <p className="text-[11px] text-muted-foreground italic text-center sm:text-left">
          Puede tardar varios minutos mientras Docker prepara y ejecuta la aplicación.
        </p>
      </div>
    </div>
  );
}

const normalizeText = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export function ManualEditor({
  manual,
  busy,
  save,
  onDirtyChange,
}: {
  manual: UserManualResponse;
  busy: boolean;
  save: (input: EditUserManualRequest) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<EditUserManualRequest>({
    expectedVersionId: manual.version.id,
    introduction: manual.introduction,
    tasks: manual.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      verified: task.verified,
      steps: task.steps.map((step) => ({ ...step })),
    })),
  });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'pending'>('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [taskToggleMap, setTaskToggleMap] = useState<Record<string, boolean>>({});

  const isTaskExpanded = (id: string) => {
    if (taskToggleMap[id] !== undefined) return taskToggleMap[id];
    return !allCollapsed;
  };

  const toggleTask = (id: string) => {
    setTaskToggleMap((prev) => ({
      ...prev,
      [id]: !isTaskExpanded(id),
    }));
  };

  const handleExpandAll = () => {
    setAllCollapsed(false);
    setTaskToggleMap({});
  };

  const handleCollapseAll = () => {
    setAllCollapsed(true);
    setTaskToggleMap({});
  };

  const updateTask = (index: number, patch: Partial<EditUserManualRequest['tasks'][number]>) => {
    onDirtyChange?.(true);
    setDraft((current) => ({
      ...current,
      tasks: current.tasks.map((task, i) => (i === index ? { ...task, ...patch } : task)),
    }));
  };

  const verifiedCount = draft.tasks.filter((t) => t.verified).length;
  const totalTasksCount = draft.tasks.length;
  const verifiedPercent =
    totalTasksCount > 0 ? Math.round((verifiedCount / totalTasksCount) * 100) : 0;
  const pendingCount = totalTasksCount - verifiedCount;

  // Filter tasks preserving originalIndex so updates always target the right task
  const filteredTasksWithOriginalIndex = useMemo(() => {
    const q = normalizeText(search.trim());
    return draft.tasks
      .map((task, originalIndex) => ({ task, originalIndex }))
      .filter(({ task, originalIndex }) => {
        if (statusFilter === 'verified' && !task.verified) return false;
        if (statusFilter === 'pending' && task.verified) return false;
        if (!q) return true;

        const origTask = manual.tasks[originalIndex];
        const matchTitle = normalizeText(task.title).includes(q);
        const matchRole = origTask?.roles?.some((r) => normalizeText(r).includes(q));
        const matchRoute = origTask?.routePath?.toLowerCase().includes(q);
        const matchStep = task.steps.some(
          (s) =>
            normalizeText(s.instruction).includes(q) || normalizeText(s.expectedResult).includes(q),
        );
        return matchTitle || matchRole || matchRoute || matchStep;
      });
  }, [draft.tasks, manual.tasks, search, statusFilter]);

  const totalFiltered = filteredTasksWithOriginalIndex.length;
  const pageCount = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const validPage = Math.min(page, Math.max(0, pageCount - 1));
  const pageStart = validPage * pageSize;
  const pagedTasks = filteredTasksWithOriginalIndex.slice(pageStart, pageStart + pageSize);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = editUserManualSchema.safeParse(draft);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          const taskIndex =
            issue?.path[0] === 'tasks' && typeof issue.path[1] === 'number' ? issue.path[1] : null;
          if (taskIndex !== null) {
            setSearch('');
            setStatusFilter('all');
            setPage(Math.floor(taskIndex / pageSize));
            setAllCollapsed(false);
            setTaskToggleMap({});
          }
          toast.error(
            taskIndex === null
              ? 'Revise la introducción del manual.'
              : `Revise los campos de la tarea ${taskIndex + 1} antes de guardar.`,
          );
          return;
        }
        void save(parsed.data);
      }}
    >
      {/* Sticky Action & Progress Bar */}
      <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card/95 p-3 shadow-md backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-foreground">
              Editor de tareas ({totalTasksCount})
            </span>
            <span className="text-[11px] text-muted-foreground font-mono">
              {verifiedCount} de {totalTasksCount} verificadas ({verifiedPercent}%)
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <div className="h-2 w-28 overflow-hidden rounded-full bg-muted border border-border/50">
              <div
                className={`h-full transition-all duration-300 ${
                  verifiedPercent === 100 ? 'bg-emerald-500' : 'bg-primary'
                }`}
                style={{ width: `${verifiedPercent}%` }}
              />
            </div>
            {verifiedPercent === 100 ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="size-3" /> Verificación completa
              </span>
            ) : null}
          </div>
        </div>

        <Button type="submit" disabled={busy} className="h-8 px-4 text-xs font-semibold shadow-xs">
          {busy ? (
            <>
              <Loader2 className="size-3.5 animate-spin mr-1.5" />
              Guardando…
            </>
          ) : (
            'Guardar nueva versión'
          )}
        </Button>
      </div>

      {/* Introduction */}
      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-2xs space-y-2">
        <label htmlFor="manual-intro-field" className="text-xs font-bold text-foreground block">
          Introducción
        </label>
        <textarea
          id="manual-intro-field"
          aria-label="Introducción"
          className="min-h-20 w-full rounded-lg border border-input bg-background p-3 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground shadow-2xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          maxLength={2000}
          required
          value={draft.introduction}
          onChange={(event) => {
            onDirtyChange?.(true);
            setDraft({
              ...draft,
              introduction: event.target.value,
              tasks: draft.tasks.map((task) => ({ ...task, verified: false })),
            });
          }}
        />
        <p className="text-[11px] text-muted-foreground">
          Breve resumen introductorio para guiar a los usuarios en la navegación de la aplicación
          generada.
        </p>
      </div>

      {/* Search, filters and expansion controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Buscar por tarea, rol, ruta o instrucción…"
            aria-label="Buscar tareas en el manual"
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-7 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          />
          {search ? (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setPage(0);
              }}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setStatusFilter('all');
              setPage(0);
            }}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              statusFilter === 'all'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Todas ({totalTasksCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('verified');
              setPage(0);
            }}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              statusFilter === 'verified'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Verificadas ({verifiedCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('pending');
              setPage(0);
            }}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              statusFilter === 'pending'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Pendientes ({pendingCount})
          </button>

          <div className="h-4 w-px bg-border/60 mx-1 hidden sm:block" />

          <button
            type="button"
            onClick={allCollapsed ? handleExpandAll : handleCollapseAll}
            className="rounded-md border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors shadow-2xs"
          >
            {allCollapsed ? 'Expandir todas' : 'Colapsar todas'}
          </button>
        </div>
      </div>

      {/* Paginated tasks */}
      {pagedTasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-card p-8 text-center space-y-2">
          <p className="text-xs font-medium text-foreground">
            No se encontraron tareas con el filtro aplicado.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Intente buscar con otros términos o restablezca los filtros.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSearch('');
              setStatusFilter('all');
              setPage(0);
            }}
            className="h-7 text-xs font-medium mt-2"
          >
            Restablecer filtros
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {pagedTasks.map(({ task, originalIndex }) => {
            const isExpanded = isTaskExpanded(task.id);
            return (
              <section
                className="rounded-xl border border-border/80 bg-card p-4 shadow-2xs space-y-3"
                key={task.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-mono font-bold">
                      {originalIndex + 1}
                    </span>
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground border border-border/50">
                      {manual.tasks[originalIndex]!.roles.join(' · ') || 'Usuario autorizado'}
                    </span>
                    <span className="rounded-md bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {manual.tasks[originalIndex]!.routePath}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {task.verified ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 className="size-3" /> Verificado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800/60">
                        Pendiente
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleTask(task.id)}
                      aria-label={
                        isExpanded
                          ? `Plegar tarea ${originalIndex + 1}`
                          : `Desplegar tarea ${originalIndex + 1}`
                      }
                      aria-expanded={isExpanded}
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expandable task content */}
                {isExpanded ? (
                  <div className="space-y-3 pt-1">
                    <div className="space-y-1.5">
                      <label
                        htmlFor={`task-title-${originalIndex}`}
                        className="text-xs font-bold text-foreground block"
                      >
                        Tarea {originalIndex + 1}
                      </label>
                      <input
                        id={`task-title-${originalIndex}`}
                        aria-label={`Tarea ${originalIndex + 1}`}
                        className="w-full rounded-lg border border-input bg-background p-2 px-3 text-xs font-semibold text-foreground shadow-2xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        value={task.title}
                        required
                        maxLength={200}
                        onChange={(event) =>
                          updateTask(originalIndex, { title: event.target.value, verified: false })
                        }
                      />
                    </div>

                    <p className="text-[11px] text-muted-foreground italic">
                      Esquema del flujo. No es una captura de la aplicación.
                    </p>

                    <ol className="space-y-3 pt-1">
                      {task.steps.map((step, stepIndex) => (
                        <li
                          className="flex gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 shadow-2xs"
                          key={stepIndex}
                        >
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold font-mono border border-primary/20">
                            {stepIndex + 1}
                          </span>
                          <div className="w-full space-y-2">
                            <div className="space-y-1">
                              <label
                                htmlFor={`step-inst-${originalIndex}-${stepIndex}`}
                                className="text-xs font-semibold text-foreground block"
                              >
                                Instrucción {stepIndex + 1}
                              </label>
                              <textarea
                                id={`step-inst-${originalIndex}-${stepIndex}`}
                                aria-label={`Instrucción ${stepIndex + 1}`}
                                className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground shadow-2xs focus:border-primary focus:outline-none"
                                value={step.instruction}
                                required
                                maxLength={1000}
                                onChange={(event) =>
                                  updateTask(originalIndex, {
                                    verified: false,
                                    steps: task.steps.map((item, i) =>
                                      i === stepIndex
                                        ? { ...item, instruction: event.target.value }
                                        : item,
                                    ),
                                  })
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <label
                                htmlFor={`step-res-${originalIndex}-${stepIndex}`}
                                className="text-xs font-semibold text-muted-foreground block"
                              >
                                Qué comprobar
                              </label>
                              <textarea
                                id={`step-res-${originalIndex}-${stepIndex}`}
                                aria-label="Qué comprobar"
                                className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground shadow-2xs focus:border-primary focus:outline-none"
                                value={step.expectedResult}
                                required
                                maxLength={1000}
                                onChange={(event) =>
                                  updateTask(originalIndex, {
                                    verified: false,
                                    steps: task.steps.map((item, i) =>
                                      i === stepIndex
                                        ? { ...item, expectedResult: event.target.value }
                                        : item,
                                    ),
                                  })
                                }
                              />
                            </div>
                            <div className="flex justify-end pt-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive gap-1"
                                disabled={task.steps.length <= 1}
                                onClick={() =>
                                  updateTask(originalIndex, {
                                    verified: false,
                                    steps: task.steps.filter((_, i) => i !== stepIndex),
                                  })
                                }
                              >
                                <Trash2 className="size-3" />
                                Quitar paso
                              </Button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>

                    <div className="flex items-center justify-between pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1.5 shadow-2xs"
                        disabled={task.steps.length >= 24}
                        onClick={() =>
                          updateTask(originalIndex, {
                            verified: false,
                            steps: [...task.steps, { instruction: '', expectedResult: '' }],
                          })
                        }
                      >
                        <Plus className="size-3.5" />
                        Añadir paso
                      </Button>
                    </div>

                    <label className="flex items-start gap-2.5 pt-2 text-xs text-foreground cursor-pointer select-none border-t border-border/50">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-input text-primary focus:ring-primary mt-0.5"
                        checked={task.verified}
                        onChange={(event) =>
                          updateTask(originalIndex, { verified: event.target.checked })
                        }
                      />
                      <span>
                        He comprobado estos pasos en la aplicación correspondiente a esta entrega.
                      </span>
                    </label>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      {/* Pagination controls */}
      <PaginationNav
        page={validPage}
        pageCount={pageCount}
        total={totalFiltered}
        pageSize={pageSize}
        setPage={setPage}
        pageSizeOptions={[10, 20, 50, 100]}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(0);
        }}
        itemLabel="tareas"
        ariaLabel="Paginación de tareas del manual"
        hideWhenSinglePage={false}
      />
    </form>
  );
}

function HistoricalManualView({ manual }: { manual: UserManualResponse }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const filteredTasks = useMemo(() => {
    const q = normalizeText(search.trim());
    return manual.tasks.filter((task) => {
      if (!q) return true;
      const matchTitle = normalizeText(task.title).includes(q);
      const matchRole = task.roles.some((r) => normalizeText(r).includes(q));
      const matchRoute = task.routePath.toLowerCase().includes(q);
      const matchStep = task.steps.some(
        (s) =>
          normalizeText(s.instruction).includes(q) || normalizeText(s.expectedResult).includes(q),
      );
      return matchTitle || matchRole || matchRoute || matchStep;
    });
  }, [manual.tasks, search]);

  const totalFiltered = filteredTasks.length;
  const pageCount = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const validPage = Math.min(page, Math.max(0, pageCount - 1));
  const pageStart = validPage * pageSize;
  const pagedTasks = filteredTasks.slice(pageStart, pageStart + pageSize);

  return (
    <div className="space-y-4 rounded-xl border border-border/80 bg-card p-5 shadow-2xs">
      <div className="border-b border-border/50 pb-3">
        <span className="text-xs font-bold text-foreground">Introducción</span>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{manual.introduction}</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Buscar tareas históricas…"
          aria-label="Buscar tareas históricas"
          className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-7 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        />
        {search ? (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setPage(0);
            }}
            aria-label="Limpiar búsqueda"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <div className="space-y-3">
        {pagedTasks.map((task, idx) => (
          <section
            className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-2"
            key={task.id}
          >
            <div className="flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-mono font-bold">
                {pageStart + idx + 1}
              </span>
              <h2 className="text-xs font-bold text-foreground">{task.title}</h2>
              <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground border border-border/50 ml-auto">
                {task.roles.join(' · ') || 'Usuario'}
              </span>
            </div>
            <ol className="list-decimal pl-5 space-y-1.5 text-xs">
              {task.steps.map((step, index) => (
                <li key={index} className="leading-relaxed">
                  <span className="text-foreground font-medium">{step.instruction}</span>
                  <p className="text-[11px] text-muted-foreground">{step.expectedResult}</p>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <PaginationNav
        page={validPage}
        pageCount={pageCount}
        total={totalFiltered}
        pageSize={pageSize}
        setPage={setPage}
        pageSizeOptions={[10, 20, 50, 100]}
        onPageSizeChange={(newSize) => {
          setPageSize(newSize);
          setPage(0);
        }}
        itemLabel="tareas históricas"
        ariaLabel="Paginación de tareas históricas"
        hideWhenSinglePage={false}
      />
    </div>
  );
}

function ManualContent({ projectId, snapshotId }: { projectId: string; snapshotId: string }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [editorEpoch, setEditorEpoch] = useState(0);

  const state = useQuery({
    queryKey: ['user-manual', projectId, snapshotId],
    queryFn: () => api.userManuals.state(projectId, snapshotId),
    refetchInterval: (query) =>
      ['QUEUED', 'RUNNING', 'CANCELLING'].includes(query.state.data?.job?.status ?? '')
        ? 2000
        : false,
  });

  const historical = useQuery({
    queryKey: ['user-manual-version', projectId, snapshotId, selectedVersion],
    queryFn: () => api.userManuals.version(projectId, snapshotId, selectedVersion),
    enabled: Boolean(selectedVersion),
  });

  const manual = selectedVersion ? historical.data : state.data?.manual;

  const allCaptures = manual ? manual.tasks.flatMap((t) => t.captures ?? []) : [];
  const totalCaptures = allCaptures.length;
  const successfulCaptures = allCaptures.filter((c) => c.status === 'CAPTURED').length;
  const pendingOrFailedCaptures = totalCaptures - successfulCaptures;
  const [userExpandedPreference, setUserExpandedPreference] = useState<boolean | null>(null);
  const capturesExpanded = userExpandedPreference ?? (manual?.tasks.length ?? 0) <= 4;

  const act = async (action: () => Promise<unknown>, successMessage = 'Manual actualizado.') => {
    setBusy(true);
    try {
      await action();
      setIsDirty(false);
      setSelectedVersion('');
      await queryClient.invalidateQueries({ queryKey: ['user-manual', projectId, snapshotId] });
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  };

  if (state.isLoading) {
    return (
      <div
        role="status"
        className="flex items-center justify-center p-12 text-xs text-muted-foreground gap-2"
      >
        <Loader2 className="size-4 animate-spin text-primary" />
        <span>Cargando manual…</span>
      </div>
    );
  }

  if (state.isError) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3"
      >
        <p className="text-sm font-semibold text-destructive">No se pudo consultar esta entrega.</p>
        <Button
          size="sm"
          onClick={() => void state.refetch()}
          className="h-8 text-xs font-semibold"
        >
          Reintentar
        </Button>
      </div>
    );
  }

  const generating = ['QUEUED', 'RUNNING', 'CANCELLING'].includes(state.data?.job?.status ?? '');

  if (selectedVersion && historical.isLoading) {
    return (
      <div
        role="status"
        className="flex items-center justify-center p-12 text-xs text-muted-foreground gap-2"
      >
        <Loader2 className="size-4 animate-spin text-primary" />
        <span>Cargando versión…</span>
      </div>
    );
  }

  if (selectedVersion && historical.isError) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3"
      >
        <p className="text-sm font-semibold text-destructive">
          No se pudo cargar la versión elegida.
        </p>
        <Button
          size="sm"
          onClick={() => setSelectedVersion('')}
          className="h-8 text-xs font-semibold"
        >
          Volver a la última versión
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link
          href="/construction/generation-runs"
          className="inline-flex items-center gap-1.5 font-medium text-muted-foreground hover:text-primary transition-colors group"
        >
          <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
          <span>Volver a proyectos generados</span>
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Manual de usuario</span>
      </div>

      {/* Page heading */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shadow-2xs">
            <BookOpen className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Manual de usuario y entrega
            </h1>
            <p className="text-xs text-muted-foreground">
              Documentación y guía de tareas para los usuarios del software generado.
            </p>
          </div>
        </div>
      </div>

      {/* Manual review notice */}
      <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-muted/30 p-3.5 text-xs leading-relaxed text-muted-foreground shadow-2xs">
        <Info className="size-4 text-primary shrink-0 mt-0.5" />
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-foreground">Aviso sobre el manual de entrega</span>
          <p>
            El manual pertenece a esta versión del software. Revise las instrucciones en la
            aplicación antes de aprobar. Los esquemas no acreditan que una función haya sido
            probada.
          </p>
        </div>
      </div>

      {/* Runtime captures for an existing manual */}
      {manual ? (
        <section className="rounded-xl border border-border/80 bg-card p-4 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/50 pb-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Camera className="size-4 text-primary" />
              <span className="text-xs font-bold text-foreground">
                Capturas de pantalla en entorno aislado (Docker)
              </span>

              {/* Capture summary */}
              <div className="flex flex-wrap items-center gap-1.5 ml-1">
                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground border border-border/50">
                  {totalCaptures} vistas por rol
                </span>
                {successfulCaptures > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold">
                    <CheckCircle2 className="size-3" /> {successfulCaptures} capturadas
                  </span>
                ) : null}
                {pendingOrFailedCaptures > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 px-2 py-0.5 text-[11px] font-semibold">
                    <AlertTriangle className="size-3" /> {pendingOrFailedCaptures} pendientes de
                    revisión
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setUserExpandedPreference(!capturesExpanded)}
                aria-expanded={capturesExpanded}
                className="h-8 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground gap-1 border border-border/60 hover:bg-muted/60"
              >
                {capturesExpanded ? (
                  <>
                    <ChevronUp className="size-3.5" />
                    <span>Plegar capturas</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="size-3.5" />
                    <span>Ver capturas ({totalCaptures})</span>
                  </>
                )}
              </Button>

              {generating && state.data?.job?.captureRequested ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || state.data?.job?.status === 'CANCELLING'}
                  onClick={() =>
                    void act(
                      () => api.userManuals.cancelCapture(projectId, snapshotId),
                      'Cancelación solicitada. Se conservará el manual anterior.',
                    )
                  }
                >
                  {state.data?.job?.status === 'CANCELLING'
                    ? 'Cancelando y liberando recursos…'
                    : 'Cancelar captura'}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={busy || generating || isDirty || Boolean(selectedVersion)}
                onClick={() =>
                  void act(
                    () => api.userManuals.capture(projectId, snapshotId),
                    'Solicitud de capturas enviada.',
                  )
                }
                className="h-8 text-xs font-semibold gap-1.5 shadow-2xs"
              >
                {generating ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1" />
                    Preparando manual o capturando pantallas…
                  </>
                ) : (
                  <>
                    <Camera className="size-3.5" />
                    {totalCaptures > 0 ? 'Volver a generar capturas' : 'Generar capturas'}
                  </>
                )}
              </Button>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Capturas reales en Docker: cuentas de prueba, base vacía y vista de escritorio. No
            comprueban operaciones completas. Las rutas que necesiten registros se revisan
            manualmente.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Genera una nueva versión del manual con las capturas obtenidas y deja sus tareas
            pendientes de verificación.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Se procesan las primeras 40 combinaciones de pantalla y rol. Las demás quedan pendientes
            de revisión manual.
          </p>

          {state.data?.job?.status === 'CANCELLED' ? (
            <p role="status" className="text-sm text-muted-foreground">
              Captura cancelada. El manual anterior se conserva.
            </p>
          ) : null}
          {state.data?.job?.status === 'CANCELLING' ? (
            <p role="status" className="text-sm text-muted-foreground">
              Cancelando la captura y liberando los recursos temporales…
            </p>
          ) : generating ? (
            <ManualGenerationProgressCard
              mode="capture"
              queued={state.data?.job?.status === 'QUEUED'}
            />
          ) : null}

          {capturesExpanded ? (
            <div className="max-h-[480px] overflow-y-auto pr-1 space-y-3 pt-1 border-t border-border/40">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {manual.tasks.map((task) => (
                  <div key={task.id} className="space-y-2">
                    {(task.captures ?? []).map((capture) => (
                      <figure
                        key={capture.id}
                        className="rounded-lg border border-border/70 bg-muted/20 p-2.5 shadow-2xs"
                      >
                        {capture.status === 'CAPTURED' ? (
                          <AuthedImage
                            className="h-auto max-h-72 w-full rounded border border-border/60 object-contain bg-background"
                            url={api.userManuals.captureUrl(
                              projectId,
                              snapshotId,
                              manual.version.id,
                              capture.id,
                            )}
                            alt={`Captura de ${task.title}`}
                          />
                        ) : (
                          <div
                            role="status"
                            className="rounded-md border border-amber-300/60 bg-amber-50/50 dark:border-amber-800/60 dark:bg-amber-950/20 p-2 text-xs text-amber-900 dark:text-amber-200"
                          >
                            {capture.reason}
                          </div>
                        )}
                        <figcaption className="mt-1.5 text-[11px] text-muted-foreground flex items-center justify-between">
                          <span className="font-semibold text-foreground truncate">
                            {task.title}
                          </span>
                          <span>
                            {capture.role || 'Sin autenticación'} ·{' '}
                            {capture.status === 'CAPTURED'
                              ? 'Captura real del estado inicial'
                              : capture.status === 'FAILED'
                                ? 'Captura fallida; se conserva el esquema'
                                : 'Captura pendiente; se conserva el esquema'}
                          </span>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {state.data?.job?.errorMessage ? (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <AlertTriangle className="size-4 shrink-0 text-destructive" />
          <span>{state.data.job.errorMessage}</span>
        </div>
      ) : null}

      {/* Empty manual state */}
      {!manual ? (
        generating ? (
          <ManualGenerationProgressCard
            mode="generate"
            queued={state.data?.job?.status === 'QUEUED'}
          />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/90 bg-card p-10 text-center shadow-2xs">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shadow-sm mb-4">
              <BookOpen className="size-7" />
            </div>
            <h2 className="text-base font-bold text-foreground">
              Esta entrega aún no tiene manual.
            </h2>
            <p
              role="status"
              className="mt-1 max-w-md text-xs text-muted-foreground leading-relaxed"
            >
              Esta entrega aún no tiene manual.
            </p>
            <p className="mt-1 max-w-md text-xs text-muted-foreground leading-relaxed">
              Genera un manual de usuario interactivo y descargable a partir de los casos de uso,
              navegación y componentes del software generado.
            </p>
            <div className="mt-6 flex flex-col items-center gap-2">
              <Button
                disabled={busy || generating}
                onClick={() =>
                  void act(
                    () => api.userManuals.generate(projectId, snapshotId),
                    'Solicitud de generación del manual enviada.',
                  )
                }
                className="h-9 px-5 gap-2 text-xs font-semibold shadow-xs"
              >
                <Sparkles className="size-4" />
                Generar o reintentar manual
              </Button>
            </div>
          </div>
        )
      ) : (
        <>
          {!manual.isCurrent ? (
            <div
              role="alert"
              className="rounded-xl border border-amber-300/80 bg-amber-50/80 dark:border-amber-800/60 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200 shadow-2xs"
            >
              Existe una entrega más reciente. Este manual documenta una versión anterior.
            </div>
          ) : null}

          {/* Version history, review actions and downloads */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-3 shadow-2xs">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-xs font-bold text-foreground">
                {manual.code} · v{manual.version.versionNumber}
              </span>
              <StatusBadge status={manual.version.status} />

              <label className="flex items-center gap-1.5 text-xs text-muted-foreground ml-2">
                <Clock className="size-3.5 text-muted-foreground/70" />
                <span>Historial</span>
                <select
                  disabled={isDirty || busy}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground shadow-2xs focus:border-primary focus:outline-none"
                  value={selectedVersion}
                  onChange={(event) => setSelectedVersion(event.target.value)}
                >
                  <option value="">Última versión</option>
                  {manual.history.map((version) => (
                    <option value={version.id} key={version.id}>
                      Versión {version.versionNumber}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Manual review actions */}
              {!selectedVersion &&
              ['DRAFT', 'GENERATED', 'CHANGES_REQUESTED'].includes(manual.version.status) ? (
                <Button
                  disabled={busy || isDirty || generating}
                  onClick={() =>
                    void act(() =>
                      api.userManuals.transition(
                        projectId,
                        snapshotId,
                        manual.version.id,
                        'IN_REVIEW',
                      ),
                    )
                  }
                  className="h-8 px-3 text-xs font-semibold gap-1.5 shadow-2xs"
                >
                  <Send className="size-3.5" />
                  Enviar a revisión
                </Button>
              ) : null}

              {!selectedVersion && manual.version.status === 'IN_REVIEW' ? (
                <>
                  <Button
                    disabled={
                      busy || isDirty || generating || !manual.tasks.every((task) => task.verified)
                    }
                    onClick={() =>
                      void act(() =>
                        api.userManuals.transition(
                          projectId,
                          snapshotId,
                          manual.version.id,
                          'APPROVED',
                        ),
                      )
                    }
                    className="h-8 px-3 text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs disabled:opacity-50"
                  >
                    <CheckCircle2 className="size-3.5" />
                    Aprobar manual
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || isDirty || generating}
                    onClick={() =>
                      void act(() =>
                        api.userManuals.transition(
                          projectId,
                          snapshotId,
                          manual.version.id,
                          'CHANGES_REQUESTED',
                        ),
                      )
                    }
                    className="h-8 px-3 text-xs font-semibold gap-1.5 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/30 shadow-2xs"
                  >
                    <AlertTriangle className="size-3.5" />
                    Solicitar cambios
                  </Button>
                </>
              ) : null}

              {/* Download actions */}
              {(['html', 'pdf'] as const).map((format) => (
                <AuthedDownloadButton
                  disabled={isDirty}
                  key={format}
                  className="inline-flex items-center gap-1.5 h-8 rounded-lg border border-border/80 bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted/80 transition-colors shadow-2xs disabled:opacity-50"
                  url={api.userManuals.downloadUrl(
                    projectId,
                    snapshotId,
                    manual.version.id,
                    format,
                  )}
                  filename={`manual-v${manual.version.versionNumber}.${format}`}
                >
                  {format === 'pdf' ? (
                    <FileText className="size-3.5 text-red-500" />
                  ) : (
                    <FileCode className="size-3.5 text-blue-500" />
                  )}
                  Descargar {format.toUpperCase()}
                  {manual.version.status === 'APPROVED' ? '' : ' (borrador)'}
                </AuthedDownloadButton>
              ))}
              {manual.version.status === 'APPROVED' ? (
                <AuthedDownloadButton
                  disabled={isDirty}
                  className="inline-flex items-center gap-1.5 h-8 rounded-lg border border-emerald-500/40 bg-emerald-600 px-3.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors shadow-2xs disabled:opacity-50"
                  url={api.userManuals.downloadUrl(projectId, snapshotId, manual.version.id, 'zip')}
                  filename={`entrega-${snapshotId}.zip`}
                >
                  <Archive className="size-3.5" />
                  Descargar software y manual
                </AuthedDownloadButton>
              ) : null}
            </div>
          </div>

          {historical.isError ? (
            <div
              role="alert"
              className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
            >
              No se pudo cargar la versión elegida.
            </div>
          ) : null}

          {/* Read-only historical view with search and pagination */}
          {selectedVersion ? (
            <HistoricalManualView manual={manual} />
          ) : (
            <>
              {/* Unsaved changes notice */}
              {isDirty ? (
                <div
                  role="status"
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50/90 dark:border-amber-800 dark:bg-amber-950/40 p-3 text-xs text-amber-950 dark:text-amber-200 shadow-2xs"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>
                      Hay cambios sin guardar. Guárdelos antes de revisar, aprobar o descargar.
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsDirty(false);
                      setEditorEpoch((value) => value + 1);
                    }}
                    className="h-7 text-xs gap-1 border-amber-300 dark:border-amber-800 bg-white dark:bg-zinc-900 text-amber-900 dark:text-amber-200 hover:bg-amber-100/60"
                  >
                    <RotateCcw className="size-3" />
                    Descartar cambios sin guardar
                  </Button>
                </div>
              ) : null}

              {/* Manual editor */}
              <fieldset disabled={generating || busy}>
                <ManualEditor
                  key={`${manual.version.id}:${editorEpoch}`}
                  manual={manual}
                  busy={busy || generating}
                  onDirtyChange={setIsDirty}
                  save={(input) => act(() => api.userManuals.edit(projectId, snapshotId, input))}
                />
              </fieldset>
            </>
          )}
        </>
      )}
    </div>
  );
}

function SelectedManual() {
  const snapshotId = useSearchParams().get('snapshotId');
  if (!snapshotId)
    return (
      <p className="p-8 text-xs text-muted-foreground">
        Seleccione una entrega validada desde Proyectos generados.
      </p>
    );
  return (
    <RequireActiveProject>
      {(projectId) => (
        <ManualContent
          key={`${projectId}:${snapshotId}`}
          projectId={projectId}
          snapshotId={snapshotId}
        />
      )}
    </RequireActiveProject>
  );
}

export default function UserManualPage() {
  return (
    <Suspense fallback={<p className="p-8 text-xs text-muted-foreground">Cargando…</p>}>
      <SelectedManual />
    </Suspense>
  );
}
