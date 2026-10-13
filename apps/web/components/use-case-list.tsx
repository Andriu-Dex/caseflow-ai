'use client';

import { useState } from 'react';
import {
  Archive,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Link2,
  ListChecks,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  Undo2,
  User,
  Users,
  Workflow,
} from 'lucide-react';
import type { RequirementResponse, UseCaseResponse } from '@caseflow-ai/contracts';
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
                <li key={r.id} className="flex items-start gap-2">
                  <span className="font-mono text-xs font-semibold text-muted-foreground">
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
}

function UseCaseRow({
  useCase: u,
  useCases,
  open,
  onToggle,
  stale,
  approving,
  lookup,
  actions,
}: {
  useCase: UseCaseResponse;
  useCases: UseCaseResponse[];
  open: boolean;
  onToggle: () => void;
  stale: boolean;
  approving: boolean;
  lookup: RequirementLookup;
  actions: UseCaseRowActions & { confirmArchive: () => void };
}) {
  const uc = u.useCase;
  const detailsId = `use-case-${u.id}-details`;
  const canApprove = isPendingApproval(u.version.status) || u.version.status === 'IN_REVIEW';
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
            {u.code}
          </span>
          <span className="truncate text-sm font-medium text-foreground">{uc.name}</span>
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
            />
          ))}
        </ul>
      )}

      {archiving ? (
        <Dialog open onOpenChange={(o) => (o ? null : setArchiving(null))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Archivar caso de uso</DialogTitle>
              <DialogDescription>
                Deja de mostrarse en las listas y en la preparación, pero su historial se conserva y
                su código no se reutiliza.
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm text-foreground">
              Va a archivar{' '}
              <strong>
                {archiving.code} — {archiving.useCase.name}
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
