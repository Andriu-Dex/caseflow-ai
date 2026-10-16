'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Layers,
  Link2,
  ListChecks,
  Info,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Undo2,
  User,
  Users,
  Workflow,
} from 'lucide-react';
import type {
  RequirementResponse,
  UseCaseBulkAction,
  UseCaseResponse,
} from '@caseflow-ai/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
} from '@caseflow-ai/ui';
import { StatusBadge } from './status-badge';
import { bulkGuards } from './bulk-guards';
import { StaleNotice, isPendingApproval } from './artifact-actions';
import { DetailBlock, ItemList, Tile } from './requirement-list';
import { AlternativeFlows, FlowSteps } from './use-case-flow';
import { UseCaseRelationChips } from './use-case-relations';

// The project's use cases at a glance: a summary with how the approved
// functional requirements are realised, search and status filter, and
// compact rows that open to show the flows.

const select = 'h-9 rounded-md border border-input bg-background px-2 text-sm';
const STATUS_FILTERS = {
  ALL: { label: 'Todos los estados', matches: () => true },
  PENDING: {
    label: 'Pendientes de aprobación',
    matches: (u: UseCaseResponse) =>
      isPendingApproval(u.version.status) || u.version.status === 'IN_REVIEW',
  },
  APPROVED: {
    label: 'Aprobados',
    matches: (u: UseCaseResponse) => u.version.status === 'APPROVED',
  },
  CHANGES_REQUESTED: {
    label: 'Cambios solicitados',
    matches: (u: UseCaseResponse) => u.version.status === 'CHANGES_REQUESTED',
  },
} as const;
type StatusFilter = keyof typeof STATUS_FILTERS;

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

// Requirement version id -> the requirement it belongs to.
export type RequirementLookup = Map<string, RequirementResponse>;

function RequirementChips({
  ids,
  lookup,
  limit,
}: {
  ids: string[];
  lookup: RequirementLookup;
  limit?: number;
}) {
  const shown = limit ? ids.slice(0, limit) : ids;
  return (
    <span className="inline-flex flex-wrap items-center gap-1" aria-label="Requisitos que realiza">
      {shown.map((id) => {
        const r = lookup.get(id);
        return (
          <span
            key={id}
            title={r?.requirement.name ?? 'Versión anterior de un requisito'}
            className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-px font-mono text-[11px] font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300"
          >
            {r?.code ?? 'RF anterior'}
          </span>
        );
      })}
      {ids.length > shown.length ? (
        <span className="text-xs text-muted-foreground">+{ids.length - shown.length}</span>
      ) : null}
    </span>
  );
}

export function UseCasesSummary({
  items,
  requirements,
}: {
  items: UseCaseResponse[];
  requirements: RequirementResponse[];
}) {
  const approved = items.filter((u) => u.version.status === 'APPROVED');
  const functional = requirements.filter(
    (r) => r.version.status === 'APPROVED' && r.requirement.requirementType === 'FUNCTIONAL',
  );
  const realised = new Set(approved.flatMap((u) => u.useCase.relatedRequirementVersionIds));
  const missing = functional.filter((r) => !realised.has(r.version.id));
  const [open, setOpen] = useState(false);
  const covered = functional.length - missing.length;
  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label="Resumen de casos de uso"
        className="grid grid-cols-2 gap-3 lg:grid-cols-3"
      >
        <Tile
          icon={Workflow}
          label="Casos de uso"
          value={items.length}
          detail="Procesos que el sistema resuelve"
          tone="bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
        />
        <Tile
          icon={CheckCircle2}
          label="Aprobados"
          value={
            <>
              {approved.length}
              <span className="text-sm font-normal text-muted-foreground"> de {items.length}</span>
            </>
          }
          progress={items.length ? Math.round((approved.length / items.length) * 100) : 0}
          detail={
            approved.length === items.length
              ? 'Todos aprobados'
              : `${items.length - approved.length} por aprobar o revisar`
          }
          tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
        />
        <Tile
          icon={ListChecks}
          label="Requisitos realizados"
          value={
            <>
              {covered}
              <span className="text-sm font-normal text-muted-foreground">
                {' '}
                de {functional.length}
              </span>
            </>
          }
          progress={functional.length ? Math.round((covered / functional.length) * 100) : 100}
          detail="Funcionales aprobados con un caso de uso aprobado"
          tone="bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
        />
      </div>
      {missing.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/20">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="min-w-0 flex-1 text-foreground">
              {missing.length === 1
                ? 'Un requisito funcional aprobado aún no tiene un caso de uso aprobado.'
                : `${missing.length} requisitos funcionales aprobados aún no tienen un caso de uso aprobado.`}
            </p>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="text-xs font-medium text-primary hover:underline"
            >
              {open ? 'Ocultar' : 'Ver cuáles'}
            </button>
          </div>
          {open ? (
            <ul className="mt-2 flex flex-col gap-1" aria-label="Requisitos sin caso de uso">
              {missing.map((r) => (
                <li key={r.id} className="flex items-baseline gap-2">
                  <span className="shrink-0 font-mono text-sm font-semibold text-muted-foreground">
                    {r.code}
                  </span>
                  <span className="text-foreground/85">{r.requirement.name}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export interface UseCaseRowActions {
  approve: (u: UseCaseResponse) => void;
  requestChanges: (u: UseCaseResponse) => void;
  edit: (u: UseCaseResponse) => void;
  archive: (u: UseCaseResponse) => Promise<void>;
  // DEC-138: the same action over the selected use cases.
  bulk?: (action: UseCaseBulkAction, ids: string[]) => Promise<void>;
}

const BULK_CONFIRM: Record<
  Exclude<UseCaseBulkAction, 'APPROVE'>,
  { title: string; description: string; button: string; busy: string }
> = {
  ARCHIVE: {
    title: 'Archivar casos de uso',
    description:
      'Dejan de mostrarse en las listas y en la preparación; su historial se conserva y sus códigos no se reutilizan.',
    button: 'Archivar',
    busy: 'Archivando…',
  },
  DELETE: {
    title: 'Eliminar casos de uso',
    description:
      'Se borran definitivamente. Solo es posible si ninguno tuvo una versión aprobada y ningún otro caso de uso los incluye o extiende; si alguno no cumple, no se elimina ninguno. Sus códigos no se reutilizan.',
    button: 'Eliminar definitivamente',
    busy: 'Eliminando…',
  },
};

function UseCaseRow({
  useCase: u,
  useCases,
  open,
  onToggle,
  stale,
  approving,
  lookup,
  actions,
  selected,
  onSelect,
}: {
  useCase: UseCaseResponse;
  useCases: UseCaseResponse[];
  open: boolean;
  onToggle: () => void;
  stale: boolean;
  approving: boolean;
  lookup: RequirementLookup;
  actions: UseCaseRowActions & { confirmArchive: () => void };
  selected?: boolean;
  onSelect?: (checked: boolean) => void;
}) {
  const uc = u.useCase;
  const detailsId = `use-case-${u.id}-details`;
  const canApprove = isPendingApproval(u.version.status) || u.version.status === 'IN_REVIEW';
  return (
    <li className="overflow-hidden rounded-lg border border-border bg-card shadow-xs transition-shadow hover:shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
        {onSelect ? (
          <input
            type="checkbox"
            className="size-4 shrink-0 cursor-pointer accent-primary"
            aria-label={`Seleccionar ${u.code}`}
            checked={Boolean(selected)}
            onChange={(e) => onSelect(e.target.checked)}
          />
        ) : null}
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
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="shrink-0 font-mono text-sm font-semibold text-muted-foreground">
              {u.code}
            </span>
            <span className="truncate text-sm font-medium text-foreground">{uc.name}</span>
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300">
            <User className="size-3" aria-hidden="true" />
            {uc.primaryActor}
          </span>
          <RequirementChips ids={uc.relatedRequirementVersionIds} lookup={lookup} limit={3} />
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
          <StatusBadge status={u.version.status} />
          {canApprove ? (
            <Button
              type="button"
              size="sm"
              onClick={() => actions.approve(u)}
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
                aria-label={`Más acciones de ${u.code}`}
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onToggle}>
                {open ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                {open ? 'Ocultar detalle' : 'Ver detalle'}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => actions.edit(u)}>
                <Pencil aria-hidden="true" />
                Editar
              </DropdownMenuItem>
              {u.version.status === 'IN_REVIEW' ? (
                <DropdownMenuItem onSelect={() => actions.requestChanges(u)}>
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
            {uc.objective}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailBlock title="Requisitos que realiza">
              <span className="flex flex-wrap items-center gap-1.5">
                <Link2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <RequirementChips ids={uc.relatedRequirementVersionIds} lookup={lookup} />
              </span>
            </DetailBlock>
            {uc.secondaryActors.length ? (
              <DetailBlock title="Actores secundarios">
                <span className="flex flex-wrap items-center gap-1.5">
                  <Users className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  {uc.secondaryActors.map((actor) => (
                    <span key={actor} className="rounded-md bg-muted px-2 py-0.5 text-xs">
                      {actor}
                    </span>
                  ))}
                </span>
              </DetailBlock>
            ) : null}
            {uc.preconditions.length ? (
              <DetailBlock title="Precondiciones">
                <ItemList items={uc.preconditions} />
              </DetailBlock>
            ) : null}
            {uc.postconditions.length ? (
              <DetailBlock title="Postcondiciones">
                <ItemList items={uc.postconditions} />
              </DetailBlock>
            ) : null}
          </div>
          {uc.relations.length ? (
            <DetailBlock title="Relaciones">
              <UseCaseRelationChips
                relations={uc.relations.map((r) => {
                  const target = useCases.find((other) => other.id === r.targetUseCaseId);
                  return {
                    kind: r.kind,
                    label: target
                      ? `${target.code} ${target.useCase.name}`
                      : 'Caso de uso archivado',
                  };
                })}
              />
            </DetailBlock>
          ) : null}
          <DetailBlock title="Flujo principal">
            <FlowSteps steps={uc.mainFlow} />
          </DetailBlock>
          {uc.alternativeFlows.length ? (
            <DetailBlock title="Flujos alternativos">
              <AlternativeFlows flows={uc.alternativeFlows} />
            </DetailBlock>
          ) : null}
          {stale ? <StaleNotice /> : null}
        </div>
      ) : null}
    </li>
  );
}

export function UseCaseList({
  items,
  lookup,
  isStale,
  approvingId,
  actions,
}: {
  items: UseCaseResponse[];
  lookup: RequirementLookup;
  isStale: (id: string) => boolean;
  approvingId: string | null;
  actions: UseCaseRowActions;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [open, setOpen] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<UseCaseResponse | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmingBulk, setConfirmingBulk] = useState<Exclude<
    UseCaseBulkAction,
    'APPROVE'
  > | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const query = normalize(search.trim());
  const visible = items.filter(
    (u) =>
      STATUS_FILTERS[status].matches(u) &&
      (!query ||
        normalize(
          `${u.code} ${u.useCase.name} ${u.useCase.objective} ${u.useCase.primaryActor}`,
        ).includes(query)),
  );
  const filtered = Boolean(query) || status !== 'ALL';

  // A deleted or archived use case leaves the selection by itself.
  const selection = items.filter((u) => selectedIds.has(u.id)).map((u) => u.id);
  const guards = bulkGuards(items.filter((x) => selectedIds.has(x.id)));
  const allVisibleSelected = visible.length > 0 && visible.every((u) => selectedIds.has(u.id));
  const toggleSelected = (ids: string[], checked: boolean) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  async function runBulk(action: UseCaseBulkAction) {
    if (!actions.bulk || !selection.length) return;
    setBulkBusy(true);
    try {
      await actions.bulk(action, selection);
      setSelectedIds(new Set());
      setConfirmingBulk(null);
    } catch {
      // The page already explained why; the selection stays to adjust it.
    } finally {
      setBulkBusy(false);
    }
  }

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
            aria-label="Buscar casos de uso"
            placeholder="Buscar casos de uso"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
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
        {filtered ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              setStatus('ALL');
            }}
          >
            Limpiar filtros
          </Button>
        ) : null}
      </div>

      {actions.bulk && items.length ? (
        <div
          role="toolbar"
          aria-label="Selección de casos de uso"
          className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
            selection.length ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-card/60'
          }`}
        >
          <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              aria-label="Seleccionar los que coinciden"
              checked={allVisibleSelected}
              onChange={(e) =>
                toggleSelected(
                  visible.map((u) => u.id),
                  e.target.checked,
                )
              }
            />
            {selection.length
              ? `${selection.length} ${selection.length === 1 ? 'seleccionado' : 'seleccionados'}`
              : 'Seleccionar'}
          </label>
          {selection.length ? (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={bulkBusy}
                aria-disabled={guards.approveBlocked}
                title={guards.approveBlocked ? (guards.hint ?? undefined) : undefined}
                aria-describedby={guards.hint ? 'bulk-hint' : undefined}
                className={`h-8 bg-emerald-600 text-white hover:bg-emerald-700 ${
                  guards.approveBlocked ? 'cursor-not-allowed opacity-50 hover:bg-emerald-600' : ''
                }`}
                onClick={() => !guards.approveBlocked && runBulk('APPROVE')}
              >
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                Aprobar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={bulkBusy}
                className="h-8"
                onClick={() => setConfirmingBulk('ARCHIVE')}
              >
                <Archive className="size-3.5" aria-hidden="true" />
                Archivar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={bulkBusy}
                aria-disabled={guards.deleteBlocked}
                title={guards.deleteBlocked ? (guards.hint ?? undefined) : undefined}
                aria-describedby={guards.hint ? 'bulk-hint' : undefined}
                className={`h-8 border-destructive/30 text-destructive hover:bg-destructive/10 ${
                  guards.deleteBlocked ? 'cursor-not-allowed opacity-50 hover:bg-transparent' : ''
                }`}
                onClick={() => !guards.deleteBlocked && setConfirmingBulk('DELETE')}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Eliminar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={() => setSelectedIds(new Set())}
              >
                Quitar selección
              </Button>
            </div>
          ) : null}
          {guards.hint ? (
            <p
              id="bulk-hint"
              role="status"
              className="flex basis-full items-start gap-1.5 text-xs text-muted-foreground"
            >
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {guards.hint}
            </p>
          ) : null}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Ningún caso de uso coincide con la búsqueda o el filtro.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((u) => (
            <UseCaseRow
              key={u.id}
              useCase={u}
              useCases={items}
              open={open === u.id}
              onToggle={() => setOpen(open === u.id ? null : u.id)}
              stale={isStale(u.id)}
              approving={approvingId === u.id}
              lookup={lookup}
              actions={{ ...actions, confirmArchive: () => setArchiving(u) }}
              selected={selectedIds.has(u.id)}
              onSelect={actions.bulk ? (checked) => toggleSelected([u.id], checked) : undefined}
            />
          ))}
        </ul>
      )}

      {confirmingBulk ? (
        <Dialog open onOpenChange={(o) => (o ? null : setConfirmingBulk(null))}>
          <DialogContent className="sm:max-w-lg p-6 gap-5 overflow-hidden">
            <div
              className={`absolute inset-x-0 top-0 h-1.5 ${
                confirmingBulk === 'DELETE'
                  ? 'bg-gradient-to-r from-destructive/80 via-destructive to-destructive/80'
                  : 'bg-gradient-to-r from-amber-500/80 via-amber-400 to-amber-500/80'
              }`}
              aria-hidden="true"
            />

            <div className="flex items-start gap-4 w-full min-w-0">
              <div
                className={`flex size-12 shrink-0 items-center justify-center rounded-2xl border shadow-xs ${
                  confirmingBulk === 'DELETE'
                    ? 'bg-destructive/10 text-destructive border-destructive/25 ring-4 ring-destructive/5'
                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25 ring-4 ring-amber-500/5'
                }`}
              >
                {confirmingBulk === 'DELETE' ? (
                  <Trash2 className="size-5.5" aria-hidden="true" />
                ) : (
                  <Archive className="size-5.5" aria-hidden="true" />
                )}
              </div>
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
                  {BULK_CONFIRM[confirmingBulk].title}
                </DialogTitle>
                <DialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {BULK_CONFIRM[confirmingBulk].description}
                </DialogDescription>
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/40 p-3.5 flex flex-col gap-2.5 w-full min-w-0">
              <div className="flex items-center justify-between text-xs pb-1 border-b border-border/40 gap-2">
                <span className="font-semibold text-foreground flex items-center gap-1.5 min-w-0 truncate">
                  <Layers className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {selection.length}{' '}
                    {selection.length === 1
                      ? 'caso de uso seleccionado'
                      : 'casos de uso seleccionados'}
                    :
                  </span>
                </span>
                <span className="rounded-full bg-background px-2 py-0.5 text-2xs font-semibold text-muted-foreground border border-border/50 shadow-2xs shrink-0">
                  {selection.length} de {items.length}
                </span>
              </div>

              {items.filter((u) => selectedIds.has(u.id)).length <= 4 ? (
                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto w-full min-w-0">
                  {items
                    .filter((u) => selectedIds.has(u.id))
                    .map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-background/80 p-2 text-xs shadow-2xs dark:bg-background/40 w-full min-w-0 overflow-hidden"
                      >
                        <span className="inline-flex items-center rounded-md border border-border/60 bg-muted/60 px-2 py-0.5 font-mono text-xs font-semibold text-foreground shrink-0 shadow-2xs">
                          {u.code}
                        </span>
                        <span
                          className="truncate font-medium text-foreground/90 flex-1 min-w-0"
                          title={u.useCase.name}
                        >
                          {u.useCase.name}
                        </span>
                        {u.useCase.primaryActor ? (
                          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-2xs font-medium text-muted-foreground shrink-0 border border-border/40 whitespace-nowrap">
                            {u.useCase.primaryActor}
                          </span>
                        ) : null}
                      </div>
                    ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 pt-0.5 w-full min-w-0">
                  {items
                    .filter((u) => selectedIds.has(u.id))
                    .slice(0, 12)
                    .map((u) => (
                      <span
                        key={u.id}
                        className="inline-flex items-center rounded-md border border-border/60 bg-background px-2 py-0.5 font-mono text-xs font-semibold text-foreground shadow-2xs"
                      >
                        {u.code}
                      </span>
                    ))}
                  {selection.length > 12 ? (
                    <span className="inline-flex items-center px-1.5 text-xs text-muted-foreground font-medium">
                      +{selection.length - 12} más
                    </span>
                  ) : null}
                </div>
              )}

              <p className="sr-only">
                {selection.length} {selection.length === 1 ? 'caso de uso' : 'casos de uso'}:{' '}
                {items
                  .filter((u) => selectedIds.has(u.id))
                  .slice(0, 8)
                  .map((u) => u.code)
                  .join(', ')}
                {selection.length > 8 ? '…' : ''}
              </p>
            </div>

            <div
              className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs leading-relaxed w-full min-w-0 ${
                confirmingBulk === 'DELETE'
                  ? 'border-destructive/25 bg-destructive/5 text-foreground dark:bg-destructive/10'
                  : 'border-amber-500/25 bg-amber-500/5 text-foreground dark:bg-amber-500/10'
              }`}
            >
              <AlertTriangle
                className={`mt-0.5 size-4 shrink-0 ${
                  confirmingBulk === 'DELETE'
                    ? 'text-destructive'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
                aria-hidden="true"
              />
              <span className="text-muted-foreground">
                {confirmingBulk === 'DELETE'
                  ? 'Esta acción elimina de forma permanente todos los seleccionados. Si alguno tuvo una versión aprobada o algo depende de él, no se elimina ninguno.'
                  : 'Los casos de uso archivados dejarán de mostrarse en las listas activas, pero todo su historial se conserva intacto.'}
              </span>
            </div>

            <div className="-mx-6 -mb-6 mt-1 flex items-center justify-end gap-2.5 border-t border-border/50 bg-muted/25 px-6 py-4 rounded-b-2xl dark:bg-muted/10 w-[calc(100%+3rem)]">
              <Button
                type="button"
                variant="outline"
                className="h-9 px-4 rounded-xl border-border/80 hover:bg-muted font-medium text-xs sm:text-sm text-foreground shadow-2xs"
                onClick={() => setConfirmingBulk(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={bulkBusy}
                onClick={() => runBulk(confirmingBulk)}
                className={`h-9 px-4 gap-2 rounded-xl font-semibold text-xs sm:text-sm shadow-xs transition-all ${
                  confirmingBulk === 'DELETE'
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : 'bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600 dark:text-zinc-950'
                }`}
              >
                {bulkBusy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    {BULK_CONFIRM[confirmingBulk].busy}
                  </>
                ) : (
                  <>
                    {confirmingBulk === 'DELETE' ? (
                      <Trash2 className="size-4" aria-hidden="true" />
                    ) : (
                      <Archive className="size-4" aria-hidden="true" />
                    )}
                    {BULK_CONFIRM[confirmingBulk].button}
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      {archiving ? (
        <Dialog open onOpenChange={(o) => (o ? null : setArchiving(null))}>
          <DialogContent className="sm:max-w-lg p-6 gap-5 overflow-hidden">
            <div
              className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-amber-500/80 via-amber-400 to-amber-500/80"
              aria-hidden="true"
            />
            <div className="flex items-start gap-4 w-full min-w-0">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25 shadow-xs ring-4 ring-amber-500/5">
                <Archive className="size-5.5" aria-hidden="true" />
              </div>
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
                  Archivar caso de uso
                </DialogTitle>
                <DialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Deja de mostrarse en las listas y en la preparación, pero su historial se conserva
                  y su código no se reutiliza.
                </DialogDescription>
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/40 p-3.5 flex flex-col gap-2.5 w-full min-w-0">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5 pb-1 border-b border-border/40">
                <Workflow className="size-3.5 text-muted-foreground" aria-hidden="true" />
                Caso de uso a archivar:
              </span>
              <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-background/80 p-2.5 shadow-2xs dark:bg-background/40 w-full min-w-0 overflow-hidden">
                <span className="inline-flex items-center rounded-md border border-border/60 bg-muted/60 px-2 py-0.5 font-mono text-xs font-semibold text-foreground shadow-2xs shrink-0">
                  {archiving.code}
                </span>
                <span
                  className="text-xs font-medium text-foreground truncate flex-1 min-w-0"
                  title={archiving.useCase.name}
                >
                  {archiving.useCase.name}
                </span>
              </div>
              <p className="sr-only">
                Va a archivar{' '}
                <strong>
                  {archiving.code} — {archiving.useCase.name}
                </strong>
                .
              </p>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-relaxed dark:bg-amber-500/10 w-full min-w-0">
              <AlertTriangle
                className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
              <span className="text-muted-foreground">
                Podrás consultar el historial de este caso de uso o restaurarlo en cualquier momento
                desde el filtro de archivados.
              </span>
            </div>

            <div className="-mx-6 -mb-6 mt-1 flex items-center justify-end gap-2.5 border-t border-border/50 bg-muted/25 px-6 py-4 rounded-b-2xl dark:bg-muted/10 w-[calc(100%+3rem)]">
              <Button
                type="button"
                variant="outline"
                className="h-9 px-4 rounded-xl border-border/80 hover:bg-muted font-medium text-xs sm:text-sm text-foreground shadow-2xs"
                onClick={() => setArchiving(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={archiveBusy}
                onClick={confirmArchive}
                className="h-9 px-4 gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600 dark:text-zinc-950 font-semibold text-xs sm:text-sm shadow-xs transition-all"
              >
                {archiveBusy ? (
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
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
