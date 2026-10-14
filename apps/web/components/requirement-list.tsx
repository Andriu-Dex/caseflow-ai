'use client';

import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  FileText,
  Gauge,
  Layers,
  Link2,
  ListChecks,
  Minus,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  Target,
  Undo2,
  UserCheck,
  Users,
} from 'lucide-react';
import type {
  RequirementContextCoverageResponse,
  RequirementPriority,
  RequirementResponse,
} from '@caseflow-ai/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
} from '@caseflow-ai/ui';
import { StatusBadge } from './status-badge';
import { StaleNotice, isPendingApproval } from './artifact-actions';
import { ContextCode, ContextCoverageSummary } from './context-coverage';

// The project's requirements at a glance (DEC-126): a summary, search and
// filters, functional and non-functional groups, and compact rows that open
// to show everything else.

type Issue = { code: string; message: string };

export const PRIORITY_META: Record<
  RequirementPriority,
  { label: string; icon: ComponentType<{ className?: string }>; className: string }
> = {
  HIGH: {
    label: 'Alta',
    icon: ArrowUp,
    className:
      'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300',
  },
  MEDIUM: {
    label: 'Media',
    icon: Minus,
    className:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  },
  LOW: {
    label: 'Baja',
    icon: ArrowDown,
    className: 'border-border bg-muted text-muted-foreground',
  },
};

// DEC-138: a long list is paged in the page itself, since the whole list is
// already loaded for the summary and coverage.
const PAGE_SIZE = 25;
const STATUS_FILTERS = {
  ALL: { label: 'Todos los estados', matches: () => true },
  PENDING: {
    label: 'Pendientes de aprobación',
    matches: (r: RequirementResponse) =>
      isPendingApproval(r.version.status) || r.version.status === 'IN_REVIEW',
  },
  APPROVED: {
    label: 'Aprobados',
    matches: (r: RequirementResponse) => r.version.status === 'APPROVED',
  },
  CHANGES_REQUESTED: {
    label: 'Cambios solicitados',
    matches: (r: RequirementResponse) => r.version.status === 'CHANGES_REQUESTED',
  },
} as const;
type StatusFilter = keyof typeof STATUS_FILTERS;
type TypeFilter = 'ALL' | 'FUNCTIONAL' | 'NON_FUNCTIONAL';

const select = 'h-9 rounded-md border border-input bg-background px-2 text-sm';

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export function Tile({
  icon: Icon,
  label,
  value,
  detail,
  tone,
  progress,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone: string;
  progress?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3 shadow-xs">
      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className={`flex size-6 items-center justify-center rounded-md ${tone}`}>
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
        {label}
      </span>
      <span className="text-xl leading-none font-semibold text-foreground">{value}</span>
      {progress !== undefined ? (
        <span className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <span
            className="block h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </span>
      ) : null}
      {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
    </div>
  );
}

export function RequirementsSummary({
  items,
  coverage,
  showMissing = true,
}: {
  items: RequirementResponse[];
  coverage?: RequirementContextCoverageResponse;
  showMissing?: boolean;
}) {
  const functional = items.filter((r) => r.requirement.requirementType === 'FUNCTIONAL').length;
  const approved = items.filter((r) => r.version.status === 'APPROVED').length;
  const mandatory = coverage?.items.filter((i) => i.mandatory) ?? [];
  const covered = mandatory.filter((i) => i.coveredBy.length).length;
  const withoutOrigin = coverage?.withoutOrigin.length ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label="Resumen de requisitos"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <Tile
          icon={ListChecks}
          label="Funcionales"
          value={functional}
          detail="Lo que el sistema debe hacer"
          tone="bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
        />
        <Tile
          icon={Gauge}
          label="No funcionales"
          value={items.length - functional}
          detail="Cómo debe hacerlo: rendimiento, seguridad…"
          tone="bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300"
        />
        <Tile
          icon={CheckCircle2}
          label="Aprobados"
          value={
            <>
              {approved}
              <span className="text-sm font-normal text-muted-foreground"> de {items.length}</span>
            </>
          }
          progress={items.length ? Math.round((approved / items.length) * 100) : 0}
          detail={
            approved === items.length
              ? 'Todos aprobados'
              : `${items.length - approved} por aprobar o revisar`
          }
          tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
        />
        <Tile
          icon={Target}
          label="Cobertura del contexto"
          value={
            coverage?.context ? (
              <>
                {covered}
                <span className="text-sm font-normal text-muted-foreground">
                  {' '}
                  de {mandatory.length}
                </span>
              </>
            ) : (
              <span className="text-sm font-normal text-muted-foreground">
                Sin contexto aprobado
              </span>
            )
          }
          progress={
            coverage?.context
              ? mandatory.length
                ? Math.round((covered / mandatory.length) * 100)
                : 100
              : undefined
          }
          detail={
            coverage?.context
              ? withoutOrigin
                ? `Necesidades y reglas cubiertas · ${withoutOrigin} sin origen`
                : 'Necesidades y reglas cubiertas'
              : undefined
          }
          tone="bg-primary/15 text-primary"
        />
      </div>
      {showMissing &&
      coverage?.context &&
      coverage.items.some((i) => i.mandatory && !i.coveredBy.length) ? (
        <ContextCoverageSummary
          subject="Los requisitos actuales"
          items={coverage.items.map((i) => ({ ...i, covered: i.coveredBy.length > 0 }))}
        />
      ) : null}
    </div>
  );
}

function OriginIndicator({ requirement }: { requirement: RequirementResponse['requirement'] }) {
  const origin = requirement.origin;
  if (!origin)
    return (
      <span
        title="No indica qué elementos del contexto atiende ni por qué se incluye. Edítelo para completarlo."
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-amber-400 px-2 py-0.5 text-xs text-amber-700 dark:border-amber-700 dark:text-amber-400"
      >
        <CircleDashed className="size-3" aria-hidden="true" />
        Sin origen
      </span>
    );
  if (origin.kind === 'USER_DECISION')
    return (
      <span
        title={`Decisión del usuario: ${origin.justification ?? ''}`}
        className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300"
      >
        <UserCheck className="size-3" aria-hidden="true" />
        Decisión
      </span>
    );
  const shown = origin.contextItems.slice(0, 3);
  return (
    <span
      className="inline-flex items-center gap-1"
      aria-label="Elementos del contexto que atiende"
    >
      {shown.map((item) => (
        <ContextCode
          key={item.id}
          code={item.code}
          kind={item.kind}
          description={item.description}
        />
      ))}
      {origin.contextItems.length > shown.length ? (
        <span className="text-xs text-muted-foreground">
          +{origin.contextItems.length - shown.length}
        </span>
      ) : null}
    </span>
  );
}

export function DetailBlock({
  title,
  icon,
  children,
  className,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-border/70 bg-card p-4 shadow-2xs transition-colors dark:border-border/50 ${
        className ?? ''
      }`}
    >
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon ? <span className="text-primary">{icon}</span> : null}
        <span>{title}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

export function ItemList({
  items,
  variant = 'default',
}: {
  items: string[];
  variant?: 'default' | 'success';
}) {
  return (
    <ul className="space-y-1.5 text-xs sm:text-sm">
      {items.map((item, i) => (
        <li key={`${i}-${item}`} className="flex items-start gap-2 leading-snug text-foreground/90">
          <span
            className={`mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
              variant === 'success'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-muted/80 text-muted-foreground dark:bg-muted/40'
            }`}
          >
            {i + 1}
          </span>
          <span className="flex-1">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export interface RequirementRowActions {
  approve: (r: RequirementResponse) => void;
  requestChanges: (r: RequirementResponse) => void;
  edit: (r: RequirementResponse) => void;
  archive: (r: RequirementResponse) => Promise<void>;
}

function RequirementRow({
  requirement: r,
  open,
  onToggle,
  issues,
  stale,
  approving,
  nameOf,
  actions,
}: {
  requirement: RequirementResponse;
  open: boolean;
  onToggle: () => void;
  issues: Issue[];
  stale: boolean;
  approving: boolean;
  nameOf: (artifactId: string) => string;
  actions: RequirementRowActions & { confirmArchive: () => void };
}) {
  const priority = PRIORITY_META[r.requirement.priority];
  const PriorityIcon = priority.icon;
  const detailsId = `requirement-${r.id}-details`;
  const canApprove = isPendingApproval(r.version.status) || r.version.status === 'IN_REVIEW';
  const req = r.requirement;

  return (
    <li className="overflow-hidden rounded-lg border border-border bg-card shadow-xs transition-shadow hover:shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={detailsId}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
            aria-hidden="true"
          />
          <span className="shrink-0 font-mono text-xs font-semibold text-muted-foreground">
            {r.code}
          </span>
          <span className="truncate text-sm font-medium text-foreground">{req.name}</span>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${priority.className}`}
          >
            <PriorityIcon className="size-3" aria-hidden="true" />
            {priority.label}
          </span>
          <OriginIndicator requirement={req} />
          {issues.length ? (
            <span
              role="img"
              aria-label={`${issues.length} ${issues.length === 1 ? 'sugerencia' : 'sugerencias'} de calidad`}
              title={issues.map((i) => `• ${i.message}`).join('\n')}
              className="text-amber-600 dark:text-amber-400"
            >
              <AlertTriangle className="size-4" aria-hidden="true" />
            </span>
          ) : null}
          {stale ? (
            <span
              role="img"
              aria-label="La información de la que depende cambió"
              title="La información de la que depende cambió desde que se creó."
              className="text-amber-600 dark:text-amber-400"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
            </span>
          ) : null}
          <StatusBadge status={r.version.status} />
          {canApprove ? (
            <Button
              type="button"
              size="sm"
              onClick={() => actions.approve(r)}
              disabled={approving}
              className="h-7 bg-emerald-600 px-2.5 text-white hover:bg-emerald-700"
            >
              {approving ? 'Aprobando…' : 'Aprobar'}
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-7 p-0"
                aria-label={`Más acciones de ${r.code}`}
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => actions.edit(r)}>
                <Pencil aria-hidden="true" />
                Editar
              </DropdownMenuItem>
              {r.version.status === 'IN_REVIEW' ? (
                <DropdownMenuItem onSelect={() => actions.requestChanges(r)}>
                  <Undo2 aria-hidden="true" />
                  Solicitar cambios
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={actions.confirmArchive}>
                <Archive aria-hidden="true" />
                Archivar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {open ? (
        <div
          id={detailsId}
          className="flex flex-col gap-3.5 border-t border-border/70 bg-muted/20 px-5 py-5 sm:px-6 transition-colors"
        >
          {/* Descripción */}
          <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs transition-colors dark:border-border/50">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <FileText className="size-3.5 text-primary" aria-hidden="true" />
              <span>Descripción</span>
            </div>
            <p className="text-sm font-normal leading-relaxed whitespace-pre-line text-foreground/90">
              {req.description}
            </p>
          </div>

          {/* Origen y respaldo */}
          <DetailBlock
            title="Origen y respaldo"
            icon={<Target className="size-3.5" aria-hidden="true" />}
          >
            {req.origin?.kind === 'CONTEXT' ? (
              <ul className="flex flex-col gap-2">
                {req.origin.contextItems.map((item) => (
                  <li key={item.id} className="flex items-start gap-2.5 text-xs sm:text-sm">
                    <div className="shrink-0 pt-0.5">
                      <ContextCode code={item.code} kind={item.kind} />
                    </div>
                    <span className="font-normal leading-relaxed text-foreground/90">
                      {item.description}
                    </span>
                  </li>
                ))}
              </ul>
            ) : req.origin?.kind === 'USER_DECISION' ? (
              <p className="flex items-start gap-2 text-xs sm:text-sm text-foreground/90">
                <UserCheck
                  className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-400"
                  aria-hidden="true"
                />
                <span>
                  <span className="font-semibold text-foreground">Decisión del usuario: </span>
                  <span className="leading-relaxed">{req.origin.justification}</span>
                </span>
              </p>
            ) : (
              <p className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm text-amber-800 dark:text-amber-300">
                <span>No indica qué elementos del contexto atiende ni por qué se incluye.</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 border-amber-300 text-xs text-amber-900 dark:border-amber-700 dark:text-amber-200"
                  onClick={() => actions.edit(r)}
                >
                  Indicar el origen
                </Button>
              </p>
            )}
          </DetailBlock>

          {/* Actores & Dependencias */}
          {(req.actors.length > 0 || req.dependencyArtifactIds.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {req.actors.length ? (
                <DetailBlock
                  title="Actores"
                  icon={<Users className="size-3.5" aria-hidden="true" />}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    {req.actors.map((actor) => (
                      <span
                        key={actor}
                        className="inline-flex items-center rounded-md border border-border/80 bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground dark:bg-muted/30"
                      >
                        {actor}
                      </span>
                    ))}
                  </div>
                </DetailBlock>
              ) : null}

              {req.dependencyArtifactIds.length ? (
                <DetailBlock
                  title="Depende de"
                  icon={<Link2 className="size-3.5" aria-hidden="true" />}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    {req.dependencyArtifactIds.map((id) => (
                      <span
                        key={id}
                        className="inline-flex items-center rounded-md border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary dark:bg-primary/15"
                      >
                        {nameOf(id)}
                      </span>
                    ))}
                  </div>
                </DetailBlock>
              ) : null}
            </div>
          )}

          {/* Precondiciones & Postcondiciones */}
          {(req.preconditions.length > 0 || req.postconditions.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {req.preconditions.length ? (
                <DetailBlock
                  title="Precondiciones"
                  icon={<Layers className="size-3.5" aria-hidden="true" />}
                >
                  <ItemList items={req.preconditions} />
                </DetailBlock>
              ) : null}
              {req.postconditions.length ? (
                <DetailBlock
                  title="Postcondiciones"
                  icon={
                    <CheckCircle2
                      className="size-3.5 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                  }
                >
                  <ItemList items={req.postconditions} variant="success" />
                </DetailBlock>
              ) : null}
            </div>
          )}

          {/* Sugerencias de calidad */}
          {issues.length ? (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-4 shadow-2xs dark:border-amber-900/50 dark:bg-amber-950/20">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-400">
                <AlertTriangle className="size-3.5" aria-hidden="true" />
                <span>Sugerencias de calidad (ISO/IEC/IEEE 29148)</span>
              </div>
              <ul className="flex flex-col gap-1.5 text-xs sm:text-sm text-amber-900 dark:text-amber-300">
                {issues.map((issue, i) => (
                  <li key={`${issue.code}-${i}`} className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span className="leading-relaxed">{issue.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {stale ? <StaleNotice /> : null}
        </div>
      ) : null}
    </li>
  );
}

export function RequirementList({
  items,
  issuesOf,
  isStale,
  approvingId,
  actions,
}: {
  items: RequirementResponse[];
  issuesOf: (id: string) => Issue[];
  isStale: (id: string) => boolean;
  approvingId: string | null;
  actions: RequirementRowActions;
}) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState<TypeFilter>('ALL');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [priority, setPriority] = useState<RequirementPriority | 'ALL'>('ALL');
  const [open, setOpen] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<RequirementResponse | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [page, setPage] = useState(0);
  // A filter starts again on the first page; approving or archiving does not.
  const filter =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(0);
    };

  const query = normalize(search.trim());
  const visible = items.filter(
    (r) =>
      (type === 'ALL' || r.requirement.requirementType === type) &&
      STATUS_FILTERS[status].matches(r) &&
      (priority === 'ALL' || r.requirement.priority === priority) &&
      (!query ||
        normalize(`${r.code} ${r.requirement.name} ${r.requirement.description}`).includes(query)),
  );
  const filtered = Boolean(query) || type !== 'ALL' || status !== 'ALL' || priority !== 'ALL';
  // Functional first, as the groups are shown; the page cuts across them.
  const ordered = [
    ...visible.filter((r) => r.requirement.requirementType === 'FUNCTIONAL'),
    ...visible.filter((r) => r.requirement.requirementType === 'NON_FUNCTIONAL'),
  ];
  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const pageRows = ordered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  // Archiving the last requirement of the last page leaves it empty: step back.
  useEffect(() => {
    if (page >= pageCount) setPage(pageCount - 1);
  }, [page, pageCount]);
  const typeCount = (value: TypeFilter) =>
    value === 'ALL'
      ? items.length
      : items.filter((r) => r.requirement.requirementType === value).length;
  const byId = new Map(items.map((r) => [r.id, r]));
  const nameOf = (id: string) => {
    const r = byId.get(id);
    return r ? `${r.code} · ${r.requirement.name}` : 'Requisito archivado';
  };
  const groups = [
    { type: 'FUNCTIONAL', title: 'Funcionales', icon: ListChecks },
    { type: 'NON_FUNCTIONAL', title: 'No funcionales', icon: Gauge },
  ] as const;

  async function confirmArchive() {
    if (!archiving) return;
    setArchiveBusy(true);
    try {
      await actions.archive(archiving);
      setArchiving(null);
    } finally {
      setArchiveBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:w-72">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Buscar requisitos"
            placeholder="Buscar requisitos"
            className="pl-8"
            value={search}
            onChange={(e) => filter(setSearch)(e.target.value)}
          />
        </div>
        <select
          aria-label="Tipo"
          className={select}
          value={type}
          onChange={(e) => filter(setType)(e.target.value as TypeFilter)}
        >
          <option value="ALL">Todos los tipos ({typeCount('ALL')})</option>
          <option value="FUNCTIONAL">Funcionales ({typeCount('FUNCTIONAL')})</option>
          <option value="NON_FUNCTIONAL">No funcionales ({typeCount('NON_FUNCTIONAL')})</option>
        </select>
        <select
          aria-label="Estado"
          className={select}
          value={status}
          onChange={(e) => filter(setStatus)(e.target.value as StatusFilter)}
        >
          {(Object.keys(STATUS_FILTERS) as StatusFilter[]).map((key) => (
            <option key={key} value={key}>
              {STATUS_FILTERS[key].label}
            </option>
          ))}
        </select>
        <select
          aria-label="Prioridad"
          className={select}
          value={priority}
          onChange={(e) => filter(setPriority)(e.target.value as RequirementPriority | 'ALL')}
        >
          <option value="ALL">Todas las prioridades</option>
          {(Object.keys(PRIORITY_META) as RequirementPriority[]).map((key) => (
            <option key={key} value={key}>
              Prioridad {PRIORITY_META[key].label.toLowerCase()}
            </option>
          ))}
        </select>
        {filtered ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              setType('ALL');
              setStatus('ALL');
              setPriority('ALL');
              setPage(0);
            }}
          >
            Limpiar filtros
          </Button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Ningún requisito coincide con la búsqueda o los filtros.
        </p>
      ) : (
        groups.map((group) => {
          const rows = pageRows.filter((r) => r.requirement.requirementType === group.type);
          if (!rows.length) return null;
          const Icon = group.icon;
          return (
            <section key={group.type} aria-label={group.title} className="flex flex-col gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                {group.title}
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {visible.filter((r) => r.requirement.requirementType === group.type).length}
                </span>
              </h2>
              <ul className="flex flex-col gap-2">
                {rows.map((r) => (
                  <RequirementRow
                    key={r.id}
                    requirement={r}
                    open={open === r.id}
                    onToggle={() => setOpen(open === r.id ? null : r.id)}
                    issues={issuesOf(r.id)}
                    stale={isStale(r.id)}
                    approving={approvingId === r.id}
                    nameOf={nameOf}
                    actions={{ ...actions, confirmArchive: () => setArchiving(r) }}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}

      {pageCount > 1 ? (
        <nav
          aria-label="Paginación de requisitos"
          className="flex flex-col items-center justify-between gap-3 rounded-xl border border-border/50 bg-card/60 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:text-sm"
        >
          <span className="font-medium text-foreground/80">
            Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, ordered.length)} de{' '}
            {ordered.length} requisitos
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2.5 text-xs"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
              Anterior
            </Button>
            <span
              aria-live="polite"
              className="rounded-md border border-border/40 bg-muted px-2.5 py-1 text-xs font-semibold text-foreground"
            >
              Página {page + 1} de {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2.5 text-xs"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        </nav>
      ) : null}

      {archiving ? (
        <Dialog open onOpenChange={(o) => (o ? null : setArchiving(null))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Archivar requisito</DialogTitle>
              <DialogDescription>
                Deja de mostrarse en las listas y en la preparación, pero su historial se conserva y
                su código no se reutiliza.
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm text-foreground">
              Va a archivar{' '}
              <strong>
                {archiving.code} — {archiving.requirement.name}
              </strong>
              .
            </p>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setArchiving(null)}>
                Cancelar
              </Button>
              <Button type="button" disabled={archiveBusy} onClick={confirmArchive}>
                {archiveBusy ? 'Archivando…' : 'Archivar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
