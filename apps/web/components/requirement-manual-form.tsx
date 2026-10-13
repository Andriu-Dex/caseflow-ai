'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Check,
  GitFork,
  Layers,
  ListChecks,
  Plus,
  Search,
  Target,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import type {
  ContextItemRef,
  RequirementInput,
  RequirementPriority,
  RequirementResponse,
  RequirementType,
} from '@caseflow-ai/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
} from '@caseflow-ai/ui';
import { api, ApiError } from '../lib/api';
import { ContextCode, KIND_NAMES } from './context-coverage';

// Manual requirement creation, and editing when `initial` is given: an edit
// never mutates the existing version, it submits a complete new version
// (which starts again as a draft needing approval). The form asks why the
// requirement exists (DEC-126): the context items it answers, or the user's
// own decision with its justification.

type OriginKind = 'CONTEXT' | 'USER_DECISION';

function Section({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-card p-5 shadow-xs transition-colors dark:border-border/60">
      <div className="mb-4 flex flex-col gap-1 border-b border-border/50 pb-3 dark:border-border/40">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {icon ? <span className="text-primary">{icon}</span> : null}
          <span>{title}</span>
        </div>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

// One choice among a few, as buttons (a radio group for assistive tech).
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-label={label}
        className="inline-flex w-fit flex-wrap gap-1 rounded-lg border border-border/80 bg-muted/40 p-1 dark:bg-muted/20"
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium transition-all ${
                active
                  ? 'bg-background text-foreground shadow-xs ring-1 ring-border/80 font-semibold dark:bg-card dark:text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
            >
              {option.icon}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// An ordered list edited one row per item: no separator can split a
// condition that contains commas.
function RowList({
  label,
  addLabel,
  values,
  onChange,
}: {
  label: string;
  addLabel: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  function add() {
    onChange([...values, '']);
    // Focus the new row once it renders.
    requestAnimationFrame(() =>
      container.current?.querySelector<HTMLInputElement>('li:last-child input')?.focus(),
    );
  }
  return (
    <div ref={container} className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {values.length > 0 && (
          <span className="text-xs font-mono text-muted-foreground">
            {values.length} {values.length === 1 ? 'definida' : 'definidas'}
          </span>
        )}
      </div>
      {values.length ? (
        <ol className="flex flex-col gap-2">
          {values.map((value, i) => (
            <li key={i} className="group flex items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted/70 text-xs font-semibold text-muted-foreground dark:bg-muted/40">
                {i + 1}
              </span>
              <Input
                aria-label={`${label} ${i + 1}`}
                value={value}
                placeholder={`Describa la ${label.toLowerCase().replace(/s$/, '')}…`}
                className="flex-1 bg-background shadow-xs focus-visible:ring-1 focus-visible:ring-primary"
                onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    add();
                  }
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-8 shrink-0 p-0 text-muted-foreground opacity-70 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                aria-label={`Quitar ${label.toLowerCase()} ${i + 1}`}
                onClick={() => onChange(values.filter((_, j) => j !== i))}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ol>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-1 w-fit border-dashed border-primary/30 text-primary transition-all hover:border-primary hover:bg-primary/5 hover:text-primary"
        onClick={add}
      >
        <Plus className="mr-1.5 size-3.5" aria-hidden="true" />
        {addLabel}
      </Button>
    </div>
  );
}

function ActorsField({
  actors,
  suggestions,
  onChange,
}: {
  actors: string[];
  suggestions: string[];
  onChange: (actors: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const has = (name: string) =>
    actors.some((a) => a.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'));
  function add(name: string) {
    const clean = name.trim();
    if (clean && !has(clean)) onChange([...actors, clean]);
    setDraft('');
  }
  const pending = suggestions.filter((s) => !has(s));
  return (
    <div className="flex flex-col gap-3">
      {actors.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="Actores del requisito">
          {actors.map((actor) => (
            <li
              key={actor}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 py-1 pr-1.5 pl-3 text-xs font-medium text-foreground shadow-xs dark:border-primary/40 dark:bg-primary/15"
            >
              <span>{actor}</span>
              <button
                type="button"
                aria-label={`Quitar ${actor}`}
                onClick={() => onChange(actors.filter((a) => a !== actor))}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs italic text-muted-foreground">No hay actores asignados todavía.</p>
      )}
      <div className="relative">
        <Input
          aria-label="Agregar actor"
          placeholder="Escriba el nombre de un actor y presione Enter…"
          className="shadow-xs focus-visible:ring-1 focus-visible:ring-primary"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(draft);
            }
          }}
          onBlur={() => add(draft)}
        />
      </div>
      {pending.length ? (
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
          <span className="font-medium">Sugeridos del contexto:</span>
          {pending.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => add(name)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/40 bg-primary/5 px-2.5 py-0.5 text-xs text-primary transition-all hover:border-primary hover:bg-primary/15"
            >
              <Plus className="size-3" aria-hidden="true" />
              {name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ContextItemPicker({
  items,
  selected,
  coveredBy,
  onChange,
}: {
  items: ContextItemRef[];
  selected: string[];
  coveredBy: Map<string, string[]>;
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLocaleLowerCase('es');
  const visible = items.filter(
    (i) => !q || `${i.code} ${i.description}`.toLocaleLowerCase('es').includes(q),
  );
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="flex flex-col gap-2.5">
      {items.length > 6 ? (
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Buscar en el contexto"
            placeholder="Buscar necesidad, regla o restricción…"
            className="pl-9 shadow-xs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      ) : null}
      <ul
        aria-label="Elementos del contexto"
        className="flex max-h-60 flex-col divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/80 bg-background shadow-xs dark:border-border/60"
      >
        {visible.map((item) => {
          const checked = selected.includes(item.id);
          const others = coveredBy.get(item.id) ?? [];
          return (
            <li key={item.id} className="transition-colors">
              <label
                className={`flex cursor-pointer items-start gap-3 p-3 text-sm transition-all hover:bg-muted/40 ${
                  checked ? 'border-l-3 border-l-primary bg-primary/5 dark:bg-primary/10' : ''
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary text-primary focus:ring-primary"
                  checked={checked}
                  onChange={() => toggle(item.id)}
                  aria-label={`${item.code} ${item.description}`}
                />
                <div className="shrink-0 pt-0.5">
                  <ContextCode code={item.code} kind={item.kind} />
                </div>
                <div className="min-w-0 flex-1 leading-snug">
                  <span className="font-medium text-foreground">{item.description}</span>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="rounded bg-muted/60 px-1.5 py-0.5 font-medium">
                      {KIND_NAMES[item.kind].one}
                    </span>
                    {others.length ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        · ya lo atiende {others.join(', ')}
                      </span>
                    ) : checked ? (
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">
                        · lo atiende este requisito
                      </span>
                    ) : (
                      <span className="text-muted-foreground/80">· sin cubrir</span>
                    )}
                  </div>
                </div>
              </label>
            </li>
          );
        })}
        {visible.length === 0 ? (
          <li className="p-6 text-center text-sm text-muted-foreground">
            Ningún elemento coincide con la búsqueda.
          </li>
        ) : null}
      </ul>
      <div
        className="flex items-center justify-between px-1 text-xs text-muted-foreground"
        aria-live="polite"
      >
        <span>
          {selected.length === 0
            ? 'Seleccione al menos un elemento que respalde el requisito.'
            : `${selected.length} ${selected.length === 1 ? 'elemento seleccionado' : 'elementos seleccionados'}.`}
        </span>
      </div>
    </div>
  );
}

function DependencyPicker({
  options,
  selected,
  onChange,
}: {
  options: RequirementResponse[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const listId = useId();
  const q = query.trim().toLocaleLowerCase('es');
  const byId = new Map(options.map((r) => [r.id, r]));
  const matches = options
    .filter((r) => !selected.includes(r.id))
    .filter((r) => !q || `${r.code} ${r.requirement.name}`.toLocaleLowerCase('es').includes(q))
    .slice(0, 8);
  return (
    <div className="flex flex-col gap-3">
      {selected.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="Dependencias seleccionadas">
          {selected.map((id) => {
            const r = byId.get(id);
            return (
              <li
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 py-1 pr-1.5 pl-3 text-xs font-medium text-foreground shadow-xs dark:border-primary/40 dark:bg-primary/15"
              >
                <span className="font-mono text-xs font-bold text-primary">{r?.code}</span>
                <span className="max-w-[200px] truncate">
                  {r?.requirement.name ?? 'Requisito archivado'}
                </span>
                <button
                  type="button"
                  aria-label={`Quitar dependencia ${r?.code ?? ''}`}
                  onClick={() => onChange(selected.filter((x) => x !== id))}
                  className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          aria-label="Buscar requisito del que depende"
          aria-controls={listId}
          placeholder="Buscar por código o nombre…"
          className="pl-9 shadow-xs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {matches.length ? (
        <ul
          id={listId}
          aria-label="Requisitos disponibles"
          className="flex max-h-48 flex-col divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/80 bg-background shadow-xs dark:border-border/60"
        >
          {matches.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onChange([...selected, r.id]);
                  setQuery('');
                }}
                className="group flex w-full items-center gap-2.5 p-2.5 text-left text-sm transition-colors hover:bg-primary/5"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Plus className="size-3.5" aria-hidden="true" />
                </span>
                <span className="font-mono text-xs font-bold text-primary">{r.code}</span>
                <span className="truncate font-medium text-foreground">{r.requirement.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : q ? (
        <p className="p-2 text-xs text-muted-foreground">
          Ningún requisito coincide con la búsqueda.
        </p>
      ) : null}
    </div>
  );
}

export function RequirementManualForm({
  projectId,
  existingRequirements,
  initial,
  onCreated,
  onCancel,
}: {
  projectId: string;
  existingRequirements: RequirementResponse[];
  initial?: RequirementResponse;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const r0 = initial?.requirement;
  const coverage = useQuery({
    queryKey: ['requirements-coverage', projectId],
    queryFn: () => api.requirements.contextCoverage(projectId),
  });
  const context = useQuery({
    queryKey: ['context', projectId],
    queryFn: () => api.context.getCurrent(projectId),
    retry: false,
  });

  const [requirementType, setRequirementType] = useState<RequirementType>(
    r0?.requirementType ?? 'FUNCTIONAL',
  );
  const [name, setName] = useState(r0?.name ?? '');
  const [description, setDescription] = useState(r0?.description ?? '');
  const [priority, setPriority] = useState<RequirementPriority>(r0?.priority ?? 'MEDIUM');
  const [originKind, setOriginKind] = useState<OriginKind>(r0?.origin?.kind ?? 'CONTEXT');
  const [contextItemIds, setContextItemIds] = useState<string[]>(
    r0?.origin?.contextItems.map((i) => i.id) ?? [],
  );
  const [justification, setJustification] = useState(r0?.origin?.justification ?? '');
  const [actors, setActors] = useState<string[]>(r0?.actors ?? []);
  const [preconditions, setPreconditions] = useState<string[]>(r0?.preconditions ?? []);
  const [postconditions, setPostconditions] = useState<string[]>(r0?.postconditions ?? []);
  // Dependencies point at the Requirement Artifact's stable id, never a
  // version id.
  const [dependencyArtifactIds, setDependencyArtifactIds] = useState<string[]>(
    r0?.dependencyArtifactIds ?? [],
  );
  const [submitting, setSubmitting] = useState(false);

  // The approved context's items, plus any older item this version cites.
  const currentItems = coverage.data?.items ?? [];
  const contextItems: ContextItemRef[] = [
    ...currentItems,
    ...(r0?.origin?.contextItems ?? []).filter((i) => !currentItems.some((c) => c.id === i.id)),
  ];
  const coveredBy = new Map(
    currentItems.map((i) => [i.id, i.coveredBy.filter((code) => code !== initial?.code)]),
  );
  const contextActors = context.data?.actors.map((a) => a.name) ?? [];
  const hasContext = contextItems.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (originKind === 'CONTEXT' && contextItemIds.length === 0) {
      toast.error('Seleccione qué elementos del contexto atiende este requisito.');
      return;
    }
    if (originKind === 'USER_DECISION' && !justification.trim()) {
      toast.error('Explique por qué se incluye este requisito.');
      return;
    }
    setSubmitting(true);
    const clean = (values: string[]) => values.map((v) => v.trim()).filter(Boolean);
    const input: RequirementInput = {
      requirementType,
      name,
      description,
      priority,
      actors,
      preconditions: clean(preconditions),
      postconditions: clean(postconditions),
      dependencyArtifactIds,
      origin:
        originKind === 'CONTEXT'
          ? { kind: 'CONTEXT', contextItemIds }
          : { kind: 'USER_DECISION', justification: justification.trim() },
    };
    try {
      if (initial) {
        await api.requirements.createVersion(projectId, initial.id, input);
        toast.success(
          `${initial.code} actualizado. La nueva versión queda pendiente de aprobación.`,
        );
      } else {
        await api.requirements.create(projectId, input);
        toast.success('Requisito creado.');
      }
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el requisito.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onCancel())}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-3xl border-border/80 shadow-2xl">
        <form onSubmit={handleSubmit} className="flex max-h-[92vh] flex-col">
          <DialogHeader className="border-b border-border/70 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent px-6 py-4.5 dark:border-border/50">
            <div className="flex items-center gap-2.5">
              {initial ? (
                <span className="rounded-md border border-primary/20 bg-primary/10 px-2.5 py-0.5 font-mono text-xs font-bold text-primary">
                  {initial.code}
                </span>
              ) : null}
              <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
                {initial ? `Editar requisito` : 'Nuevo requisito'}
              </DialogTitle>
            </div>
            <DialogDescription className="mt-1 text-xs text-muted-foreground">
              {initial
                ? `Al guardar se creará la versión ${initial.version.versionNumber + 1}, que requerirá aprobación. La versión actual no se modifica.`
                : 'Defina qué debe realizar el sistema y su justificación. Quedará como borrador para su revisión.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5 bg-muted/10">
            <Section title="Qué debe cumplir" icon={<ListChecks className="size-4" />}>
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                <Segmented
                  label="Tipo"
                  value={requirementType}
                  onChange={setRequirementType}
                  options={[
                    { value: 'FUNCTIONAL', label: 'Funcional (RF)' },
                    { value: 'NON_FUNCTIONAL', label: 'No funcional (RNF)' },
                  ]}
                />
                <Segmented
                  label="Prioridad"
                  value={priority}
                  onChange={setPriority}
                  options={[
                    { value: 'HIGH', label: 'Alta' },
                    { value: 'MEDIUM', label: 'Media' },
                    { value: 'LOW', label: 'Baja' },
                  ]}
                />
              </div>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                Nombre
                <Input
                  required
                  value={name}
                  maxLength={200}
                  placeholder="Por ejemplo: Registrar un pedido"
                  className="shadow-xs focus-visible:ring-1 focus-visible:ring-primary"
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                Descripción
                <Textarea
                  required
                  rows={4}
                  value={description}
                  placeholder="El sistema debe permitir…"
                  className="shadow-xs focus-visible:ring-1 focus-visible:ring-primary"
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
            </Section>

            <Section
              title="Por qué existe"
              description="Todo requisito responde al contexto aprobado o a una decisión justificada."
              icon={<Target className="size-4" />}
            >
              <Segmented
                label="Origen"
                value={originKind}
                onChange={setOriginKind}
                options={[
                  {
                    value: 'CONTEXT',
                    label: 'Atiende el contexto',
                    icon: <Target className="size-4" aria-hidden="true" />,
                  },
                  {
                    value: 'USER_DECISION',
                    label: 'Decisión propia',
                    icon: <UserCheck className="size-4" aria-hidden="true" />,
                  },
                ]}
              />
              {originKind === 'CONTEXT' ? (
                hasContext ? (
                  <ContextItemPicker
                    items={contextItems}
                    selected={contextItemIds}
                    coveredBy={coveredBy}
                    onChange={setContextItemIds}
                  />
                ) : (
                  <p className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    {coverage.isLoading
                      ? 'Cargando el contexto…'
                      : 'El contexto aprobado no tiene necesidades, reglas ni restricciones que citar. Elija «Decisión propia» y explique por qué se incluye.'}
                  </p>
                )
              ) : (
                <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                  Justificación
                  <Textarea
                    rows={3}
                    maxLength={1000}
                    value={justification}
                    placeholder="Por ejemplo: lo pidió el cliente en la reunión del 3 de octubre."
                    className="shadow-xs focus-visible:ring-1 focus-visible:ring-primary"
                    onChange={(e) => setJustification(e.target.value)}
                  />
                </label>
              )}
            </Section>

            <Section
              title="Actores"
              description="Quiénes intervienen en este requisito."
              icon={<Users className="size-4" />}
            >
              <ActorsField actors={actors} suggestions={contextActors} onChange={setActors} />
            </Section>

            <Section title="Condiciones" icon={<Layers className="size-4" />}>
              <div className="flex flex-col gap-5">
                <RowList
                  label="Precondiciones"
                  addLabel="Agregar precondición"
                  values={preconditions}
                  onChange={setPreconditions}
                />
                <div className="border-t border-border/40" />
                <RowList
                  label="Postcondiciones"
                  addLabel="Agregar postcondición"
                  values={postconditions}
                  onChange={setPostconditions}
                />
              </div>
            </Section>

            {existingRequirements.some((r) => r.id !== initial?.id) ? (
              <Section
                title="Dependencias"
                description="Requisitos que deben cumplirse antes que este (opcional)."
                icon={<GitFork className="size-4" />}
              >
                <DependencyPicker
                  options={existingRequirements.filter((r) => r.id !== initial?.id)}
                  selected={dependencyArtifactIds}
                  onChange={setDependencyArtifactIds}
                />
              </Section>
            ) : null}
          </div>

          <DialogFooter className="border-t border-border/70 bg-muted/20 px-6 py-3.5 dark:border-border/50 sm:flex-row sm:justify-end sm:gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="shadow-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting}
              className="gap-2 shadow-xs transition-all hover:shadow-sm"
            >
              <Check className="size-4" aria-hidden="true" />
              {submitting ? 'Guardando…' : initial ? 'Guardar cambios' : 'Crear requisito'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
