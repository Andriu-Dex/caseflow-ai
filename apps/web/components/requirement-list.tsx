'use client';

import { useState, type ComponentType, type ReactNode } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Gauge,
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

function Tile({
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
}: {
  items: RequirementResponse[];
  coverage?: RequirementContextCoverageResponse;
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
          tone="bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
        />
        <Tile
          icon={Gauge}
          label="No funcionales"
          value={items.length - functional}
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
      {coverage?.context && coverage.items.some((i) => i.mandatory && !i.coveredBy.length) ? (
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

function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      {children}
    </div>
  );
}

function ItemList({ items }: { items: string[] }) {
  return (
    <ul className="ml-4 list-disc space-y-0.5 text-sm text-foreground/85 marker:text-primary">
      {items.map((item, i) => (
        <li key={`${i}-${item}`}>{item}</li>
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
          className="flex flex-col gap-4 border-t border-border bg-muted/20 px-4 py-4 sm:pl-10"
        >
          <p className="text-sm leading-relaxed whitespace-pre-line text-foreground/90">
            {req.description}
          </p>
          <DetailBlock title="Origen">
            {req.origin?.kind === 'CONTEXT' ? (
              <ul className="flex flex-col gap-1.5">
                {req.origin.contextItems.map((item) => (
                  <li key={item.id} className="flex items-start gap-2 text-sm">
                    <ContextCode code={item.code} kind={item.kind} />
                    <span className="text-foreground/85">{item.description}</span>
                  </li>
                ))}
              </ul>
            ) : req.origin?.kind === 'USER_DECISION' ? (
              <p className="flex items-start gap-2 text-sm text-foreground/85">
                <UserCheck className="mt-0.5 size-4 shrink-0 text-sky-600" aria-hidden="true" />
                <span>
                  <span className="font-medium">Decisión del usuario: </span>
                  {req.origin.justification}
                </span>
              </p>
            ) : (
              <p className="flex flex-wrap items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
                No indica qué elementos del contexto atiende ni por qué se incluye.
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => actions.edit(r)}
                >
                  Indicar el origen
                </Button>
              </p>
            )}
          </DetailBlock>
          <div className="grid gap-4 sm:grid-cols-2">
            {req.actors.length ? (
              <DetailBlock title="Actores">
                <span className="flex flex-wrap items-center gap-1.5">
                  <Users className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  {req.actors.map((actor) => (
                    <span key={actor} className="rounded-md bg-muted px-2 py-0.5 text-xs">
                      {actor}
                    </span>
                  ))}
                </span>
              </DetailBlock>
            ) : null}
            {req.dependencyArtifactIds.length ? (
              <DetailBlock title="Depende de">
                <span className="flex flex-wrap items-center gap-1.5">
                  <Link2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  {req.dependencyArtifactIds.map((id) => (
                    <span
                      key={id}
                      className="rounded-md border border-dashed border-border px-2 py-0.5 text-xs"
                    >
                      {nameOf(id)}
                    </span>
                  ))}
                </span>
              </DetailBlock>
            ) : null}
            {req.preconditions.length ? (
              <DetailBlock title="Precondiciones">
                <ItemList items={req.preconditions} />
              </DetailBlock>
            ) : null}
            {req.postconditions.length ? (
              <DetailBlock title="Postcondiciones">
                <ItemList items={req.postconditions} />
              </DetailBlock>
            ) : null}
          </div>
          {issues.length ? (
            <DetailBlock title="Sugerencias de calidad (ISO/IEC/IEEE 29148)">
              <ul className="flex flex-col gap-1 text-sm text-amber-800 dark:text-amber-300">
                {issues.map((issue, i) => (
                  <li key={`${issue.code}-${i}`} className="flex items-start gap-1.5">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    {issue.message}
                  </li>
                ))}
              </ul>
            </DetailBlock>
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
            placeholder="Buscar por código, nombre o descripción"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Tipo"
          className={select}
          value={type}
          onChange={(e) => setType(e.target.value as TypeFilter)}
        >
          <option value="ALL">Todos los tipos</option>
          <option value="FUNCTIONAL">Funcionales</option>
          <option value="NON_FUNCTIONAL">No funcionales</option>
        </select>
        <select
          aria-label="Estado"
          className={select}
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
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
          onChange={(e) => setPriority(e.target.value as RequirementPriority | 'ALL')}
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
          const rows = visible.filter((r) => r.requirement.requirementType === group.type);
          if (!rows.length) return null;
          const Icon = group.icon;
          return (
            <section key={group.type} aria-label={group.title} className="flex flex-col gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                {group.title}
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {rows.length}
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
